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

// Variabel global
let currentUser = null;
let userData = null;
let cameraStream = null;
let capturedPhoto = null;

// Daftar UID Admin
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
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

// Fungsi untuk mendapatkan waktu server
const getServerTimestamp = () => {
  return firebase.firestore.FieldValue.serverTimestamp();
};

// Fungsi untuk memeriksa apakah user adalah admin
const isAdmin = (uid) => {
  return ADMIN_UIDS.includes(uid);
};

// Fungsi untuk mendapatkan status presensi berdasarkan waktu
const getPresenceStatus = (jenis, waktu) => {
  const now = new Date(waktu.toDate().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Hari Minggu adalah libur
  if (day === 0) return "Libur";
  
  // Shift pagi: berangkat 05.30–06.00, pulang 10.00–11.00
  // Shift sore: berangkat 14.00–14.30, pulang 17.30–18.00
  
  if (jenis === 'berangkat') {
    // Shift pagi
    if ((hours === 5 && minutes >= 30) || (hours === 6 && minutes === 0)) {
      return "Tepat Waktu";
    } else if (hours === 6 && minutes > 0 && minutes <= 20) {
      return "Terlambat";
    }
    
    // Shift sore
    if ((hours === 14 && minutes >= 0 && minutes <= 30)) {
      return "Tepat Waktu";
    } else if (hours === 14 && minutes > 30 && minutes <= 50) {
      return "Terlambat";
    }
  } else if (jenis === 'pulang') {
    // Shift pagi
    if ((hours === 10 && minutes >= 0) || (hours === 11 && minutes === 0)) {
      return "Tepat Waktu";
    } else if (hours === 11 && minutes > 0 && minutes <= 20) {
      return "Terlambat";
    }
    
    // Shift sore
    if ((hours === 17 && minutes >= 30) || (hours === 18 && minutes === 0)) {
      return "Tepat Waktu";
    } else if (hours === 18 && minutes > 0 && minutes <= 20) {
      return "Terlambat";
    }
  }
  
  return "Di luar sesi presensi";
};

// Fungsi untuk mengompres gambar
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set maksimum dimensi
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;
        
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
        ctx.drawImage(img, 0, 0, width, height);
        
        // Kompres ke format JPEG dengan kualitas 0.7
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.7);
      };
      img.src = event.target.result;
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

// Fungsi untuk upload ke Cloudinary
const uploadToCloudinary = (blob) => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', 'FupaSnack');
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
};

// Fungsi untuk mendapatkan lokasi
const getLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
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
};

// Fungsi untuk memuat riwayat presensi
const loadPresenceHistory = async (limit = 20, filters = {}) => {
  try {
    let query = db.collection('presensi');
    
    // Jika bukan admin, hanya tampilkan presensi user sendiri
    if (!isAdmin(currentUser.uid)) {
      query = query.where('uid', '==', currentUser.uid);
    } else if (filters.nama) {
      // Filter berdasarkan nama untuk admin
      query = query.where('nama', '==', filters.nama);
    }
    
    // Filter berdasarkan tanggal jika ada
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      
      query = query.where('waktu', '>=', start).where('waktu', '<=', end);
    }
    
    query = query.orderBy('waktu', 'desc');
    
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }
    
    const snapshot = await query.get();
    const presences = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      presences.push({
        id: doc.id,
        ...data,
        waktu: data.waktu.toDate()
      });
    });
    
    return presences;
  } catch (error) {
    console.error('Error loading presence history:', error);
    showToast('Gagal memuat riwayat presensi', 'error');
    return [];
  }
};

// Fungsi untuk memuat notifikasi
const loadNotifications = async () => {
  try {
    let query = db.collection('notifikasi')
      .where('targetUID', 'in', [currentUser.uid, 'all'])
      .orderBy('createdAt', 'desc');
    
    if (isAdmin(currentUser.uid)) {
      // Admin melihat semua notifikasi cuti
      query = db.collection('notifikasi')
        .where('type', '==', 'cuti')
        .orderBy('createdAt', 'desc');
    }
    
    const snapshot = await query.get();
    const notifications = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt.toDate()
      });
    });
    
    return notifications;
  } catch (error) {
    console.error('Error loading notifications:', error);
    showToast('Gagal memuat notifikasi', 'error');
    return [];
  }
};

