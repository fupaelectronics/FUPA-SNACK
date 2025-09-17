// app.js
// Firebase config
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
let stream = null;
let currentPhoto = null;
let isSubmitting = false;

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const showToast = (msg, type = 'info') => {
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
const getServerTimestamp = async () => {
  try {
    const docRef = db.collection('serverTime').doc('current');
    await docRef.set({ timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    const doc = await docRef.get();
    return doc.exists ? doc.data().timestamp.toDate() : new Date();
  } catch (error) {
    console.error("Error getting server time:", error);
    return new Date();
  }
};

// Fungsi untuk menentukan shift berdasarkan waktu
const getShiftFromTime = (time) => {
  const hour = time.getHours();
  if (hour >= 5 && hour < 12) return 'pagi';
  if (hour >= 12 && hour < 18) return 'sore';
  return 'tidak aktif';
};

// Fungsi untuk menentukan status presensi
const getStatusPresensi = (time, jenis) => {
  const day = time.getDay();
  if (day === 0) return 'Libur'; // Minggu
  
  const hour = time.getHours();
  const minutes = time.getMinutes();
  const totalMinutes = hour * 60 + minutes;
  
  if (jenis === 'izin') return 'Izin';
  
  if (jenis === 'berangkat') {
    if (totalMinutes >= 330 && totalMinutes <= 360) return 'Tepat Waktu'; // 05:30-06:00
    if (totalMinutes > 360 && totalMinutes <= 380) return 'Terlambat'; // hingga 06:20
    if (totalMinutes >= 840 && totalMinutes <= 870) return 'Tepat Waktu'; // 14:00-14:30
    if (totalMinutes > 870 && totalMinutes <= 890) return 'Terlambat'; // hingga 14:50
  }
  
  if (jenis === 'pulang') {
    if (totalMinutes >= 600 && totalMinutes <= 660) return 'Tepat Waktu'; // 10:00-11:00
    if (totalMinutes > 660 && totalMinutes <= 680) return 'Terlambat'; // hingga 11:20
    if (totalMinutes >= 1050 && totalMinutes <= 1110) return 'Tepat Waktu'; // 17:30-18:30
    if (totalMinutes > 1110 && totalMinutes <= 1130) return 'Terlambat'; // hingga 18:50
  }
  
  return 'Di luar sesi presensi';
};

// Fungsi untuk memeriksa apakah sudah presensi hari ini
const checkAlreadyPresensi = async (userId, jenis, tanggal) => {
  try {
    const snap = await db.collection('presensi')
      .where('userId', '==', userId)
      .where('jenis', '==', jenis)
      .where('tanggal', '==', tanggal)
      .get();
    
    return !snap.empty;
  } catch (error) {
    console.error("Error checking presensi:", error);
    return false;
  }
};

// Fungsi untuk kompres gambar
const compressImage = (file, maxSizeKB = 10) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        let quality = 0.9;
        
        // Hitung ulang ukuran untuk menjaga aspect ratio
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
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Kompres hingga ukuran target
        const tryCompress = (q) => {
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const base64 = dataUrl.split(',')[1];
          const binary = atob(base64);
          if (binary.length <= maxSizeKB * 1024 || q <= 0.1) {
            // Hapus metadata EXIF
            const blob = dataURLToBlob(dataUrl);
            resolve(blob);
          } else {
            setTimeout(() => tryCompress(q * 0.8), 10);
          }
        };
        
        tryCompress(quality);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const dataURLToBlob = (dataURL) => {
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const uInt8Array = new Uint8Array(raw.length);
  
  for (let i = 0; i < raw.length; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  
  return new Blob([uInt8Array], { type: contentType });
};

// Fungsi untuk upload ke Cloudinary
const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
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
};

// Fungsi untuk mengelola kamera
const startCamera = async () => {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    
    const video = $('#cameraPreview');
    if (video) {
      video.srcObject = stream;
      video.play();
    }
  } catch (error) {
    console.error("Error accessing camera:", error);
    showToast("Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.", "error");
  }
};

const stopCamera = () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
};

const capturePhoto = () => {
  const video = $('#cameraPreview');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const img = $('#capturedImage');
  if (img) {
    img.src = canvas.toDataURL('image/png');
    img.style.display = 'block';
  }
  
  canvas.toBlob((blob) => {
    currentPhoto = blob;
    $('#uploadBtn').disabled = false;
  }, 'image/jpeg', 0.9);
  
  showToast("Foto berhasil diambil", "success");
};

// Fungsi untuk submit presensi
const submitPresensi = async () => {
  if (isSubmitting) return;
  isSubmitting = true;
  
  try {
    const jenis = $('#jenis').value;
    const serverTime = await getServerTimestamp();
    const tanggal = serverTime.toISOString().split('T')[0];
    
    // Periksa apakah sudah presensi hari ini
    const alreadyPresensi = await checkAlreadyPresensi(currentUser.uid, jenis, tanggal);
    if (alreadyPresensi) {
      showToast(`Anda sudah melakukan presensi ${jenis} hari ini`, "error");
      isSubmitting = false;
      return;
    }
    
    // Dapatkan lokasi
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });
    
    const coords = `${position.coords.latitude}, ${position.coords.longitude}`;
    
    // Kompres dan upload foto
    $('#uploadBtn').disabled = true;
    $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
    
    const compressedPhoto = await compressImage(currentPhoto);
    const photoUrl = await uploadToCloudinary(compressedPhoto);
    
    // Tentukan shift dan status
    const shift = getShiftFromTime(serverTime);
    const status = getStatusPresensi(serverTime, jenis);
    
    // Simpan ke Firestore
    await db.collection('presensi').add({
      userId: currentUser.uid,
      nama: userProfile.nama,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      tanggal: tanggal,
      jenis: jenis,
      shift: jenis === 'izin' ? 'Penuh' : shift,
      status: status,
      koordinat: coords,
      foto: photoUrl
    });
    
    showToast("Presensi berhasil dicatat", "success");
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    $('#uploadBtn').disabled = true;
    currentPhoto = null;
    
    // Refresh status presensi
    updatePresenceStatus();
  } catch (error) {
    console.error("Error submitting presensi:", error);
    showToast("Gagal mencatat presensi: " + error.message, "error");
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    $('#uploadBtn').disabled = false;
  } finally {
    isSubmitting = false;
  }
};

