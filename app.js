// Inisialisasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyApYdiUlLMb9ihBkLnCjDpLJHqYFRFS3Fw",
  authDomain: "fupa-snack.firebaseapp.com",
  projectId: "fupa-snack",
  storageBucket: "fupa-snack.firebasestorage.app",
  messagingSenderId: "972524876738",
  appId: "1:972524876738:web:dd0d57dd8bf2d8a8dd9c5b"
};

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Variabel global
let currentUser = null;
let userProfile = null;
let currentStream = null;
let capturedPhoto = null;
let userCoordinates = null;
let serverTimeInterval = null;
let presenceStatusInterval = null;

// Fungsi utilitas UI
const $ = (sel) => document.querySelector(sel);
const toast = (msg, type = 'info', duration = 3000) => {
  const t = $("#toast");
  if (!t) return alert(msg);
  
  const colors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f9a825',
    info: '#111'
  };
  
  t.style.backgroundColor = colors[type] || colors.info;
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, duration);
};

// Fungsi untuk mendapatkan waktu server dari Firestore
async function getServerTime() {
  try {
    const ref = db.collection('serverTime').doc('current');
    const doc = await ref.get();
    if (doc.exists) {
      return doc.data().timestamp.toDate();
    }
  } catch (error) {
    console.error("Error getting server time:", error);
  }
  // Fallback ke waktu lokal jika gagal
  return new Date();
}

// Fungsi untuk mengupdate waktu server di UI
async function updateServerTime() {
  const timeElement = $('#serverTime');
  if (!timeElement) return;
  
  const now = await getServerTime();
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Jakarta'
  };
  timeElement.textContent = now.toLocaleDateString('id-ID', options);
}

// Fungsi untuk mendapatkan shift berdasarkan waktu
function getShift(now) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'pagi';
  if (hour >= 12 && hour < 18) return 'sore';
  return null;
}

// Fungsi untuk mendapatkan status presensi
function getPresenceStatus(now, jenis, shift) {
  // Jika hari Minggu, status Libur
  if (now.getDay() === 0) return 'Libur';
  
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hour * 60 + minutes;
  
  // Aturan waktu default
  if (jenis === 'izin') return 'Izin';
  
  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      // Berangkat pagi: 05.30–06.00 WIB
      if (totalMinutes >= 330 && totalMinutes <= 360) return 'Tepat Waktu';
      if (totalMinutes > 360 && totalMinutes <= 380) return 'Terlambat';
    } else if (jenis === 'pulang') {
      // Pulang pagi: 10.00–11.00 WIB
      if (totalMinutes >= 600 && totalMinutes <= 660) return 'Tepat Waktu';
      if (totalMinutes > 660 && totalMinutes <= 680) return 'Terlambat';
    }
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') {
      // Berangkat sore: 14.00-14.30 WIB
      if (totalMinutes >= 840 && totalMinutes <= 870) return 'Tepat Waktu';
      if (totalMinutes > 870 && totalMinutes <= 890) return 'Terlambat';
    } else if (jenis === 'pulang') {
      // Pulang sore: 17.30-18.30 WIB
      if (totalMinutes >= 1050 && totalMinutes <= 1110) return 'Tepat Waktu';
      if (totalMinutes > 1110 && totalMinutes <= 1130) return 'Terlambat';
    }
  }
  
  return 'Di luar sesi presensi';
}

