// Konfigurasi Firebase
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

// Variabel global
let currentUser = null;
let userData = null;
let stream = null;
let currentPhoto = null;

// Elemen UI umum
const $ = (sel) => document.querySelector(sel);
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

// Fungsi untuk memeriksa role admin
const isAdmin = (uid) => {
  const adminUids = ['O1SJ7hYop3UJjDcsA3JqT29aapI3', 'uB2XsyM6fXUj493cRlHCqpe2fxH3'];
  return adminUids.includes(uid);
};

// onAuthStateChanged: dipindahkan ke index.html
// Di app.js kita hanya memastikan user sudah login
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    // Ambil data user dari Firestore
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists) {
        userData = doc.data();
        // Jika data user kosong, tampilkan popup isi profil
        if (!userData.nama || !userData.alamat) {
          showProfileDialog();
        }
        // Load data sesuai halaman
        if (window.location.pathname.endsWith('karyawan.html')) {
          loadKaryawanPage();
        } else if (window.location.pathname.endsWith('admin.html')) {
          loadAdminPage();
        }
      } else {
        // Jika tidak ada data, buat data user default
        userData = {
          email: user.email,
          nama: user.email.split('@')[0],
          alamat: 'Fupa',
          role: isAdmin(user.uid) ? 'admin' : 'karyawan'
        };
        await db.collection('users').doc(user.uid).set(userData);
        showProfileDialog();
      }
    } catch (error) {
      console.error("Error getting user document:", error);
    }
  } else {
    // Jika tidak ada user, redirect ke index.html
    window.location.href = 'index.html';
  }
});

// Fungsi untuk menampilkan dialog profil
function showProfileDialog() {
  const profileDlg = document.getElementById('profileDlg');
  if (profileDlg) {
    $('#nama').value = userData.nama || '';
    $('#alamat').value = userData.alamat || '';
    profileDlg.showModal();
  }
}

// Fungsi untuk load halaman karyawan
async function loadKaryawanPage() {
  // Update waktu server
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Ambil lokasi
  getLocation();
  
  // Setup kamera
  setupCamera();
  
  // Load riwayat presensi
  loadPresenceHistory();
  
  // Event listeners
  $('#snapBtn').addEventListener('click', takePicture);
  $('#uploadBtn').addEventListener('click', uploadPresence);
  $('#cutiFab').addEventListener('click', showCutiDialog);
  $('#saveProfileBtn').addEventListener('click', saveProfile);
  $('#logoutBtn').addEventListener('click', logout);
  $('#historyFilter').addEventListener('change', loadPresenceHistory);
  
  // Periksa status presensi
  checkPresenceStatus();
}

// Fungsi untuk load halaman admin
async function loadAdminPage() {
  // Update waktu server
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Load data presensi
  loadAllPresences();
  
  // Event listeners
  $('#applyFilter').addEventListener('click', loadAllPresences);
  $('#exportCsv').addEventListener('click', exportToCSV);
  $('#saveProfileBtn').addEventListener('click', saveProfile);
  $('#logoutBtn').addEventListener('click', logout);
  $('#createUserBtn').addEventListener('click', createUser);
  $('#fPeriode').addEventListener('change', toggleCustomDateRange);
  $('#announceTarget').addEventListener('change', toggleUserSelection);
  $('#sendAnnounce').addEventListener('click', sendAnnouncement);
  $('#notifBtn').addEventListener('click', loadCutiRequests);
  $('#timeRulesFab').addEventListener('click', showTimeRulesDialog);
  $('#saveRulesBtn').addEventListener('click', saveTimeRules);
  $('#saveSchedule').addEventListener('click', saveScheduleSettings);
}

// Fungsi untuk update waktu server
function updateServerTime() {
  const now = new Date();
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  const timeElement = $('#serverTime');
  if (timeElement) {
    timeElement.textContent = now.toLocaleDateString('id-ID', options);
  }
}

