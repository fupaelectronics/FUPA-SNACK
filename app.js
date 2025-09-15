// Firebase initialization
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

// UID lists
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
];

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

// Utility functions
const $ = (sel) => document.querySelector(sel);
const formatDate = (date) => date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const formatTime = (date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Check if user is admin
const isAdmin = (uid) => ADMIN_UIDS.includes(uid);

// Check if user is karyawan
const isKaryawan = (uid) => KARYAWAN_UIDS.includes(uid);

// Get user role
const getUserRole = (uid) => {
  if (isAdmin(uid)) return 'admin';
  if (isKaryawan(uid)) return 'karyawan';
  return null;
};

// Redirect based on role
const redirectByRole = (uid) => {
  const role = getUserRole(uid);
  if (role === 'admin') return 'admin.html';
  if (role === 'karyawan') return 'karyawan.html';
  return null;
};

// Show toast notification
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
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
};

// Compress image to 10KB
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas dimensions
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
        
        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.6);
      };
    };
  });
};

// Upload image to Cloudinary
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
    console.error('Upload error:', error);
    throw new Error('Gagal mengupload gambar');
  }
};

// Get current session status
const getSessionStatus = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Sunday is day off
  if (day === 0) return { status: 'Libur', message: 'Hari ini libur (Minggu)' };
  
  // Morning session: 05:30-06:00 (arrival), 10:00-11:00 (departure)
  const isMorningArrival = (hour === 5 && minute >= 30) || (hour === 6 && minute <= 0);
  const isMorningDeparture = (hour === 10 && minute >= 0) || (hour === 11 && minute <= 0);
  
  // Afternoon session: 14:00-14:30 (arrival), 17:30-18:00 (departure)
  const isAfternoonArrival = (hour === 14 && minute >= 0) || (hour === 14 && minute <= 30);
  const isAfternoonDeparture = (hour === 17 && minute >= 30) || (hour === 18 && minute <= 0);
  
  if (isMorningArrival || isAfternoonArrival) {
    return { status: 'Tepat Waktu', message: 'Sesi presensi berangkat' };
  }
  
  if (isMorningDeparture || isAfternoonDeparture) {
    return { status: 'Tepat Waktu', message: 'Sesi presensi pulang' };
  }
  
  // Check if late (within 20 minutes of session end)
  const isLateMorningArrival = (hour === 6 && minute > 0 && minute <= 20);
  const isLateMorningDeparture = (hour === 11 && minute > 0 && minute <= 20);
  const isLateAfternoonArrival = (hour === 14 && minute > 30 && minute <= 50);
  const isLateAfternoonDeparture = (hour === 18 && minute > 0 && minute <= 20);
  
  if (isLateMorningArrival || isLateAfternoonArrival || isLateMorningDeparture || isLateAfternoonDeparture) {
    return { status: 'Terlambat', message: 'Anda terlambat' };
  }
  
  return { status: 'Di luar sesi presensi', message: 'Tidak dalam sesi presensi' };
};

// Check if user has already done presence for current session
const checkExistingPresence = async (uid, type) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const presenceRef = db.collection('presensi')
      .where('uid', '==', uid)
      .where('timestamp', '>=', today)
      .where('timestamp', '<', tomorrow)
      .where('jenis', '==', type);
    
    const snapshot = await presenceRef.get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking existing presence:', error);
    return false;
  }
};

// Initialize PWA
const initPWA = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
  
  // Handle install prompt
  let deferredPrompt;
  const installBtn = document.getElementById('installBtn');
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    if (installBtn) {
      installBtn.style.display = 'block';
      installBtn.addEventListener('click', () => {
        installBtn.style.display = 'none';
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted install');
          }
          deferredPrompt = null;
        });
      });
    }
  });
};

