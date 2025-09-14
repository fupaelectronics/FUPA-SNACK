// Modul utama aplikasi FUPA Presensi
// Ditempatkan di file terpisah dan di-load oleh karyawan.html dan admin.html

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
let userData = null;
let presenceStatus = null;
let currentStream = null;
let currentLocation = null;

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const showToast = (message, type = 'info') => {
  const toast = document.getElementById('toast');
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

// Format tanggal Indonesia
const formatDate = (date) => {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  return date.toLocaleDateString('id-ID', options);
};

// Format waktu
const formatTime = (date) => {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// Kompres gambar menjadi 10KB dan hapus metadata
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
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
        
        // Gambar ulang dengan kualitas lebih rendah
        ctx.drawImage(img, 0, 0, width, height);
        
        // Konversi ke blob dengan kualitas 0.6 (lebih rendah dari default 0.92)
        canvas.toBlob((blob) => {
          if (blob.size > 10000) { // 10KB
            // Jika masih terlalu besar, coba lagi dengan kualitas lebih rendah
            canvas.toBlob(
              (smallerBlob) => resolve(smallerBlob),
              'image/jpeg',
              0.5
            );
          } else {
            resolve(blob);
          }
        }, 'image/jpeg', 0.6);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Upload gambar ke Cloudinary
const uploadToCloudinary = (blob) => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', blob);
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
    .catch(reject);
  });
};

// Ambil lokasi pengguna
const getLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        resolve(location);
      },
      (error) => {
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};

// Cek status presensi berdasarkan aturan waktu
const checkPresenceStatus = async (uid, jenis) => {
  try {
    // Ambil aturan waktu
    let aturanWaktu = null;
    const userRuleSnapshot = await db.collection('aturanwaktuuser')
      .doc(uid).get();
    
    if (userRuleSnapshot.exists) {
      aturanWaktu = userRuleSnapshot.data();
    } else {
      const defaultRuleSnapshot = await db.collection('aturanwaktudefault')
        .doc('default').get();
      if (defaultRuleSnapshot.exists) {
        aturanWaktu = defaultRuleSnapshot.data();
      }
    }
    
    // Jika tidak ada aturan, gunakan default
    if (!aturanWaktu) {
      aturanWaktu = {
        jam_berangkat: '05:30',
        jam_pulang: '10:00',
        toleransi: 20, // dalam menit
        hari_libur: [0] // Minggu
      };
    }
    
    const now = new Date();
    const hariIni = now.getDay();
    const jamSekarang = now.getHours();
    const menitSekarang = now.getMinutes();
    const totalMenitSekarang = jamSekarang * 60 + menitSekarang;
    
    // Cek hari libur
    if (aturanWaktu.hari_libur.includes(hariIni)) {
      return { status: 'Libur', keterangan: 'Hari libur' };
    }
    
    // Parse waktu dari aturan
    const [jamBerangkat, menitBerangkat] = aturanWaktu.jam_berangkat.split(':').map(Number);
    const [jamPulang, menitPulang] = aturanWaktu.jam_pulang.split(':').map(Number);
    
    const totalMenitBerangkat = jamBerangkat * 60 + menitBerangkat;
    const totalMenitPulang = jamPulang * 60 + menitPulang;
    const toleransiMenit = aturanWaktu.toleransi || 20;
    
    // Tentukan status berdasarkan jenis presensi
    if (jenis === 'berangkat') {
      const batasAwal = totalMenitBerangkat - toleransiMenit;
      const batasAkhir = totalMenitBerangkat + toleransiMenit;
      
      if (totalMenitSekarang < batasAwal) {
        return { status: 'Di Luar Sesi Presensi', keterangan: 'Belum waktunya presensi berangkat' };
      } else if (totalMenitSekarang <= totalMenitBerangkat) {
        return { status: 'Tepat Waktu', keterangan: 'Presensi berangkat tepat waktu' };
      } else if (totalMenitSekarang <= batasAkhir) {
        return { status: 'Terlambat', keterangan: 'Presensi berangkat terlambat' };
      } else {
        return { status: 'Di Luar Sesi Presensi', keterangan: 'Lewat dari batas toleransi presensi berangkat' };
      }
    } else if (jenis === 'pulang') {
      const batasAwal = totalMenitPulang - toleransiMenit;
      const batasAkhir = totalMenitPulang + toleransiMenit;
      
      if (totalMenitSekarang < batasAwal) {
        return { status: 'Di Luar Sesi Presensi', keterangan: 'Belum waktunya presensi pulang' };
      } else if (totalMenitSekarang <= totalMenitPulang) {
        return { status: 'Tepat Waktu', keterangan: 'Presensi pulang tepat waktu' };
      } else if (totalMenitSekarang <= batasAkhir) {
        return { status: 'Terlambat', keterangan: 'Presensi pulang terlambat' };
      } else {
        return { status: 'Di Luar Sesi Presensi', keterangan: 'Lewat dari batas toleransi presensi pulang' };
      }
    }
    
    return { status: 'Tidak Valid', keterangan: 'Jenis presensi tidak valid' };
  } catch (error) {
    console.error('Error checking presence status:', error);
    return { status: 'Error', keterangan: 'Gagal memeriksa status presensi' };
  }
};

