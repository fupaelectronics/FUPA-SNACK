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

// Daftar UID Admin
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
];

// Daftar UID Karyawan
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

// Fungsi untuk mendapatkan waktu server dari Firestore
const getServerTimestamp = () => {
  return firebase.firestore.FieldValue.serverTimestamp();
};

// Fungsi untuk mendapatkan waktu Indonesia
const getWaktuIndonesia = (timestamp) => {
  if (!timestamp) return '-';
  
  const date = timestamp.toDate();
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
};

// Fungsi untuk mendapatkan status presensi berdasarkan waktu
const getStatusPresensi = (jenis) => {
  const now = new Date();
  const hari = now.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const jam = now.getHours();
  const menit = now.getMinutes();
  
  // Jika hari Minggu
  if (hari === 0) return { status: 'Libur', kelas: 's-bad' };
  
  // Aturan shift pagi: berangkat 05.30–06.00, pulang 10.00–11.00
  // Aturan shift sore: berangkat 14.00-14.30, pulang 17.30-18.00
  
  if (jenis === 'berangkat') {
    // Shift pagi
    if ((jam === 5 && menit >= 30) || (jam === 6 && menit === 0)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    } 
    // Shift sore
    else if ((jam === 14 && menit >= 0 && menit <= 30) || (jam === 14 && menit === 30)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    }
    // Terlambat (≤ 20 menit dari batas)
    else if (
      (jam === 6 && menit > 0 && menit <= 20) || 
      (jam === 14 && menit > 30 && menit <= 50)
    ) {
      return { status: 'Terlambat', kelas: 's-warn' };
    }
    // Di luar sesi presensi
    else {
      return { status: 'Di luar sesi presensi', kelas: 's-bad' };
    }
  } 
  else if (jenis === 'pulang') {
    // Shift pagi
    if ((jam === 10 && menit >= 0) || (jam === 11 && menit === 0)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    } 
    // Shift sore
    else if ((jam === 17 && menit >= 30) || (jam === 18 && menit === 0)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    }
    // Terlambat (≤ 20 menit dari batas)
    else if (
      (jam === 11 && menit > 0 && menit <= 20) || 
      (jam === 18 && menit > 0 && menit <= 20)
    ) {
      return { status: 'Terlambat', kelas: 's-warn' };
    }
    // Di luar sesi presensi
    else {
      return { status: 'Di luar sesi presensi', kelas: 's-bad' };
    }
  }
  
  return { status: 'Tidak valid', kelas: 's-bad' };
};

// Fungsi untuk kompres gambar (COMPEX)
const compressImage = (file, maxSizeKB = 10) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Hitung ukuran baru dengan menjaga aspect ratio
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
        
        // Gambar ulang dengan kualitas yang dikurangi
        ctx.drawImage(img, 0, 0, width, height);
        
        // Konversi ke blob dengan kualitas yang disesuaikan
        let quality = 0.9;
        let compressedDataUrl;
        
        const tryCompress = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = compressedDataUrl.split(',')[1];
          const binaryString = atob(base64);
          const sizeKB = binaryString.length / 1024;
          
          if (sizeKB > maxSizeKB && quality > 0.1) {
            quality -= 0.1;
            tryCompress();
          } else {
            // Hapus metadata EXIF
            const cleanedDataUrl = compressedDataUrl; // Simplifikasi - di production gunakan library seperti exif-js
            
            // Konversi kembali ke blob
            fetch(cleanedDataUrl)
              .then(res => res.blob())
              .then(blob => resolve(blob))
              .catch(reject);
          }
        };
        
        tryCompress();
      };
    };
    reader.onerror = error => reject(error);
  });
};

// Fungsi untuk upload ke Cloudinary
const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'FupaSnack');
    
    fetch(`https://api.cloudinary.com/v1_1/da7idhh4f/image/upload`, {
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
};

// Fungsi untuk mendapatkan lokasi pengguna
const getCurrentLocation = () => {
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
};

// Fungsi untuk memeriksa apakah user sudah login dan redirect sesuai role
const checkAuthState = () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // Cek role user dari Firestore
      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          
          // Redirect berdasarkan role
          if (ADMIN_UIDS.includes(user.uid)) {
            if (window.location.pathname.endsWith('admin.html')) {
              // Sudah di halaman admin, muat data
              initAdminPage();
            } else {
              window.location.href = 'admin.html';
            }
          } else if (KARYAWAN_UIDS.includes(user.uid)) {
            if (window.location.pathname.endsWith('karyawan.html')) {
              // Sudah di halaman karyawan, muat data
              initKaryawanPage();
            } else {
              window.location.href = 'karyawan.html';
            }
          } else {
            // User tidak memiliki role yang valid
            showToast('Akun tidak memiliki akses', 'error');
            await auth.signOut();
            window.location.href = 'index.html';
          }
        } else {
          // Data user belum ada, minta isi profil
          if (window.location.pathname.endsWith('karyawan.html') || 
              window.location.pathname.endsWith('admin.html')) {
            showProfileDialog();
          }
        }
      } catch (error) {
        console.error('Error checking user role:', error);
        showToast('Error memeriksa role pengguna', 'error');
      }
    } else {
      // User belum login, redirect ke index.html
      if (!window.location.pathname.endsWith('index.html')) {
        window.location.href = 'index.html';
      }
    }
  });
};

// Fungsi untuk inisialisasi halaman karyawan
const initKaryawanPage = () => {
  // Implementasi lengkap ada di karyawan.html
  console.log('Initializing karyawan page');
};

// Fungsi untuk inisialisasi halaman admin
const initAdminPage = () => {
  // Implementasi lengkap ada di admin.html
  console.log('Initializing admin page');
};

// Fungsi untuk menampilkan dialog profil
const showProfileDialog = () => {
  // Implementasi akan ditambahkan di masing-masing halaman
  console.log('Showing profile dialog');
};

// Panggil fungsi untuk memeriksa status autentikasi
checkAuthState();