// Initialize app
const initApp = () => {
  initPWA();
  
  // Auth state listener
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const currentPage = window.location.pathname.split('/').pop();
      const rolePage = redirectByRole(user.uid);
      
      // Redirect if on wrong page
      if (currentPage === 'index.html' && rolePage) {
        window.location.href = rolePage;
        return;
      }
      
      // Check if user data exists
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (!userDoc.exists) {
        // Create user data if doesn't exist
        await db.collection('users').doc(user.uid).set({
          email: user.email,
          nama: '',
          alamat: '',
          role: getUserRole(user.uid),
          foto: `https://api.dicebear.com/7.x/initials/svg?seed=${user.email}&backgroundColor=ffb300,ffd54f&radius=20`,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      
      // Show profile popup if data is empty
      if (currentPage !== 'index.html') {
        const userData = userDoc.data();
        if (!userData.nama || !userData.alamat) {
          showProfilePopup();
        }
      }
      
      // Load page-specific functionality
      if (currentPage === 'karyawan.html') {
        initKaryawanPage(user);
      } else if (currentPage === 'admin.html') {
        initAdminPage(user);
      }
    } else {
      // Redirect to login if not authenticated
      if (!window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
    }
  });
};

// Initialize karyawan page
const initKaryawanPage = (user) => {
  // Load user profile
  loadUserProfile(user.uid);
  
  // Load presence history
  loadPresenceHistory(user.uid);
  
  // Load notifications
  loadNotifications(user.uid, 'karyawan');
  
  // Initialize camera
  initCamera();
  
  // Initialize geolocation
  initGeolocation();
  
  // Event listeners
  document.getElementById('snapBtn').addEventListener('click', takePicture);
  document.getElementById('uploadBtn').addEventListener('click', () => uploadPresence(user.uid));
  document.getElementById('profileBtn').addEventListener('click', () => document.getElementById('profileDlg').showModal());
  document.getElementById('saveProfileBtn').addEventListener('click', () => saveProfile(user.uid));
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('notifBtn').addEventListener('click', () => document.getElementById('notifDlg').showModal());
  document.getElementById('cutiFab').addEventListener('click', () => document.getElementById('cutiDlg').showModal());
  document.getElementById('ajukanCutiBtn').addEventListener('click', () => ajukanCuti(user.uid));
  document.getElementById('historyFilter').addEventListener('change', () => loadPresenceHistory(user.uid));
  
  // Update server time
  updateServerTime();
};

// Initialize admin page
const initAdminPage = (user) => {
  // Load user profile
  loadUserProfile(user.uid);
  
  // Load all presence history
  loadAllPresenceHistory();
  
  // Load notifications
  loadNotifications(user.uid, 'admin');
  
  // Load karyawan list
  loadKaryawanList();
  
  // Event listeners
  document.getElementById('profileBtn').addEventListener('click', () => document.getElementById('profileDlg').showModal());
  document.getElementById('saveProfileBtn').addEventListener('click', () => saveProfile(user.uid));
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('notifBtn').addEventListener('click', () => document.getElementById('notifDlg').showModal());
  document.getElementById('createUserBtn').addEventListener('click', createUser);
  document.getElementById('exportCsv').addEventListener('click', exportToCSV);
  document.getElementById('applyFilter').addEventListener('click', applyFilters);
  document.getElementById('sendAnnounce').addEventListener('click', sendAnnouncement);
  document.getElementById('announceTarget').addEventListener('change', toggleUserSelection);
  
  // Update server time
  updateServerTime();
};

// Initialize camera
const initCamera = () => {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        video.srcObject = stream;
        video.play();
      })
      .catch((error) => {
        console.error('Camera error:', error);
        showToast('Tidak dapat mengakses kamera', 'error');
      });
  }
};

// Take picture
const takePicture = () => {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const context = canvas.getContext('2d');
  
  // Draw current video frame to canvas
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Show canvas, hide video
  canvas.style.display = 'block';
  video.style.display = 'none';
  
  // Enable upload button
  document.getElementById('uploadBtn').disabled = false;
  
  showToast('Foto berhasil diambil', 'success');
};

