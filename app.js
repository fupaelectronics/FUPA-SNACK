// Firebase configuration dengan data kunci yang diberikan
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
let userData = null;
let stream = null;
let currentPhoto = null;

// Utility functions
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const showToast = (message, type = 'info') => {
  const toast = $("#toast");
  if (!toast) return;
  
  const colors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f9a825',
    info: '#111'
  };
  
  toast.style.backgroundColor = colors[type] || colors.info;
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
};

// Format tanggal Indonesia
function formatDate(date, includeTime = true) {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  };
  
  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Jakarta'
  };
  
  let formatted = date.toLocaleDateString('id-ID', options);
  if (includeTime) {
    formatted += ', ' + date.toLocaleTimeString('id-ID', timeOptions);
  }
  
  return formatted;
}

// Kompres gambar untuk Cloudinary
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set maximum dimensions
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
        
        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Remove metadata and compress to 50kb
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.7);
      };
    };
    reader.onerror = error => reject(error);
  });
}

// Upload ke Cloudinary
async function uploadToCloudinary(blob) {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', 'FupaSnack');
  formData.append('cloud_name', 'da7idhh4f');
  
  try {
    const response = await fetch('https://api.cloudinary.com/v1_1/da7idhh4f/image/upload', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

// Fungsi untuk mendapatkan status presensi berdasarkan waktu
function getPresenceStatus(now, jenis) {
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Hari Minggu adalah libur
  if (day === 0) return { status: "Libur", color: "s-bad" };
  
  // Jika jenis izin, status adalah "Izin"
  if (jenis === "izin") return { status: "Izin", color: "s-warn" };
  
  // Aturan shift pagi
  if (userData && userData.shift === "pagi") {
    if (jenis === "berangkat") {
      // Berangkat pagi: 05.30–06.00 WIB (tepat waktu), hingga 06.20 (terlambat)
      const totalMinutes = hour * 60 + minute;
      if (totalMinutes >= 330 && totalMinutes <= 360) {
        return { status: "Tepat Waktu", color: "s-good" };
      } else if (totalMinutes > 360 && totalMinutes <= 380) {
        return { status: "Terlambat", color: "s-warn" };
      } else {
        return { status: "Di luar sesi presensi", color: "s-bad" };
      }
    } else if (jenis === "pulang") {
      // Pulang pagi: 10.00–11.00 WIB (tepat waktu), hingga 11.20 (terlambat)
      const totalMinutes = hour * 60 + minute;
      if (totalMinutes >= 600 && totalMinutes <= 660) {
        return { status: "Tepat Waktu", color: "s-good" };
      } else if (totalMinutes > 660 && totalMinutes <= 680) {
        return { status: "Terlambat", color: "s-warn" };
      } else {
        return { status: "Di luar sesi presensi", color: "s-bad" };
      }
    }
  }
  
  // Aturan shift sore
  if (userData && userData.shift === "sore") {
    if (jenis === "berangkat") {
      // Berangkat sore: 14.00-14.30 WIB (tepat waktu), hingga 14.50 (terlambat)
      const totalMinutes = hour * 60 + minute;
      if (totalMinutes >= 840 && totalMinutes <= 870) {
        return { status: "Tepat Waktu", color: "s-good" };
      } else if (totalMinutes > 870 && totalMinutes <= 890) {
        return { status: "Terlambat", color: "s-warn" };
      } else {
        return { status: "Di luar sesi presensi", color: "s-bad" };
      }
    } else if (jenis === "pulang") {
      // Pulang sore: 17.30-18.30 WIB (tepat waktu), hingga 18.50 (terlambat)
      const totalMinutes = hour * 60 + minute;
      if (totalMinutes >= 1050 && totalMinutes <= 1110) {
        return { status: "Tepat Waktu", color: "s-good" };
      } else if (totalMinutes > 1110 && totalMinutes <= 1130) {
        return { status: "Terlambat", color: "s-warn" };
      } else {
        return { status: "Di luar sesi presensi", color: "s-bad" };
      }
    }
  }
  
  return { status: "Di luar sesi presensi", color: "s-bad" };
}

// Fungsi untuk memeriksa apakah sudah melakukan presensi hari ini
async function checkTodayPresence(jenis) {
  if (!currentUser) return false;
  
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  try {
    const presenceRef = db.collection('presences')
      .where('userId', '==', currentUser.uid)
      .where('jenis', '==', jenis)
      .where('timestamp', '>=', startOfDay);
    
    const snapshot = await presenceRef.get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking today presence:', error);
    return false;
  }
}

// Fungsi untuk mendapatkan lokasi pengguna
function getCurrentLocation() {
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

// Inisialisasi kamera
async function initCamera() {
  try {
    const video = $("#cameraVideo");
    if (!video) return;
    
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    
    video.srcObject = stream;
    $("#cameraPlaceholder").style.display = "none";
    video.style.display = "block";
  } catch (error) {
    console.error('Error accessing camera:', error);
    showToast('Tidak dapat mengakses kamera: ' + error.message, 'error');
  }
}

// Ambil foto dari kamera
function capturePhoto() {
  const video = $("#cameraVideo");
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.9);
  });
}

// Fungsi untuk menghentikan kamera
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  const video = $("#cameraVideo");
  if (video) {
    video.srcObject = null;
    video.style.display = "none";
  }
  
  $("#cameraPlaceholder").style.display = "flex";
}

