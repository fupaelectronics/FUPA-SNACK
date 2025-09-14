// app.js - Modul umum untuk karyawan.html dan admin.html

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

// Data UID Admin dan Karyawan
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

// Toast notification
function showToast(message, type = 'info') {
  // Hapus toast sebelumnya jika ada
  const existingToast = document.getElementById('custom-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const colors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f9a825',
    info: '#111'
  };
  
  const toast = document.createElement('div');
  toast.id = 'custom-toast';
  toast.style.cssText = `
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    background: ${colors[type] || colors.info};
    color: #fff;
    padding: 10px 14px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.15);
    z-index: 1000;
    transition: opacity 0.3s;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Format tanggal Indonesia
function formatDate(date, includeTime = true) {
  const optionsDate = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  
  const optionsTime = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  
  const dateStr = date.toLocaleDateString('id-ID', optionsDate);
  const timeStr = date.toLocaleTimeString('id-ID', optionsTime);
  
  return includeTime ? `${dateStr}, ${timeStr}` : dateStr;
}

// Kompres gambar ke 10KB sebelum upload ke Cloudinary
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
        
        // Set ukuran canvas sesuai gambar asli
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Gambar ke canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Kompresi progresif hingga ukuran < 10KB
        let quality = 0.9;
        let compressedDataUrl;
        
        const compress = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          
          // Hitung ukuran file dari data URL
          const head = 'data:image/jpeg;base64,';
          const imgFileSize = Math.round((compressedDataUrl.length - head.length) * 3 / 4);
          
          if (imgFileSize > 10000 && quality > 0.1) {
            quality -= 0.1;
            compress();
          } else {
            // Konversi data URL ke blob
            fetch(compressedDataUrl)
              .then(res => res.blob())
              .then(blob => resolve(blob))
              .catch(err => reject(err));
          }
        };
        
        compress();
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
    const response = await fetch(`https://api.cloudinary.com/v1_1/da7idhh4f/image/upload`, {
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

// Deteksi status presensi berdasarkan aturan waktu
async function getPresenceStatus(uid, waktuServer, jenisPresensi) {
  try {
    // Cek aturan waktu user terlebih dahulu
    const userRulesDoc = await db.collection('aturanwaktuuser').doc(uid).get();
    let rules;
    
    if (userRulesDoc.exists) {
      rules = userRulesDoc.data();
    } else {
      // Jika tidak ada aturan khusus, gunakan aturan default
      const defaultRulesDoc = await db.collection('aturanwaktudefault').doc('default').get();
      rules = defaultRulesDoc.exists ? defaultRulesDoc.data() : {
        jam_berangkat: '05:30',
        jam_pulang: '10:00',
        toleransi: 20,
        hari_libur: [0] // Minggu
      };
    }
    
    // Parse waktu
    const [jam, menit] = rules[jenisPresensi === 'berangkat' ? 'jam_berangkat' : 'jam_pulang'].split(':');
    const waktuPresensi = new Date(waktuServer);
    waktuPresensi.setHours(parseInt(jam), parseInt(menit), 0, 0);
    
    // Cek hari libur
    const hariIni = waktuServer.getDay();
    if (rules.hari_libur.includes(hariIni)) {
      return 'Libur';
    }
    
    // Hitung batas waktu dengan toleransi
    const batasWaktu = new Date(waktuPresensi.getTime() + (rules.toleransi * 60 * 1000));
    
    // Cek status
    if (waktuServer < waktuPresensi) {
      return 'Di Luar Sesi Presensi';
    } else if (waktuServer <= batasWaktu) {
      return 'Tepat Waktu';
    } else {
      return 'Terlambat';
    }
  } catch (error) {
    console.error('Error getting presence status:', error);
    return 'Error';
  }
}

// Fungsi untuk mendapatkan aturan waktu
async function getTimeRules(uid) {
  try {
    // Cek aturan waktu user terlebih dahulu
    const userRulesDoc = await db.collection('aturanwaktuuser').doc(uid).get();
    
    if (userRulesDoc.exists) {
      return userRulesDoc.data();
    } else {
      // Jika tidak ada aturan khusus, gunakan aturan default
      const defaultRulesDoc = await db.collection('aturanwaktudefault').doc('default').get();
      return defaultRulesDoc.exists ? defaultRulesDoc.data() : {
        jam_berangkat: '05:30',
        jam_pulang: '10:00',
        toleransi: 20,
        hari_libur: [0] // Minggu
      };
    }
  } catch (error) {
    console.error('Error getting time rules:', error);
    return null;
  }
}

// Ekspor fungsi untuk digunakan di file lain
window.fupaApp = {
  auth,
  db,
  ADMIN_UIDS,
  KARYAWAN_UIDS,
  $,
  $$,
  showToast,
  formatDate,
  compressImage,
  uploadToCloudinary,
  getPresenceStatus,
  getTimeRules
};