// Upload presence
const uploadPresence = async (uid) => {
  try {
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner"></span> Mengupload...';
    
    // Get presence type
    const jenis = document.getElementById('jenis').value;
    
    // Check if already presence for this session
    const hasExisting = await checkExistingPresence(uid, jenis);
    if (hasExisting) {
      showToast('Anda sudah melakukan presensi untuk sesi ini', 'error');
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      return;
    }
    
    // Check session status
    const sessionStatus = getSessionStatus();
    if (sessionStatus.status === 'Di luar sesi presensi') {
      showToast('Tidak dapat melakukan presensi di luar sesi', 'error');
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      return;
    }
    
    // Get current location
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      });
    });
    
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    // Get image data from canvas
    const canvas = document.getElementById('cameraCanvas');
    const imageBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });
    
    // Compress image
    const compressedImage = await compressImage(new File([imageBlob], 'presence.jpg', { type: 'image/jpeg' }));
    
    // Upload to Cloudinary
    const imageUrl = await uploadToCloudinary(compressedImage);
    
    // Save to Firestore
    await db.collection('presensi').add({
      uid: uid,
      jenis: jenis,
      status: sessionStatus.status,
      koordinat: new firebase.firestore.GeoPoint(latitude, longitude),
      selfie: imageUrl,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Create notification
    await db.collection('notifikasi').add({
      title: 'Presensi Berhasil',
      message: `Presensi ${jenis} Anda berhasil dicatat dengan status ${sessionStatus.status}`,
      targetUid: uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    
    showToast('Presensi berhasil dicatat', 'success');
    
    // Reset camera
    const video = document.getElementById('cameraVideo');
    video.style.display = 'block';
    canvas.style.display = 'none';
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    
    // Reload presence history
    loadPresenceHistory(uid);
  } catch (error) {
    console.error('Upload error:', error);
    showToast('Gagal mengupload presensi: ' + error.message, 'error');
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  }
};

// Initialize geolocation
const initGeolocation = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        document.getElementById('locText').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      },
      (error) => {
        console.error('Geolocation error:', error);
        document.getElementById('locText').textContent = 'Tidak dapat mengakses lokasi';
      }
    );
  } else {
    document.getElementById('locText').textContent = 'Geolocation tidak didukung';
  }
};

// Load user profile
const loadUserProfile = async (uid) => {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      
      // Update profile elements
      const profileImg = document.getElementById('pfp');
      const namaInput = document.getElementById('nama');
      const alamatInput = document.getElementById('alamat');
      
      if (profileImg) profileImg.src = userData.foto;
      if (namaInput) namaInput.value = userData.nama || '';
      if (alamatInput) alamatInput.value = userData.alamat || '';
      
      // Update status
      const sessionStatus = getSessionStatus();
      const statusText = document.getElementById('statusText');
      const statusChip = document.getElementById('statusChip');
      
      if (statusText && statusChip) {
        statusText.textContent = sessionStatus.message;
        
        // Update status chip class based on status
        statusChip.className = 'status ';
        if (sessionStatus.status === 'Tepat Waktu') {
          statusChip.classList.add('s-good');
        } else if (sessionStatus.status === 'Terlambat') {
          statusChip.classList.add('s-warn');
        } else {
          statusChip.classList.add('s-bad');
        }
      }
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
};

// Save profile
const saveProfile = async (uid) => {
  try {
    const nama = document.getElementById('nama').value;
    const alamat = document.getElementById('alamat').value;
    const fileInput = document.getElementById('pfpFile');
    
    let fotoUrl = document.getElementById('pfp').src;
    
    // Upload new profile picture if selected
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const compressedImage = await compressImage(file);
      fotoUrl = await uploadToCloudinary(compressedImage);
    }
    
    // Update user document
    await db.collection('users').doc(uid).update({
      nama: nama,
      alamat: alamat,
      foto: fotoUrl
    });
    
    showToast('Profil berhasil disimpan', 'success');
    document.getElementById('profileDlg').close();
  } catch (error) {
    console.error('Error saving profile:', error);
    showToast('Gagal menyimpan profil', 'error');
  }
};

