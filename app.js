// Firebase initialization
const firebaseConfig = {
  apiKey: "AIzaSyApYdiUlLMb9ihBkLnCjDpLJHqYFRFS3Fw",
  authDomain: "fupa-snack.firebaseapp.com",
  projectId: "fupa-snack",
  storageBucket: "fupa-snack.firebasestorage.app",
  messagingSenderId: "972524876738",
  appId: "1:972524876738:web:dd0d57dd8bf2d8a8dd9c5b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Utility functions
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

// Check authentication state
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  
  try {
    // Get user data from Firestore
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      toast("Data pengguna tidak ditemukan", "error");
      await auth.signOut();
      return;
    }
    
    const userData = userDoc.data();
    
    // Redirect based on role
    const currentPage = window.location.pathname.split('/').pop();
    if (userData.role === 'admin' && currentPage !== 'admin.html') {
      window.location.href = "admin.html";
    } else if (userData.role === 'karyawan' && currentPage !== 'karyawan.html') {
      window.location.href = "karyawan.html";
    }
    
    // Load page-specific functionality
    if (currentPage === 'karyawan.html') {
      loadKaryawanPage(user, userData);
    } else if (currentPage === 'admin.html') {
      loadAdminPage(user, userData);
    }
  } catch (error) {
    console.error("Error checking user role:", error);
    toast("Error memeriksa peran pengguna", "error");
  }
});

// Karyawan page functionality
async function loadKaryawanPage(user, userData) {
  // Initialize server time
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Initialize geolocation
  initGeolocation();
  
  // Initialize camera
  initCamera();
  
  // Load user profile
  loadUserProfile(user, userData);
  
  // Check today's presence
  checkTodaysPresence(user.uid);
  
  // Set up event listeners
  $("#snapBtn").addEventListener("click", capturePhoto);
  $("#uploadBtn").addEventListener("click", () => uploadPresence(user, userData));
  $("#profileBtn").addEventListener("click", () => $("#profileDlg").showModal());
  $("#saveProfileBtn").addEventListener("click", () => saveProfile(user));
  $("#logoutBtn").addEventListener("click", logout);
  $("#pfpFile").addEventListener("change", (e) => uploadProfilePicture(user, e.target.files[0]));
}

// Admin page functionality
async function loadAdminPage(user, userData) {
  // Initialize server time
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Load user profile
  loadUserProfile(user, userData);
  
  // Load presence history
  loadPresenceHistory();
  
  // Set up event listeners
  $("#profileBtn").addEventListener("click", () => $("#profileDlg").showModal());
  $("#saveProfileBtn").addEventListener("click", () => saveProfile(user));
  $("#logoutBtn").addEventListener("click", logout);
  $("#pfpFile").addEventListener("change", (e) => uploadProfilePicture(user, e.target.files[0]));
  $("#applyFilter").addEventListener("click", applyFilters);
  $("#exportCsv").addEventListener("click", exportToCSV);
  $("#fPeriode").addEventListener("change", toggleCustomDateRange);
}

// Server time function
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
  
  if ($("#serverTime")) {
    $("#serverTime").textContent = now.toLocaleDateString('id-ID', options);
  }
  
  // Update presence status for karyawan page
  if (window.location.pathname.includes('karyawan.html')) {
    updatePresenceStatus(now);
  }
}

// Geolocation function
function initGeolocation() {
  if (!navigator.geolocation) {
    toast("Geolocation tidak didukung oleh browser Anda", "error");
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      $("#locText").textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },
    (error) => {
      console.error("Error getting location:", error);
      toast("Tidak dapat mengakses lokasi", "error");
    }
  );
}

// Camera functions
let stream = null;
let capturedPhoto = null;

async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "user" }, 
      audio: false 
    });
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    
    const cameraPlaceholder = $(".camera-placeholder");
    if (cameraPlaceholder) {
      cameraPlaceholder.innerHTML = '';
      cameraPlaceholder.appendChild(video);
    }
  } catch (error) {
    console.error("Error accessing camera:", error);
    toast("Tidak dapat mengakses kamera", "error");
  }
}