// Fungsi untuk menandai notifikasi sebagai sudah dibaca
const markNotificationAsRead = async (notifId) => {
  try {
    await db.collection('notifikasi').doc(notifId).update({
      read: true
    });
    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
};

// Fungsi untuk menghapus notifikasi
const deleteNotification = async (notifId) => {
  try {
    await db.collection('notifikasi').doc(notifId).delete();
    return true;
  } catch (error) {
    console.error('Error deleting notification:', error);
    return false;
  }
};

// Fungsi untuk mengajukan cuti
const submitCuti = async (tanggal, jenis, keterangan) => {
  try {
    const cutiData = {
      uid: currentUser.uid,
      nama: userData.nama,
      tanggal: new Date(tanggal),
      jenis: jenis,
      keterangan: keterangan,
      status: 'pending',
      diajukanPada: getServerTimestamp()
    };
    
    // Simpan data cuti
    const cutiRef = await db.collection('cuti').add(cutiData);
    
    // Buat notifikasi untuk admin
    const notifData = {
      type: 'cuti',
      targetUID: 'admin',
      title: 'Pengajuan Cuti',
      message: `${userData.nama} mengajukan cuti ${jenis} pada ${tanggal}`,
      data: { cutiId: cutiRef.id },
      createdAt: getServerTimestamp(),
      read: false
    };
    
    await db.collection('notifikasi').add(notifData);
    
    return true;
  } catch (error) {
    console.error('Error submitting cuti:', error);
    return false;
  }
};

// Fungsi untuk memproses cuti
const processCuti = async (cutiId, approved) => {
  try {
    // Update status cuti
    await db.collection('cuti').doc(cutiId).update({
      status: approved ? 'approved' : 'rejected'
    });
    
    // Dapatkan data cuti
    const cutiDoc = await db.collection('cuti').doc(cutiId).get();
    const cutiData = cutiDoc.data();
    
    // Buat notifikasi untuk karyawan
    const notifData = {
      type: 'cuti_result',
      targetUID: cutiData.uid,
      title: 'Hasil Pengajuan Cuti',
      message: `Pengajuan cuti ${cutiData.jenis} Anda ${approved ? 'disetujui' : 'ditolak'}`,
      data: { 
        cutiId: cutiId,
        approved: approved,
        jenis: cutiData.jenis,
        tanggal: cutiData.tanggal
      },
      createdAt: getServerTimestamp(),
      read: false
    };
    
    await db.collection('notifikasi').add(notifData);
    
    return true;
  } catch (error) {
    console.error('Error processing cuti:', error);
    return false;
  }
};

// Fungsi untuk membuat entri presensi dari cuti
const createPresenceFromCuti = async (cutiId) => {
  try {
    // Dapatkan data cuti
    const cutiDoc = await db.collection('cuti').doc(cutiId).get();
    const cutiData = cutiDoc.data();
    
    // Buat entri presensi
    const presenceData = {
      uid: cutiData.uid,
      nama: cutiData.nama,
      jenis: 'cuti',
      status: cutiData.jenis,
      waktu: cutiData.tanggal,
      koordinat: null,
      selfie: null,
      createdAt: getServerTimestamp()
    };
    
    await db.collection('presensi').add(presenceData);
    
    return true;
  } catch (error) {
    console.error('Error creating presence from cuti:', error);
    return false;
  }
};

// Fungsi untuk mengirim pengumuman
const sendAnnouncement = async (judul, deskripsi, targetUID) => {
  try {
    const notifData = {
      type: 'pengumuman',
      targetUID: targetUID,
      title: judul,
      message: deskripsi,
      createdAt: getServerTimestamp(),
      read: false
    };
    
    await db.collection('notifikasi').add(notifData);
    
    return true;
  } catch (error) {
    console.error('Error sending announcement:', error);
    return false;
  }
};

// Fungsi untuk mendapatkan daftar karyawan
const getKaryawanList = async () => {
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'karyawan')
      .get();
    
    const karyawanList = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      karyawanList.push({
        id: doc.id,
        ...data
      });
    });
    
    return karyawanList;
  } catch (error) {
    console.error('Error getting karyawan list:', error);
    return [];
  }
};