// Fungsi untuk memuat data profil pengguna
async function loadUserProfile() {
  if (!currentUser) return;
  
  try {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
      userData = userDoc.data();
      
      // Update UI dengan data profil
      if ($("#profileName")) $("#profileName").textContent = userData.name || currentUser.email;
      if ($("#profileEmail")) $("#profileEmail").textContent = currentUser.email;
      if ($("#profileShift")) $("#profileShift").textContent = userData.shift || 'Belum diatur';
      if ($("#profileAddress")) $("#profileAddress").textContent = userData.address || 'Belum diatur';
      
      // Update form edit profil
      if ($("#editName")) $("#editName").value = userData.name || '';
      if ($("#editAddress")) $("#editAddress").value = userData.address || '';
      if ($("#editShift")) $("#editShift").value = userData.shift || 'pagi';
      
      // Update foto profil jika ada
      if (userData.photoURL && $("#profilePhoto")) {
        $("#profilePhoto").src = userData.photoURL;
      }
    } else {
      // Buat data user baru jika belum ada
      await db.collection('users').doc(currentUser.uid).set({
        email: currentUser.email,
        name: currentUser.email.split('@')[0],
        shift: 'pagi',
        role: 'karyawan',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Muat ulang data
      await loadUserProfile();
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
    showToast('Gagal memuat profil pengguna', 'error');
  }
}

// Fungsi untuk memperbarui profil pengguna
async function updateUserProfile(updates) {
  if (!currentUser) return;
  
  try {
    await db.collection('users').doc(currentUser.uid).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Muat ulang data profil
    await loadUserProfile();
    showToast('Profil berhasil diperbarui', 'success');
  } catch (error) {
    console.error('Error updating user profile:', error);
    showToast('Gagal memperbarui profil', 'error');
  }
}

// Fungsi untuk mengunggah presensi
async function uploadPresence() {
  if (!currentUser || !userData) {
    showToast('Silakan login terlebih dahulu', 'error');
    return;
  }
  
  const jenis = $("#jenisSelect").value;
  const statusElement = $("#statusText");
  
  // Validasi
  if (!currentPhoto) {
    showToast('Ambil foto terlebih dahulu', 'error');
    return;
  }
  
  // Nonaktifkan tombol upload selama proses
  $("#uploadBtn").disabled = true;
  $("#uploadBtn").innerHTML = '<span class="spinner"></span> Mengupload...';
  
  try {
    // Periksa apakah sudah melakukan presensi dengan jenis yang sama hari ini
    const alreadyPresence = await checkTodayPresence(jenis);
    if (alreadyPresence && jenis !== 'izin') {
      showToast(`Anda sudah melakukan presensi ${jenis} hari ini`, 'error');
      $("#uploadBtn").disabled = false;
      $("#uploadBtn").innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      return;
    }
    
    // Dapatkan lokasi terkini
    const location = await getCurrentLocation();
    
    // Dapatkan waktu server
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    const now = new Date();
    
    // Tentukan status presensi
    const presenceStatus = getPresenceStatus(now, jenis);
    
    // Kompres gambar
    const compressedPhoto = await compressImage(currentPhoto);
    
    // Upload ke Cloudinary
    const photoURL = await uploadToCloudinary(compressedPhoto);
    
    // Simpan data presensi ke Firestore
    await db.collection('presences').add({
      userId: currentUser.uid,
      userName: userData.name || currentUser.email,
      userEmail: currentUser.email,
      jenis: jenis,
      status: presenceStatus.status,
      shift: jenis === 'izin' ? 'Penuh' : userData.shift,
      coordinates: new firebase.firestore.GeoPoint(location.lat, location.lng),
      photoURL: photoURL,
      timestamp: timestamp,
      createdAt: timestamp
    });
    
    // Reset state
    currentPhoto = null;
    $("#previewImage").style.display = "none";
    $("#cameraPlaceholder").style.display = "flex";
    $("#snapBtn").disabled = false;
    $("#snapBtn").innerHTML = '<span class="material-symbols-rounded">photo_camera</span> Ambil selfie';
    
    // Tampilkan notifikasi sukses
    showToast('Presensi berhasil dicatat', 'success');
    
    // Perbarui status UI
    if (statusElement) {
      statusElement.textContent = presenceStatus.status;
      statusElement.className = `status ${presenceStatus.color}`;
    }
  } catch (error) {
    console.error('Error uploading presence:', error);
    showToast('Gagal mengupload presensi: ' + error.message, 'error');
  } finally {
    // Aktifkan kembali tombol upload
    $("#uploadBtn").disabled = false;
    $("#uploadBtn").innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  }
}

// Fungsi untuk memuat riwayat presensi (admin)
async function loadPresenceHistory(filters = {}) {
  if (!currentUser) return;
  
  try {
    let query = db.collection('presences').orderBy('timestamp', 'desc');
    
    // Terapkan filter nama jika ada
    if (filters.name) {
      query = query.where('userName', '>=', filters.name)
                  .where('userName', '<=', filters.name + '\uf8ff');
    }
    
    // Terapkan filter tanggal jika ada
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // Sampai akhir hari
      
      query = query.where('timestamp', '>=', startDate)
                  .where('timestamp', '<=', endDate);
    }
    
    // Batasi jumlah hasil jika bukan 'all'
    if (filters.limit && filters.limit !== 'all') {
      query = query.limit(parseInt(filters.limit));
    }
    
    const snapshot = await query.get();
    const tableBody = $("#presenceTableBody");
    
    if (!tableBody) return;
    
    // Kosongkan tabel
    tableBody.innerHTML = '';
    
    if (snapshot.empty) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center">Tidak ada data presensi</td></tr>';
      return;
    }
    
    // Isi tabel dengan data
    snapshot.forEach(doc => {
      const data = doc.data();
      const timestamp = data.timestamp ? data.timestamp.toDate() : new Date();
      
      const row = document.createElement('tr');
      
      // Tentukan kelas status
      let statusClass = 's-bad';
      if (data.status === 'Tepat Waktu') statusClass = 's-good';
      if (data.status === 'Terlambat') statusClass = 's-warn';
      if (data.status === 'Izin') statusClass = 's-warn';
      
      row.innerHTML = `
        <td>${formatDate(timestamp)}</td>
        <td>${data.userName}</td>
        <td>${data.shift}</td>
        <td>${data.jenis}</td>
        <td><span class="status ${statusClass}">${data.status}</span></td>
        <td>${data.coordinates ? `${data.coordinates.latitude.toFixed(4)}, ${data.coordinates.longitude.toFixed(4)}` : '-'}</td>
        <td><a href="${data.photoURL}" target="_blank">Lihat Foto</a></td>
      `;
      
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading presence history:', error);
    showToast('Gagal memuat riwayat presensi', 'error');
  }
}

// Fungsi untuk mengekspor data ke CSV
async function exportToCSV(filters = {}) {
  if (!currentUser) return;
  
  try {
    let query = db.collection('presences').orderBy('userName').orderBy('timestamp');
    
    // Terapkan filter nama jika ada
    if (filters.name) {
      query = query.where('userName', '>=', filters.name)
                  .where('userName', '<=', filters.name + '\uf8ff');
    }
    
    // Terapkan filter tanggal jika ada
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // Sampai akhir hari
      
      query = query.where('timestamp', '>=', startDate)
                  .where('timestamp', '<=', endDate);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      showToast('Tidak ada data untuk diekspor', 'warning');
      return;
    }
    
    // Format data untuk CSV sesuai format STDR
    let csvContent = "Nama,Tanggal,Shift,Jenis,Status,Koordinat\n";
    let currentUser = null;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const timestamp = data.timestamp ? data.timestamp.toDate() : new Date();
      const dateStr = timestamp.toISOString().split('T')[0];
      
      // Jika berganti user, tambahkan baris kosong
      if (currentUser !== data.userName) {
        if (currentUser !== null) {
          csvContent += "\n"; // Baris kosong antar blok user
        }
        currentUser = data.userName;
      }
      
      csvContent += `"${data.userName}","${dateStr}","${data.shift}","${data.jenis}","${data.status}","${data.coordinates ? `${data.coordinates.latitude},${data.coordinates.longitude}` : ''}"\n`;
    });
    
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
    console.error('Error exporting to CSV:', error);
    showToast('Gagal mengekspor CSV', 'error');
  }
}

