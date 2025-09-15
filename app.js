// app.js

// Inisialisasi Firebase (jika belum diinisialisasi)
if (!firebase.apps.length) {
  const firebaseConfig = {
    apiKey: "AIzaSyApYdiUlLMb9ihBkLnCjDpLJHqYFRFS3Fw",
    authDomain: "fupa-snack.firebaseapp.com",
    projectId: "fupa-snack",
    storageBucket: "fupa-snack.firebasestorage.app",
    messagingSenderId: "972524876738",
    appId: "1:972524876738:web:dd0d57dd8bf2d8a8dd9c5b"
  };
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const toast = (msg, type = 'info') => {
  // Buat elemen toast jika belum ada
  let toastEl = document.getElementById('toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.style.cssText = 'position:fixed; left:50%; bottom:18px; transform:translateX(-50%); color:#fff; padding:10px 14px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.15); z-index:10; display:none;';
    document.body.appendChild(toastEl);
  }

  const colors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f9a825',
    info: '#111'
  };
  toastEl.style.backgroundColor = colors[type] || colors.info;
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  setTimeout(() => { toastEl.style.display = "none"; }, 3000);
};

// Fungsi untuk logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch((error) => {
    toast('Gagal logout', 'error');
  });
}

// Fungsi untuk mendapatkan waktu server (menggunakan Firebase ServerTimestamp)
function getServerTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

// Fungsi untuk kompres gambar (menggunakan Canvas)
function compressImage(file, maxSizeKB = 10) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 1024; // Max dimension untuk menjaga aspek rasio

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

        // Mengatur kualitas hingga ukuran file <= maxSizeKB
        let quality = 0.9;
        let compressedDataUrl;

        const compressLoop = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const sizeInKB = (compressedDataUrl.length * 0.75) / 1024;
          if (sizeInKB > maxSizeKB && quality > 0.1) {
            quality -= 0.1;
            compressLoop();
          } else {
            // Konversi data URL ke Blob
            const blob = dataURLToBlob(compressedDataUrl);
            resolve(blob);
          }
        };

        compressLoop();
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
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
async function uploadToCloudinary(blob) {
  const cloudName = 'da7idhh4f';
  const uploadPreset = 'FupaSnack';

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

// Fungsi untuk mendapatkan koordinat
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

// Fungsi untuk menentukan status presensi berdasarkan waktu
function getStatusPresensi(waktu, jenis) {
  const now = new Date(waktu);
  const hari = now.getDay(); // 0 = Minggu, 1 = Senin, ... 6 = Sabtu
  const jam = now.getHours();
  const menit = now.getMinutes();

  // Jika hari Minggu
  if (hari === 0) {
    return 'Libur';
  }

  // Shift pagi: berangkat 05.30–06.00, pulang 10.00–11.00
  // Shift sore: berangkat 14.00–14.30, pulang 17.30–18.00

  if (jenis === 'berangkat') {
    // Cek shift pagi
    if (jam === 5 && menit >= 30 || jam === 6 && menit <= 0) {
      return 'Tepat Waktu';
    } else if (jam === 6 && menit <= 20) {
      return 'Terlambat';
    }
    // Cek shift sore
    else if (jam === 14 && menit >= 0 && menit <= 30) {
      return 'Tepat Waktu';
    } else if (jam === 14 && menit <= 50) {
      return 'Terlambat';
    } else {
      return 'Di luar sesi presensi';
    }
  } else if (jenis === 'pulang') {
    // Shift pagi: pulang 10.00–11.00
    if (jam === 10 && menit >= 0 || jam === 11 && menit <= 0) {
      return 'Tepat Waktu';
    } else if (jam === 11 && menit <= 20) {
      return 'Terlambat';
    }
    // Shift sore: pulang 17.30–18.00
    else if (jam === 17 && menit >= 30 || jam === 18 && menit <= 0) {
      return 'Tepat Waktu';
    } else if (jam === 18 && menit <= 20) {
      return 'Terlambat';
    } else {
      return 'Di luar sesi presensi';
    }
  }

  return 'Di luar sesi presensi';
}

// Fungsi untuk memformat tanggal
function formatDate(date, withTime = true) {
  const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
  if (withTime) {
    return date.toLocaleDateString('id-ID', optionsDate) + ' - ' + date.toLocaleTimeString('id-ID', optionsTime);
  } else {
    return date.toLocaleDateString('id-ID', optionsDate);
  }
}

// Ekspor fungsi-fungsi yang diperlukan
window.compressImage = compressImage;
window.uploadToCloudinary = uploadToCloudinary;
window.getLocation = getLocation;
window.getStatusPresensi = getStatusPresensi;
window.formatDate = formatDate;
window.toast = toast;
window.$ = $;
window.auth = auth;
window.db = db;
window.logout = logout;
window.getServerTimestamp = getServerTimestamp;