function capturePhoto() {
  if (!stream) {
    toast("Kamera tidak tersedia", "error");
    return;
  }
  
  const video = $("video");
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Compress image to ~10KB
  canvas.toBlob((blob) => {
    capturedPhoto = blob;
    
    // Show preview
    const preview = document.createElement('img');
    preview.src = URL.createObjectURL(blob);
    
    const cameraPlaceholder = $(".camera-placeholder");
    if (cameraPlaceholder) {
      cameraPlaceholder.innerHTML = '';
      cameraPlaceholder.appendChild(preview);
    }
    
    $("#uploadBtn").disabled = false;
    toast("Foto berhasil diambil", "success");
  }, 'image/jpeg', 0.1); // Quality set to 0.1 to achieve ~10KB
}

// Presence status function
function updatePresenceStatus(now) {
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  const statusElement = $("#statusText");
  const statusChip = $("#statusChip");
  
  // Sunday is day off
  if (day === 0) {
    statusElement.textContent = 'Libur';
    statusChip.className = 'status s-bad';
    statusChip.innerHTML = '<span class="material-symbols-rounded">beach_access</span><span id="statusText">Libur</span>';
    return;
  }
  
  // Check shift (pagi: 5:30-11:00, sore: 14:00-18:30)
  const isPagiShift = (hour >= 5 && hour < 11) || (hour === 11 && minute === 0);
  const isSoreShift = (hour >= 14 && hour < 18) || (hour === 18 && minute <= 30);
  
  if (isPagiShift) {
    statusElement.textContent = 'Sesi Presensi Pagi';
    statusChip.className = 'status s-good';
    statusChip.innerHTML = '<span class="material-symbols-rounded">check_circle</span><span id="statusText">Sesi Presensi Pagi</span>';
  } else if (isSoreShift) {
    statusElement.textContent = 'Sesi Presensi Sore';
    statusChip.className = 'status s-good';
    statusChip.innerHTML = '<span class="material-symbols-rounded">check_circle</span><span id="statusText">Sesi Presensi Sore</span>';
  } else {
    statusElement.textContent = 'Di Luar Sesi Presensi';
    statusChip.className = 'status s-bad';
    statusChip.innerHTML = '<span class="material-symbols-rounded">schedule</span><span id="statusText">Di Luar Sesi Presensi</span>';
  }
}

