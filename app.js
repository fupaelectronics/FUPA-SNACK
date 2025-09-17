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
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// Referensi ke UID admin
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
];

// Fungsi utilitas
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

// Fungsi kompres gambar ke 10KB
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
        
        // Set ukuran maksimum
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
        
        // Gambar ulang dengan kualitas lebih rendah
        ctx.drawImage(img, 0, 0, width, height);
        
        // Kompres ke JPEG dengan kualitas 0.6 (bisa disesuaikan)
        canvas.toBlob(
          (blob) => {
            if (blob.size > 10000) { // 10KB
              // Jika masih terlalu besar, coba lagi dengan kualitas lebih rendah
              canvas.toBlob(
                (newBlob) => resolve(newBlob),
                'image/jpeg',
                0.5
              );
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          0.6
        );
      };
    };
    reader.onerror = error => reject(error);
  });
}

// Fungsi upload ke Cloudinary
async function uploadToCloudinary(blob) {
  const formData = new FormData();
  formData.append('file', blob);
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
    throw new Error('Gagal mengupload gambar');
  }
}

// Fungsi untuk menentukan shift berdasarkan waktu
function getCurrentShift() {
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 5 && hour < 12) return 'pagi';
  if (hour >= 12 && hour < 18) return 'sore';
  return null;
}

// Fungsi untuk menentukan status presensi
function getPresenceStatus(time, jenis, shift) {
  const now = new Date(time);
  const day = now.getDay(); // 0 = Minggu, 1 = Senin, dst
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Jika hari Minggu
  if (day === 0) return { status: 'Libur', dapatPresensi: false };
  
  // Jika jenis izin
  if (jenis === 'izin') return { status: 'Izin', dapatPresensi: true };
  
  // Untuk shift pagi
  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      // Waktu tepat: 05.30-06.00
      if (hour === 5 && minute >= 30 || hour === 6 && minute === 0) {
        return { status: 'Tepat Waktu', dapatPresensi: true };
      }
      // Terlambat: 06.01-06.20
      else if (hour === 6 && minute > 0 && minute <= 20) {
        return { status: 'Terlambat', dapatPresensi: true };
      }
      // Di luar sesi
      else {
        return { status: 'Di luar sesi presensi', dapatPresensi: false };
      }
    } 
    else if (jenis === 'pulang') {
      // Waktu tepat: 10.00-11.00
      if (hour === 10 && minute >= 0 || hour === 11 && minute === 0) {
        return { status: 'Tepat Waktu', dapatPresensi: true };
      }
      // Terlambat: 11.01-11.20
      else if (hour === 11 && minute > 0 && minute <= 20) {
        return { status: 'Terlambat', dapatPresensi: true };
      }
      // Di luar sesi
      else {
        return { status: 'Di luar sesi presensi', dapatPresensi: false };
      }
    }
  }
  
  // Untuk shift sore
  if (shift === 'sore') {
    if (jenis === 'berangkat') {
      // Waktu tepat: 14.00-14.30
      if (hour === 14 && minute >= 0 && minute <= 30) {
        return { status: 'Tepat Waktu', dapatPresensi: true };
      }
      // Terlambat: 14.31-14.50
      else if (hour === 14 && minute > 30 && minute <= 50) {
        return { status: 'Terlambat', dapatPresensi: true };
      }
      // Di luar sesi
      else {
        return { status: 'Di luar sesi presensi', dapatPresensi: false };
      }
    } 
    else if (jenis === 'pulang') {
      // Waktu tepat: 17.30-18.30
      if (hour === 17 && minute >= 30 || hour === 18 && minute <= 30) {
        return { status: 'Tepat Waktu', dapatPresensi: true };
      }
      // Terlambat: 18.31-18.50
      else if (hour === 18 && minute > 30 && minute <= 50) {
        return { status: 'Terlambat', dapatPresensi: true };
      }
      // Di luar sesi
      else {
        return { status: 'Di luar sesi presensi', dapatPresensi: false };
      }
    }
  }
  
  return { status: 'Tidak diketahui', dapatPresensi: false };
}

// Fungsi untuk memeriksa apakah sudah melakukan presensi hari ini
async function checkTodayPresence(uid, jenis) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const snapshot = await db.collection('presensi')
      .where('userId', '==', uid)
      .where('waktu', '>=', today)
      .where('waktu', '<', tomorrow)
      .where('jenis', '==', jenis)
      .get();
    
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking today presence:', error);
    return false;
  }
}