// Fungsi untuk mendapatkan lokasi
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        $('#locText').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      },
      (error) => {
        console.error("Error getting location:", error);
        $('#locText').textContent = "Tidak dapat mengakses lokasi";
      }
    );
  } else {
    $('#locText').textContent = "Geolocation tidak didukung";
  }
}

// Fungsi untuk setup kamera
async function setupCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "user" }, 
      audio: false 
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    const cameraPlaceholder = $('.camera-placeholder');
    if (cameraPlaceholder) {
      cameraPlaceholder.innerHTML = '';
      cameraPlaceholder.appendChild(video);
    }
  } catch (error) {
    console.error("Error accessing camera:", error);
    $('.camera-placeholder').innerHTML = `
      <span class="material-symbols-rounded" style="font-size:48px">no_photography</span>
      <div>Kamera tidak dapat diakses</div>
    `;
  }
}

// Fungsi untuk mengambil gambar
function takePicture() {
  if (!stream) {
    toast('Kamera tidak siap', 'error');
    return;
  }
  
  const video = $('video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Kompres gambar menjadi 10KB
  compressImage(canvas.toDataURL('image/jpeg'), 10, (compressedDataUrl) => {
    currentPhoto = compressedDataUrl;
    
    // Tampilkan preview
    const preview = document.createElement('img');
    preview.src = compressedDataUrl;
    const cameraPlaceholder = $('.camera-placeholder');
    cameraPlaceholder.innerHTML = '';
    cameraPlaceholder.appendChild(preview);
    
    // Aktifkan tombol upload
    $('#uploadBtn').disabled = false;
    
    toast('Foto berhasil diambil', 'success');
  });
}

// Fungsi untuk mengkompres gambar
function compressImage(dataUrl, maxSizeKB, callback) {
  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    let quality = 0.9;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const compress = () => {
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      const sizeKB = Math.round((compressedDataUrl.length * 3) / 4 / 1024);
      
      if (sizeKB > maxSizeKB && quality > 0.1) {
        quality -= 0.1;
        compress();
      } else {
        callback(compressedDataUrl);
      }
    };
    
    compress();
  };
}

