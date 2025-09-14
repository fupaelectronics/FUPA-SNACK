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
const storage = firebase.storage();

// Daftar UID Admin dan Karyawan
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
];

const KARYAWAN_UIDS = [
  "7NJ9xoMgQlUbi68CMQWFN5bYvF62", // x@fupa.id
  "Jn7Fghq1fkNGx8f0z8sTGkxH94E2", // cabang1@fupa.id
  "vB3i5h6offMxQslKf2U0J1ElpWS2", // cabang2@fupa.id
  "tIGmvfnqtxf5QJlfPUy9O1uzHJ73", // cabang3@fupa.id
  "zl7xjZaI6BdCLT7Z2WA34oTcFV42", // cabang4@fupa.id
  "NainrtLo3BWRSJKImgIBYNLJEIv2", // cabang5@fupa.id
  "9Y9s8E23TNbMlO9vZBVKQCGGG0Z2", // cabang6@fupa.id
  "dDq2zTPs12Tn2v0Zh4IdObDcD7g2", // cabang7@fupa.id
  "Tkqf05IzI9UTvy4BF0nWtZwbz8j2", // cabang8@fupa.id
  "pMbjHKjsZLWtNHi7PTc8cDJ254w2", // cabang9@fupa.id
  "G0qTjLBc6MeRMPziNTzIT6N32ZM2"  // cabang10@fupa.id
];

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Fungsi untuk menampilkan toast notifikasi
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.3s;
  `;
  
  if (type === 'success') toast.style.background = 'var(--good)';
  else if (type === 'error') toast.style.background = 'var(--bad)';
  else if (type === 'warning') toast.style.background = 'var(--warn)';
  else toast.style.background = '#333';
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

// Fungsi untuk memeriksa peran user
function checkUserRole(uid) {
  if (ADMIN_UIDS.includes(uid)) return 'admin';
  if (KARYAWAN_UIDS.includes(uid)) return 'karyawan';
  return null;
}

// Fungsi untuk redirect berdasarkan role
function redirectBasedOnRole(uid) {
  const role = checkUserRole(uid);
  if (role === 'admin') {
    window.location.href = 'admin.html';
  } else if (role === 'karyawan') {
    window.location.href = 'karyawan.html';
  } else {
    auth.signOut();
    showToast('Akses ditolak: akun tidak terdaftar', 'error');
  }
}

// Fungsi kompresi gambar (menggunakan Cloudinary)
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
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

// Fungsi untuk mendapatkan waktu Indonesia
function getWIBDate() {
  const now = new Date();
  const offset = 7 * 60; // WIB UTC+7
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * offset / 60));
}

// Fungsi untuk memeriksa status presensi
function checkPresensiStatus(jenis, waktu) {
  const now = getWIBDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes;
  
  // Aturan default waktu
  const berangkatStart = 5 * 60 + 30; // 05:30
  const berangkatEnd = 6 * 60;        // 06:00
  const pulangStart = 10 * 60;        // 10:00
  const pulangEnd = 11 * 60;          // 11:00
  const toleransi = 20;               // 20 menit
  
  if (jenis === 'berangkat') {
    if (currentTime >= berangkatStart && currentTime <= berangkatEnd) {
      return 'tepat waktu';
    } else if (currentTime > berangkatEnd && currentTime <= berangkatEnd + toleransi) {
      return 'terlambat';
    } else {
      return 'diluar sesi';
    }
  } else if (jenis === 'pulang') {
    if (currentTime >= pulangStart && currentTime <= pulangEnd) {
      return 'tepat waktu';
    } else if (currentTime > pulangEnd && currentTime <= pulangEnd + toleransi) {
      return 'terlambat';
    } else {
      return 'diluar sesi';
    }
  }
  
  return 'tidak valid';
}

// Fungsi untuk mendapatkan koordinat geolokasi
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung'));
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        }
      );
    }
  });
}

// Fungsi untuk format tanggal Indonesia
function formatDate(date) {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  return date.toLocaleDateString('id-ID', options);
}

// Fungsi untuk memeriksa apakah hari ini libur
function isHariLibur() {
  const now = getWIBDate();
  return now.getDay() === 0; // Minggu adalah hari libur default
}

// Ekspor fungsi untuk digunakan di file HTML
window.firebaseApp = {
  auth,
  db,
  storage,
  showToast,
  checkUserRole,
  redirectBasedOnRole,
  compressImage,
  getWIBDate,
  checkPresensiStatus,
  getLocation,
  formatDate,
  isHariLibur,
  ADMIN_UIDS,
  KARYAWAN_UIDS
};