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

// UID untuk admin dan karyawan
const ADMIN_UIDS = ["O1SJ7hYop3UJjDcsA3JqT29aapI3", "uB2XsyM6fXUj493cRlHCqpe2fxH3"];
const KARYAWAN_UIDS = [
  "7NJ9xoMgQlUbi68CMQWFN5bYvF62", "Jn7Fghq1fkNGx8f0z8sTGkxH94E2", 
  "vB3i5h6offMxQslKf2U0J1ElpWS2", "tIGmvfnqtxf5QJlfPUy9O1uzHJ73",
  "zl7xjZaI6BdCLT7Z2WA34oTcFV42", "NainrtLo3BWRSJKImgIBYNLJEIv2",
  "9Y9s8E23TNbMlO9vZBVKQCGGG0Z2", "dDq2zTPs12Tn2v0Zh4IdObDcD7g2",
  "Tkqf05IzI9UTvy4BF0nWtZwbz8j2", "pMbjHKjsZLWtNHi7PTc8cDJ254w2",
  "G0qTjLBc6MeRMPziNTzIT6N32ZM2"
];

// Fungsi utilitas
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

// Fungsi untuk mendapatkan waktu Indonesia
function getWIBDate() {
  return new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
}

// Fungsi untuk memeriksa status presensi
function checkPresensiStatus(waktuSekarang, aturanWaktu) {
  const jam = waktuSekarang.getHours();
  const menit = waktuSekarang.getMinutes();
  const totalMenit = jam * 60 + menit;
  
  const berangkatAwal = aturanWaktu.berangkatAwal;
  const berangkatAkhir = aturanWaktu.berangkatAkhir;
  const pulangAwal = aturanWaktu.pulangAwal;
  const pulangAkhir = aturanWaktu.pulangAkhir;
  const toleransi = aturanWaktu.toleransi || 20;
  
  // Cek jika hari libur
  const hari = waktuSekarang.getDay();
  if (aturanWaktu.hariLibur.includes(hari)) {
    return { status: "Libur", dapatPresensi: false };
  }
  
  // Cek sesi berangkat
  if (totalMenit >= berangkatAwal && totalMenit <= berangkatAkhir + toleransi) {
    if (totalMenit > berangkatAkhir) {
      return { status: "Terlambat", dapatPresensi: true, jenis: "berangkat" };
    }
    return { status: "Tepat Waktu", dapatPresensi: true, jenis: "berangkat" };
  }
  
  // Cek sesi pulang
  if (totalMenit >= pulangAwal && totalMenit <= pulangAkhir + toleransi) {
    if (totalMenit > pulangAkhir) {
      return { status: "Terlambat", dapatPresensi: true, jenis: "pulang" };
    }
    return { status: "Tepat Waktu", dapatPresensi: true, jenis: "pulang" };
  }
  
  return { status: "Diluar Sesi Presensi", dapatPresensi: false };
}

// Fungsi untuk mengompres gambar (menggunakan Canvas API)
function compressImage(file, maxSizeKB = 10) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Hitung dimensi baru dengan menjaga aspect ratio
        let width = img.width;
        let height = img.height;
        const maxDimension = 800;
        
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Kompres ke JPEG dengan kualitas menyesuaikan untuk mencapai ~10KB
        let quality = 0.9;
        let compressedDataURL;
        
        // Coba beberapa tingkat kualitas sampai ukuran sesuai
        const tryCompress = () => {
          compressedDataURL = canvas.toDataURL('image/jpeg', quality);
          const sizeKB = Math.floor((compressedDataURL.length * 3) / 4 / 1024);
          
          if (sizeKB > maxSizeKB && quality > 0.1) {
            quality -= 0.1;
            tryCompress();
          } else {
            resolve(compressedDataURL);
          }
        };
        
        tryCompress();
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Fungsi untuk mengupload gambar ke Cloudinary
async function uploadToCloudinary(imageData, folder = "FupaSnack") {
  return new Promise((resolve, reject) => {
    const uploadPreset = "FupaSnack";
    const cloudName = "da7idhh4f";
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const formData = new FormData();
    formData.append('file', imageData);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', folder);
    
    fetch(url, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.secure_url) {
        resolve(data.secure_url);
      } else {
        reject(new Error('Upload failed'));
      }
    })
    .catch(error => reject(error));
  });
}

// Fungsi untuk mendapatkan aturan waktu default
function getDefaultTimeRules() {
  return {
    berangkatAwal: 5 * 60 + 30, // 05:30 dalam menit
    berangkatAkhir: 6 * 60,     // 06:00 dalam menit
    pulangAwal: 10 * 60,        // 10:00 dalam menit
    pulangAkhir: 11 * 60,       // 11:00 dalam menit
    toleransi: 20,              // 20 menit
    hariLibur: [0]              // 0 = Minggu
  };
}

// Fungsi untuk memformat waktu
function formatTime(minutes) {
  const jam = Math.floor(minutes / 60);
  const menit = minutes % 60;
  return `${jam.toString().padStart(2, '0')}:${menit.toString().padStart(2, '0')}`;
}