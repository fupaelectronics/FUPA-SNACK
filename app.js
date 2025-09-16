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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Variabel global
let currentUser = null;
let userData = null;
let cameraStream = null;
let capturedPhotoData = null;
let currentShift = null;
let presenceStatus = null;
let isRestricted = false;

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const showToast = (msg, type = 'info') => {
  const toast = $("#toast");
  if (!toast) return;
  
  const colors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f9a825',
    info: '#111'
  };
  
  toast.style.backgroundColor = colors[type] || colors.info;
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
};

// Fungsi kompres gambar (menggunakan canvas)
function compressImage(imageData, maxSizeKB = 10) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Hitung ukuran baru dengan menjaga aspek rasio
      let width = img.width;
      let height = img.height;
      const maxDimension = 800;
      
      if (width > height) {
        if (width > maxDimension) {
          height *= maxDimension / width;
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width *= maxDimension / height;
          height = maxDimension;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Gambar ulang dengan kualitas lebih rendah
      ctx.drawImage(img, 0, 0, width, height);
      
      // Konversi ke blob dengan kualitas 0.7 (70%)
      canvas.toBlob((blob) => {
        // Jika masih terlalu besar, kurangi kualitas lebih lanjut
        if (blob.size > maxSizeKB * 1024) {
          canvas.toBlob((smallerBlob) => {
            resolve(smallerBlob);
          }, 'image/jpeg', 0.5);
        } else {
          resolve(blob);
        }
      }, 'image/jpeg', 0.7);
    };
    img.src = imageData;
  });
}

// Fungsi untuk mengupload gambar ke Cloudinary
async function uploadToCloudinary(blob) {
  const cloudName = 'da7idhh4f';
  const uploadPreset = 'FupaSnack';
  
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', uploadPreset);
  
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error('Gagal mengupload foto');
  }
}

// Fungsi untuk mendapatkan waktu server dari Firestore
async function getServerTime() {
  try {
    const timeRef = db.collection('serverTime').doc('current');
    const doc = await timeRef.get();
    
    if (doc.exists) {
      return doc.data().timestamp.toDate();
    } else {
      // Fallback ke waktu lokal jika tidak ada waktu server
      return new Date();
    }
  } catch (error) {
    console.error('Error getting server time:', error);
    return new Date(); // Fallback ke waktu lokal
  }
}

// Fungsi untuk menentukan shift berdasarkan waktu
function determineShift(time) {
  const hour = time.getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'pagi';
  } else if (hour >= 12 && hour < 18) {
    return 'sore';
  } else {
    return null; // Di luar jam kerja
  }
}

// Fungsi untuk menentukan status presensi
function determinePresenceStatus(time, shift, jenis) {
  const day = time.getDay();
  
  // Hari Minggu adalah libur
  if (day === 0) {
    return { status: 'Libur', canPresence: false };
  }
  
  const hour = time.getHours();
  const minute = time.getMinutes();
  const totalMinutes = hour * 60 + minute;
  
  // Aturan waktu default
  let startTime, endTime, lateThreshold;
  
  if (jenis === 'izin') {
    return { status: 'Izin', canPresence: true };
  }
  
  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      startTime = 5 * 60 + 30; // 05:30
      endTime = 6 * 60;        // 06:00
      lateThreshold = 6 * 60 + 20; // 06:20
    } else if (jenis === 'pulang') {
      startTime = 10 * 60;     // 10:00
      endTime = 11 * 60;       // 11:00
      lateThreshold = 11 * 60 + 20; // 11:20
    }
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') {
      startTime = 14 * 60;     // 14:00
      endTime = 14 * 60 + 30;  // 14:30
      lateThreshold = 14 * 60 + 50; // 14:50
    } else if (jenis === 'pulang') {
      startTime = 17 * 60 + 30; // 17:30
      endTime = 18 * 60 + 30;   // 18:30
      lateThreshold = 18 * 60 + 50; // 18:50
    }
  }
  
  // Cek apakah dalam sesi presensi
  if (totalMinutes >= startTime && totalMinutes <= endTime) {
    return { status: 'Tepat Waktu', canPresence: true };
  }
  
  // Cek apakah terlambat (dalam toleransi 20 menit)
  if (totalMinutes > endTime && totalMinutes <= lateThreshold) {
    return { status: 'Terlambat', canPresence: true };
  }
  
  // Di luar sesi presensi
  return { status: 'Di luar sesi presensi', canPresence: false };
}

