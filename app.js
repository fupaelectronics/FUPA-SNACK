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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Fungsi utilitas UI
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

// Fungsi untuk mendapatkan waktu server dari Firestore
async function getServerTime() {
  try {
    const ref = db.collection('serverTime').doc('current');
    const doc = await ref.get();
    if (doc.exists) {
      return doc.data().timestamp.toDate();
    } else {
      // Fallback ke waktu lokal jika tidak ada waktu server
      return new Date();
    }
  } catch (error) {
    console.error("Error getting server time:", error);
    return new Date(); // Fallback ke waktu lokal
  }
}

// Fungsi untuk menentukan shift berdasarkan waktu
function getShift(waktu) {
  const hour = waktu.getHours();
  if (hour >= 5 && hour < 12) return 'pagi';
  if (hour >= 12 && hour < 18) return 'sore';
  return null;
}

// Fungsi untuk menentukan status presensi
function getStatusPresensi(waktu, jenis, shift) {
  const hari = waktu.getDay();
  if (hari === 0) return "Libur"; // Minggu
  
  const jam = waktu.getHours();
  const menit = waktu.getMinutes();
  const totalMenit = jam * 60 + menit;
  
  // Aturan waktu default
  if (jenis === 'izin') return "Izin";
  
  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      if (totalMenit >= 330 && totalMenit <= 360) return "Tepat Waktu";
      if (totalMenit > 360 && totalMenit <= 380) return "Terlambat";
    } else if (jenis === 'pulang') {
      if (totalMenit >= 600 && totalMenit <= 660) return "Tepat Waktu";
      if (totalMenit > 660 && totalMenit <= 680) return "Terlambat";
    }
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') {
      if (totalMenit >= 840 && totalMenit <= 870) return "Tepat Waktu";
      if (totalMenit > 870 && totalMenit <= 890) return "Terlambat";
    } else if (jenis === 'pulang') {
      if (totalMenit >= 1050 && totalMenit <= 1110) return "Tepat Waktu";
      if (totalMenit > 1110 && totalMenit <= 1130) return "Terlambat";
    }
  }
  
  return "Di luar sesi presensi";
}

// Fungsi untuk memeriksa apakah sudah melakukan presensi hari ini
async function sudahPresensiHariIni(uid, jenis) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const querySnapshot = await db.collection('presensi')
      .where('userId', '==', uid)
      .where('waktu', '>=', today)
      .where('waktu', '<', tomorrow)
      .where('jenis', '==', jenis)
      .get();
    
    return !querySnapshot.empty;
  } catch (error) {
    console.error("Error checking attendance:", error);
    return false;
  }
}

// Fungsi untuk kompres gambar
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
        
        // Set maximum dimensions
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob with quality setting
        canvas.toBlob(
          (blob) => {
            if (blob.size > 10000) { // 10KB
              // If still too large, reduce quality further
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
}

// Fungsi untuk mengupload gambar ke Cloudinary
async function uploadToCloudinary(blob) {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', 'FupaSnack');
  
  try {
    const response = await fetch('https://api.cloudinary.com/v1_1/da7idhh4f/image/upload', {
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

// Fungsi untuk mendapatkan lokasi pengguna
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
      { timeout: 10000 }
    );
  });
}

// Fungsi untuk memformat waktu
function formatTime(date) {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Fungsi untuk memformat tanggal
function formatDate(date) {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Fungsi untuk mengecek dan mengupdate status login
function checkAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    
    try {
      // Cek role user
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (!userDoc.exists) {
        // Jika data user tidak ada, arahkan ke index.html
        await auth.signOut();
        window.location.href = 'index.html';
        return;
      }
      
      const userData = userDoc.data();
      
      // Redirect berdasarkan role
      const currentPage = window.location.pathname.split('/').pop();
      if (userData.role === 'admin' && currentPage !== 'admin.html') {
        window.location.href = 'admin.html';
      } else if (userData.role === 'karyawan' && currentPage !== 'karyawan.html') {
        window.location.href = 'karyawan.html';
      }
      
      // Load data user
      loadUserProfile(user.uid);
      
      // Jika data profil kosong, tampilkan popup
      if (!userData.nama || !userData.alamat) {
        $('#profileDlg').showModal();
      }
      
    } catch (error) {
      console.error('Error checking user role:', error);
      toast('Terjadi kesalahan saat memeriksa hak akses', 'error');
    }
  });
}

// Fungsi untuk memuat profil pengguna
async function loadUserProfile(uid) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      
      // Isi data profil
      if ($('#nama')) $('#nama').value = userData.nama || '';
      if ($('#alamat')) $('#alamat').value = userData.alamat || '';
      if ($('#pfp')) {
        $('#pfp').src = userData.fotoProfil || 
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userData.nama || 'User')}&backgroundColor=ffb300,ffd54f&radius=20`;
      }
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
  }
}

// Fungsi untuk menyimpan profil pengguna
async function saveUserProfile(uid, data) {
  try {
    await db.collection('users').doc(uid).update(data);
    toast('Profil berhasil disimpan', 'success');
    return true;
  } catch (error) {
    console.error('Error saving profile:', error);
    toast('Gagal menyimpan profil', 'error');
    return false;
  }
}

// Fungsi untuk logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch((error) => {
    console.error('Error signing out:', error);
    toast('Gagal keluar', 'error');
  });
}

// Inisialisasi aplikasi
function initApp() {
  checkAuth();
  
  // Event listener untuk logout button
  if ($('#logoutBtn')) {
    $('#logoutBtn').addEventListener('click', logout);
  }
  
  // Event listener untuk save profile button
  if ($('#saveProfileBtn')) {
    $('#saveProfileBtn').addEventListener('click', async () => {
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
      let fotoProfilUrl = null;
      
      if (pfpFile) {
        try {
          const compressedImage = await compressImage(pfpFile);
          fotoProfilUrl = await uploadToCloudinary(compressedImage);
        } catch (error) {
          console.error('Error uploading profile picture:', error);
          toast('Gagal mengupload foto profil', 'error');
          return;
        }
      }
      
      const updateData = { nama, alamat };
      if (fotoProfilUrl) updateData.fotoProfil = fotoProfilUrl;
      
      const success = await saveUserProfile(user.uid, updateData);
      if (success) {
        $('#profileDlg').close();
      }
    });
  }
  
  // Event listener untuk file input change
  if ($('#pfpFile')) {
    $('#pfpFile').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (event) => {
          $('#pfp').src = event.target.result;
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });
  }
}

// Panggil inisialisasi aplikasi saat DOM siap
document.addEventListener('DOMContentLoaded', initApp);