// Load presence history
const loadPresenceHistory = async (uid) => {
  try {
    const filterValue = document.getElementById('historyFilter').value;
    let query = db.collection('presensi')
      .where('uid', '==', uid)
      .orderBy('timestamp', 'desc');
    
    if (filterValue !== 'all') {
      query = query.limit(parseInt(filterValue));
    }
    
    const snapshot = await query.get();
    const logList = document.getElementById('logList');
    
    if (!logList) return;
    
    logList.innerHTML = '';
    
    if (snapshot.empty) {
      logList.innerHTML = '<div class="riwayat-item">Belum ada riwayat presensi</div>';
      return;
    }
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = data.timestamp.toDate();
      
      const item = document.createElement('div');
      item.className = 'riwayat-item';
      
      const jenisIcon = data.jenis === 'berangkat' ? 'login' : 'logout';
      const statusClass = data.status === 'Tepat Waktu' ? 's-good' : 
                         data.status === 'Terlambat' ? 's-warn' : 's-bad';
      
      item.innerHTML = `
        <div class="riwayat-jenis">
          <span class="material-symbols-rounded">${jenisIcon}</span>
          ${data.jenis === 'berangkat' ? 'Berangkat' : 'Pulang'}
          <span class="status ${statusClass}" style="margin-left:auto;font-size:12px">
            ${data.status.toLowerCase()}
          </span>
        </div>
        <div class="riwayat-time">
          ${formatDate(timestamp)} - ${formatTime(timestamp)}
        </div>
      `;
      
      logList.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading presence history:', error);
  }
};