// Fungsi untuk mengupdate status presensi di UI
async function updatePresenceStatus() {
  const statusElement = $('#statusText');
  const statusChip = $('#statusChip');
  if (!statusElement || !statusChip) return;
  
  const now = await getServerTime();
  const shift = getShift(now);
  const jenis = $('#jenis').value;
  
  if (now.getDay() === 0) {
    statusElement.textContent = 'Libur';
    statusChip.className = 'status s-bad';
    statusChip.innerHTML = '<span class="material-symbols-rounded">beach_access</span><span id="statusText">Libur</span>';
    return;
  }
  
  if (!shift) {
    statusElement.textContent = 'Di Luar Sesi Presensi';
    statusChip.className = 'status s-bad';
    statusChip.innerHTML = '<span class="material-symbols-rounded">schedule</span><span id="statusText">Di Luar Sesi Presensi</span>';
    return;
  }
  
  const status = getPresenceStatus(now, jenis, shift);
  
  if (status === 'Tepat Waktu') {
    statusElement.textContent = 'Tepat Waktu';
    statusChip.className = 'status s-good';
    statusChip.innerHTML = '<span class="material-symbols-rounded">check_circle</span><span id="statusText">Tepat Waktu</span>';
  } else if (status === 'Terlambat') {
    statusElement.textContent = 'Terlambat';
    statusChip.className = 'status s-warn';
    statusChip.innerHTML = '<span class="material-symbols-rounded">warning</span><span id="statusText">Terlambat</span>';
  } else if (status === 'Di luar sesi presensi') {
    statusElement.textContent = 'Di Luar Sesi Presensi';
    statusChip.className = 'status s-bad';
    statusChip.innerHTML = '<span class="material-symbols-rounded">schedule</span><span id="statusText">Di Luar Sesi Presensi</span>';
  } else if (status === 'Izin') {
    statusElement.textContent = 'Izin';
    statusChip.className = 'status s-warn';
    statusChip.innerHTML = '<span class="material-symbols-rounded">event_available</span><span id="statusText">Izin</span>';
  }
}

// Fungsi untuk mendapatkan lokasi pengguna
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = position.coords;
        userCoordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude
        };
        $('#locText').textContent = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
        resolve(userCoordinates);
      },
      (error) => {
        console.error('Error getting location:', error);
        toast('Tidak dapat mengakses lokasi', 'error');
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Fungsi untuk mengakses kamera
async function startCamera() {
  try {
    const video = $('#cameraVideo');
    if (!video) return;
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    
    currentStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    $('.camera-placeholder').style.display = 'none';
    
    return stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    toast('Tidak dapat mengakses kamera', 'error');
    return null;
  }
}

// Fungsi untuk mengambil foto
function capturePhoto() {
  const video = $('#cameraVideo');
  const canvas = $('#photoCanvas');
  const photo = $('#capturedPhoto');
  
  if (!video || !canvas || !photo) return null;
  
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  capturedPhoto = canvas.toDataURL('image/jpeg', 0.7);
  photo.src = capturedPhoto;
  photo.style.display = 'block';
  video.style.display = 'none';
  
  $('#uploadBtn').disabled = false;
  toast('Foto berhasil diambil', 'success');
  
  return capturedPhoto;
}

// Fungsi untuk mengkompres gambar dan menghapus metadata
async function compressImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0);
      
      // Get compressed image
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
      
      // Convert to blob
      const blob = dataURLToBlob(compressedDataUrl);
      
      // Check if size is less than 10KB
      if (blob.size <= 10 * 1024) {
        resolve(blob);
      } else {
        // If still too big, resize and compress further
        const maxWidth = 800;
        const maxHeight = 600;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const furtherCompressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
        const furtherCompressedBlob = dataURLToBlob(furtherCompressedDataUrl);
        resolve(furtherCompressedBlob);
      }
    };
    
    img.onerror = function() {
      reject(new Error('Gagal memuat gambar'));
    };
    
    img.src = dataUrl;
  });
}

// Fungsi untuk mengonversi data URL ke blob
function dataURLToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
}

// Fungsi untuk mengupload gambar ke Cloudinary
async function uploadToCloudinary(blob) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', 'FupaSnack');
    formData.append('cloud_name', 'da7idhh4f');
    
    fetch('https://api.cloudinary.com/v1_1/da7idhh4f/image/upload', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.secure_url) {
        resolve(data.secure_url);
      } else {
        reject(new Error('Upload gagal'));
      }
    })
    .catch(error => {
      reject(error);
    });
  });
}