// Fungsi untuk logout
function logout() {
  stopCamera();
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch(error => {
    console.error('Error signing out:', error);
    showToast('Gagal logout', 'error');
  });
}

// Inisialisasi aplikasi berdasarkan halaman
function initApp() {
  // Periksa status autentikasi
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      
      // Muat data profil pengguna
      await loadUserProfile();
      
      // Inisialisasi berdasarkan halaman
      if (window.location.pathname.includes('karyawan.html')) {
        initKaryawanPage();
      } else if (window.location.pathname.includes('admin.html')) {
        initAdminPage();
      }
    } else {
      // Redirect ke halaman login jika belum login
      if (!window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
    }
  });
}

// Inisialisasi halaman karyawan
function initKaryawanPage() {
  // Update waktu server
  function updateServerTime() {
    const now = new Date();
    $("#serverTime").textContent = formatDate(now);
    
    // Perbarui status presensi berdasarkan waktu
    const jenis = $("#jenisSelect").value;
    const statusInfo = getPresenceStatus(now, jenis);
    
    if ($("#statusText")) {
      $("#statusText").textContent = statusInfo.status;
      $("#statusChip").className = `status ${statusInfo.color}`;
    }
  }
  
  // Inisialisasi waktu
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Dapatkan lokasi terkini
  getCurrentLocation().then(location => {
    $("#locText").textContent = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
  }).catch(error => {
    console.error('Error getting location:', error);
    $("#locText").textContent = 'Tidak dapat mengakses lokasi';
  });
  
  // Inisialisasi kamera
  if ($("#cameraVideo")) {
    initCamera();
  }
  
  // Event listener untuk tombol ambil foto
  $("#snapBtn").addEventListener('click', async () => {
    try {
      $("#snapBtn").disabled = true;
      $("#snapBtn").innerHTML = '<span class="spinner"></span> Memproses...';
      
      currentPhoto = await capturePhoto();
      
      // Tampilkan pratinjau
      const previewUrl = URL.createObjectURL(currentPhoto);
      $("#previewImage").src = previewUrl;
      $("#previewImage").style.display = "block";
      $("#cameraVideo").style.display = "none";
      
      // Aktifkan tombol upload
      $("#uploadBtn").disabled = false;
      
      showToast('Foto berhasil diambil', 'success');
    } catch (error) {
      console.error('Error capturing photo:', error);
      showToast('Gagal mengambil foto', 'error');
    } finally {
      $("#snapBtn").disabled = false;
      $("#snapBtn").innerHTML = '<span class="material-symbols-rounded">photo_camera</span> Ambil selfie';
    }
  });
  
  // Event listener untuk tombol upload
  $("#uploadBtn").addEventListener('click', uploadPresence);
  
  // Event listener untuk perubahan jenis presensi
  $("#jenisSelect").addEventListener('change', () => {
    const now = new Date();
    const jenis = $("#jenisSelect").value;
    const statusInfo = getPresenceStatus(now, jenis);
    
    $("#statusText").textContent = statusInfo.status;
    $("#statusChip").className = `status ${statusInfo.color}`;
  });
  
  // Event listener untuk dialog profil
  $("#profileBtn").addEventListener('click', () => {
    $("#profileDlg").showModal();
  });
  
  // Event listener untuk simpan profil
  $("#saveProfileBtn").addEventListener('click', () => {
    const name = $("#editName").value;
    const address = $("#editAddress").value;
    const shift = $("#editShift").value;
    
    updateUserProfile({ name, address, shift });
    $("#profileDlg").close();
  });
  
  // Event listener untuk logout
  $("#logoutBtn").addEventListener('click', logout);
}

