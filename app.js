// Inisialisasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyApYdiUlLMb9ihBkLnCjDpLJHqYFRFS3Fw",
  authDomain: "fupa-snack.firebaseapp.com",
  projectId: "fupa-snack",
  storageBucket: "fupa-snack.firebasestorage.app",
  messagingSenderId: "972524876738",
  appId: "1:972524876738:web:dd0d57dd8bf2d8a8dd9c5b"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Cloudinary configuration
const cloudName = 'da7idhh4f';
const uploadPreset = 'FupaSnack';

// Util
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const toast = (msg, type = 'info') => {
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
  setTimeout(() => { t.style.display = "none"; }, 3000);
};

// Fungsi untuk mendapatkan waktu server dari Firestore
async function getServerTime() {
  return await firebase.firestore.Timestamp.now().toDate();
}

// Fungsi untuk menentukan status presensi
function determinePresenceStatus(now, jenis, shift) {
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Hari Minggu libur
  if (day === 0) return { status: 'Libur', color: 's-bad' };
  
  // Izin selalu valid
  if (jenis === 'izin') return { status: 'Izin', color: 's-warn' };
  
  // Shift pagi
  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      // 05:30 - 06:00 tepat waktu, 06:01 - 06:20 terlambat
      if (hour === 5 && minute >= 30) return { status: 'Tepat Waktu', color: 's-good' };
      if (hour === 6 && minute <= 0) return { status: 'Tepat Waktu', color: 's-good' };
      if (hour === 6 && minute <= 20) return { status: 'Terlambat', color: 's-warn' };
    } else if (jenis === 'pulang') {
      // 10:00 - 11:00 tepat waktu, 11:01 - 11:20 terlambat
      if (hour === 10 && minute >= 0) return { status: 'Tepat Waktu', color: 's-good' };
      if (hour === 11 && minute <= 0) return { status: 'Tepat Waktu', color: 's-good' };
      if (hour === 11 && minute <= 20) return { status: 'Terlambat', color: 's-warn' };
    }
  }
  
  // Shift sore
  if (shift === 'sore') {
    if (jenis === 'berangkat') {
      // 14:00 - 14:30 tepat waktu, 14:31 - 14:50 terlambat
      if (hour === 14 && minute >= 0 && minute <= 30) return { status: 'Tepat Waktu', color: 's-good' };
      if (hour === 14 && minute > 30 && minute <= 50) return { status: 'Terlambat', color: 's-warn' };
    } else if (jenis === 'pulang') {
      // 17:30 - 18:30 tepat waktu, 18:31 - 18:50 terlambat
      if (hour === 17 && minute >= 30) return { status: 'Tepat Waktu', color: 's-good' };
      if (hour === 18 && minute <= 30) return { status: 'Tepat Waktu', color: 's-good' };
      if (hour === 18 && minute > 30 && minute <= 50) return { status: 'Terlambat', color: 's-warn' };
    }
  }
  
  return { status: 'Di luar sesi presensi', color: 's-bad' };
}

// Fungsi untuk mendapatkan lokasi
function getLocation() {
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
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Fungsi untuk mengompres gambar
function compressImage(file, maxSizeKB = 50) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Hitung ukuran baru
        let width = img.width;
        let height = img.height;
        const maxDimension = 1024;
        
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
        
        // Konversi ke blob dengan kualitas menyesuaikan ukuran
        let quality = 0.9;
        let attempts = 0;
        
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              const sizeKB = blob.size / 1024;
              
              if (sizeKB <= maxSizeKB || attempts >= 5) {
                // Hapus metadata EXIF
                const cleanBlob = new Blob([blob], { type: 'image/jpeg' });
                resolve(cleanBlob);
              } else {
                quality -= 0.1;
                attempts++;
                setTimeout(tryCompress, 100);
              }
            },
            'image/jpeg',
            quality
          );
        };
        
        tryCompress();
      };
    };
    reader.onerror = error => reject(error);
  });
}

// Fungsi untuk upload ke Cloudinary
async function uploadToCloudinary(blob) {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', uploadPreset);
  
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload gagal');
    }
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