// Load all presence history (for admin)
const loadAllPresenceHistory = async () => {
  try {
    const filterValue = document.getElementById('fShow').value;
    const namaFilter = document.getElementById('fNama').value.toLowerCase();
    const periodeFilter = document.getElementById('fPeriode').value;
    
    let query = db.collection('presensi').orderBy('timestamp', 'desc');
    
    // Apply filters
    if (filterValue !== 'all') {
      query = query.limit(parseInt(filterValue));
    }
    
    // Date filter
    if (periodeFilter !== 'harian') {
      const now = new Date();
      let startDate = new Date();
      
      switch (periodeFilter) {
        case 'mingguan':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'bulanan':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'tahunan':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        case 'custom':
          const dari = new Date(document.getElementById('fDari').value);
          const sampai = new Date(document.getElementById('fSampai').value);
          startDate = dari;
          query = query.where('timestamp', '>=', dari)
                      .where('timestamp', '<=', sampai);
          break;
      }
      
      if (periodeFilter !== 'custom') {
        query = query.where('timestamp', '>=', startDate);
      }
    }
    
    const snapshot = await query.get();
    const tableBody = document.getElementById('tableBody');
    
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (snapshot.empty) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
      return;
    }
    
    // Get user data for all presences
    const userIds = [...new Set(snapshot.docs.map(doc => doc.data().uid))];
    const userPromises = userIds.map(uid => db.collection('users').doc(uid).get());
    const userSnapshots = await Promise.all(userPromises);
    
    const users = {};
    userSnapshots.forEach(snap => {
      if (snap.exists) {
        users[snap.id] = snap.data();
      }
    });
    
    // Filter by name if specified
    const filteredDocs = snapshot.docs.filter(doc => {
      const data = doc.data();
      const userData = users[data.uid];
      
      if (!userData) return false;
      if (namaFilter && !userData.nama.toLowerCase().includes(namaFilter)) return false;
      
      return true;
    });
    
    if (filteredDocs.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data yang sesuai filter</td></tr>';
      return;
    }
    
    // Display results
    filteredDocs.forEach((doc) => {
      const data = doc.data();
      const timestamp = data.timestamp.toDate();
      const userData = users[data.uid];
      
      if (!userData) return;
      
      const row = document.createElement('tr');
      
      const statusClass = data.status === 'Tepat Waktu' ? 's-good' : 
                         data.status === 'Terlambat' ? 's-warn' : 's-bad';
      
      row.innerHTML = `
        <td>${formatDate(timestamp)}<br>${formatTime(timestamp)}</td>
        <td>${userData.nama || 'Tidak diketahui'}</td>
        <td>${data.jenis === 'berangkat' ? 'Berangkat' : 'Pulang'}</td>
        <td><span class="status ${statusClass}">${data.status.toLowerCase()}</span></td>
        <td>${data.koordinat.latitude.toFixed(4)}, ${data.koordinat.longitude.toFixed(4)}</td>
        <td><a href="${data.selfie}" target="_blank">Lihat Foto</a></td>
      `;
      
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading all presence history:', error);
  }
};

// Load notifications
const loadNotifications = async (uid, role) => {
  try {
    let query = db.collection('notifikasi');
    
    if (role === 'karyawan') {
      query = query.where('targetUid', '==', uid);
    } else if (role === 'admin') {
      query = query.where('targetRole', '==', 'admin');
    }
    
    query = query.orderBy('timestamp', 'desc');
    
    const snapshot = await query.get();
    const notifList = document.getElementById('notifList');
    const notifBadge = document.getElementById('notifBadge');
    
    if (!notifList) return;
    
    notifList.innerHTML = '';
    
    if (snapshot.empty) {
      notifList.innerHTML = '<div class="notif-item">Tidak ada notifikasi</div>';
      if (notifBadge) notifBadge.style.display = 'none';
      return;
    }
    
    // Count unread notifications
    const unreadCount = snapshot.docs.filter(doc => !doc.data().read).length;
    
    if (notifBadge) {
      notifBadge.textContent = unreadCount;
      notifBadge.style.display = unreadCount > 0 ? 'grid' : 'none';
    }
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = data.timestamp.toDate();
      
      const item = document.createElement('div');
      item.className = 'notif-item';
      if (data.read) item.style.opacity = '0.7';
      
      item.innerHTML = `
        <div class="notif-content">
          <div style="font-weight:600">${data.title}</div>
          <div>${data.message}</div>
          <div style="font-size:12px;opacity:0.7">${formatDate(timestamp)} - ${formatTime(timestamp)}</div>
        </div>
        <div class="notif-actions">
          <button class="icon-btn mark-read" data-id="${doc.id}" title="Tandai sudah dibaca" style="font-size:16px">
            <span class="material-symbols-rounded">check_circle</span>
          </button>
        </div>
      `;
      
      notifList.appendChild(item);
    });
    
    // Add event listeners for mark as read buttons
    document.querySelectorAll('.mark-read').forEach(btn => {
      btn.addEventListener('click', async function() {
        const notifId = this.getAttribute('data-id');
        await db.collection('notifikasi').doc(notifId).update({ read: true });
        loadNotifications(uid, role);
      });
    });
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
};

// Apply filters (admin)
const applyFilters = () => {
  loadAllPresenceHistory();
  showToast('Filter diterapkan', 'success');
};

