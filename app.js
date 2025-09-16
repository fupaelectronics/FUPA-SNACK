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

// Variabel global
let currentUser = null;
let userProfile = null;
let stream = null;
let currentPhotoUrl = null;
let hasPresencedToday = {
  berangkat: false,
  pulang: false,
  izin: false
};

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

// Format waktu Indonesia
function formatTime(date) {
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
  return date.toLocaleDateString('id-ID', options);
}

// Deteksi shift berdasarkan waktu
function getShift() {
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 5 && hour < 12) return 'pagi';
  if (hour >= 12 && hour < 18) return 'sore';
  return 'malam';
}

// Status presensi berdasarkan waktu
function getPresenceStatus() {
  const now = new Date();
  const day = now.getDay(); // 0 = Minggu, 1 = Senin, dst
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Jika hari Minggu
  if (day === 0) return { status: 'Libur', type: 'info' };
  
  const shift = getShift();
  let status = 'Di luar sesi presensi';
  let type = 'bad';
  
  if (shift === 'pagi') {
    // Berangkat: 05:30 - 06:00 (tepat waktu), 06:00 - 06:20 (terlambat)
    if (hour === 5 && minute >= 30) status = 'Tepat Waktu', type = 'good';
    else if ((hour === 6 && minute <= 20) || (hour === 5 && minute >= 30)) status = 'Tepat Waktu', type = 'good';
    else if (hour === 6 && minute > 20) status = 'Terlambat', type = 'warn';
    // Pulang: 10:00 - 11:00 (tepat waktu), 11:00 - 11:20 (terlambat)
    else if (hour === 10 || (hour === 11 && minute <= 20)) status = 'Tepat Waktu', type = 'good';
    else if (hour === 11 && minute > 20) status = 'Terlambat', type = 'warn';
  } else if (shift === 'sore') {
    // Berangkat: 14:00 - 14:30 (tepat waktu), 14:30 - 14:50 (terlambat)
    if ((hour === 14 && minute >= 0 && minute <= 30) || (hour === 14 && minute <= 50)) status = 'Tepat Waktu', type = 'good';
    else if (hour === 14 && minute > 50) status = 'Terlambat', type = 'warn';
    // Pulang: 17:30 - 18:30 (tepat waktu), 18:30 - 18:50 (terlambat)
    else if ((hour === 17 && minute >= 30) || (hour === 18 && minute <= 30)) status = 'Tepat Waktu', type = 'good';
    else if (hour === 18 && minute > 30) status = 'Terlambat', type = 'warn';
  }
  
  // Izin bisa dilakukan kapan saja
  return { status, type };
}

// Cek apakah sudah melakukan presensi hari ini
async function checkTodaysPresence() {
  if (!currentUser) return;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  try {
    const presenceRef = db.collection('presensi')
      .where('uid', '==', currentUser.uid)
      .where('waktu', '>=', today)
      .where('waktu', '<', tomorrow);
    
    const snapshot = await presenceRef.get();
    
    // Reset status
    hasPresencedToday = { berangkat: false, pulang: false, izin: false };
    
    snapshot.forEach(doc => {
      const data = doc.data();
      hasPresencedToday[data.jenis] = true;
    });
    
    // Nonaktifkan tombol jika sudah presensi
    const jenisSelect = $('#jenis');
    if (jenisSelect) {
      const selectedType = jenisSelect.value;
      if (hasPresencedToday[selectedType]) {
        $('#uploadBtn').disabled = true;
      } else {
        $('#uploadBtn').disabled = !currentPhotoUrl;
      }
    }
  } catch (error) {
    console.error('Error checking today presence:', error);
  }
}

// Ambil koordinat geolokasi
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve(`${latitude}, ${longitude}`);
      },
      (error) => {
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Kompres gambar menggunakan Canvas
function compressImage(file, maxSizeKB = 10) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Hitung dimensi baru dengan menjaga aspek rasio
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
        
        // Konversi ke blob dengan kualitas yang disesuaikan
        canvas.toBlob(
          (blob) => {
            if (blob.size > maxSizeKB * 1024) {
              // Jika masih terlalu besar, turunkan kualitas
              canvas.toBlob(
                (newBlob) => resolve(newBlob),
                'image/jpeg',
                0.5
              );
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          0.7
        );
      };
    };
    reader.onerror = error => reject(error);
  });
}