// Inisialisasi halaman admin
function initAdminPage() {
  // Update waktu server
  function updateServerTime() {
    const now = new Date();
    $("#serverTime").textContent = formatDate(now);
  }
  
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Muat riwayat presensi
  loadPresenceHistory();
  
  // Event listener untuk filter
  $("#applyFilter").addEventListener('click', () => {
    const filters = {
      name: $("#fNama").value.trim() || null,
      startDate: $("#fDari").value || null,
      endDate: $("#fSampai").value || null,
      limit: $("#fShow").value
    };
    
    loadPresenceHistory(filters);
  });
  
  // Event listener untuk perubahan periode
  $("#fPeriode").addEventListener('change', () => {
    const period = $("#fPeriode").value;
    $("#customDateRange").style.display = period === 'custom' ? 'flex' : 'none';
    
    // Set tanggal otomatis berdasarkan periode
    const today = new Date();
    let startDate, endDate;
    
    switch(period) {
      case 'harian':
        startDate = today;
        endDate = today;
        break;
      case 'mingguan':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay()); // Awal minggu (Minggu)
        endDate = new Date(today);
        endDate.setDate(today.getDate() + (6 - today.getDay())); // Akhir minggu (Sabtu)
        break;
      case 'bulanan':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'tahunan':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        // custom - tidak ada perubahan otomatis
        return;
    }
    
    if (startDate && endDate) {
      $("#fDari").value = startDate.toISOString().split('T')[0];
      $("#fSampai").value = endDate.toISOString().split('T')[0];
    }
  });
  
  // Event listener untuk ekspor CSV
  $("#exportCsv").addEventListener('click', () => {
    const filters = {
      name: $("#fNama").value.trim() || null,
      startDate: $("#fDari").value || null,
      endDate: $("#fSampai").value || null
    };
    
    exportToCSV(filters);
  });
  
  // Event listener untuk dialog profil
  $("#profileBtn").addEventListener('click', () => {
    $("#profileDlg").showModal();
  });
  
  // Event listener untuk simpan profil
  $("#saveProfileBtn").addEventListener('click', () => {
    const name = $("#editName").value;
    const address = $("#editAddress").value;
    
    updateUserProfile({ name, address });
    $("#profileDlg").close();
  });
  
  // Event listener untuk logout
  $("#logoutBtn").addEventListener('click', logout);
}

// Jalankan inisialisasi aplikasi ketika DOM siap
document.addEventListener('DOMContentLoaded', initApp);