// Export to CSV
const exportToCSV = async () => {
  try {
    const exportBtn = document.getElementById('exportCsv');
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<span class="spinner"></span> Mengekspor...';
    
    // Get all data without limit
    const snapshot = await db.collection('presensi')
      .orderBy('timestamp', 'desc')
      .get();
    
    if (snapshot.empty) {
      showToast('Tidak ada data untuk diekspor', 'warning');
      exportBtn.disabled = false;
      exportBtn.innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
      return;
    }
    
    // Get user data for all presences
    const userIds = [...new Set(snapshot.docs.map(doc => doc.data().uid))];
    const userPromises = userIds.map(uid => db.collection('users').doc(uid).get());
    const userSnapshots = await Promise.all(userPromises);
    
    const users = {};
    userSnapshots.forEach(snap => {
      if (snap.exists) {
        users[snap.id] = snap.data();
      }
    });
    
    // Group by user and sort alphabetically
    const userPresences = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const userData = users[data.uid];
      
      if (!userData) return;
      
      const userName = userData.nama || 'Tidak diketahui';
      
      if (!userPresences[userName]) {
        userPresences[userName] = [];
      }
      
      userPresences[userName].push({
        ...data,
        id: doc.id,
        timestamp: data.timestamp.toDate()
      });
    });
    
    // Sort users alphabetically
    const sortedUserNames = Object.keys(userPresences).sort();
    
    // Create CSV content
    let csvContent = 'Nama,Tanggal,Jam,Jenis,Status,Latitude,Longitude\n';
    
    sortedUserNames.forEach(userName => {
      // Sort presences by date (oldest first)
      const presences = userPresences[userName].sort((a, b) => a.timestamp - b.timestamp);
      
      presences.forEach(presence => {
        const date = formatDate(presence.timestamp);
        const time = formatTime(presence.timestamp);
        const jenis = presence.jenis === 'berangkat' ? 'Berangkat' : 'Pulang';
        const status = presence.status;
        const lat = presence.koordinat.latitude;
        const lng = presence.koordinat.longitude;
        
        csvContent += `"${userName}","${date}","${time}","${jenis}","${status}","${lat}","${lng}"\n`;
      });
      
      // Add empty line between users
      csvContent += '\n';
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `presensi_${formatDate(new Date()).replace(/ /g, '_')}.csv`);
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV berhasil diekspor', 'success');
    exportBtn.disabled = false;
    exportBtn.innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
  } catch (error) {
    console.error('Error exporting CSV:', error);
    showToast('Gagal mengekspor CSV', 'error');
    
    const exportBtn = document.getElementById('exportCsv');
    exportBtn.disabled = false;
    exportBtn.innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
  }
};

// Ajukan cuti
const ajukanCuti = async (uid) => {
  try {
    const ajukanBtn = document.getElementById('ajukanCutiBtn');
    ajukanBtn.disabled = true;
    ajukanBtn.innerHTML = '<span class="spinner"></span> Mengajukan...';
    
    const jenis = document.getElementById('cutiJenis').value;
    const tanggal = document.getElementById('cutiTanggal').value;
    const catatan = document.getElementById('cutiCatatan').value;
    
    if (!tanggal) {
      showToast('Pilih tanggal cuti', 'error');
      ajukanBtn.disabled = false;
      ajukanBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Ajukan';
      return;
    }
    
    // Save cuti request
    await db.collection('cuti').add({
      uid: uid,
      jenis: jenis,
      tanggal: new Date(tanggal),
      catatan: catatan,
      status: 'pending',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Create notification for admin
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    
    await db.collection('notifikasi').add({
      title: 'Permintaan Cuti',
      message: `${userData.nama} mengajukan cuti ${jenis} untuk tanggal ${formatDate(new Date(tanggal))}`,
      targetRole: 'admin',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    
    showToast('Cuti berhasil diajukan', 'success');
    document.getElementById('cutiDlg').close();
    ajukanBtn.disabled = false;
    ajukanBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Ajukan';
  } catch (error) {
    console.error('Error submitting cuti:', error);
    showToast('Gagal mengajukan cuti', 'error');
    
    const ajukanBtn = document.getElementById('ajukanCutiBtn');
    ajukanBtn.disabled = false;
    ajukanBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Ajukan';
  }
};

// Send announcement
const sendAnnouncement = async () => {
  try {
    const sendBtn = document.getElementById('sendAnnounce');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner"></span> Mengirim...';
    
    const text = document.getElementById('announceText').value;
    const target = document.getElementById('announceTarget').value;
    
    if (!text) {
      showToast('Tulis pengumuman terlebih dahulu', 'error');
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Kirim';
      return;
    }
    
    if (target === 'all') {
      // Send to all karyawan
      await db.collection('notifikasi').add({
        title: 'Pengumuman',
        message: text,
        targetRole: 'karyawan',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
      });
    } else if (target === 'specific') {
      // Send to specific users
      const selectedUsers = document.querySelectorAll('#userList .user-item.selected');
      
      if (selectedUsers.length === 0) {
        showToast('Pilih karyawan terlebih dahulu', 'error');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Kirim';
        return;
      }
      
      for (const userElement of selectedUsers) {
        const uid = userElement.getAttribute('data-uid');
        
        await db.collection('notifikasi').add({
          title: 'Pengumuman',
          message: text,
          targetUid: uid,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          read: false
        });
      }
    }
    
    showToast('Pengumuman berhasil dikirim', 'success');
    document.getElementById('announceText').value = '';
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Kirim';
  } catch (error) {
    console.error('Error sending announcement:', error);
    showToast('Gagal mengirim pengumuman', 'error');
    
    const sendBtn = document.getElementById('sendAnnounce');
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<span class="material-symbols-rounded">send</span> Kirim';
  }
};

// Toggle user selection
const toggleUserSelection = () => {
  const target = document.getElementById('announceTarget').value;
  const userSelection = document.getElementById('userSelection');
  
  userSelection.style.display = target === 'specific' ? 'block' : 'none';
};

// Load karyawan list
const loadKaryawanList = async () => {
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'karyawan')
      .get();
    
    const userList = document.getElementById('userList');
    const rulesUserList = document.getElementById('rulesUserList');
    
    if (!userList && !rulesUserList) return;
    
    const listHTML = snapshot.docs.map(doc => {
      const data = doc.data();
      return `
        <div class="user-item" data-uid="${doc.id}">
          ${data.nama || data.email}
        </div>
      `;
    }).join('');
    
    if (userList) userList.innerHTML = listHTML;
    if (rulesUserList) rulesUserList.innerHTML = listHTML;
    
    // Add click event to user items
    document.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', function() {
        this.classList.toggle('selected');
      });
    });
  } catch (error) {
    console.error('Error loading karyawan list:', error);
  }
};