// Fungsi untuk memeriksa apakah sudah melakukan presensi hari ini
async function checkTodayPresence(jenis) {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const presenceRef = db.collection('presensi')
      .where('userId', '==', currentUser.uid)
      .where('waktu', '>=', startOfDay)
      .where('jenis', '==', jenis);
    
    const snapshot = await presenceRef.get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking today presence:', error);
    return false;
  }
}

// Fungsi untuk mendapatkan lokasi pengguna
async function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        reject(new Error('Tidak dapat mendapatkan lokasi: ' + error.message));
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}

// Fungsi untuk memulai kamera
async function startCamera() {
  try {
    // Hentikan kamera yang sedang berjalan
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    
    // Minta akses kamera
    cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    
    // Tampilkan video di elemen video
    const videoElement = $('#cameraPreview');
    if (videoElement) {
      videoElement.srcObject = cameraStream;
      videoElement.style.display = 'block';
      
      // Sembunyikan placeholder
      const placeholder = $('.camera-placeholder');
      if (placeholder) {
        placeholder.style.display = 'none';
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error accessing camera:', error);
    showToast('Tidak dapat mengakses kamera: ' + error.message, 'error');
    return false;
  }
}

// Fungsi untuk mengambil foto
function capturePhoto() {
  return new Promise((resolve) => {
    const videoElement = $('#cameraPreview');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set ukuran canvas sesuai dengan video
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    // Gambar frame video ke canvas
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // Konversi ke data URL
    const photoData = canvas.toDataURL('image/jpeg');
    resolve(photoData);
  });
}

// Fungsi untuk menghentikan kamera
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  const videoElement = $('#cameraPreview');
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement.style.display = 'none';
  }
  
  const placeholder = $('.camera-placeholder');
  if (placeholder) {
    placeholder.style.display = 'flex';
  }
}

