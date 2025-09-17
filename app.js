// app.js - File integrasi umum

// Inisialisasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyApYdiUlLMb9ihBkLnCjDpLJHqYFRFS3Fw",
  authDomain: "fupa-snack.firebaseapp.com",
  projectId: "fupa-snack",
  storageBucket: "fupa-snack.firebasestorage.app",
  messagingSenderId: "972524876738",
  appId: "1:972524876738:web:dd0d57dd8bf2d8a8dd9c5b"
};

// Inisialisasi Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Format tanggal ke string Indonesia
function formatTanggal(date) {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('id-ID', options);
}

// Format waktu ke string Indonesia
function formatWaktu(date) {
  return date.toLocaleTimeString('id-ID');
}

// Format tanggal dan waktu untuk tampilan
function formatTanggalWaktu(date) {
  return `${formatTanggal(date)}, ${formatWaktu(date)}`;
}

// Fungsi untuk menampilkan toast
function toast(msg, type = 'info') {
  // Buat elemen toast jika belum ada
  let toastEl = document.getElementById('toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 12px;
      background: #333;
      color: white;
      z-index: 1000;
      transition: opacity 0.3s;
      opacity: 0;
    `;
    document.body.appendChild(toastEl);
  }

  const colors = {
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
    info: '#333'
  };

  toastEl.textContent = msg;
  toastEl.style.backgroundColor = colors[type] || colors.info;
  toastEl.style.opacity = 1;

  setTimeout(() => {
    toastEl.style.opacity = 0;
  }, 3000);
}

// Fungsi untuk memeriksa apakah hari ini libur (Minggu)
function isHariLibur() {
  const now = new Date();
  return now.getDay() === 0; // 0 adalah Minggu
}

// Fungsi untuk menentukan shift berdasarkan waktu
function getShift(now) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) {
    return 'pagi';
  } else if (hour >= 12 && hour < 18) {
    return 'sore';
  } else {
    return null;
  }
}

// Fungsi untuk menentukan status presensi berdasarkan waktu dan jenis presensi
function getStatusPresensi(now, jenis) {
  if (isHariLibur()) {
    return 'Libur';
  }

  const shift = getShift(now);
  if (!shift) {
    return 'Di luar sesi presensi';
  }

  const menit = now.getHours() * 60 + now.getMinutes();

  if (jenis === 'izin') {
    return 'Izin';
  }

  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      // Berangkat pagi: 05.30-06.00 (330-360 menit) tepat waktu, sampai 06.20 (380 menit) terlambat
      if (menit >= 330 && menit <= 360) {
        return 'Tepat Waktu';
      } else if (menit > 360 && menit <= 380) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    } else if (jenis === 'pulang') {
      // Pulang pagi: 10.00-11.00 (600-660 menit) tepat waktu, sampai 11.20 (680 menit) terlambat
      if (menit >= 600 && menit <= 660) {
        return 'Tepat Waktu';
      } else if (menit > 660 && menit <= 680) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    }
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') {
      // Berangkat sore: 14.00-14.30 (840-870 menit) tepat waktu, sampai 14.50 (890 menit) terlambat
      if (menit >= 840 && menit <= 870) {
        return 'Tepat Waktu';
      } else if (menit > 870 && menit <= 890) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    } else if (jenis === 'pulang') {
      // Pulang sore: 17.30-18.30 (1050-1110 menit) tepat waktu, sampai 18.50 (1130 menit) terlambat
      if (menit >= 1050 && menit <= 1110) {
        return 'Tepat Waktu';
      } else if (menit > 1110 && menit <= 1130) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    }
  }

  return 'Di luar sesi presensi';
}

// Fungsi untuk mendapatkan waktu server dari Firestore (menggunakan serverTimestamp)
// Karena kita tidak bisa langsung mendapatkan server time dari client, kita akan menggunakan waktu client sebagai aproksimasi.
// Namun, untuk presensi, kita akan menyimpan serverTimestamp di Firestore.

// Fungsi untuk mengompres gambar (menggunakan canvas)
function compressImage(file, maxSizeKB = 10) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

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

        ctx.drawImage(img, 0, 0, width, height);

        // Mengatur kualitas hingga ukuran file <= maxSizeKB
        let quality = 0.9;
        let compressedDataUrl;

        const compress = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const sizeInKB = (compressedDataUrl.length * 0.75) / 1024;
          if (sizeInKB > maxSizeKB && quality > 0.1) {
            quality -= 0.1;
            compress();
          } else {
            resolve(compressedDataUrl);
          }
        };

        compress();
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Fungsi untuk mengupload gambar ke Cloudinary
async function uploadImageToCloudinary(dataUrl) {
  const cloudName = 'da7idhh4f';
  const uploadPreset = 'FupaSnack';

  const formData = new FormData();
  formData.append('file', dataUrl);
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

// Fungsi untuk logout
function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = 'index.html';
  }).catch((error) => {
    toast('Gagal logout', 'error');
  });
}

// Ekspor fungsi jika menggunakan modul, tetapi karena tidak, kita akan menambahkan ke window
window.app = {
  formatTanggal,
  formatWaktu,
  formatTanggalWaktu,
  toast,
  isHariLibur,
  getShift,
  getStatusPresensi,
  compressImage,
  uploadImageToCloudinary,
  logout
};