// Create user (admin)
const createUser = async () => {
  try {
    const createBtn = document.getElementById('createUserBtn');
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner"></span> Membuat...';
    
    const email = document.getElementById('newEmail').value;
    const password = document.getElementById('newPass').value;
    
    if (!email || !password) {
      showToast('Email dan password harus diisi', 'error');
      createBtn.disabled = false;
      createBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Buat';
      return;
    }
    
    // Create user with Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Add user data to Firestore
    await db.collection('users').doc(user.uid).set({
      email: email,
      nama: '',
      alamat: '',
      role: 'karyawan',
      foto: `https://api.dicebear.com/7.x/initials/svg?seed=${email}&backgroundColor=ffb300,ffd54f&radius=20`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Akun berhasil dibuat', 'success');
    document.getElementById('newEmail').value = '';
    document.getElementById('newPass').value = 'fupa123';
    createBtn.disabled = false;
    createBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Buat';
  } catch (error) {
    console.error('Error creating user:', error);
    showToast('Gagal membuat akun: ' + error.message, 'error');
    
    const createBtn = document.getElementById('createUserBtn');
    createBtn.disabled = false;
    createBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Buat';
  }
};

// Update server time
const updateServerTime = () => {
  const serverTimeElement = document.getElementById('serverTime');
  if (!serverTimeElement) return;
  
  const updateTime = () => {
    const now = new Date();
    serverTimeElement.textContent = `${formatDate(now)}, ${formatTime(now)}`;
  };
  
  updateTime();
  setInterval(updateTime, 1000);
};

// Show profile popup
const showProfilePopup = () => {
  const profileDlg = document.getElementById('profileDlg');
  if (profileDlg) profileDlg.showModal();
};

// Logout
const logout = () => {
  auth.signOut()
    .then(() => {
      showToast('Berhasil keluar', 'success');
      window.location.href = 'index.html';
    })
    .catch((error) => {
      console.error('Logout error:', error);
      showToast('Gagal keluar', 'error');
    });
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);