// Fungsi untuk mendapatkan koordinat
function getCurrentLocation() {
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
}

// Fungsi untuk mengelola kamera
class CameraManager {
  constructor(videoEl, canvasEl) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.stream = null;
    this.photoData = null;
  }
  
  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      });
      
      this.video.srcObject = this.stream;
      await this.video.play();
      
      return true;
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast('Tidak dapat mengakses kamera: ' + error.message, 'error');
      return false;
    }
  }
  
  takePicture() {
    if (!this.stream) {
      toast('Kamera belum diaktifkan', 'error');
      return null;
    }
    
    const context = this.canvas.getContext('2d');
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    
    context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        this.photoData = blob;
        resolve(blob);
      }, 'image/jpeg', 0.95);
    });
  }
  
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.video.srcObject = null;
    }
  }
  
  hasPhoto() {
    return this.photoData !== null;
  }
  
  clearPhoto() {
    this.photoData = null;
    const context = this.canvas.getContext('2d');
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

// Fungsi untuk menangani auth state changes
function setupAuthStateListener() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    
    try {
      // Cek role user
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (!userDoc.exists) {
        // Buat dokumen user baru jika belum ada
        await db.collection('users').doc(user.uid).set({
          email: user.email,
          nama: '',
          alamat: '',
          role: ADMIN_UIDS.includes(user.uid) ? 'admin' : 'karyawan',
          createdAt: serverTimestamp()
        });
        
        // Tampilkan modal isi profil jika data kosong
        if (window.showProfileModal) {
          window.showProfileModal();
        }
      } else {
        const userData = userDoc.data();
        
        // Redirect berdasarkan role
        const currentPage = window.location.pathname.split('/').pop();
        const isAdminPage = currentPage === 'admin.html';
        const isKaryawanPage = currentPage === 'karyawan.html';
        
        if (userData.role === 'admin' && isKaryawanPage) {
          window.location.href = 'admin.html';
          return;
        }
        
        if (userData.role === 'karyawan' && isAdminPage) {
          window.location.href = 'karyawan.html';
          return;
        }
        
        // Tampilkan modal isi profil jika data kosong
        if ((!userData.nama || !userData.alamat) && window.showProfileModal) {
          window.showProfileModal();
        }
        
        // Muat data profil
        if (window.loadProfileData) {
          window.loadProfileData(user.uid);
        }
        
        // Muat data sesuai halaman
        if (isAdminPage && window.loadPresenceData) {
          window.loadPresenceData();
        }
        
        if (isKaryawanPage && window.setupKaryawanPage) {
          window.setupKaryawanPage(user.uid);
        }
      }
    } catch (error) {
      console.error('Error in auth state change:', error);
      toast('Terjadi kesalahan: ' + error.message, 'error');
    }
  });
}

// Fungsi logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch((error) => {
    toast('Gagal logout: ' + error.message, 'error');
  });
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', function() {
  setupAuthStateListener();
  
  // Setup event listener untuk logout button jika ada
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
  
  // Setup event listener untuk save profile button jika ada
  const saveProfileBtn = $('#saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async function() {
      try {
        const user = auth.currentUser;
        if (!user) return;
        
        const nama = $('#nama').value.trim();
        const alamat = $('#alamat').value.trim();
        
        if (!nama || !alamat) {
          toast('Nama dan alamat harus diisi', 'error');
          return;
        }
        
        // Handle upload foto profil jika ada
        const pfpFile = $('#pfpFile').files[0];
        let photoURL = $('#pfp').src;
        
        if (pfpFile) {
          const compressedImage = await compressImage(pfpFile);
          photoURL = await uploadToCloudinary(compressedImage);
        }
        
        // Update data user
        await db.collection('users').doc(user.uid).update({
          nama,
          alamat,
          photoURL,
          updatedAt: serverTimestamp()
        });
        
        toast('Profil berhasil disimpan', 'success');
        
        // Tutup modal jika ada
        const profileDlg = $('#profileDlg');
        if (profileDlg) {
          profileDlg.close();
        }
        
        // Perbarui tampilan profil
        if (window.loadProfileData) {
          window.loadProfileData(user.uid);
        }
      } catch (error) {
        console.error('Error saving profile:', error);
        toast('Gagal menyimpan profil: ' + error.message, 'error');
      }
    });
  }
  
  // Setup event listener untuk file input profile picture
  const pfpFile = $('#pfpFile');
  if (pfpFile) {
    pfpFile.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
          $('#pfp').src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
});