// Fungsi untuk memuat data profil pengguna
async function loadUserProfile() {
  try {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    
    if (userDoc.exists) {
      userData = userDoc.data();
      
      // Update UI dengan data profil
      const namaElement = $('#nama');
      const alamatElement = $('#alamat');
      const pfpElement = $('#pfp');
      
      if (namaElement) namaElement.value = userData.nama || '';
      if (alamatElement) alamatElement.value = userData.alamat || '';
      
      if (pfpElement && userData.fotoProfil) {
        pfpElement.src = userData.fotoProfil;
      }
      
      return true;
    } else {
      // Jika data user tidak ada, tampilkan popup
      showProfileDialog();
      return false;
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
    showToast('Gagal memuat profil', 'error');
    return false;
  }
}

// Fungsi untuk menyimpan data profil
async function saveUserProfile() {
  try {
    const nama = $('#nama').value.trim();
    const alamat = $('#alamat').value.trim();
    const pfpFile = $('#pfpFile').files[0];
    
    if (!nama || !alamat) {
      showToast('Nama dan alamat harus diisi', 'error');
      return;
    }
    
    let fotoProfilUrl = userData?.fotoProfil || '';
    
    // Jika ada file foto baru, upload ke Cloudinary
    if (pfpFile) {
      const compressedImage = await compressImage(URL.createObjectURL(pfpFile), 10);
      fotoProfilUrl = await uploadToCloudinary(compressedImage);
    }
    
    // Simpan ke Firestore
    await db.collection('users').doc(currentUser.uid).set({
      nama,
      alamat,
      fotoProfil: fotoProfilUrl,
      email: currentUser.email,
      role: userData?.role || 'karyawan',
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Perbarui data lokal
    userData = { ...userData, nama, alamat, fotoProfil: fotoProfilUrl };
    
    showToast('Profil berhasil disimpan', 'success');
    $('#profileDlg').close();
  } catch (error) {
    console.error('Error saving profile:', error);
    showToast('Gagal menyimpan profil', 'error');
  }
}

// Fungsi untuk menampilkan dialog profil
function showProfileDialog() {
  $('#profileDlg').showModal();
}

// Fungsi untuk melakukan presensi
async function submitPresence(jenis) {
  try {
    // Validasi
    if (!capturedPhotoData) {
      showToast('Ambil foto terlebih dahulu', 'error');
      return;
    }
    
    // Cek apakah sudah melakukan presensi jenis ini hari ini
    const alreadyPresence = await checkTodayPresence(jenis);
    if (alreadyPresence && jenis !== 'izin') {
      showToast(`Anda sudah melakukan presensi ${jenis} hari ini`, 'error');
      return;
    }
    
    // Dapatkan lokasi
    const location = await getLocation();
    
    // Dapatkan waktu server
    const serverTime = await getServerTime();
    
    // Tentukan shift
    const shift = determineShift(serverTime);
    
    // Tentukan status presensi
    const statusInfo = determinePresenceStatus(serverTime, shift, jenis);
    
    if (!statusInfo.canPresence && jenis !== 'izin') {
      showToast('Tidak dapat melakukan presensi di luar sesi', 'error');
      return;
    }
    
    // Kompres dan upload foto
    showToast('Mengkompres dan mengupload foto...', 'info');
    const compressedImage = await compressImage(capturedPhotoData, 10);
    const photoUrl = await uploadToCloudinary(compressedImage);
    
    // Simpan data presensi ke Firestore
    const presenceData = {
      userId: currentUser.uid,
      nama: userData.nama,
      waktu: serverTime,
      shift: jenis === 'izin' ? 'Penuh' : shift,
      jenis,
      status: statusInfo.status,
      koordinat: new firebase.firestore.GeoPoint(location.lat, location.lng),
      foto: photoUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('presensi').add(presenceData);
    
    // Reset state
    capturedPhotoData = null;
    $('#photoPreview').style.display = 'none';
    $('#cameraPreview').style.display = 'block';
    $('.camera-placeholder').style.display = 'none';
    $('#uploadBtn').disabled = true;
    
    showToast('Presensi berhasil dicatat', 'success');
    
    // Jika di halaman admin, muat ulang data
    if (window.location.pathname.includes('admin.html')) {
      loadPresenceData();
    }
  } catch (error) {
    console.error('Error submitting presence:', error);
    showToast('Gagal melakukan presensi: ' + error.message, 'error');
  }
}

// Fungsi untuk memuat riwayat presensi (admin)
async function loadPresenceData(filters = {}) {
  try {
    let query = db.collection('presensi').orderBy('waktu', 'desc');
    
    // Terapkan filter nama
    if (filters.nama) {
      query = query.where('nama', '==', filters.nama);
    }
    
    // Terapkan filter tanggal
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      endDate.setDate(endDate.getDate() + 1); // Sampai akhir hari
      
      query = query.where('waktu', '>=', startDate)
                  .where('waktu', '<=', endDate);
    }
    
    const snapshot = await query.get();
    const tableBody = $('#tableBody');
    
    if (snapshot.empty) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
      return;
    }
    
    // Kosongkan tabel
    tableBody.innerHTML = '';
    
    // Isi tabel dengan data
    snapshot.forEach(doc => {
      const data = doc.data();
      const waktu = data.waktu.toDate();
      const waktuFormatted = waktu.toLocaleDateString('id-ID', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) + '<br>' + waktu.toLocaleTimeString('id-ID');
      
      const statusClass = data.status.includes('Tepat') ? 's-good' : 
                         data.status.includes('Terlambat') ? 's-warn' : 's-bad';
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${waktuFormatted}</td>
        <td>${data.nama}</td>
        <td>${data.jenis}</td>
        <td><span class="status ${statusClass}">${data.status}</span></td>
        <td>${data.koordinat.latitude.toFixed(4)}, ${data.koordinat.longitude.toFixed(4)}</td>
        <td><a href="${data.foto}" target="_blank">Lihat Foto</a></td>
      `;
      
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading presence data:', error);
    showToast('Gagal memuat data presensi', 'error');
  }
}

// Fungsi untuk mengekspor data ke CSV
async function exportToCSV() {
  try {
    // Dapatkan filter yang aktif
    const namaFilter = $('#fNama').value.trim();
    const periodeFilter = $('#fPeriode').value;
    let startDate, endDate;
    
    if (periodeFilter === 'custom') {
      startDate = $('#fDari').value;
      endDate = $('#fSampai').value;
    } else {
      const now = new Date();
      
      switch (periodeFilter) {
        case 'harian':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        case 'mingguan':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()) + 1);
          break;
        case 'bulanan':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'tahunan':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear() + 1, 0, 1);
          break;
      }
      
      startDate = startDate.toISOString().split('T')[0];
      endDate = endDate.toISOString().split('T')[0];
    }
    
    // Muat data dengan filter
    let query = db.collection('presensi').orderBy('nama').orderBy('waktu', 'asc');
    
    if (namaFilter) {
      query = query.where('nama', '==', namaFilter);
    }
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      
      query = query.where('waktu', '>=', start)
                  .where('waktu', '<=', end);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      showToast('Tidak ada data untuk diekspor', 'warning');
      return;
    }
    
    // Format data sesuai STDR
    const dataByUser = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const userKey = data.nama;
      
      if (!dataByUser[userKey]) {
        dataByUser[userKey] = [];
      }
      
      dataByUser[userKey].push({
        tanggal: data.waktu.toDate().toISOString().split('T')[0],
        waktu: data.waktu.toDate().toLocaleTimeString('id-ID'),
        shift: data.shift,
        jenis: data.jenis,
        status: data.status,
        koordinat: `${data.koordinat.latitude.toFixed(4)}, ${data.koordinat.longitude.toFixed(4)}`
      });
    });
    
    // Urutkan nama alfabetis
    const sortedUsers = Object.keys(dataByUser).sort();
    
    // Buat konten CSV
    let csvContent = 'Nama,Tanggal,Shift,Jenis,Status,Koordinat\n';
    
    for (const user of sortedUsers) {
      // Urutkan data per user berdasarkan tanggal dan waktu
      dataByUser[user].sort((a, b) => {
        if (a.tanggal !== b.tanggal) {
          return a.tanggal.localeCompare(b.tanggal);
        }
        
        // Jika tanggal sama, berangkat lebih dulu lalu pulang
        if (a.jenis === 'berangkat' && b.jenis !== 'berangkat') return -1;
        if (a.jenis !== 'berangkat' && b.jenis === 'berangkat') return 1;
        
        return a.waktu.localeCompare(b.waktu);
      });
      
      // Tambahkan data ke CSV
      for (const record of dataByUser[user]) {
        csvContent += `"${user}",${record.tanggal},${record.shift},${record.jenis},${record.status},"${record.koordinat}"\n`;
      }
      
      // Tambahkan baris kosong antar blok karyawan
      csvContent += '\n';
    }
    
    // Buat file dan unduh
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `presensi_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV berhasil diekspor', 'success');
  } catch (error) {
    console.error('Error exporting CSV:', error);
    showToast('Gagal mengekspor CSV', 'error');
  }
}

// Fungsi untuk memuat dan memperbarui waktu server
async function updateServerTime() {
  try {
    const serverTime = await getServerTime();
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
    
    const timeElement = $('#serverTime');
    if (timeElement) {
      timeElement.textContent = serverTime.toLocaleDateString('id-ID', options);
    }
    
    // Perbarui shift dan status presensi
    const shift = determineShift(serverTime);
    const shiftElement = $('#shiftText');
    if (shiftElement) {
      shiftElement.textContent = shift ? `Shift ${shift}` : 'Di luar jam kerja';
    }
    
    // Perbarui status presensi
    const jenisElement = $('#jenis');
    if (jenisElement) {
      const jenis = jenisElement.value;
      const statusInfo = determinePresenceStatus(serverTime, shift, jenis);
      
      const statusElement = $('#statusText');
      const statusChip = $('#statusChip');
      
      if (statusElement && statusChip) {
        statusElement.textContent = statusInfo.status;
        
        // Update kelas status
        statusChip.className = 'status ';
        if (statusInfo.status === 'Tepat Waktu') {
          statusChip.classList.add('s-good');
        } else if (statusInfo.status === 'Terlambat') {
          statusChip.classList.add('s-warn');
        } else if (statusInfo.status === 'Libur') {
          statusChip.classList.add('s-bad');
        } else {
          statusChip.classList.add('s-bad');
        }
      }
      
      // Update kemampuan untuk melakukan presensi
      isRestricted = !statusInfo.canPresence && jenis !== 'izin';
    }
    
    // Perbarui lokasi
    try {
      const location = await getLocation();
      const locElement = $('#locText');
      if (locElement) {
        locElement.textContent = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  } catch (error) {
    console.error('Error updating server time:', error);
  }
}

// Fungsi untuk logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch((error) => {
    console.error('Error signing out:', error);
    showToast('Gagal keluar', 'error');
  });
}

// Inisialisasi aplikasi setelah login
function initApp() {
  // Dapatkan user yang sedang login
  currentUser = auth.currentUser;
  
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }
  
  // Muat profil pengguna
  loadUserProfile();
  
  // Mulai pembaruan waktu server
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Setup event listeners berdasarkan halaman
  if (window.location.pathname.includes('karyawan.html')) {
    initKaryawanPage();
  } else if (window.location.pathname.includes('admin.html')) {
    initAdminPage();
  }
}

// Inisialisasi halaman karyawan
function initKaryawanPage() {
  // Mulai kamera
  startCamera();
  
  // Event listener untuk tombol ambil foto
  $('#snapBtn').addEventListener('click', async () => {
    try {
      capturedPhotoData = await capturePhoto();
      
      // Tampilkan preview foto
      $('#photoPreview').src = capturedPhotoData;
      $('#photoPreview').style.display = 'block';
      $('#cameraPreview').style.display = 'none';
      
      // Aktifkan tombol upload
      $('#uploadBtn').disabled = false;
      
      showToast('Foto berhasil diambil', 'success');
    } catch (error) {
      console.error('Error capturing photo:', error);
      showToast('Gagal mengambil foto', 'error');
    }
  });
  
  // Event listener untuk tombol upload
  $('#uploadBtn').addEventListener('click', async () => {
    const jenis = $('#jenis').value;
    
    // Nonaktifkan tombol sementara
    $('#uploadBtn').disabled = true;
    $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
    
    await submitPresence(jenis);
    
    // Kembalikan state tombol
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  });
  
  // Event listener untuk perubahan jenis presensi
  $('#jenis').addEventListener('change', () => {
    // Perbarui status presensi berdasarkan jenis yang dipilih
    updateServerTime();
  });
  
  // Event listener untuk dialog profil
  $('#profileBtn').addEventListener('click', showProfileDialog);
  $('#saveProfileBtn').addEventListener('click', saveUserProfile);
  $('#logoutBtn').addEventListener('click', logout);
}

// Inisialisasi halaman admin
function initAdminPage() {
  // Muat data presensi
  loadPresenceData();
  
  // Event listener untuk filter
  $('#applyFilter').addEventListener('click', () => {
    const filters = {
      nama: $('#fNama').value.trim() || null,
      startDate: $('#fDari').value || null,
      endDate: $('#fSampai').value || null
    };
    
    loadPresenceData(filters);
  });
  
  // Event listener untuk perubahan periode filter
  $('#fPeriode').addEventListener('change', () => {
    const period = $('#fPeriode').value;
    $('#customDateRange').style.display = period === 'custom' ? 'flex' : 'none';
  });
  
  // Event listener untuk ekspor CSV
  $('#exportCsv').addEventListener('click', exportToCSV);
  
  // Event listener untuk dialog profil
  $('#profileBtn').addEventListener('click', showProfileDialog);
  $('#saveProfileBtn').addEventListener('click', saveUserProfile);
  $('#logoutBtn').addEventListener('click', logout);
}

// Jalankan aplikasi ketika halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
  // Periksa status autentikasi
  auth.onAuthStateChanged((user) => {
    if (user) {
      initApp();
    } else {
      window.location.href = 'index.html';
    }
  });
});

// Handle ketika halaman akan ditutup atau di-refresh
window.addEventListener('beforeunload', () => {
  stopCamera();
});