// Fungsi untuk mencatat presensi
async function recordPresence() {
  try {
    const jenis = $('#jenis').value;
    if (!jenis) {
      toast('Pilih jenis presensi terlebih dahulu', 'error');
      return;
    }
    
    if (!capturedPhoto) {
      toast('Ambil foto terlebih dahulu', 'error');
      return;
    }
    
    if (!userCoordinates) {
      toast('Mendapatkan lokasi...', 'info');
      await getLocation();
    }
    
    $('#uploadBtn').disabled = true;
    $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
    
    // Dapatkan waktu server
    const now = await getServerTime();
    const shift = getShift(now);
    const status = getPresenceStatus(now, jenis, shift);
    
    // Kompres gambar
    const compressedBlob = await compressImage(capturedPhoto);
    
    // Upload ke Cloudinary
    const photoUrl = await uploadToCloudinary(compressedBlob);
    
    // Simpan data presensi ke Firestore
    await db.collection('presences').add({
      userId: currentUser.uid,
      nama: userProfile.nama || 'Tidak diketahui',
      waktu: firebase.firestore.Timestamp.fromDate(now),
      shift: jenis === 'izin' ? 'Penuh' : shift,
      jenis: jenis,
      status: status,
      koordinat: new firebase.firestore.GeoPoint(userCoordinates.latitude, userCoordinates.longitude),
      selfie: photoUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    toast('Presensi berhasil dicatat', 'success');
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    $('#uploadBtn').disabled = true;
    
    // Reset camera
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    
    $('#cameraVideo').style.display = 'none';
    $('#capturedPhoto').style.display = 'none';
    $('.camera-placeholder').style.display = 'flex';
    capturedPhoto = null;
    
    // Muat ulang riwayat presensi
    if (window.location.pathname.endsWith('admin.html')) {
      loadPresenceHistory();
    }
    
  } catch (error) {
    console.error('Error recording presence:', error);
    toast('Gagal mencatat presensi: ' + error.message, 'error');
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    $('#uploadBtn').disabled = false;
  }
}

// Fungsi untuk memuat riwayat presensi (admin)
async function loadPresenceHistory() {
  try {
    const tableBody = $('#tableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Memuat data...</td></tr>';
    
    let query = db.collection('presences').orderBy('waktu', 'desc');
    
    // Terapkan filter nama
    const nameFilter = $('#fNama').value;
    if (nameFilter) {
      query = query.where('nama', '>=', nameFilter).where('nama', '<=', nameFilter + '\uf8ff');
    }
    
    // Terapkan filter periode
    const period = $('#fPeriode').value;
    const now = await getServerTime();
    
    if (period !== 'all') {
      let startDate = new Date(now);
      
      switch (period) {
        case 'harian':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'mingguan':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'bulanan':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'tahunan':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        case 'custom':
          const dari = $('#fDari').value;
          const sampai = $('#fSampai').value;
          if (dari && sampai) {
            startDate = new Date(dari);
            const endDate = new Date(sampai);
            endDate.setHours(23, 59, 59, 999);
            query = query.where('waktu', '>=', firebase.firestore.Timestamp.fromDate(startDate))
                         .where('waktu', '<=', firebase.firestore.Timestamp.fromDate(endDate));
          }
          break;
      }
      
      if (period !== 'custom') {
        query = query.where('waktu', '>=', firebase.firestore.Timestamp.fromDate(startDate));
      }
    }
    
    // Terapkan batasan jumlah data
    const showLimit = $('#fShow').value;
    if (showLimit !== 'all') {
      query = query.limit(parseInt(showLimit));
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
      return;
    }
    
    tableBody.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const waktu = data.waktu.toDate();
      const waktuFormatted = waktu.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + '<br>' + waktu.toLocaleTimeString('id-ID');
      
      const statusClass = data.status === 'Tepat Waktu' ? 's-good' : 
                         data.status === 'Terlambat' ? 's-warn' : 's-bad';
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${waktuFormatted}</td>
        <td>${data.nama}</td>
        <td>${data.jenis}</td>
        <td><span class="status ${statusClass}">${data.status}</span></td>
        <td>${data.koordinat.latitude.toFixed(4)}, ${data.koordinat.longitude.toFixed(4)}</td>
        <td><a href="${data.selfie}" target="_blank">Lihat Foto</a></td>
      `;
      tableBody.appendChild(row);
    });
    
  } catch (error) {
    console.error('Error loading presence history:', error);
    toast('Gagal memuat riwayat presensi', 'error');
  }
}

// Fungsi untuk mengekspor data ke CSV
async function exportToCSV() {
  try {
    $('#exportCsv').disabled = true;
    $('#exportCsv').innerHTML = '<span class="spinner"></span> Mengekspor...';
    
    let query = db.collection('presences').orderBy('nama').orderBy('waktu', 'asc');
    
    // Terapkan filter nama
    const nameFilter = $('#fNama').value;
    if (nameFilter) {
      query = query.where('nama', '>=', nameFilter).where('nama', '<=', nameFilter + '\uf8ff');
    }
    
    // Terapkan filter periode
    const period = $('#fPeriode').value;
    const now = await getServerTime();
    
    if (period !== 'all') {
      let startDate = new Date(now);
      
      switch (period) {
        case 'harian':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'mingguan':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'bulanan':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'tahunan':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        case 'custom':
          const dari = $('#fDari').value;
          const sampai = $('#fSampai').value;
          if (dari && sampai) {
            startDate = new Date(dari);
            const endDate = new Date(sampai);
            endDate.setHours(23, 59, 59, 999);
            query = query.where('waktu', '>=', firebase.firestore.Timestamp.fromDate(startDate))
                         .where('waktu', '<=', firebase.firestore.Timestamp.fromDate(endDate));
          }
          break;
      }
      
      if (period !== 'custom') {
        query = query.where('waktu', '>=', firebase.firestore.Timestamp.fromDate(startDate));
      }
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      toast('Tidak ada data untuk diekspor', 'warning');
      $('#exportCsv').disabled = false;
      $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
      return;
    }
    
    // Format data sesuai STDR
    let csvContent = 'Nama,Tanggal,Shift,Jenis,Status,Koordinat\n';
    let currentUserName = '';
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const waktu = data.waktu.toDate();
      const tanggal = waktu.toLocaleDateString('id-ID');
      
      // Jika nama berubah, tambahkan baris kosong (kecuali untuk data pertama)
      if (currentUserName && currentUserName !== data.nama) {
        csvContent += '\n';
      }
      
      currentUserName = data.nama;
      
      csvContent += `"${data.nama}",${tanggal},${data.shift},${data.jenis},${data.status},"${data.koordinat.latitude.toFixed(4)}, ${data.koordinat.longitude.toFixed(4)}"\n`;
    });
    
    // Buat file dan download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `presensi_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast('CSV berhasil diekspor', 'success');
    $('#exportCsv').disabled = false;
    $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
    
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    toast('Gagal mengekspor CSV', 'error');
    $('#exportCsv').disabled = false;
    $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
  }
}

// Fungsi untuk memuat profil pengguna
async function loadUserProfile() {
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    
    if (doc.exists) {
      userProfile = doc.data();
      
      // Update UI dengan data profil
      if ($('#nama')) $('#nama').value = userProfile.nama || '';
      if ($('#alamat')) $('#alamat').value = userProfile.alamat || '';
      if ($('#pfp')) {
        $('#pfp').src = userProfile.photoURL || 
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userProfile.nama || 'User')}&backgroundColor=ffb300,ffd54f&radius=20`;
      }
      
      // Jika data profil kosong, tampilkan popup
      if ((!userProfile.nama || !userProfile.alamat) && $('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    } else {
      // Jika dokumen tidak ada, buat dokumen baru
      userProfile = {
        nama: '',
        alamat: '',
        email: currentUser.email,
        role: 'karyawan',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('users').doc(currentUser.uid).set(userProfile);
      
      // Tampilkan popup untuk mengisi profil
      if ($('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
    toast('Gagal memuat profil pengguna', 'error');
  }
}

// Fungsi untuk menyimpan profil pengguna
async function saveUserProfile() {
  try {
    const nama = $('#nama').value.trim();
    const alamat = $('#alamat').value.trim();
    const pfpFile = $('#pfpFile').files[0];
    
    if (!nama || !alamat) {
      toast('Nama dan alamat harus diisi', 'error');
      return;
    }
    
    $('#saveProfileBtn').disabled = true;
    $('#saveProfileBtn').innerHTML = '<span class="spinner"></span> Menyimpan...';
    
    let photoURL = userProfile.photoURL;
    
    // Upload foto profil jika ada
    if (pfpFile) {
      const compressedBlob = await compressImage(URL.createObjectURL(pfpFile));
      photoURL = await uploadToCloudinary(compressedBlob);
    }
    
    // Update profil di Firestore
    await db.collection('users').doc(currentUser.uid).update({
      nama: nama,
      alamat: alamat,
      photoURL: photoURL,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Update variabel lokal
    userProfile.nama = nama;
    userProfile.alamat = alamat;
    userProfile.photoURL = photoURL;
    
    // Update UI
    if ($('#pfp')) {
      $('#pfp').src = photoURL || 
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(nama)}&backgroundColor=ffb300,ffd54f&radius=20`;
    }
    
    toast('Profil berhasil disimpan', 'success');
    $('#saveProfileBtn').disabled = false;
    $('#saveProfileBtn').innerHTML = '<span class="material-symbols-rounded">save</span> Simpan';
    
    // Tutup dialog jika tidak di admin page
    if ($('#profileDlg') && !window.location.pathname.endsWith('admin.html')) {
      $('#profileDlg').close();
    }
    
  } catch (error) {
    console.error('Error saving user profile:', error);
    toast('Gagal menyimpan profil', 'error');
    $('#saveProfileBtn').disabled = false;
    $('#saveProfileBtn').innerHTML = '<span class="material-symbols-rounded">save</span> Simpan';
  }
}

// Fungsi untuk logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch(error => {
    console.error('Error signing out:', error);
    toast('Gagal logout', 'error');
  });
}

