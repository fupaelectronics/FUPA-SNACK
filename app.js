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

// Variabel global
let currentUser = null;
let userProfile = null;

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const showToast = (message, type = 'info') => {
  const toast = $('#toast');
  if (!toast) return;
  
  const colors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f9a825',
    info: '#111'
  };
  
  toast.style.backgroundColor = colors[type] || colors.info;
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
};

// Fungsi untuk mendapatkan waktu server dari Firestore
const getServerTime = () => {
  return firebase.firestore.Timestamp.now();
};

// Fungsi untuk memeriksa status login
const checkAuthState = () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      
      // Dapatkan data profil pengguna
      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
          userProfile = userDoc.data();
          
          // Jika data pengguna kosong, tampilkan popup
          if ((!userProfile.nama || !userProfile.alamat) && window.showProfilePopup) {
            window.showProfilePopup();
          }
          
          // Redirect jika role tidak sesuai dengan halaman
          const isAdminPage = window.location.pathname.includes('admin.html');
          const isKaryawanPage = window.location.pathname.includes('karyawan.html');
          
          if (isAdminPage && userProfile.role !== 'admin') {
            window.location.href = 'karyawan.html';
          } else if (isKaryawanPage && userProfile.role !== 'karyawan') {
            window.location.href = 'admin.html';
          }
          
          // Muat data halaman
          if (typeof loadPageData === 'function') {
            loadPageData();
          }
        } else {
          // Buat dokumen pengguna jika tidak ada
          await db.collection('users').doc(user.uid).set({
            email: user.email,
            role: user.email === 'karomi@fupa.id' || user.email === 'annisa@fupa.id' ? 'admin' : 'karyawan',
            createdAt: getServerTime()
          });
          
          // Tampilkan popup untuk melengkapi profil
          if (window.showProfilePopup) {
            window.showProfilePopup();
          }
        }
      } catch (error) {
        console.error('Error getting user document:', error);
        showToast('Error memuat profil pengguna', 'error');
      }
    } else {
      // Redirect ke halaman login jika belum login
      if (!window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
    }
  });
};

// Fungsi untuk logout
const logout = async () => {
  try {
    await auth.signOut();
    showToast('Berhasil keluar', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  } catch (error) {
    console.error('Error signing out:', error);
    showToast('Gagal keluar', 'error');
  }
};

// Fungsi untuk mengompres gambar menjadi 10KB
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Tentukan ukuran canvas (resize gambar)
        let width = img.width;
        let height = img.height;
        const maxDimension = 800; // Ukuran maksimum
        
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
        
        // Gambar ulang gambar dengan kualitas lebih rendah
        ctx.drawImage(img, 0, 0, width, height);
        
        // Konversi ke blob dengan kualitas 0.6 (bisa disesuaikan)
        canvas.toBlob(
          (blob) => {
            // Jika masih lebih besar dari 10KB, kurangi kualitas
            if (blob.size > 10 * 1024) {
              canvas.toBlob(
                (finalBlob) => resolve(finalBlob),
                'image/jpeg',
                0.5
              );
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          0.7
        );
      };
    };
    reader.onerror = error => reject(error);
  });
};

// Fungsi untuk mengupload gambar ke Cloudinary
const uploadToCloudinary = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'FupaSnack');
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/da7idhh4f/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error('Gagal mengupload gambar');
  }
};

// Fungsi untuk mendapatkan aturan waktu
const getTimeRules = async (uid) => {
  try {
    // Cek aturan khusus user
    const userRulesDoc = await db.collection('aturanwaktuuser').doc(uid).get();
    
    if (userRulesDoc.exists) {
      return userRulesDoc.data();
    }
    
    // Jika tidak ada aturan khusus, gunakan aturan default
    const defaultRulesQuery = await db.collection('aturanwaktudefault').orderBy('createdAt', 'desc').limit(1).get();
    
    if (!defaultRulesQuery.empty) {
      return defaultRulesQuery.docs[0].data();
    }
    
    // Return aturan default jika tidak ada di database
    return {
      jam_berangkat: '05:30',
      jam_pulang: '10:00',
      toleransi: 20,
      hari_libur: [0], // 0 = Minggu
      updatedAt: getServerTime()
    };
  } catch (error) {
    console.error('Error getting time rules:', error);
    showToast('Error mengambil aturan waktu', 'error');
    
    // Return default values jika terjadi error
    return {
      jam_berangkat: '05:30',
      jam_pulang: '10:00',
      toleransi: 20,
      hari_libur: [0]
    };
  }
};

// Fungsi untuk menentukan status presensi
const determinePresenceStatus = async (waktu, jenis, uid) => {
  try {
    const rules = await getTimeRules(uid);
    
    // Konversi waktu ke Date object
    const waktuDate = waktu.toDate();
    const hari = waktuDate.getDay(); // 0 = Minggu, 1 = Senin, dst.
    
    // Cek apakah hari libur
    if (rules.hari_libur.includes(hari)) {
      return 'Libur';
    }
    
    // Parse jam dari aturan
    const [berangkatJam, berangkatMenit] = rules.jam_berangkat.split(':').map(Number);
    const [pulangJam, pulangMenit] = rules.jam_pulang.split(':').map(Number);
    
    // Buat objek Date untuk waktu berangkat dan pulang
    const berangkatTime = new Date(waktuDate);
    berangkatTime.setHours(berangkatJam, berangkatMenit, 0, 0);
    
    const pulangTime = new Date(waktuDate);
    pulangTime.setHours(pulangJam, pulangMenit, 0, 0);
    
    // Hitung waktu toleransi (dalam milidetik)
    const toleransiMs = rules.toleransi * 60 * 1000;
    
    // Tentukan status berdasarkan jenis presensi
    if (jenis === 'berangkat') {
      const batasAwal = new Date(berangkatTime.getTime() - toleransiMs);
      const batasAkhir = new Date(berangkatTime.getTime() + toleransiMs);
      
      if (waktuDate < batasAwal || waktuDate > batasAkhir) {
        return 'Di Luar Sesi Presensi';
      }
      
      if (waktuDate <= berangkatTime) {
        return 'Tepat Waktu';
      } else {
        return 'Terlambat';
      }
    } else if (jenis === 'pulang') {
      const batasAwal = new Date(pulangTime.getTime() - toleransiMs);
      const batasAkhir = new Date(pulangTime.getTime() + toleransiMs);
      
      if (waktuDate < batasAwal || waktuDate > batasAkhir) {
        return 'Di Luar Sesi Presensi';
      }
      
      if (waktuDate <= pulangTime) {
        return 'Tepat Waktu';
      } else {
        return 'Terlambat';
      }
    }
    
    return 'Tidak Valid';
  } catch (error) {
    console.error('Error determining presence status:', error);
    return 'Error';
  }
};

// Panggil fungsi untuk memeriksa status auth saat app.js dimuat
checkAuthState();