// Fungsi untuk update status presensi
const updatePresenceStatus = async () => {
  try {
    const serverTime = await getServerTimestamp();
    const statusElement = $('#statusText');
    const statusChip = $('#statusChip');
    const jenisSelect = $('#jenis');
    
    if (!statusElement || !statusChip || !jenisSelect) return;
    
    const day = serverTime.getDay();
    const hour = serverTime.getHours();
    const minutes = serverTime.getMinutes();
    const totalMinutes = hour * 60 + minutes;
    const jenis = jenisSelect.value;
    
    if (day === 0) {
      statusElement.textContent = 'Libur';
      statusChip.className = 'status s-bad';
      statusChip.innerHTML = '<span class="material-symbols-rounded">beach_access</span><span id="statusText">Libur</span>';
      return;
    }
    
    // Tentukan sesi presensi
    let inSession = false;
    let sessionType = '';
    
    // Shift pagi: berangkat 05:30-06:00, pulang 10:00-11:00
    if ((totalMinutes >= 330 && totalMinutes <= 360) || (jenis === 'izin' && totalMinutes >= 330 && totalMinutes <= 360)) {
      inSession = true;
      sessionType = 'Berangkat';
    } else if ((totalMinutes >= 600 && totalMinutes <= 660) || (jenis === 'izin' && totalMinutes >= 600 && totalMinutes <= 660)) {
      inSession = true;
      sessionType = 'Pulang';
    }
    // Shift sore: berangkat 14:00-14:30, pulang 17:30-18:30
    else if ((totalMinutes >= 840 && totalMinutes <= 870) || (jenis === 'izin' && totalMinutes >= 840 && totalMinutes <= 870)) {
      inSession = true;
      sessionType = 'Berangkat';
    } else if ((totalMinutes >= 1050 && totalMinutes <= 1110) || (jenis === 'izin' && totalMinutes >= 1050 && totalMinutes <= 1110)) {
      inSession = true;
      sessionType = 'Pulang';
    }
    
    if (inSession) {
      statusElement.textContent = `Sesi Presensi ${sessionType}`;
      statusChip.className = 'status s-good';
      statusChip.innerHTML = `<span class="material-symbols-rounded">check_circle</span><span id="statusText">Sesi Presensi ${sessionType}</span>`;
    } else {
      statusElement.textContent = 'Di Luar Sesi Presensi';
      statusChip.className = 'status s-bad';
      statusChip.innerHTML = '<span class="material-symbols-rounded">schedule</span><span id="statusText">Di Luar Sesi Presensi</span>';
    }
  } catch (error) {
    console.error("Error updating presence status:", error);
  }
};