// Fungsi untuk mengekspor data ke CSV
const exportToCSV = (data, filename) => {
  const csvContent = "data:text/csv;charset=utf-8," 
    + data.map(row => Object.values(row).join(',')).join('\n');
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  
  link.click();
  document.body.removeChild(link);
};

// Fungsi untuk memformat data presensi untuk CSV
const formatPresenceForCSV = (presences) => {
  // Kelompokkan berdasarkan nama
  const grouped = {};
  
  presences.forEach(presence => {
    if (!grouped[presence.nama]) {
      grouped[presence.nama] = [];
    }
    grouped[presence.nama].push(presence);
  });
  
  // Urutkan nama secara alfabetis
  const sortedNames = Object.keys(grouped).sort();
  
  // Format data untuk CSV
  const csvData = [];
  
  sortedNames.forEach(nama => {
    // Urutkan presensi berdasarkan tanggal
    const userPresences = grouped[nama].sort((a, b) => a.waktu - b.waktu);
    
    // Tambahkan header untuk setiap karyawan
    csvData.push([nama]);
    csvData.push(['Tanggal', 'Jam', 'Jenis', 'Status', 'Koordinat']);
    
    // Tambahkan data presensi
    userPresences.forEach(presence => {
      const date = presence.waktu.toLocaleDateString('id-ID');
      const time = presence.waktu.toLocaleTimeString('id-ID');
      
      csvData.push([
        date,
        time,
        presence.jenis,
        presence.status,
        presence.koordinat ? `${presence.koordinat.latitude}, ${presence.koordinat.longitude}` : '-'
      ]);
    });
    
    // Tambahkan baris kosong antar karyawan
    csvData.push([]);
  });
  
  return csvData;
};

// Fungsi untuk memulai kamera
const startCamera = async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' },
      audio: false
    });
    
    const video = $('#cameraPreview');
    if (video) {
      video.srcObject = cameraStream;
    }
    
    return true;
  } catch (error) {
    console.error('Error accessing camera:', error);
    showToast('Tidak dapat mengakses kamera', 'error');
    return false;
  }
};

// Fungsi untuk mengambil foto
const capturePhoto = () => {
  const video = $('#cameraPreview');
  const canvas = $('#photoCanvas');
  const context = canvas.getContext('2d');
  
  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw current video frame to canvas
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Convert canvas to blob
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.8);
  });
};

// Fungsi untuk menghentikan kamera
const stopCamera = () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
};

// Event listener untuk auth state changes
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    
    // Dapatkan data user dari Firestore
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (userDoc.exists) {
        userData = userDoc.data();
        
        // Redirect berdasarkan role
        if (isAdmin(user.uid) && !window.location.pathname.endsWith('admin.html')) {
          window.location.href = 'admin.html';
        } else if (!isAdmin(user.uid) && !window.location.pathname.endsWith('karyawan.html')) {
          window.location.href = 'karyawan.html';
        }
        
        // Periksa jika data user kosong
        if ((!userData.nama || !userData.alamat) && window.location.pathname.endsWith('karyawan.html')) {
          $('#profileDlg').showModal();
        }
      } else {
        // Buat dokumen user baru jika tidak ada
        userData = {
          email: user.email,
          nama: '',
          alamat: '',
          role: isAdmin(user.uid) ? 'admin' : 'karyawan',
          createdAt: getServerTimestamp()
        };
        
        await db.collection('users').doc(user.uid).set(userData);
        
        if (!isAdmin(user.uid)) {
          $('#profileDlg').showModal();
        }
      }
    } catch (error) {
      console.error('Error getting user data:', error);
      showToast('Gagal memuat data pengguna', 'error');
    }
  } else {
    // User is signed out
    if (!window.location.pathname.endsWith('index.html')) {
      window.location.href = 'index.html';
    }
  }
});

// Fungsi untuk logout
const logout = async () => {
  try {
    stopCamera();
    await auth.signOut();
  } catch (error) {
    console.error('Error signing out:', error);
  }
};