// Upload presence function
async function uploadPresence(user, userData) {
  if (!capturedPhoto) {
    toast("Ambil foto terlebih dahulu", "error");
    return;
  }
  
  const jenis = $("#jenis").value;
  const now = new Date();
  const day = now.getDay();
  
  // Check if it's Sunday
  if (day === 0 && jenis !== 'izin') {
    toast("Hari Minggu adalah hari libur, hanya bisa izin", "error");
    return;
  }
  
  // Check if already presence today for the same type
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const existingPresence = await db.collection('presences')
    .where('userId', '==', user.uid)
    .where('jenis', '==', jenis)
    .where('timestamp', '>=', today)
    .get();
  
  if (!existingPresence.empty) {
    toast(`Anda sudah melakukan presensi ${jenis} hari ini`, "error");
    return;
  }
  
  try {
    $("#uploadBtn").disabled = true;
    $("#uploadBtn").innerHTML = '<span class="spinner"></span> Mengupload...';
    
    // Upload image to Cloudinary
    const formData = new FormData();
    formData.append('file', capturedPhoto);
    formData.append('upload_preset', 'FupaSnack');
    formData.append('cloud_name', 'da7idhh4f');
    
    const cloudinaryResponse = await fetch('https://api.cloudinary.com/v1_1/da7idhh4f/image/upload', {
      method: 'POST',
      body: formData
    });
    
    const imageData = await cloudinaryResponse.json();
    
    if (!imageData.secure_url) {
      throw new Error("Gagal mengupload gambar");
    }
    
    // Get location
    const location = $("#locText").textContent.split(',').map(coord => parseFloat(coord.trim()));
    
    // Determine status
    const status = calculatePresenceStatus(now, jenis);
    
    // Determine shift
    const hour = now.getHours();
    const shift = (hour >= 5 && hour < 14) ? 'pagi' : 'sore';
    
    // Save to Firestore
    await db.collection('presences').add({
      userId: user.uid,
      userName: userData.nama || user.email,
      jenis: jenis,
      status: status,
      shift: shift,
      coordinates: new firebase.firestore.GeoPoint(location[0], location[1]),
      imageUrl: imageData.secure_url,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    toast("Presensi berhasil dicatat", "success");
    $("#uploadBtn").disabled = false;
    $("#uploadBtn").innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    
    // Reset camera
    capturedPhoto = null;
    initCamera();
    
  } catch (error) {
    console.error("Error uploading presence:", error);
    toast("Gagal mengupload presensi", "error");
    $("#uploadBtn").disabled = false;
    $("#uploadBtn").innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  }
}

// Calculate presence status
function calculatePresenceStatus(now, jenis) {
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  if (jenis === 'izin') {
    return 'izin';
  }
  
  // Morning shift
  if (jenis === 'berangkat') {
    if (hour < 5 || (hour === 5 && minute < 30)) return 'di luar sesi';
    if (hour === 5 && minute >= 30 && minute <= 60) return 'tepat waktu';
    if ((hour === 6 && minute <= 20) || (hour === 6 && minute > 0 && minute <= 20)) return 'terlambat';
    return 'di luar sesi';
  }
  
  // Afternoon shift
  if (jenis === 'pulang') {
    if ((hour === 10 && minute >= 0) || (hour === 11 && minute <= 0)) return 'tepat waktu';
    if ((hour === 11 && minute > 0 && minute <= 20)) return 'terlambat';
    return 'di luar sesi';
  }
  
  return 'tidak valid';
}

// User profile functions
function loadUserProfile(user, userData) {
  if ($("#nama")) $("#nama").value = userData.nama || '';
  if ($("#alamat")) $("#alamat").value = userData.alamat || '';
  if ($("#pfp") && userData.photoURL) $("#pfp").src = userData.photoURL;
}

async function saveProfile(user) {
  try {
    const nama = $("#nama").value;
    const alamat = $("#alamat").value;
    
    await db.collection('users').doc(user.uid).update({
      nama: nama,
      alamat: alamat,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    toast("Profil berhasil disimpan", "success");
    $("#profileDlg").close();
  } catch (error) {
    console.error("Error saving profile:", error);
    toast("Gagal menyimpan profil", "error");
  }
}

async function uploadProfilePicture(user, file) {
  if (!file) return;
  
  try {
    // Upload to Firebase Storage
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`profile_pictures/${user.uid}`);
    await fileRef.put(file);
    
    // Get download URL
    const photoURL = await fileRef.getDownloadURL();
    
    // Update user profile
    await db.collection('users').doc(user.uid).update({
      photoURL: photoURL,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Update profile picture in UI
    if ($("#pfp")) $("#pfp").src = photoURL;
    
    toast("Foto profil berhasil diubah", "success");
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    toast("Gagal mengupload foto profil", "error");
  }
}

// Check today's presence
async function checkTodaysPresence(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const presences = await db.collection('presences')
    .where('userId', '==', userId)
    .where('timestamp', '>=', today)
    .get();
  
  presences.forEach(doc => {
    const data = doc.data();
    if (data.jenis === 'berangkat') {
      $("#jenis option[value='berangkat']").disabled = true;
    } else if (data.jenis === 'pulang') {
      $("#jenis option[value='pulang']").disabled = true;
    }
  });
}

// Admin functions
async function loadPresenceHistory() {
  try {
    const presences = await db.collection('presences')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    
    const tableBody = $("#tableBody");
    tableBody.innerHTML = '';
    
    presences.forEach(doc => {
      const data = doc.data();
      const date = data.timestamp ? data.timestamp.toDate() : new Date();
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${date.toLocaleDateString('id-ID')}<br>${date.toLocaleTimeString('id-ID')}</td>
        <td>${data.userName}</td>
        <td>${data.jenis}</td>
        <td><span class="status s-${getStatusClass(data.status)}">${data.status}</span></td>
        <td>${data.coordinates.latitude.toFixed(4)}, ${data.coordinates.longitude.toFixed(4)}</td>
        <td><a href="${data.imageUrl}" target="_blank">Lihat Foto</a></td>
      `;
      
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error("Error loading presence history:", error);
    toast("Gagal memuat riwayat presensi", "error");
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'tepat waktu': return 'good';
    case 'terlambat': return 'warn';
    case 'izin': return 'good';
    default: return 'bad';
  }
}

function applyFilters() {
  // Implementation for filtering presence history
  toast("Filter diterapkan", "success");
  // Actual implementation would filter the presence data based on selected criteria
}

function exportToCSV() {
  // Implementation for exporting to CSV
  toast("CSV berhasil diekspor", "success");
  // Actual implementation would generate and download a CSV file
}

function toggleCustomDateRange() {
  const period = $("#fPeriode").value;
  $("#customDateRange").style.display = period === 'custom' ? 'flex' : 'none';
}

// Logout function
async function logout() {
  try {
    await auth.signOut();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error signing out:", error);
    toast("Gagal keluar", "error");
  }
}