// Inisialisasi aplikasi setelah login
function initApp() {
  currentUser = auth.currentUser;
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }
  
  // Muat profil pengguna
  loadUserProfile();
  
  // Setup interval untuk update waktu server
  updateServerTime();
  serverTimeInterval = setInterval(updateServerTime, 1000);
  
  // Setup interval untuk update status presensi (halaman karyawan)
  if (window.location.pathname.endsWith('karyawan.html')) {
    updatePresenceStatus();
    presenceStatusInterval = setInterval(updatePresenceStatus, 30000);
    
    // Dapatkan lokasi
    getLocation().catch(error => {
      console.error('Error getting location:', error);
    });
    
    // Setup event listeners untuk halaman karyawan
    $('#snapBtn').addEventListener('click', capturePhoto);
    $('#uploadBtn').addEventListener('click', recordPresence);
    $('#jenis').addEventListener('change', updatePresenceStatus);
  }
  
  // Muat riwayat presensi (halaman admin)
  if (window.location.pathname.endsWith('admin.html')) {
    loadPresenceHistory();
    
    // Setup event listeners untuk halaman admin
    $('#applyFilter').addEventListener('click', loadPresenceHistory);
    $('#exportCsv').addEventListener('click', exportToCSV);
    $('#fPeriode').addEventListener('change', function() {
      $('#customDateRange').style.display = this.value === 'custom' ? 'flex' : 'none';
    });
  }
  
  // Setup event listeners umum
  if ($('#profileBtn')) {
    $('#profileBtn').addEventListener('click', function() {
      $('#profileDlg').showModal();
    });
  }
  
  if ($('#saveProfileBtn')) {
    $('#saveProfileBtn').addEventListener('click', saveUserProfile);
  }
  
  if ($('#logoutBtn')) {
    $('#logoutBtn').addEventListener('click', logout);
  }
  
  // Setup camera (halaman karyawan)
  if (window.location.pathname.endsWith('karyawan.html') && $('#cameraVideo')) {
    startCamera().catch(error => {
      console.error('Error starting camera:', error);
    });
  }
}

// Cleanup ketika halaman ditutup atau direfresh
window.addEventListener('beforeunload', function() {
  if (serverTimeInterval) clearInterval(serverTimeInterval);
  if (presenceStatusInterval) clearInterval(presenceStatusInterval);
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
});

// Inisialisasi ketika DOM sudah dimuat
document.addEventListener('DOMContentLoaded', function() {
  // Periksa status autentikasi
  auth.onAuthStateChanged(function(user) {
    if (user) {
      initApp();
    } else {
      window.location.href = 'index.html';
    }
  });
});