// Fungsi untuk mengupload presensi
async function uploadPresence() {
  if (!currentPhoto) {
    toast('Ambil foto terlebih dahulu', 'error');
    return;
  }
  
  const jenis = $('#jenis').value;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // Periksa apakah sudah presensi hari ini untuk jenis yang sama
  try {
    const existingPresence = await db.collection('presences')
      .where('uid', '==', currentUser.uid)
      .where('tanggal', '==', today)
      .where('jenis', '==', jenis)
      .get();
    
    if (!existingPresence.empty) {
      toast('Anda sudah melakukan presensi ' + jenis + ' hari ini', 'error');
      return;
    }
  } catch (error) {
    console.error("Error checking existing presence:", error);
    toast('Error memeriksa presensi', 'error');
    return;
  }
  
  // Upload ke Cloudinary
  try {
    $('#uploadBtn').disabled = true;
    $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
    
    // Upload foto ke Cloudinary
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/da7idhh4f/upload`;
    const uploadPreset = 'FupaSnack';
    
    const formData = new FormData();
    formData.append('file', currentPhoto);
    formData.append('upload_preset', uploadPreset);
    
    const response = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    const photoUrl = data.secure_url;
    
    // Dapatkan lokasi
    let lat = 0;
    let lng = 0;
    if (navigator.geolocation) {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      lat = position.coords.latitude;
      lng = position.coords.longitude;
    }
    
    // Tentukan status presensi
    const status = determinePresenceStatus(now, jenis);
    
    // Simpan ke Firestore
    await db.collection('presences').add({
      uid: currentUser.uid,
      nama: userData.nama,
      tanggal: today,
      waktu: now,
      jenis: jenis,
      status: status,
      koordinat: new firebase.firestore.GeoPoint(lat, lng),
      foto: photoUrl,
      shift: getCurrentShift(now)
    });
    
    toast('Presensi berhasil dicatat', 'success');
    
    // Reset state
    currentPhoto = null;
    $('#uploadBtn').disabled = true;
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    
    // Reload riwayat
    loadPresenceHistory();
    
    // Setup ulang kamera
    setupCamera();
    
  } catch (error) {
    console.error("Error uploading presence:", error);
    toast('Gagal mengupload presensi', 'error');
    $('#uploadBtn').disabled = false;
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  }
}

// Fungsi untuk menentukan status presensi
function determinePresenceStatus(now, jenis) {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const day = now.getDay(); // 0 = Minggu
  
  // Hari Minggu adalah libur
  if (day === 0) return "Libur";
  
  // Tentukan shift
  const shift = getCurrentShift(now);
  
  // Tentukan batas waktu
  let startTime, endTime, lateLimit;
  
  if (jenis === 'berangkat') {
    if (shift === 'pagi') {
      startTime = { hour: 5, minute: 30 }; // 05:30
      endTime = { hour: 6, minute: 0 };    // 06:00
      lateLimit = { hour: 6, minute: 20 }; // 06:20
    } else { // shift sore
      startTime = { hour: 14, minute: 0 }; // 14:00
      endTime = { hour: 14, minute: 30 };  // 14:30
      lateLimit = { hour: 14, minute: 50 }; // 14:50
    }
  } else { // pulang
    if (shift === 'pagi') {
      startTime = { hour: 10, minute: 0 }; // 10:00
      endTime = { hour: 11, minute: 0 };   // 11:00
      lateLimit = { hour: 11, minute: 20 }; // 11:20
    } else { // shift sore
      startTime = { hour: 17, minute: 30 }; // 17:30
      endTime = { hour: 18, minute: 0 };    // 18:00
      lateLimit = { hour: 18, minute: 20 }; // 18:20
    }
  }
  
  // Konversi waktu sekarang ke menit
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startTime.hour * 60 + startTime.minute;
  const endMinutes = endTime.hour * 60 + endTime.minute;
  const lateMinutes = lateLimit.hour * 60 + lateLimit.minute;
  
  // Tentukan status
  if (currentMinutes < startMinutes) return "Di luar sesi presensi";
  if (currentMinutes <= endMinutes) return "Tepat Waktu";
  if (currentMinutes <= lateMinutes) return "Terlambat";
  return "Di luar sesi presensi";
}

// Fungsi untuk mendapatkan shift berdasarkan waktu
function getCurrentShift(now) {
  const hour = now.getHours();
  return (hour < 12) ? 'pagi' : 'sore';
}

// Fungsi untuk memeriksa status presensi
function checkPresenceStatus() {
  const now = new Date();
  const statusElement = $('#statusText');
  const statusChip = $('#statusChip');
  
  if (!statusElement || !statusChip) return;
  
  const day = now.getDay(); // 0 = Minggu
  
  if (day === 0) {
    statusElement.textContent = 'Libur';
    statusChip.className = 'status s-bad';
    statusChip.innerHTML = '<span class="material-symbols-rounded">beach_access</span><span id="statusText">Libur</span>';
    return;
  }
  
  const hour = now.getHours();
  const shift = getCurrentShift(now);
  
  if (shift === 'pagi') {
    if (hour >= 5 && hour < 12) {
      statusElement.textContent = 'Sesi Presensi ' + (hour < 10 ? 'Berangkat' : 'Pulang');
      statusChip.className = 'status s-good';
    } else {
      statusElement.textContent = 'Di Luar Sesi Presensi';
      statusChip.className = 'status s-bad';
    }
  } else {
    if (hour >= 14 && hour < 18) {
      statusElement.textContent = 'Sesi Presensi ' + (hour < 17 ? 'Berangkat' : 'Pulang');
      statusChip.className = 'status s-good';
    } else {
      statusElement.textContent = 'Di Luar Sesi Presensi';
      statusChip.className = 'status s-bad';
    }
  }
}

// Fungsi untuk memuat riwayat presensi
async function loadPresenceHistory() {
  try {
    const limit = $('#historyFilter').value;
    let query = db.collection('presences')
      .where('uid', '==', currentUser.uid)
      .orderBy('waktu', 'desc');
    
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }
    
    const snapshot = await query.get();
    const logList = $('#logList');
    
    if (snapshot.empty) {
      logList.innerHTML = '<div class="riwayat-item">Tidak ada riwayat presensi</div>';
      return;
    }
    
    logList.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const waktu = data.waktu.toDate();
      const options = { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      };
      
      const statusClass = 
        data.status === 'Tepat Waktu' ? 's-good' :
        data.status === 'Terlambat' ? 's-warn' : 's-bad';
      
      const icon = data.jenis === 'berangkat' ? 'login' : 'logout';
      
      logList.innerHTML += `
        <div class="riwayat-item">
          <div class="riwayat-jenis">
            <span class="material-symbols-rounded">${icon}</span>
            ${data.jenis}
            <span class="status ${statusClass}" style="margin-left:auto;font-size:12px">
              ${data.status}
            </span>
          </div>
          <div class="riwayat-time">
            ${waktu.toLocaleDateString('id-ID', options)}
          </div>
        </div>
      `;
    });
  } catch (error) {
    console.error("Error loading presence history:", error);
    $('#logList').innerHTML = '<div class="riwayat-item">Error memuat riwayat</div>';
  }
}

// Fungsi untuk menampilkan dialog cuti
function showCutiDialog() {
  $('#cutiTanggal').valueAsDate = new Date();
  $('#cutiDlg').showModal();
}

// Fungsi untuk menyimpan profil
async function saveProfile() {
  try {
    const nama = $('#nama').value;
    const alamat = $('#alamat').value;
    
    if (!nama || !alamat) {
      toast('Nama dan alamat harus diisi', 'error');
      return;
    }
    
    await db.collection('users').doc(currentUser.uid).update({
      nama: nama,
      alamat: alamat
    });
    
    userData.nama = nama;
    userData.alamat = alamat;
    
    toast('Profil berhasil disimpan', 'success');
    $('#profileDlg').close();
  } catch (error) {
    console.error("Error saving profile:", error);
    toast('Gagal menyimpan profil', 'error');
  }
}

// Fungsi untuk logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch((error) => {
    console.error("Error signing out:", error);
    toast('Gagal keluar', 'error');
  });
}

// Fungsi untuk memuat semua data presensi (admin)
async function loadAllPresences() {
  // Implementasi untuk admin
}

// Fungsi untuk export ke CSV (admin)
async function exportToCSV() {
  // Implementasi untuk admin
}

// Fungsi untuk membuat user baru (admin)
async function createUser() {
  // Implementasi untuk admin
}

// Fungsi untuk mengirim pengumuman (admin)
async function sendAnnouncement() {
  // Implementasi untuk admin
}

// Fungsi untuk memuat permintaan cuti (admin)
async function loadCutiRequests() {
  // Implementasi untuk admin
}

// Fungsi untuk menampilkan dialog aturan waktu (admin)
function showTimeRulesDialog() {
  // Implementasi untuk admin
}

// Fungsi untuk menyimpan aturan waktu (admin)
async function saveTimeRules() {
  // Implementasi untuk admin
}

// Fungsi untuk menyimpan pengaturan jadwal (admin)
async function saveScheduleSettings() {
  // Implementasi untuk admin
}

// Fungsi untuk toggle range tanggal kustom
function toggleCustomDateRange() {
  const period = $('#fPeriode').value;
  $('#customDateRange').style.display = period === 'custom' ? 'flex' : 'none';
}

// Fungsi untuk toggle seleksi user
function toggleUserSelection() {
  const target = $('#announceTarget').value;
  $('#userSelection').style.display = target === 'specific' ? 'block' : 'none';
}