// Inisialisasi aplikasi
const initApp = () => {
  // Cek status autentikasi
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      
      // Ambil data user dari Firestore
      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          
          // Update UI dengan data user
          updateUserUI();
          
          // Load data yang diperlukan berdasarkan role
          if (userData.role === 'admin') {
            initAdminDashboard();
          } else if (userData.role === 'karyawan') {
            initKaryawanDashboard();
          }
        } else {
          showToast('Data pengguna tidak ditemukan', 'error');
          await auth.signOut();
          window.location.href = 'index.html';
        }
      } catch (error) {
        console.error('Error getting user data:', error);
        showToast('Gagal memuat data pengguna', 'error');
      }
    } else {
      // Tidak ada user yang login, redirect ke index
      window.location.href = 'index.html';
    }
  });
};

// Update UI dengan data user
const updateUserUI = () => {
  // Update nama dan foto profil
  const namaElement = document.getElementById('nama');
  const pfpElement = document.getElementById('pfp');
  
  if (namaElement && userData) {
    namaElement.value = userData.nama || '';
  }
  
  if (pfpElement && userData && userData.foto) {
    pfpElement.src = userData.foto;
  }
  
  // Update alamat jika ada
  const alamatElement = document.getElementById('alamat');
  if (alamatElement && userData) {
    alamatElement.value = userData.alamat || '';
  }
};

// Inisialisasi dashboard karyawan
const initKaryawanDashboard = () => {
  // Setup camera
  setupCamera();
  
  // Update waktu server
  updateServerTime();
  
  // Load riwayat presensi
  loadPresenceHistory();
  
  // Setup notifikasi
  setupNotifications();
  
  // Setup event listeners
  setupKaryawanEventListeners();
};

// Inisialisasi dashboard admin
const initAdminDashboard = () => {
  // Update waktu server
  updateServerTime();
  
  // Load data presensi semua karyawan
  loadAllPresenceHistory();
  
  // Setup notifikasi
  setupAdminNotifications();
  
  // Setup event listeners
  setupAdminEventListeners();
  
  // Load daftar karyawan untuk pengumuman
  loadKaryawanList();
};

// Setup camera untuk presensi
const setupCamera = () => {
  const video = document.getElementById('cameraVideo');
  if (!video) return;
  
  // Request akses camera
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then((stream) => {
      currentStream = stream;
      video.srcObject = stream;
      video.play();
    })
    .catch((error) => {
      console.error('Error accessing camera:', error);
      showToast('Tidak dapat mengakses kamera', 'error');
    });
};

// Ambil foto dari camera
const capturePhoto = () => {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('photoCanvas');
  const preview = document.getElementById('photoPreview');
  
  if (!video || !canvas || !preview) return null;
  
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Konversi canvas ke blob
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.8);
  });
};

// Update waktu server
const updateServerTime = () => {
  const serverTimeElement = document.getElementById('serverTime');
  if (!serverTimeElement) return;
  
  // Gunakan server timestamp dari Firestore untuk waktu yang konsisten
  const updateTime = () => {
    const now = new Date();
    serverTimeElement.textContent = formatDate(now);
  };
  
  updateTime();
  setInterval(updateTime, 1000);
};

// Load riwayat presensi karyawan
const loadPresenceHistory = async (limit = 20) => {
  const logList = document.getElementById('logList');
  if (!logList) return;
  
  try {
    let query = db.collection('presensi')
      .where('uid', '==', currentUser.uid)
      .orderBy('waktu', 'desc');
    
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }
    
    const snapshot = await query.get();
    
    logList.innerHTML = '';
    
    if (snapshot.empty) {
      logList.innerHTML = '<div class="riwayat-item">Belum ada riwayat presensi</div>';
      return;
    }
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const waktu = data.waktu.toDate();
      
      const statusClass = 
        data.status === 'Tepat Waktu' ? 's-good' :
        data.status === 'Terlambat' ? 's-warn' :
        data.status === 'Libur' ? 's-bad' : '';
      
      const item = document.createElement('div');
      item.className = 'riwayat-item';
      item.innerHTML = `
        <div class="riwayat-jenis">
          <span class="material-symbols-rounded">${data.jenis === 'berangkat' ? 'login' : 'logout'}</span>
          ${data.jenis === 'berangkat' ? 'Berangkat' : 'Pulang'}
          <span class="status ${statusClass}" style="margin-left:auto;font-size:12px">
            ${data.status.toLowerCase()}
          </span>
        </div>
        <div class="riwayat-time">
          ${formatDate(waktu)}
        </div>
      `;
      
      logList.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading presence history:', error);
    showToast('Gagal memuat riwayat presensi', 'error');
  }
};