// Fungsi untuk update waktu server
const updateServerTime = async () => {
  try {
    const serverTime = await getServerTimestamp();
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
    
    // Update shift
    const shift = getShiftFromTime(serverTime);
    const shiftElement = $('#shiftInfo');
    if (shiftElement) {
      shiftElement.textContent = `Shift ${shift}`;
    }
    
    // Update status presensi
    updatePresenceStatus();
  } catch (error) {
    console.error("Error updating server time:", error);
    const timeElement = $('#serverTime');
    if (timeElement) {
      timeElement.textContent = new Date().toLocaleDateString('id-ID', {
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }
};

// Fungsi untuk memuat profil pengguna
const loadUserProfile = async (userId) => {
  try {
    const doc = await db.collection('users').doc(userId).get();
    
    if (doc.exists) {
      userProfile = doc.data();
      
      // Update UI dengan data profil
      if ($('#nama')) $('#nama').value = userProfile.nama || '';
      if ($('#alamat')) $('#alamat').value = userProfile.alamat || '';
      if ($('#pfp')) {
        $('#pfp').src = userProfile.foto || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userProfile.nama || 'User')}&backgroundColor=ffb300,ffd54f&radius=20`;
      }
      
      return userProfile;
    } else {
      // Buat profil baru jika tidak ada
      userProfile = {
        nama: '',
        alamat: '',
        foto: '',
        role: 'karyawan' // Default role
      };
      
      // Tampilkan popup isi profil jika data kosong
      if (window.location.pathname !== '/index.html') {
        $('#profileDlg').showModal();
      }
      
      return userProfile;
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
    showToast("Gagal memuat profil", "error");
    return null;
  }
};

// Fungsi untuk menyimpan profil
const saveProfile = async () => {
  try {
    const nama = $('#nama').value.trim();
    const alamat = $('#alamat').value.trim();
    const file = $('#pfpFile').files[0];
    
    if (!nama) {
      showToast("Nama harus diisi", "error");
      return;
    }
    
    let fotoUrl = userProfile.foto || '';
    
    // Upload foto profil jika ada
    if (file) {
      const compressedPhoto = await compressImage(file, 20); // 20KB untuk foto profil
      fotoUrl = await uploadToCloudinary(compressedPhoto);
    }
    
    // Simpan ke Firestore
    await db.collection('users').doc(currentUser.uid).set({
      nama: nama,
      alamat: alamat,
      foto: fotoUrl,
      role: userProfile.role || 'karyawan',
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Update profil lokal
    userProfile = { ...userProfile, nama, alamat, foto: fotoUrl };
    
    showToast("Profil berhasil disimpan", "success");
    $('#profileDlg').close();
  } catch (error) {
    console.error("Error saving profile:", error);
    showToast("Gagal menyimpan profil", "error");
  }
};

// Fungsi untuk logout
const logout = async () => {
  try {
    stopCamera();
    await auth.signOut();
    window.location.href = 'index.html';
  } catch (error) {
    console.error("Error logging out:", error);
    showToast("Gagal keluar", "error");
  }
};

// Fungsi untuk memuat riwayat presensi (admin)
const loadPresensiHistory = async (filters = {}) => {
  try {
    let query = db.collection('presensi').orderBy('waktu', 'desc');
    
    // Terapkan filter nama
    if (filters.nama) {
      query = query.where('nama', '>=', filters.nama).where('nama', '<=', filters.nama + '\uf8ff');
    }
    
    // Terapkan filter periode
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
            query = query.where('waktu', '>=', startDate).where('waktu', '<=', endDate);
          }
          break;
      }
      
      if (filters.periode !== 'custom') {
        query = query.where('waktu', '>=', startDate);
      }
    }
    
    // Batasi jumlah data yang ditampilkan
    if (filters.limit && filters.limit !== 'all') {
      query = query.limit(parseInt(filters.limit));
    }
    
    const snapshot = await query.get();
    const tbody = $('#tableBody');
    
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
      return;
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const waktu = data.waktu ? data.waktu.toDate() : new Date();
      const waktuFormatted = waktu.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + '<br>' + waktu.toLocaleTimeString('id-ID');
      
      const statusClass = data.status === 'Tepat Waktu' ? 's-good' : 
                         data.status === 'Terlambat' ? 's-warn' : 's-bad';
      
      const row = `
        <tr>
          <td>${waktuFormatted}</td>
          <td>${data.nama || 'Unknown'}</td>
          <td>${data.jenis}</td>
          <td><span class="status ${statusClass}">${data.status}</span></td>
          <td>${data.koordinat}</td>
          <td><a href="${data.foto}" target="_blank">Lihat Foto</a></td>
        </tr>
      `;
      
      tbody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading presensi history:", error);
    showToast("Gagal memuat riwayat presensi", "error");
  }
};

// Fungsi untuk export CSV
const exportToCSV = async (filters = {}) => {
  try {
    let query = db.collection('presensi').orderBy('nama').orderBy('waktu', 'asc');
    
    // Terapkan filter nama
    if (filters.nama) {
      query = query.where('nama', '>=', filters.nama).where('nama', '<=', filters.nama + '\uf8ff');
    }
    
    // Terapkan filter periode
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
            query = query.where('waktu', '>=', startDate).where('waktu', '<=', endDate);
          }
          break;
      }
      
      if (filters.periode !== 'custom') {
        query = query.where('waktu', '>=', startDate);
      }
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      showToast("Tidak ada data untuk diekspor", "warning");
      return;
    }
    
    // Format data sesuai STDR
    let csvContent = "Nama,Tanggal,Shift,Jenis,Status,Koordinat\n";
    let currentName = '';
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const waktu = data.waktu ? data.waktu.toDate() : new Date();
      const tanggal = waktu.toISOString().split('T')[0];
      
      // Tambah baris kosong antar blok karyawan
      if (data.nama !== currentName) {
        if (currentName !== '') csvContent += "\n";
        currentName = data.nama;
      }
      
      csvContent += `"${data.nama || 'Unknown'}",${tanggal},${data.shift},${data.jenis},${data.status},"${data.koordinat}"\n`;
    });
    
    // Buat dan unduh file CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `presensi_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("CSV berhasil diekspor", "success");
  } catch (error) {
    console.error("Error exporting CSV:", error);
    showToast("Gagal mengekspor CSV", "error");
  }
};

// Inisialisasi aplikasi setelah auth state changed
const initApp = async (user) => {
  currentUser = user;
  
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  // Load user profile
  userProfile = await loadUserProfile(user.uid);
  
  // Update UI berdasarkan role
  const userRole = userProfile?.role || 'karyawan';
  
  if (userRole === 'admin' && !window.location.pathname.endsWith('admin.html')) {
    window.location.href = 'admin.html';
  } else if (userRole === 'karyawan' && !window.location.pathname.endsWith('karyawan.html')) {
    window.location.href = 'karyawan.html';
  }
  
  // Inisialisasi berdasarkan halaman
  if (window.location.pathname.endsWith('karyawan.html')) {
    initKaryawanPage();
  } else if (window.location.pathname.endsWith('admin.html')) {
    initAdminPage();
  }
};

// Inisialisasi halaman karyawan
const initKaryawanPage = () => {
  // Mulai kamera
  startCamera();
  
  // Update waktu server setiap detik
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Event listeners
  $('#snapBtn').addEventListener('click', capturePhoto);
  $('#uploadBtn').addEventListener('click', submitPresensi);
  $('#profileBtn').addEventListener('click', () => $('#profileDlg').showModal());
  $('#saveProfileBtn').addEventListener('click', saveProfile);
  $('#logoutBtn').addEventListener('click', logout);
  
  // Update lokasi
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        $('#locText').textContent = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      },
      (error) => {
        console.error("Error getting location:", error);
        $('#locText').textContent = 'Tidak dapat mengakses lokasi';
      }
    );
  }
};