// Fungsi untuk memuat profil pengguna
async function loadProfile(user, userData) {
  if ($('#nama')) $('#nama').value = userData.nama || '';
  if ($('#alamat')) $('#alamat').value = userData.alamat || '';
  
  if ($('#pfp')) {
    $('#pfp').src = userData.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${userData.nama || 'User'}&backgroundColor=ffb300,ffd54f&radius=20`;
  }
}

// Fungsi untuk menyimpan profil
async function saveProfile(user, userData) {
  try {
    await db.collection('users').doc(user.uid).set({
      ...userData,
      nama: $('#nama').value,
      alamat: $('#alamat').value,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    toast('Profil berhasil disimpan', 'success');
  } catch (error) {
    console.error('Error saving profile:', error);
    toast('Gagal menyimpan profil', 'error');
  }
}

// Inisialisasi kamera
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    
    const video = $('#video');
    video.srcObject = stream;
    video.style.display = 'block';
    $('#cameraPlaceholder').style.display = 'none';
    
    return stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    toast('Tidak dapat mengakses kamera', 'error');
    throw error;
  }
}

// Ambil foto dari kamera
function takePicture(video, canvas) {
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  return canvas.toDataURL('image/jpeg');
}

// Fungsi untuk memeriksa apakah sudah presensi hari ini
async function checkTodayPresence(userId, jenis) {
  try {
    const now = await getServerTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    const querySnapshot = await db.collection('presences')
      .where('userId', '==', userId)
      .where('waktu', '>=', todayStart)
      .where('waktu', '<', todayEnd)
      .where('jenis', '==', jenis)
      .get();
    
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking today presence:', error);
    return false;
  }
}

// Fungsi untuk submit presensi
async function submitPresence(user, userData, jenis, imageDataUrl, location) {
  try {
    // Konversi data URL ke blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    
    // Kompres gambar
    const compressedBlob = await compressImage(blob, 50);
    
    // Upload ke Cloudinary
    toast('Mengupload foto...', 'info');
    const imageUrl = await uploadToCloudinary(compressedBlob);
    
    // Dapatkan waktu server
    const now = await getServerTime();
    
    // Tentukan shift
    let shift = userData.shift || 'pagi';
    if (jenis === 'izin') shift = 'Penuh';
    
    // Tentukan status
    const statusInfo = determinePresenceStatus(now, jenis, shift);
    
    // Simpan ke Firestore
    const presenceData = {
      userId: user.uid,
      nama: userData.nama,
      waktu: now,
      shift: shift,
      jenis: jenis,
      status: statusInfo.status,
      koordinat: new firebase.firestore.GeoPoint(location.lat, location.lng),
      selfie: imageUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('presences').add(presenceData);
    
    toast('Presensi berhasil dicatat', 'success');
    return true;
  } catch (error) {
    console.error('Error submitting presence:', error);
    toast('Gagal mencatat presensi', 'error');
    return false;
  }
}

// Fungsi untuk memuat riwayat presensi (admin)
async function loadPresenceHistory(filters = {}) {
  try {
    let query = db.collection('presences').orderBy('waktu', 'desc');
    
    // Filter nama
    if (filters.nama) {
      query = query.where('nama', '==', filters.nama);
    }
    
    // Filter periode
    if (filters.periode && filters.periode !== 'all') {
      const now = await getServerTime();
      let startDate;
      
      switch (filters.periode) {
        case 'harian':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'mingguan':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          break;
        case 'bulanan':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'tahunan':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case 'custom':
          if (filters.dari && filters.sampai) {
            startDate = new Date(filters.dari);
            const endDate = new Date(filters.sampai);
            query = query.where('waktu', '>=', startDate).where('waktu', '<=', endDate);
          }
          break;
      }
      
      if (filters.periode !== 'custom') {
        query = query.where('waktu', '>=', startDate);
      }
    }
    
    // Batasi jumlah hasil
    if (filters.limit && filters.limit !== 'all') {
      query = query.limit(parseInt(filters.limit));
    }
    
    const querySnapshot = await query.get();
    const presences = [];
    
    querySnapshot.forEach((doc) => {
      presences.push({ id: doc.id, ...doc.data() });
    });
    
    return presences;
  } catch (error) {
    console.error('Error loading presence history:', error);
    toast('Gagal memuat riwayat presensi', 'error');
    return [];
  }
}

// Fungsi untuk mengekspor CSV
function exportToCSV(presences, filename = 'presensi.csv') {
  if (presences.length === 0) {
    toast('Tidak ada data untuk diekspor', 'warning');
    return;
  }
  
  // Format STDR: Nama, Tanggal, Shift, Jenis, Status, Koordinat
  let csvContent = 'Nama,Tanggal,Shift,Jenis,Status,Koordinat\n';
  
  // Urutkan berdasarkan nama dan tanggal
  presences.sort((a, b) => {
    if (a.nama < b.nama) return -1;
    if (a.nama > b.nama) return 1;
    return a.waktu.toDate() - b.waktu.toDate();
  });
  
  let currentName = '';
  presences.forEach((presence) => {
    if (presence.nama !== currentName) {
      currentName = presence.nama;
      // Tambahkan baris kosong antar blok
      csvContent += '\n';
    }
    
    const date = presence.waktu.toDate();
    const dateStr = date.toLocaleDateString('id-ID');
    const coordStr = `${presence.koordinat.latitude},${presence.koordinat.longitude}`;
    
    csvContent += `"${presence.nama}","${dateStr}","${presence.shift}","${presence.jenis}","${presence.status}","${coordStr}"\n`;
  });
  
  // Buat blob dan unduh
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Fungsi untuk memuat data pengguna (admin)
async function loadUsers() {
  try {
    const querySnapshot = await db.collection('users').get();
    const users = [];
    
    querySnapshot.forEach((doc) => {
      if (doc.data().role === 'karyawan') {
        users.push({ id: doc.id, ...doc.data() });
      }
    });
    
    return users;
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

// Inisialisasi aplikasi berdasarkan halaman
function initApp() {
  const currentPage = window.location.pathname.split('/').pop();
  
  // Update waktu server
  function updateServerTime() {
    getServerTime().then(now => {
      const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };
      
      if ($('#serverTime')) {
        $('#serverTime').textContent = now.toLocaleDateString('id-ID', options);
      }
    });
  }
  
  // Update waktu setiap detik
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Event listener untuk logout
  if ($('#logoutBtn')) {
    $('#logoutBtn').addEventListener('click', () => {
      auth.signOut().then(() => {
        toast('Berhasil keluar', 'success');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      }).catch(error => {
        console.error('Error signing out:', error);
        toast('Gagal keluar', 'error');
      });
    });
  }
  
  // Event listener untuk simpan profil
  if ($('#saveProfileBtn')) {
    $('#saveProfileBtn').addEventListener('click', () => {
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          const userDoc = await db.collection('users').doc(user.uid).get();
          if (userDoc.exists) {
            saveProfile(user, userDoc.data());
          }
        }
      });
    });
  }
  
  // Event listener untuk ganti foto profil
  if ($('#pfpFile')) {
    $('#pfpFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const user = auth.currentUser;
        if (!user) return;
        
        // Kompres gambar
        const compressedBlob = await compressImage(file, 50);
        
        // Upload ke Cloudinary
        toast('Mengupload foto...', 'info');
        const imageUrl = await uploadToCloudinary(compressedBlob);
        
        // Update foto profil di Firestore
        await db.collection('users').doc(user.uid).update({
          photoURL: imageUrl
        });
        
        // Update foto di UI
        if ($('#pfp')) {
          $('#pfp').src = imageUrl;
        }
        
        toast('Foto profil berhasil diubah', 'success');
      } catch (error) {
        console.error('Error changing profile picture:', error);
        toast('Gagal mengubah foto profil', 'error');
      }
    });
  }
  
  // Inisialisasi halaman karyawan
  if (currentPage === 'karyawan.html') {
    let cameraStream = null;
    let capturedImage = null;
    
    // Inisialisasi kamera
    setTimeout(() => {
      initCamera().then(stream => {
        cameraStream = stream;
      }).catch(error => {
        console.error('Camera initialization failed:', error);
      });
    }, 1000);
    
    // Event listener untuk ambil foto
    if ($('#snapBtn')) {
      $('#snapBtn').addEventListener('click', () => {
        if (!cameraStream) {
          toast('Kamera belum siap', 'error');
          return;
        }
        
        const video = $('#video');
        const canvas = $('#canvas');
        
        capturedImage = takePicture(video, canvas);
        
        // Tampilkan preview
        $('#capturedImage').src = capturedImage;
        $('#capturedImage').style.display = 'block';
        video.style.display = 'none';
        $('#cameraPlaceholder').style.display = 'none';
        
        // Aktifkan tombol upload
        $('#uploadBtn').disabled = false;
        
        toast('Foto berhasil diambil', 'success');
      });
    }
    
    // Event listener untuk upload presensi
    if ($('#uploadBtn')) {
      $('#uploadBtn').addEventListener('click', async () => {
        if (!capturedImage) {
          toast('Ambil foto terlebih dahulu', 'error');
          return;
        }
        
        const jenis = $('#jenis').value;
        
        // Nonaktifkan tombol selama proses
        $('#uploadBtn').disabled = true;
        $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
        
        try {
          // Dapatkan lokasi
          toast('Mendapatkan lokasi...', 'info');
          const location = await getLocation();
          $('#locText').textContent = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
          
          // Periksa apakah sudah presensi hari ini
          const user = auth.currentUser;
          const alreadyPresenced = await checkTodayPresence(user.uid, jenis);
          
          if (alreadyPresenced && jenis !== 'izin') {
            toast('Anda sudah melakukan presensi ' + jenis + ' hari ini', 'error');
            $('#uploadBtn').disabled = false;
            $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
            return;
          }
          
          // Dapatkan data user
          const userDoc = await db.collection('users').doc(user.uid).get();
          const userData = userDoc.data();
          
          // Submit presensi
          const success = await submitPresence(user, userData, jenis, capturedImage, location);
          
          if (success) {
            // Reset form
            capturedImage = null;
            $('#capturedImage').style.display = 'none';
            $('#video').style.display = 'block';
            
            // Nonaktifkan tombol upload
            $('#uploadBtn').disabled = true;
          }
        } catch (error) {
          console.error('Error uploading presence:', error);
          toast('Gagal mengupload presensi', 'error');
        }
        
        // Aktifkan kembali tombol
        $('#uploadBtn').disabled = false;
        $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      });
    }
    
    // Event listener untuk dialog profil
    if ($('#profileBtn')) {
      $('#profileBtn').addEventListener('click', () => {
        $('#profileDlg').showModal();
      });
    }
    
    // Update status presensi secara berkala
    function updatePresenceStatus() {
      getServerTime().then(now => {
        const jenis = $('#jenis').value;
        const user = auth.currentUser;
        
        if (user) {
          db.collection('users').doc(user.uid).get().then(userDoc => {
            if (userDoc.exists) {
              const userData = userDoc.data();
              const shift = userData.shift || 'pagi';
              const statusInfo = determinePresenceStatus(now, jenis, shift);
              
              if ($('#statusText')) {
                $('#statusText').textContent = statusInfo.status;
              }
              
              if ($('#statusChip')) {
                $('#statusChip').className = `status ${statusInfo.color}`;
              }
            }
          });
        }
      });
    }
    
    updatePresenceStatus();
    setInterval(updatePresenceStatus, 60000); // Update setiap menit
    
    // Update status ketika jenis berubah
    if ($('#jenis')) {
      $('#jenis').addEventListener('change', updatePresenceStatus);
    }
  }
  
  // Inisialisasi halaman admin
  if (currentPage === 'admin.html') {
    let allPresences = [];
    let currentFilters = {};
    
    // Event listener untuk filter
    if ($('#applyFilter')) {
      $('#applyFilter').addEventListener('click', async () => {
        const filters = {
          nama: $('#fNama').value || null,
          periode: $('#fPeriode').value,
          dari: $('#fDari').value,
          sampai: $('#fSampai').value,
          limit: $('#fShow').value
        };
        
        currentFilters = filters;
        
        // Tampilkan loading
        $('#applyFilter').disabled = true;
        $('#applyFilter').innerHTML = '<span class="spinner"></span> Memuat...';
        
        // Muat data dengan filter
        allPresences = await loadPresenceHistory(filters);
        renderPresenceTable(allPresences);
        
        // Sembunyikan loading
        $('#applyFilter').disabled = false;
        $('#applyFilter').innerHTML = '<span class="material-symbols-rounded">filter_alt</span> Terapkan';
      });
    }
    
    // Event listener untuk periode custom
    if ($('#fPeriode')) {
      $('#fPeriode').addEventListener('change', () => {
        $('#customDateRange').style.display = 
          $('#fPeriode').value === 'custom' ? 'flex' : 'none';
      });
    }
    
    // Event listener untuk ekspor CSV
    if ($('#exportCsv')) {
      $('#exportCsv').addEventListener('click', () => {
        if (allPresences.length === 0) {
          toast('Tidak ada data untuk diekspor', 'warning');
          return;
        }
        
        // Tampilkan loading
        $('#exportCsv').disabled = true;
        $('#exportCsv').innerHTML = '<span class="spinner"></span> Mengekspor...';
        
        // Ekspor ke CSV
        exportToCSV(allPresences, `presensi-${new Date().toISOString().split('T')[0]}.csv`);
        
        // Sembunyikan loading
        setTimeout(() => {
          $('#exportCsv').disabled = false;
          $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
        }, 1000);
      });
    }
    
    // Event listener untuk dialog profil
    if ($('#profileBtn')) {
      $('#profileBtn').addEventListener('click', () => {
        $('#profileDlg').showModal();
      });
    }
    
    // Fungsi untuk render tabel presensi
    function renderPresenceTable(presences) {
      const tableBody = $('#tableBody');
      if (!tableBody) return;
      
      tableBody.innerHTML = '';
      
      if (presences.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center">Tidak ada data presensi</td></tr>';
        return;
      }
      
      presences.forEach(presence => {
        const row = document.createElement('tr');
        const date = presence.waktu.toDate();
        
        // Tentukan class status
        let statusClass = 's-good';
        if (presence.status === 'Terlambat') statusClass = 's-warn';
        if (presence.status === 'Libur' || presence.status === 'Di luar sesi presensi') statusClass = 's-bad';
        
        row.innerHTML = `
          <td>${date.toLocaleDateString('id-ID')}<br>${date.toLocaleTimeString('id-ID')}</td>
          <td>${presence.nama}</td>
          <td>${presence.shift}</td>
          <td>${presence.jenis}</td>
          <td><span class="status ${statusClass}">${presence.status}</span></td>
          <td>${presence.koordinat.latitude.toFixed(6)}, ${presence.koordinat.longitude.toFixed(6)}</td>
          <td><a href="${presence.selfie}" target="_blank">Lihat Foto</a></td>
        `;
        
        tableBody.appendChild(row);
      });
    }
    
    // Muat data awal
    setTimeout(async () => {
      allPresences = await loadPresenceHistory({ limit: '50' });
      renderPresenceTable(allPresences);
    }, 1000);
  }
}

// Jalankan aplikasi ketika auth state berubah
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // User logged in
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      // Jika tidak ada data user, mungkin logout atau tampilkan error
      toast('Data pengguna tidak ditemukan', 'error');
      auth.signOut();
      return;
    }
    
    const userData = userDoc.data();
    const currentPage = window.location.pathname.split('/').pop();
    
    // Redirect jika role tidak sesuai
    if (currentPage === 'admin.html' && userData.role !== 'admin') {
      toast('Akses ditolak. Hanya untuk admin.', 'error');
      auth.signOut();
      return;
    }
    
    if (currentPage === 'karyawan.html' && userData.role !== 'karyawan') {
      toast('Akses ditolak. Hanya untuk karyawan.', 'error');
      auth.signOut();
      return;
    }
    
    // Muat profil
    loadProfile(user, userData);
    
    // Inisialisasi aplikasi
    initApp();
  } else {
    // User not logged in, redirect to index.html
    window.location.href = 'index.html';
  }
});