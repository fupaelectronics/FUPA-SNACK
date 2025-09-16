// Inisialisasi Firebase (jika belum diinisialisasi di halaman ini)
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

// Fungsi umum
const $ = (sel) => document.querySelector(sel);
const toast = (msg, type = 'info') => {
  const t = document.getElementById('toast');
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
function getServerTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

// Fungsi untuk logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch((error) => {
    toast('Gagal logout: ' + error.message, 'error');
  });
}

// Fungsi untuk update profil
function updateProfile(uid, data) {
  return db.collection('users').doc(uid).update(data);
}

// Fungsi untuk mendapatkan data user
function getUserData(uid) {
  return db.collection('users').doc(uid).get();
}

// Fungsi untuk mendapatkan presensi karyawan (untuk karyawan: hanya milik sendiri, untuk admin: semua)
function getPresensi(uid, isAdmin = false) {
  if (isAdmin) {
    return db.collection('presensi').orderBy('waktu', 'desc').get();
  } else {
    return db.collection('presensi').where('uid', '==', uid).orderBy('waktu', 'desc').get();
  }
}

// Fungsi untuk menambahkan presensi
function addPresensi(data) {
  return db.collection('presensi').add(data);
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
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.9;
        let compressedDataUrl;
        do {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          quality -= 0.1;
        } while (quality > 0.5 && (compressedDataUrl.length / 1024) > maxSizeKB);
        resolve(compressedDataUrl);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Fungsi untuk upload gambar ke Cloudinary
function uploadToCloudinary(dataUrl) {
  return new Promise((resolve, reject) => {
    const uploadPreset = 'FupaSnack';
    const cloudName = 'da7idhh4f';
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('upload_preset', uploadPreset);

    fetch(url, {
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
    .catch(reject);
  });
}

// Fungsi untuk menentukan status presensi berdasarkan waktu dan shift
function getStatusPresensi(waktu, jenis, shift) {
  // waktu adalah object Date
  const hari = waktu.getDay(); // 0 = Minggu
  if (hari === 0) return 'Libur';

  const jam = waktu.getHours();
  const menit = waktu.getMinutes();

  if (jenis === 'izin') {
    return 'Izin';
  }

  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      if (jam < 5 || (jam === 5 && menit < 30)) return 'Di luar sesi presensi';
      if (jam === 5 && menit >= 30 && menit <= 59) return 'Tepat Waktu';
      if (jam === 6 && menit <= 20) return 'Terlambat';
      if (jam > 6 || (jam === 6 && menit > 20)) return 'Di luar sesi presensi';
    } else if (jenis === 'pulang') {
      if (jam < 10 || (jam === 10 && menit < 0)) return 'Di luar sesi presensi';
      if (jam === 10 && menit >= 0 && menit <= 59) return 'Tepat Waktu';
      if (jam === 11 && menit <= 20) return 'Terlambat';
      if (jam > 11 || (jam === 11 && menit > 20)) return 'Di luar sesi presensi';
    }
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') {
      if (jam < 14 || (jam === 14 && menit < 0)) return 'Di luar sesi presensi';
      if (jam === 14 && menit >= 0 && menit <= 30) return 'Tepat Waktu';
      if (jam === 14 && menit > 30 && menit <= 50) return 'Terlambat';
      if (jam > 14 || (jam === 14 && menit > 50)) return 'Di luar sesi presensi';
    } else if (jenis === 'pulang') {
      if (jam < 17 || (jam === 17 && menit < 30)) return 'Di luar sesi presensi';
      if (jam === 17 && menit >= 30 && menit <= 59) return 'Tepat Waktu';
      if (jam === 18 && menit <= 20) return 'Terlambat';
      if (jam > 18 || (jam === 18 && menit > 20)) return 'Di luar sesi presensi';
    }
  }

  return 'Tidak Valid';
}

// Fungsi untuk menentukan shift berdasarkan waktu
function getShift(waktu) {
  const jam = waktu.getHours();
  if (jam >= 5 && jam < 12) return 'pagi';
  if (jam >= 12 && jam < 18) return 'sore';
  return 'tidak ada';
}

// Event listener untuk auth state changes
auth.onAuthStateChanged((user) => {
  if (user) {
    // User logged in
    getUserData(user.uid).then((doc) => {
      if (doc.exists) {
        const userData = doc.data();
        // Jika data user kosong (nama atau alamat), tampilkan popup profil
        if (!userData.nama || !userData.alamat) {
          // Tampilkan dialog profil
          if (document.getElementById('profileDlg')) {
            document.getElementById('profileDlg').showModal();
          }
        }
      } else {
        // Jika dokumen user tidak ada, buat dokumen baru dengan role karyawan (kecuali admin)
        const isAdmin = user.uid === 'O1SJ7hYop3UJjDcsA3JqT29aapI3' || user.uid === 'uB2XsyM6fXUj493cRlHCqpe2fxH3';
        db.collection('users').doc(user.uid).set({
          email: user.email,
          role: isAdmin ? 'admin' : 'karyawan',
          // nama dan alamat kosong, sehingga akan muncul popup
        }).then(() => {
          if (document.getElementById('profileDlg')) {
            document.getElementById('profileDlg').showModal();
          }
        });
      }
    });
  } else {
    // User logged out, redirect to index.html
    window.location.href = 'index.html';
  }
});