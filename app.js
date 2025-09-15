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
let userData = null;

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

// Fungsi untuk memeriksa status autentikasi
function checkAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      // Ambil data user dari Firestore
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
          userData = doc.data();
          // Jika data profil kosong, tampilkan popup
          if (!userData.nama || !userData.alamat) {
            showProfileModal();
          }
        } else {
          // Jika dokumen tidak ada, buat dokumen baru
          const emailParts = user.email.split('@');
          const nama = emailParts[0];
          userData = {
            nama: nama,
            alamat: 'Fupa',
            email: user.email,
            role: isAdmin(user.uid) ? 'admin' : 'karyawan',
            foto: `https://api.dicebear.com/7.x/initials/svg?seed=${nama}&backgroundColor=ffb300,ffd54f&radius=20`
          };
          await db.collection('users').doc(user.uid).set(userData);
          showProfileModal();
        }
      } catch (error) {
        console.error("Error getting user document:", error);
      }
    } else {
      // Tidak ada user, redirect ke index.html
      window.location.href = 'index.html';
    }
  });
}

// Fungsi untuk mengecek apakah user adalah admin
function isAdmin(uid) {
  const adminUIDs = [
    "O1SJ7hYop3UJjDcsA3JqT29aapI3",
    "uB2XsyM6fXUj493cRlHCqpe2fxH3"
  ];
  return adminUIDs.includes(uid);
}

// Fungsi untuk mendapatkan waktu server dari Firestore
function getServerTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

// Fungsi untuk mendapatkan waktu Indonesia
function getWaktuIndonesia() {
  const now = new Date();
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
  return now.toLocaleDateString('id-ID', options);
}

// Fungsi untuk mengecek status presensi berdasarkan waktu
function getStatusPresensi(shift, jenis, waktu) {
  const hari = waktu.getDay(); // 0 = Minggu, 1 = Senin, ... 6 = Sabtu
  const jam = waktu.getHours();
  const menit = waktu.getMinutes();

  // Jika hari Minggu
  if (hari === 0) {
    return "Libur";
  }

  // Tentukan batas waktu berdasarkan shift dan jenis
  let batasAwal, batasAkhir, batasTerlambat;
  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      batasAwal = { jam: 5, menit: 30 };
      batasAkhir = { jam: 6, menit: 0 };
      batasTerlambat = { jam: 6, menit: 20 };
    } else { // pulang
      batasAwal = { jam: 10, menit: 0 };
      batasAkhir = { jam: 11, menit: 0 };
      batasTerlambat = { jam: 11, menit: 20 };
    }
  } else { // shift sore
    if (jenis === 'berangkat') {
      batasAwal = { jam: 14, menit: 0 };
      batasAkhir = { jam: 14, menit: 30 };
      batasTerlambat = { jam: 14, menit: 50 };
    } else { // pulang
      batasAwal = { jam: 17, menit: 30 };
      batasAkhir = { jam: 18, menit: 0 };
      batasTerlambat = { jam: 18, menit: 20 };
    }
  }

  // Konversi waktu ke menit
  const totalMenit = jam * 60 + menit;
  const totalBatasAwal = batasAwal.jam * 60 + batasAwal.menit;
  const totalBatasAkhir = batasAkhir.jam * 60 + batasAkhir.menit;
  const totalBatasTerlambat = batasTerlambat.jam * 60 + batasTerlambat.menit;

  if (totalMenit < totalBatasAwal) {
    return "Di luar sesi presensi";
  } else if (totalMenit >= totalBatasAwal && totalMenit <= totalBatasAkhir) {
    return "Tepat Waktu";
  } else if (totalMenit > totalBatasAkhir && totalMenit <= totalBatasTerlambat) {
    return "Terlambat";
  } else {
    return "Di luar sesi presensi";
  }
}

// Fungsi untuk mengompres gambar (menggunakan canvas)
function compressImage(file, maxSizeKB = 10) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 1024; // Max dimension untuk menjaga aspek ratio

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
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Ubah kualitas hingga ukuran file <= maxSizeKB
        let quality = 0.9;
        let compressedDataUrl;

        const doCompress = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          // Perkiraan ukuran: data URL adalah base64, ukuran file = (dataURL.length * 3/4) bytes
          const sizeKB = (compressedDataUrl.length * 3 / 4) / 1024;
          if (sizeKB > maxSizeKB && quality > 0.1) {
            quality -= 0.1;
            doCompress();
          } else {
            // Konversi data URL ke blob
            const blob = dataURLToBlob(compressedDataUrl);
            resolve(blob);
          }
        };

        doCompress();
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataURLToBlob(dataURL) {
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const uInt8Array = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

// Fungsi untuk upload gambar ke Cloudinary
function uploadToCloudinary(blob, uploadPreset = 'FupaSnack') {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', uploadPreset);
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
        reject(new Error('Upload failed'));
      }
    })
    .catch(error => reject(error));
  });
}

// Fungsi untuk mendapatkan lokasi geografis
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  });
}

// Panggil checkAuth saat script dimuat
checkAuth();