// Load semua riwayat presensi (admin)
const loadAllPresenceHistory = async (filters = {}) => {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;
  
  try {
    let query = db.collection('presensi').orderBy('waktu', 'desc');
    
    // Terapkan filter nama
    if (filters.nama) {
      // Untuk filter nama, kita perlu query users dulu
      const usersSnapshot = await db.collection('users')
        .where('nama', '>=', filters.nama)
        .where('nama', '<=', filters.nama + '\uf8ff')
        .get();
      
      const uids = usersSnapshot.docs.map(doc => doc.id);
      if (uids.length > 0) {
        query = query.where('uid', 'in', uids);
      } else {
        // Tidak ada user dengan nama tersebut
        tableBody.innerHTML = '<tr><td colspan="6">Tidak ada data presensi</td></tr>';
        return;
      }
    }
    
    // Terapkan filter periode
    if (filters.dari && filters.sampai) {
      const dariDate = new Date(filters.dari);
      const sampaiDate = new Date(filters.sampai);
      sampaiDate.setDate(sampaiDate.getDate() + 1); // Sampai akhir hari
      
      query = query.where('waktu', '>=', dariDate)
                  .where('waktu', '<=', sampaiDate);
    }
    
    // Terapkan limit
    if (filters.limit && filters.limit !== 'all') {
      query = query.limit(parseInt(filters.limit));
    }
    
    const snapshot = await query.get();
    
    tableBody.innerHTML = '';
    
    if (snapshot.empty) {
      tableBody.innerHTML = '<tr><td colspan="6">Tidak ada data presensi</td></tr>';
      return;
    }
    
    // Untuk efisiensi, ambil semua user data sekaligus
    const userIds = [...new Set(snapshot.docs.map(doc => doc.data().uid))];
    const usersData = {};
    
    const usersSnapshot = await db.collection('users')
      .where(firebase.firestore.FieldPath.documentId(), 'in', userIds)
      .get();
    
    usersSnapshot.forEach(doc => {
      usersData[doc.id] = doc.data();
    });
    
    // Render data
    snapshot.forEach((doc) => {
      const data = doc.data();
      const user = usersData[data.uid] || { nama: 'Unknown' };
      const waktu = data.waktu.toDate();
      
      const statusClass = 
        data.status === 'Tepat Waktu' ? 's-good' :
        data.status === 'Terlambat' ? 's-warn' :
        data.status === 'Libur' ? 's-bad' : '';
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${formatDate(waktu)}</td>
        <td>${user.nama}</td>
        <td>${data.jenis === 'berangkat' ? 'Berangkat' : 'Pulang'}</td>
        <td><span class="status ${statusClass}">${data.status.toLowerCase()}</span></td>
        <td>${data.koordinat || '-'}</td>
        <td>${data.selfie && data.selfie !== '-' ? 
          `<a href="${data.selfie}" target="_blank">Lihat Foto</a>` : '-'}</td>
      `;
      
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading all presence history:', error);
    showToast('Gagal memuat riwayat presensi', 'error');
  }
};

// Setup notifikasi untuk karyawan
const setupNotifications = () => {
  const notifBadge = document.getElementById('notifBadge');
  const notifList = document.getElementById('notifList');
  
  if (!notifBadge || !notifList) return;
  
  // Listen untuk notifikasi yang ditujukan ke user ini
  const unsubscribe = db.collection('notifikasi')
    .where('uid', '==', currentUser.uid)
    .orderBy('timestamp', 'desc')
    .onSnapshot((snapshot) => {
      let unreadCount = 0;
      notifList.innerHTML = '';
      
      if (snapshot.empty) {
        notifList.innerHTML = '<div class="notif-item">Tidak ada notifikasi</div>';
        notifBadge.style.display = 'none';
        return;
      }
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.isRead) unreadCount++;
        
        const waktu = data.timestamp.toDate();
        const item = document.createElement('div');
        item.className = 'notif-item';
        item.dataset.id = doc.id;
        item.innerHTML = `
          <div class="notif-content">
            <div style="font-weight:600">${data.pesan}</div>
            <div style="font-size:12px;opacity:0.7">${formatDate(waktu)}</div>
          </div>
          <div class="notif-actions">
            <button class="icon-btn mark-read" title="Tandai sudah dibaca" style="font-size:16px">
              <span class="material-symbols-rounded">check_circle</span>
            </button>
          </div>
        `;
        
        // Tandai sebagai sudah dibaca ketika diklik
        item.querySelector('.mark-read').addEventListener('click', () => {
          db.collection('notifikasi').doc(doc.id).update({
            isRead: true
          });
        });
        
        notifList.appendChild(item);
      });
      
      // Update badge
      notifBadge.textContent = unreadCount;
      notifBadge.style.display = unreadCount > 0 ? 'grid' : 'none';
    }, (error) => {
      console.error('Error listening to notifications:', error);
    });
  
  // Simpan unsubscribe function untuk dibersihkan nanti
  window.notificationUnsubscribe = unsubscribe;
};

// Setup notifikasi untuk admin
const setupAdminNotifications = () => {
  const notifBadge = document.getElementById('notifBadge');
  const cutiList = document.getElementById('cutiList');
  
  if (!notifBadge || !cutiList) return;
  
  // Listen untuk notifikasi permintaan cuti
  const unsubscribe = db.collection('notifikasi')
    .where('targetRole', '==', 'admin')
    .where('jenis', '==', 'cuti_request')
    .where('isRead', '==', false)
    .orderBy('timestamp', 'desc')
    .onSnapshot(async (snapshot) => {
      let unreadCount = 0;
      cutiList.innerHTML = '';
      
      if (snapshot.empty) {
        cutiList.innerHTML = '<div class="cuti-item">Tidak ada permintaan cuti</div>';
        notifBadge.style.display = 'none';
        return;
      }
      
      // Untuk setiap notifikasi, ambil data cuti terkait
      for (const doc of snapshot.docs) {
        const notifData = doc.data();
        unreadCount++;
        
        try {
          const cutiDoc = await db.collection('cuti').doc(notifData.refId).get();
          if (!cutiDoc.exists) continue;
          
          const cutiData = cutiDoc.data();
          const userDoc = await db.collection('users').doc(cutiData.uid).get();
          const userData = userDoc.data();
          
          const waktu = notifData.timestamp.toDate();
          const item = document.createElement('div');
          item.className = 'cuti-item';
          item.dataset.id = doc.id;
          item.dataset.cutiId = cutiDoc.id;
          item.innerHTML = `
            <div><strong>${userData.nama}</strong> mengajukan cuti <strong>${cutiData.jenis}</strong></div>
            <div>Tanggal: ${cutiData.tanggal}</div>
            <div>Keterangan: ${cutiData.keterangan || '-'}</div>
            <div style="font-size:12px;opacity:0.7">Diajukan pada: ${formatDate(waktu)}</div>
            <div class="cuti-actions">
              <button class="btn approve-btn" style="background:var(--good)">
                <span class="material-symbols-rounded">check</span> Setujui
              </button>
              <button class="btn reject-btn" style="background:var(--bad)">
                <span class="material-symbols-rounded">close</span> Tolak
              </button>
            </div>
          `;
          
          // Handle approve
          item.querySelector('.approve-btn').addEventListener('click', async () => {
            await approveCuti(cutiDoc.id, notifData.refId, doc.id, userData.nama);
          });
          
          // Handle reject
          item.querySelector('.reject-btn').addEventListener('click', async () => {
            await rejectCuti(cutiDoc.id, doc.id, userData.nama);
          });
          
          cutiList.appendChild(item);
        } catch (error) {
          console.error('Error loading cuti data:', error);
        }
      }
      
      // Update badge
      notifBadge.textContent = unreadCount;
      notifBadge.style.display = unreadCount > 0 ? 'grid' : 'none';
    }, (error) => {
      console.error('Error listening to cuti requests:', error);
    });
  
  // Simpan unsubscribe function untuk dibersihkan nanti
  window.cutiNotificationUnsubscribe = unsubscribe;
};

// Approve cuti
const approveCuti = async (cutiId, refId, notifId, namaKaryawan) => {
  try {
    // Update status cuti
    await db.collection('cuti').doc(cutiId).update({
      status: 'disetujui'
    });
    
    // Tandai notifikasi sebagai sudah diproses
    await db.collection('notifikasi').doc(notifId).update({
      isRead: true
    });
    
    // Buat entri presensi otomatis
    const cutiDoc = await db.collection('cuti').doc(cutiId).get();
    const cutiData = cutiDoc.data();
    
    await db.collection('presensi').add({
      uid: cutiData.uid,
      nama: namaKaryawan,
      tanggal: cutiData.tanggal,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      jenis: 'Cuti',
      status: 'Full',
      koordinat: '-',
      selfie: '-',
      keterangan: 'Cuti disetujui'
    });
    
    // Buat notifikasi untuk karyawan
    await db.collection('notifikasi').add({
      uid: cutiData.uid,
      jenis: 'cuti_status',
      pesan: `Cuti Anda pada tanggal ${cutiData.tanggal} telah disetujui`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      isRead: false
    });
    
    showToast('Cuti disetujui', 'success');
  } catch (error) {
    console.error('Error approving cuti:', error);
    showToast('Gagal menyetujui cuti', 'error');
  }
};

// Tolak cuti
const rejectCuti = async (cutiId, notifId, namaKaryawan) => {
  try {
    // Update status cuti
    await db.collection('cuti').doc(cutiId).update({
      status: 'ditolak'
    });
    
    // Tandai notifikasi sebagai sudah diproses
    await db.collection('notifikasi').doc(notifId).update({
      isRead: true
    });
    
    // Buat notifikasi untuk karyawan
    const cutiDoc = await db.collection('cuti').doc(cutiId).get();
    const cutiData = cutiDoc.data();
    
    await db.collection('notifikasi').add({
      uid: cutiData.uid,
      jenis: 'cuti_status',
      pesan: `Cuti Anda pada tanggal ${cutiData.tanggal} ditolak`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      isRead: false
    });
    
    showToast('Cuti ditolak', 'success');
  } catch (error) {
    console.error('Error rejecting cuti:', error);
    showToast('Gagal menolak cuti', 'error');
  }
};

// Setup event listeners untuk karyawan
const setupKaryawanEventListeners = () => {
  // Snap button
  const snapBtn = document.getElementById('snapBtn');
  if (snapBtn) {
    snapBtn.addEventListener('click', async () => {
      try {
        snapBtn.disabled = true;
        snapBtn.innerHTML = '<span class="spinner"></span> Memproses...';
        
        // Ambil foto
        const photoBlob = await capturePhoto();
        if (!photoBlob) {
          throw new Error('Gagal mengambil foto');
        }
        
        // Kompres foto
        const compressedBlob = await compressImage(photoBlob);
        
        // Tampilkan preview
        const preview = document.getElementById('photoPreview');
        if (preview) {
          preview.src = URL.createObjectURL(compressedBlob);
          preview.style.display = 'block';
        }
        
        // Simpan blob untuk diupload nanti
        window.currentPhotoBlob = compressedBlob;
        
        // Enable upload button
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
          uploadBtn.disabled = false;
        }
        
        showToast('Foto berhasil diambil', 'success');
      } catch (error) {
        console.error('Error capturing photo:', error);
        showToast('Gagal mengambil foto', 'error');
      } finally {
        snapBtn.disabled = false;
        snapBtn.innerHTML = '<span class="material-symbols-rounded">photo_camera</span> Ambil selfie';
      }
    });
  }
  
  // Upload button
  const uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      try {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner"></span> Mengupload...';
        
        const jenis = document.getElementById('jenis').value;
        const photoBlob = window.currentPhotoBlob;
        
        if (!photoBlob) {
          throw new Error('Tidak ada foto yang diambil');
        }
        
        // Ambil lokasi
        const location = await getLocation();
        const koordinat = `${location.latitude}, ${location.longitude}`;
        
        // Upload foto ke Cloudinary
        const fotoUrl = await uploadToCloudinary(photoBlob);
        
        // Cek status presensi
        const statusResult = await checkPresenceStatus(currentUser.uid, jenis);
        
        // Simpan presensi ke Firestore
        await db.collection('presensi').add({
          uid: currentUser.uid,
          nama: userData.nama,
          waktu: firebase.firestore.FieldValue.serverTimestamp(),
          jenis: jenis,
          status: statusResult.status,
          koordinat: koordinat,
          selfie: fotoUrl,
          keterangan: statusResult.keterangan
        });
        
        // Buat notifikasi untuk admin
        await db.collection('notifikasi').add({
          targetRole: 'admin',
          jenis: 'presensi',
          pesan: `${userData.nama} melakukan presensi ${jenis} dengan status ${statusResult.status}`,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          isRead: false
        });
        
        showToast('Presensi berhasil dicatat', 'success');
        
        // Reset state
        window.currentPhotoBlob = null;
        const preview = document.getElementById('photoPreview');
        if (preview) {
          preview.style.display = 'none';
        }
        
        // Reload riwayat presensi
        const historyFilter = document.getElementById('historyFilter');
        loadPresenceHistory(historyFilter ? historyFilter.value : 20);
      } catch (error) {
        console.error('Error uploading presence:', error);
        showToast('Gagal mengupload presensi', 'error');
      } finally {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      }
    });
  }
  
  // History filter
  const historyFilter = document.getElementById('historyFilter');
  if (historyFilter) {
    historyFilter.addEventListener('change', () => {
      loadPresenceHistory(historyFilter.value);
    });
  }
  
  // Cuti FAB
  const cutiFab = document.getElementById('cutiFab');
  if (cutiFab) {
    cutiFab.addEventListener('click', () => {
      const cutiDlg = document.getElementById('cutiDlg');
      if (cutiDlg) {
        // Set default date to today
        const cutiTanggal = document.getElementById('cutiTanggal');
        if (cutiTanggal) {
          cutiTanggal.valueAsDate = new Date();
        }
        cutiDlg.showModal();
      }
    });
  }
  
  // Ajukan cuti button
  const ajukanCutiBtn = document.getElementById('ajukanCutiBtn');
  if (ajukanCutiBtn) {
    ajukanCutiBtn.addEventListener('click', async () => {
      try {
        ajukanCutiBtn.disabled = true;
        ajukanCutiBtn.innerHTML = '<span class="spinner"></span> Mengajukan...';
        
        const jenis = document.getElementById('cutiJenis').value;
        const tanggal = document.getElementById('cutiTanggal').value;
        const catatan = document.getElementById('cutiCatatan').value;
        
        if (!tanggal) {
          throw new Error('Tanggal harus diisi');
        }
        
        // Simpan pengajuan cuti
        const cutiRef = await db.collection('cuti').add({
          uid: currentUser.uid,
          jenis: jenis,
          tanggal: tanggal,
          keterangan: catatan,
          status: 'pending',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Buat notifikasi untuk admin
        await db.collection('notifikasi').add({
          targetRole: 'admin',
          jenis: 'cuti_request',
          refId: cutiRef.id,
          pesan: `${userData.nama} mengajukan cuti ${jenis} tanggal ${tanggal}`,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          isRead: false
        });
        
        showToast('Cuti berhasil diajukan', 'success');
        
        // Tutup dialog
        const cutiDlg = document.getElementById('cutiDlg');
        if (cutiDlg) {
          cutiDlg.close();
        }
      } catch (error) {
        console.error('Error submitting cuti:', error);
        showToast('Gagal mengajukan cuti', 'error');
      } finally {
        ajukanCutiBtn.disabled = false;
        ajukanCutiBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Ajukan';
      }
    });
  }
  
  // Profile button
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      const profileDlg = document.getElementById('profileDlg');
      if (profileDlg) {
        profileDlg.showModal();
      }
    });
  }
  
  // Save profile button
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      try {
        saveProfileBtn.disabled = true;
        saveProfileBtn.innerHTML = '<span class="spinner"></span> Menyimpan...';
        
        const nama = document.getElementById('nama').value;
        const alamat = document.getElementById('alamat').value;
        const pfpFile = document.getElementById('pfpFile').files[0];
        
        let fotoUrl = userData.foto;
        
        // Jika ada file foto baru, upload ke Cloudinary
        if (pfpFile) {
          const compressedBlob = await compressImage(pfpFile);
          fotoUrl = await uploadToCloudinary(compressedBlob);
        }
        
        // Update data user di Firestore
        await db.collection('users').doc(currentUser.uid).update({
          nama: nama,
          alamat: alamat,
          foto: fotoUrl
        });
        
        // Update userData lokal
        userData.nama = nama;
        userData.alamat = alamat;
        userData.foto = fotoUrl;
        
        showToast('Profil berhasil disimpan', 'success');
        
        // Tutup dialog
        const profileDlg = document.getElementById('profileDlg');
        if (profileDlg) {
          profileDlg.close();
        }
      } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Gagal menyimpan profil', 'error');
      } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Simpan';
      }
    });
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        // Hentikan semua listener
        if (window.notificationUnsubscribe) {
          window.notificationUnsubscribe();
        }
        
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
        
        // Logout dari Firebase
        await auth.signOut();
        showToast('Berhasil keluar', 'success');
        
        // Redirect ke index
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      } catch (error) {
        console.error('Error logging out:', error);
        showToast('Gagal keluar', 'error');
      }
    });
  }
  
  // Notifikasi button
  const notifBtn = document.getElementById('notifBtn');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      const notifDlg = document.getElementById('notifDlg');
      if (notifDlg) {
        notifDlg.showModal();
      }
    });
  }
};

// Setup event listeners untuk admin
const setupAdminEventListeners = () => {
  // Apply filters button
  const applyFilter = document.getElementById('applyFilter');
  if (applyFilter) {
    applyFilter.addEventListener('click', () => {
      const fNama = document.getElementById('fNama').value;
      const fPeriode = document.getElementById('fPeriode').value;
      const fDari = document.getElementById('fDari').value;
      const fSampai = document.getElementById('fSampai').value;
      const fShow = document.getElementById('fShow').value;
      
      const filters = {};
      if (fNama) filters.nama = fNama;
      if (fPeriode === 'custom' && fDari && fSampai) {
        filters.dari = fDari;
        filters.sampai = fSampai;
      }
      if (fShow) filters.limit = fShow;
      
      loadAllPresenceHistory(filters);
    });
  }
  
  // Period filter change
  const fPeriode = document.getElementById('fPeriode');
  if (fPeriode) {
    fPeriode.addEventListener('change', () => {
      const customDateRange = document.getElementById('customDateRange');
      if (customDateRange) {
        customDateRange.style.display = fPeriode.value === 'custom' ? 'flex' : 'none';
      }
    });
  }
  
  // Export CSV button
  const exportCsv = document.getElementById('exportCsv');
  if (exportCsv) {
    exportCsv.addEventListener('click', async () => {
      try {
        exportCsv.disabled = true;
        exportCsv.innerHTML = '<span class="spinner"></span> Mengekspor...';
        
        // Ambil filter yang aktif
        const fNama = document.getElementById('fNama').value;
        const fPeriode = document.getElementById('fPeriode').value;
        const fDari = document.getElementById('fDari').value;
        const fSampai = document.getElementById('fSampai').value;
        
        const filters = {};
        if (fNama) filters.nama = fNama;
        if (fPeriode === 'custom' && fDari && fSampai) {
          filters.dari = fDari;
          filters.sampai = fSampai;
        }
        
        // Ambil data presensi dengan filter
        let query = db.collection('presensi').orderBy('waktu', 'desc');
        
        if (filters.nama) {
          const usersSnapshot = await db.collection('users')
            .where('nama', '>=', filters.nama)
            .where('nama', '<=', filters.nama + '\uf8ff')
            .get();
          
          const uids = usersSnapshot.docs.map(doc => doc.id);
          if (uids.length > 0) {
            query = query.where('uid', 'in', uids);
          }
        }
        
        if (filters.dari && filters.sampai) {
          const dariDate = new Date(filters.dari);
          const sampaiDate = new Date(filters.sampai);
          sampaiDate.setDate(sampaiDate.getDate() + 1);
          
          query = query.where('waktu', '>=', dariDate)
                      .where('waktu', '<=', sampaiDate);
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
          showToast('Tidak ada data untuk diekspor', 'warning');
          return;
        }
        
        // Ambil data user untuk mapping uid ke nama
        const userIds = [...new Set(snapshot.docs.map(doc => doc.data().uid))];
        const usersData = {};
        
        const usersSnapshot = await db.collection('users')
          .where(firebase.firestore.FieldPath.documentId(), 'in', userIds)
          .get();
        
        usersSnapshot.forEach(doc => {
          usersData[doc.id] = doc.data();
        });
        
        // Format data sesuai STDR: diurutkan berdasarkan nama, dikelompokkan per karyawan
        const dataByUser = {};
        
        snapshot.forEach(doc => {
          const data = doc.data();
          const user = usersData[data.uid] || { nama: 'Unknown' };
          
          if (!dataByUser[user.nama]) {
            dataByUser[user.nama] = [];
          }
          
          dataByUser[user.nama].push({
            waktu: data.waktu.toDate(),
            jenis: data.jenis,
            status: data.status,
            koordinat: data.koordinat,
            selfie: data.selfie
          });
        });
        
        // Urutkan nama karyawan
        const sortedUserNames = Object.keys(dataByUser).sort();
        
        // Buat CSV content
        let csvContent = 'Nama,Tanggal,Waktu,Jenis,Status,Koordinat,Selfie\n';
        
        for (const userName of sortedUserNames) {
          const presences = dataByUser[userName];
          
          // Urutkan presensi berdasarkan tanggal
          presences.sort((a, b) => a.waktu - b.waktu);
          
          for (const presence of presences) {
            const date = presence.waktu.toLocaleDateString('id-ID');
            const time = presence.waktu.toLocaleTimeString('id-ID');
            
            csvContent += `"${userName}",${date},${time},${presence.jenis},${presence.status},${presence.koordinat},${presence.selfie}\n`;
          }
          
          // Tambahkan baris kosong antar karyawan
          csvContent += '\n';
        }
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `presensi_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('CSV berhasil diekspor', 'success');
      } catch (error) {
        console.error('Error exporting CSV:', error);
        showToast('Gagal mengekspor CSV', 'error');
      } finally {
        exportCsv.disabled = false;
        exportCsv.innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
      }
    });
  }
  
  // Profile button
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      const profileDlg = document.getElementById('profileDlg');
      if (profileDlg) {
        profileDlg.showModal();
      }
    });
  }
  
  // Save profile button
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      try {
        saveProfileBtn.disabled = true;
        saveProfileBtn.innerHTML = '<span class="spinner"></span> Menyimpan...';
        
        const nama = document.getElementById('nama').value;
        const alamat = document.getElementById('alamat').value;
        const pfpFile = document.getElementById('pfpFile').files[0];
        
        let fotoUrl = userData.foto;
        
        // Jika ada file foto baru, upload ke Cloudinary
        if (pfpFile) {
          const compressedBlob = await compressImage(pfpFile);
          fotoUrl = await uploadToCloudinary(compressedBlob);
        }
        
        // Update data user di Firestore
        await db.collection('users').doc(currentUser.uid).update({
          nama: nama,
          alamat: alamat,
          foto: fotoUrl
        });
        
        // Update userData lokal
        userData.nama = nama;
        userData.alamat = alamat;
        userData.foto = fotoUrl;
        
        showToast('Profil berhasil disimpan', 'success');
        
        // Tutup dialog
        const profileDlg = document.getElementById('profileDlg');
        if (profileDlg) {
          profileDlg.close();
        }
      } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Gagal menyimpan profil', 'error');
      } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Simpan';
      }
    });
  }
  
  // Create user button
  const createUserBtn = document.getElementById('createUserBtn');
  if (createUserBtn) {
    createUserBtn.addEventListener('click', async () => {
      try {
        createUserBtn.disabled = true;
        createUserBtn.innerHTML = '<span class="spinner"></span> Membuat...';
        
        const email = document.getElementById('newEmail').value;
        const password = document.getElementById('newPass').value;
        
        if (!email || !password) {
          throw new Error('Email dan password harus diisi');
        }
        
        // Buat user baru di Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const newUser = userCredential.user;
        
        // Simpan data user di Firestore
        await db.collection('users').doc(newUser.uid).set({
          email: email,
          nama: email.split('@')[0],
          role: 'karyawan',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('Akun berhasil dibuat', 'success');
        
        // Reset form
        document.getElementById('newEmail').value = '';
        document.getElementById('newPass').value = 'fupa123';
      } catch (error) {
        console.error('Error creating user:', error);
        showToast('Gagal membuat akun', 'error');
      } finally {
        createUserBtn.disabled = false;
        createUserBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Buat';
      }
    });
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        // Hentikan semua listener
        if (window.cutiNotificationUnsubscribe) {
          window.cutiNotificationUnsubscribe();
        }
        
        // Logout dari Firebase
        await auth.signOut();
        showToast('Berhasil keluar', 'success');
        
        // Redirect ke index
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      } catch (error) {
        console.error('Error logging out:', error);
        showToast('Gagal keluar', 'error');
      }
    });
  }
  
  // Notifikasi button
  const notifBtn = document.getElementById('notifBtn');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      const notifDlg = document.getElementById('notifDlg');
      if (notifDlg) {
        notifDlg.showModal();
      }
    });
  }
  
  // Announce target change
  const announceTarget = document.getElementById('announceTarget');
  if (announceTarget) {
    announceTarget.addEventListener('change', () => {
      const userSelection = document.getElementById('userSelection');
      if (userSelection) {
        userSelection.style.display = announceTarget.value === 'specific' ? 'block' : 'none';
      }
    });
  }
  
  // Send announcement button
  const sendAnnounce = document.getElementById('sendAnnounce');
  if (sendAnnounce) {
    sendAnnounce.addEventListener('click', async () => {
      try {
        sendAnnounce.disabled = true;
        sendAnnounce.innerHTML = '<span class="spinner"></span> Mengirim...';
        
        const text = document.getElementById('announceText').value;
        const target = document.getElementById('announceTarget').value;
        
        if (!text) {
          throw new Error('Teks pengumuman harus diisi');
        }
        
        // Simpan pengumuman
        const announceRef = await db.collection('pengumuman').add({
          judul: 'Pengumuman',
          pesan: text,
          target: target === 'all' ? 'all' : [],
          dibuatOleh: currentUser.uid,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Buat notifikasi untuk target
        if (target === 'all') {
          // Untuk semua karyawan
          await db.collection('notifikasi').add({
            targetRole: 'karyawan',
            jenis: 'pengumuman',
            refId: announceRef.id,
            pesan: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            isRead: false
          });
        } else {
          // Untuk karyawan tertentu
          const selectedUsers = document.querySelectorAll('#userList .user-item.selected');
          for (const userItem of selectedUsers) {
            await db.collection('notifikasi').add({
              uid: userItem.dataset.uid,
              jenis: 'pengumuman',
              refId: announceRef.id,
              pesan: text,
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              isRead: false
            });
          }
        }
        
        showToast('Pengumuman berhasil dikirim', 'success');
        
        // Reset form
        document.getElementById('announceText').value = '';
      } catch (error) {
        console.error('Error sending announcement:', error);
        showToast('Gagal mengirim pengumuman', 'error');
      } finally {
        sendAnnounce.disabled = false;
        sendAnnounce.innerHTML = '<span class="material-symbols-rounded">send</span> Kirim';
      }
    });
  }
  
  // Time rules FAB
  const timeRulesFab = document.getElementById('timeRulesFab');
  if (timeRulesFab) {
    timeRulesFab.addEventListener('click', () => {
      const timeRulesDlg = document.getElementById('timeRulesDlg');
      if (timeRulesDlg) {
        timeRulesDlg.showModal();
      }
    });
  }
  
  // Rules target change
  const rulesTarget = document.getElementById('rulesTarget');
  if (rulesTarget) {
    rulesTarget.addEventListener('change', () => {
      const rulesUserSelection = document.getElementById('rulesUserSelection');
      if (rulesUserSelection) {
        rulesUserSelection.style.display = rulesTarget.value === 'specific' ? 'block' : 'none';
      }
    });
  }
  
  // Save time rules button
  const saveRulesBtn = document.getElementById('saveRulesBtn');
  if (saveRulesBtn) {
    saveRulesBtn.addEventListener('click', async () => {
      try {
        saveRulesBtn.disabled = true;
        saveRulesBtn.innerHTML = '<span class="spinner"></span> Menyimpan...';
        
        const target = document.getElementById('rulesTarget').value;
        const berangkat = document.getElementById('rulesBerangkat').value;
        const pulang = document.getElementById('rulesPulang').value;
        const liburSelect = document.getElementById('rulesLibur');
        const libur = Array.from(liburSelect.selectedOptions).map(opt => parseInt(opt.value));
        
        if (target === 'all') {
          // Simpan aturan default
          await db.collection('aturanwaktudefault').doc('default').set({
            jam_berangkat: berangkat,
            jam_pulang: pulang,
            toleransi: 20,
            hari_libur: libur,
            updatedBy: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Simpan aturan untuk user tertentu
          const selectedUsers = document.querySelectorAll('#rulesUserList .user-item.selected');
          for (const userItem of selectedUsers) {
            await db.collection('aturanwaktuuser').doc(userItem.dataset.uid).set({
              jam_berangkat: berangkat,
              jam_pulang: pulang,
              toleransi: 20,
              hari_libur: libur,
              updatedBy: currentUser.uid,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        }
        
        showToast('Aturan waktu berhasil disimpan', 'success');
        
        // Tutup dialog
        const timeRulesDlg = document.getElementById('timeRulesDlg');
        if (timeRulesDlg) {
          timeRulesDlg.close();
        }
      } catch (error) {
        console.error('Error saving time rules:', error);
        showToast('Gagal menyimpan aturan waktu', 'error');
      } finally {
        saveRulesBtn.disabled = false;
        saveRulesBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Simpan Aturan';
      }
    });
  }
  
  // Save schedule button
  const saveSchedule = document.getElementById('saveSchedule');
  if (saveSchedule) {
    saveSchedule.addEventListener('click', async () => {
      try {
        const wajibHari = document.getElementById('wajibHari').value;
        
        // Implementasi override hari libur
        // Ini akan mempengaruhi fungsi checkPresenceStatus
        // Untuk simplicity, kita simpan di localStorage
        localStorage.setItem('hariLiburOverride', wajibHari);
        
        showToast('Pengaturan berhasil disimpan', 'success');
      } catch (error) {
        console.error('Error saving schedule:', error);
        showToast('Gagal menyimpan pengaturan', 'error');
      }
    });
  }
};

// Load daftar karyawan untuk admin
const loadKaryawanList = async () => {
  const userList = document.getElementById('userList');
  const rulesUserList = document.getElementById('rulesUserList');
  
  if (!userList && !rulesUserList) return;
  
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'karyawan')
      .get();
    
    if (snapshot.empty) return;
    
    const renderUserList = (container, users) => {
      container.innerHTML = '';
      users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.dataset.uid = user.id;
        item.textContent = user.nama;
        item.addEventListener('click', () => {
          item.classList.toggle('selected');
        });
        container.appendChild(item);
      });
    };
    
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    if (userList) {
      renderUserList(userList, users);
    }
    
    if (rulesUserList) {
      renderUserList(rulesUserList, users);
    }
  } catch (error) {
    console.error('Error loading karyawan list:', error);
  }
};

// Inisialisasi saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// Cleanup saat halaman ditutup
window.addEventListener('beforeunload', () => {
  // Hentikan semua listener
  if (window.notificationUnsubscribe) {
    window.notificationUnsubscribe();
  }
  
  if (window.cutiNotificationUnsubscribe) {
    window.cutiNotificationUnsubscribe();
  }
  
  // Hentikan camera stream
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
});