// Inisialisasi halaman admin
const initAdminPage = () => {
  // Update waktu server setiap detik
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Load riwayat presensi
  loadPresensiHistory();
  
  // Event listeners
  $('#applyFilter').addEventListener('click', applyFilters);
  $('#exportCsv').addEventListener('click', () => exportToCSV(getCurrentFilters()));
  $('#profileBtn').addEventListener('click', () => $('#profileDlg').showModal());
  $('#saveProfileBtn').addEventListener('click', saveProfile);
  $('#logoutBtn').addEventListener('click', logout);
  
  // Toggle custom date range
  $('#fPeriode').addEventListener('change', () => {
    $('#customDateRange').style.display = $('#fPeriode').value === 'custom' ? 'flex' : 'none';
  });
};

// Fungsi untuk mendapatkan filter saat ini
const getCurrentFilters = () => {
  return {
    nama: $('#fNama').value,
    periode: $('#fPeriode').value,
    dari: $('#fDari').value,
    sampai: $('#fSampai').value,
    limit: $('#fShow').value
  };
};

// Fungsi untuk menerapkan filter
const applyFilters = () => {
  const filters = getCurrentFilters();
  loadPresensiHistory(filters);
  showToast("Filter diterapkan", "success");
};

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    initApp(user);
  } else if (!window.location.pathname.endsWith('index.html')) {
    window.location.href = 'index.html';
  }
});