// Upload ke Cloudinary
async function uploadToCloudinary(blob) {
  const url = 'https://api.cloudinary.com/v1_1/da7idhh4f/upload';
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', 'FupaSnack');
  
  try {
    const response = await fetch(url, {
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

// Simpan data presensi ke Firestore
async function savePresence(data) {
  try {
    await db.collection('presensi').add({
      ...data,
      waktu: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Presensi berhasil dicatat', 'success');
    return true;
  } catch (error) {
    console.error('Error saving presence:', error);
    showToast('Gagal menyimpan presensi', 'error');
    return false;
  }
}

// Muat data profil pengguna
async function loadUserProfile() {
  if (!currentUser) return;
  
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    
    if (doc.exists) {
      userProfile = doc.data();
      
      // Isi form profil jika ada
      if ($('#nama')) $('#nama').value = userProfile.nama || '';
      if ($('#alamat')) $('#alamat').value = userProfile.alamat || '';
      if ($('#pfp') && userProfile.fotoURL) {
        $('#pfp').src = userProfile.fotoURL;
      }
      
      // Periksa apakah profil lengkap
      if ((!userProfile.nama || !userProfile.alamat) && $('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    } else {
      // Buat dokumen profil baru jika belum ada
      userProfile = {
        nama: '',
        alamat: '',
        fotoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.email}&backgroundColor=ffb300,ffd54f&radius=20`,
        role: currentUser.uid === 'O1SJ7hYop3UJjDcsA3JqT29aapI3' || 
              currentUser.uid === 'uB2XsyM6fXUj493cRlHCqpe2fxH3' ? 'admin' : 'karyawan'
      };
      
      await db.collection('users').doc(currentUser.uid).set(userProfile);
      
      // Tampilkan dialog profil untuk diisi
      if ($('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
  }
}

// Simpan perubahan profil
async function saveProfile() {
  if (!currentUser) return;
  
  const nama = $('#nama').value.trim();
  const alamat = $('#alamat').value.trim();
  const file = $('#pfpFile').files[0];
  
  if (!nama || !alamat) {
    showToast('Nama dan alamat harus diisi', 'error');
    return;
  }
  
  try {
    let fotoURL = userProfile.fotoURL;
    
    // Upload foto baru jika ada
    if (file) {
      const compressedImage = await compressImage(file);
      fotoURL = await uploadToCloudinary(compressedImage);
    }
    
    // Update profil di Firestore
    await db.collection('users').doc(currentUser.uid).update({
      nama,
      alamat,
      fotoURL
    });
    
    userProfile = { ...userProfile, nama, alamat, fotoURL };
    if ($('#pfp')) $('#pfp').src = fotoURL;
    
    showToast('Profil berhasil disimpan', 'success');
    $('#profileDlg').close();
  } catch (error) {
    console.error('Error saving profile:', error);
    showToast('Gagal menyimpan profil', 'error');
  }
}

// Muat riwayat presensi (untuk admin)
async function loadPresenceHistory(filters = {}) {
  if (!currentUser) return [];
  
  try {
    let query = db.collection('presensi').orderBy('waktu', 'desc');
    
    // Terapkan filter nama jika ada
    if (filters.nama) {
      // Untuk filter nama, kita perlu mendapatkan UID dari nama pengguna
      const usersSnapshot = await db.collection('users')
        .where('nama', '>=', filters.nama)
        .where('nama', '<=', filters.nama + '\uf8ff')
        .get();
      
      const uids = usersSnapshot.docs.map(doc => doc.id);
      if (uids.length > 0) {
        query = query.where('uid', 'in', uids);
      } else {
        // Jika tidak ada pengguna dengan nama tersebut, kembalikan array kosong
        return [];
      }
    }
    
    // Terapkan filter periode jika ada
    if (filters.periode && filters.periode !== 'all') {
      const now = new Date();
      let startDate = new Date();
      
      switch (filters.periode) {
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
          if (filters.dari && filters.sampai) {
            startDate = new Date(filters.dari);
            const endDate = new Date(filters.sampai);
            endDate.setHours(23, 59, 59, 999);
            query = query.where('waktu', '>=', startDate)
                         .where('waktu', '<=', endDate);
            break;
          }
          // Fallthrough to default if custom but no dates
        default:
          // Tidak ada filter tanggal
      }
      
      if (filters.periode !== 'custom') {
        query = query.where('waktu', '>=', startDate);
      }
    }
    
    // Terapkan limit jika ada
    if (filters.limit && filters.limit !== 'all') {
      query = query.limit(parseInt(filters.limit));
    }
    
    const snapshot = await query.get();
    const presences = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Dapatkan nama pengguna dari koleksi users
      const userDoc = await db.collection('users').doc(data.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      
      presences.push({
        id: doc.id,
        waktu: data.waktu ? data.waktu.toDate() : new Date(),
        nama: userData.nama || 'Tidak diketahui',
        jenis: data.jenis,
        status: data.status,
        koordinat: data.koordinat,
        fotoURL: data.fotoURL,
        shift: data.shift
      });
    }
    
    return presences;
  } catch (error) {
    console.error('Error loading presence history:', error);
    showToast('Gagal memuat riwayat presensi', 'error');
    return [];
  }
}

// Ekspor data ke CSV
function exportToCSV(data, filename = 'presensi.csv') {
  if (data.length === 0) {
    showToast('Tidak ada data untuk diekspor', 'warning');
    return;
  }
  
  // Urutkan data berdasarkan nama kemudian waktu
  data.sort((a, b) => {
    if (a.nama < b.nama) return -1;
    if (a.nama > b.nama) return 1;
    return a.waktu - b.waktu;
  });
  
  // Header CSV
  let csv = 'Nama,Tanggal,Shift,Jenis,Status,Koordinat\n';
  
  // Data CSV
  data.forEach(item => {
    const date = item.waktu.toLocaleDateString('id-ID');
    csv += `"${item.nama}",${date},${item.shift},${item.jenis},${item.status},"${item.koordinat}"\n`;
  });
  
  // Buat blob dan unduh
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Inisialisasi kamera
async function initCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    
    const video = $('#cameraPreview');
    if (video) {
      video.srcObject = stream;
      video.play();
    }
  } catch (error) {
    console.error('Error accessing camera:', error);
    showToast('Tidak dapat mengakses kamera', 'error');
  }
}

// Ambil foto dari kamera
function capturePhoto() {
  const video = $('#cameraPreview');
  const canvas = $('#photoCanvas');
  const photo = $('#photoResult');
  
  if (!video || !canvas) return null;
  
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Konversi ke blob
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.8);
  });
}

// Logout
function logout() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch(error => {
    console.error('Error signing out:', error);
  });
}

// Deteksi status auth
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    
    // Dapatkan role dari Firestore
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        
        // Redirect berdasarkan role
        if (userData.role === 'admin' && !window.location.pathname.endsWith('admin.html')) {
          window.location.href = 'admin.html';
        } else if (userData.role === 'karyawan' && !window.location.pathname.endsWith('karyawan.html')) {
          window.location.href = 'karyawan.html';
        } else {
          // Pengguna sudah di halaman yang benar, lanjutkan inisialisasi
          await initializePage();
        }
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  } else {
    // Pengguna tidak login, redirect ke index
    if (!window.location.pathname.endsWith('index.html')) {
      window.location.href = 'index.html';
    }
  }
});

// Inisialisasi halaman berdasarkan role
async function initializePage() {
  await loadUserProfile();
  
  // Inisialisasi berdasarkan halaman
  if (window.location.pathname.endsWith('karyawan.html')) {
    initKaryawanPage();
  } else if (window.location.pathname.endsWith('admin.html')) {
    initAdminPage();
  }
}

// Inisialisasi halaman karyawan
function initKaryawanPage() {
  // Update waktu server
  function updateServerTime() {
    const now = new Date();
    $('#serverTime').textContent = formatTime(now);
    
    // Update status presensi
    const statusInfo = getPresenceStatus();
    const statusChip = $('#statusChip');
    const statusText = $('#statusText');
    
    if (statusChip && statusText) {
      statusText.textContent = statusInfo.status;
      statusChip.className = `status s-${statusInfo.type}`;
      
      // Update icon berdasarkan status
      let icon = 'schedule';
      if (statusInfo.type === 'good') icon = 'check_circle';
      if (statusInfo.type === 'warn') icon = 'warning';
      
      statusChip.innerHTML = `<span class="material-symbols-rounded">${icon}</span><span id="statusText">${statusInfo.status}</span>`;
    }
    
    // Update lokasi
    getLocation().then(coords => {
      $('#locText').textContent = coords;
    }).catch(error => {
      console.error('Error getting location:', error);
      $('#locText').textContent = 'Tidak dapat mengakses lokasi';
    });
  }
  
  // Inisialisasi waktu
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Inisialisasi kamera
  if ($('#cameraPreview')) {
    initCamera().catch(console.error);
  }
  
  // Event listener untuk tombol ambil foto
  $('#snapBtn').addEventListener('click', async () => {
    try {
      const blob = await capturePhoto();
      if (blob) {
        currentPhotoUrl = URL.createObjectURL(blob);
        $('#photoResult').src = currentPhotoUrl;
        $('#uploadBtn').disabled = hasPresencedToday[$('#jenis').value];
        
        showToast('Foto berhasil diambil', 'success');
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      showToast('Gagal mengambil foto', 'error');
    }
  });
  
  // Event listener untuk tombol upload
  $('#uploadBtn').addEventListener('click', async () => {
    if (!currentPhotoUrl) {
      showToast('Ambil foto terlebih dahulu', 'warning');
      return;
    }
    
    const jenis = $('#jenis').value;
    
    // Nonaktifkan tombol selama proses
    $('#uploadBtn').disabled = true;
    $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
    
    try {
      // Dapatkan koordinat
      const koordinat = await getLocation();
      
      // Dapatkan status presensi
      const statusInfo = getPresenceStatus();
      
      // Kompres dan upload foto
      const response = await fetch(currentPhotoUrl);
      const blob = await response.blob();
      const compressedBlob = await compressImage(blob);
      const fotoURL = await uploadToCloudinary(compressedBlob);
      
      // Simpan data presensi
      const success = await savePresence({
        uid: currentUser.uid,
        nama: userProfile.nama,
        jenis,
        status: statusInfo.status,
        koordinat,
        fotoURL,
        shift: getShift()
      });
      
      if (success) {
        // Reset state
        currentPhotoUrl = null;
        $('#photoResult').src = '';
        $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
        await checkTodaysPresence();
      }
    } catch (error) {
      console.error('Error uploading presence:', error);
      showToast('Gagal mengupload presensi', 'error');
      $('#uploadBtn').disabled = false;
      $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    }
  });
  
  // Event listener untuk perubahan jenis presensi
  $('#jenis').addEventListener('change', () => {
    $('#uploadBtn').disabled = hasPresencedToday[$('#jenis').value] || !currentPhotoUrl;
  });
  
  // Event listener untuk dialog profil
  $('#profileBtn').addEventListener('click', () => {
    $('#profileDlg').showModal();
  });
  
  $('#saveProfileBtn').addEventListener('click', saveProfile);
  $('#logoutBtn').addEventListener('click', logout);
  
  // Periksa presensi hari ini
  checkTodaysPresence();
}

// Inisialisasi halaman admin
function initAdminPage() {
  // Update waktu server
  function updateServerTime() {
    const now = new Date();
    $('#serverTime').textContent = formatTime(now);
  }
  
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Muat riwayat presensi
  async function loadAndDisplayPresenceHistory(filters = {}) {
    const presences = await loadPresenceHistory(filters);
    const tableBody = $('#tableBody');
    
    if (!tableBody) return;
    
    // Kosongkan tabel
    tableBody.innerHTML = '';
    
    if (presences.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
      return;
    }
    
    // Isi tabel dengan data
    presences.forEach(presence => {
      const row = document.createElement('tr');
      
      const waktu = presence.waktu.toLocaleString('id-ID');
      const statusClass = `s-${presence.status === 'Tepat Waktu' ? 'good' : 
                          presence.status === 'Terlambat' ? 'warn' : 'bad'}`;
      
      row.innerHTML = `
        <td>${waktu}</td>
        <td>${presence.nama}</td>
        <td>${presence.jenis}</td>
        <td><span class="status ${statusClass}">${presence.status}</span></td>
        <td>${presence.koordinat}</td>
        <td><a href="${presence.fotoURL}" target="_blank">Lihat Foto</a></td>
      `;
      
      tableBody.appendChild(row);
    });
  }
  
  // Event listener untuk filter
  $('#applyFilter').addEventListener('click', async () => {
    const filters = {
      nama: $('#fNama').value.trim(),
      periode: $('#fPeriode').value,
      dari: $('#fDari').value,
      sampai: $('#fSampai').value,
      limit: $('#fShow').value
    };
    
    await loadAndDisplayPresenceHistory(filters);
  });
  
  // Toggle tampilan custom date range
  $('#fPeriode').addEventListener('change', () => {
    $('#customDateRange').style.display = 
      $('#fPeriode').value === 'custom' ? 'flex' : 'none';
  });
  
  // Event listener untuk ekspor CSV
  $('#exportCsv').addEventListener('click', async () => {
    $('#exportCsv').disabled = true;
    $('#exportCsv').innerHTML = '<span class="spinner"></span> Mengekspor...';
    
    try {
      const filters = {
        nama: $('#fNama').value.trim(),
        periode: $('#fPeriode').value,
        dari: $('#fDari').value,
        sampai: $('#fSampai').value,
        limit: 'all' // Selalu ekspor semua data
      };
      
      const presences = await loadPresenceHistory(filters);
      exportToCSV(presences, `presensi-${new Date().toISOString().split('T')[0]}.csv`);
      
      showToast('CSV berhasil diekspor', 'success');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      showToast('Gagal mengekspor CSV', 'error');
    } finally {
      $('#exportCsv').disabled = false;
      $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
    }
  });
  
  // Event listener untuk dialog profil
  $('#profileBtn').addEventListener('click', () => {
    $('#profileDlg').showModal();
  });
  
  $('#saveProfileBtn').addEventListener('click', saveProfile);
  $('#logoutBtn').addEventListener('click', logout);
  
  // Muat data awal
  loadAndDisplayPresenceHistory();
}