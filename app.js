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
const storage = firebase.storage();

// Variabel global
let currentUser = null;
let userProfile = null;
let presenceStatus = null;
let cameraStream = null;
let capturedPhoto = null;
let deferredPrompt = null;

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
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
};

// Format tanggal Indonesia
const formatDate = (timestamp, withTime = true) => {
  if (!timestamp) return '-';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  
  let formatted = date.toLocaleDateString('id-ID', options);
  
  if (withTime) {
    const time = date.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    formatted += ` - ${time}`;
  }
  
  return formatted;
};

// Kompres gambar sebelum upload ke Cloudinary
const compressImage = (file, maxSizeKB = 10) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Hitung ukuran baru dengan menjaga aspect ratio
        let width = img.width;
        let height = img.height;
        const maxDimension = 800;
        
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
        
        // Gambar ulang dengan kualitas lebih rendah
        ctx.drawImage(img, 0, 0, width, height);
        
        // Konversi ke blob dengan kualitas yang disesuaikan
        canvas.toBlob((blob) => {
          if (blob.size > maxSizeKB * 1024) {
            // Jika masih terlalu besar, coba lagi dengan kualitas lebih rendah
            canvas.toBlob(
              (newBlob) => resolve(newBlob),
              'image/jpeg',
              0.5
            );
          } else {
            resolve(blob);
          }
        }, 'image/jpeg', 0.7);
      };
      
      img.onerror = (error) => {
        reject(error);
      };
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
  });
};

// Upload gambar ke Cloudinary
const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
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
        reject(new Error('Upload gagal'));
      }
    })
    .catch(error => {
      reject(error);
    });
  });
};

// Deteksi status presensi berdasarkan waktu
const getPresenceStatus = () => {
  const now = new Date();
  const day = now.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Hari Minggu adalah libur
  if (day === 0) {
    return { status: 'Libur', session: null };
  }
  
  // Shift pagi: berangkat 05:30-06:00, pulang 10:00-11:00
  // Shift sore: berangkat 14:00-14:30, pulang 17:30-18:00
  
  const currentTime = hour * 60 + minute;
  
  // Cek sesi berangkat pagi
  if (currentTime >= 330 && currentTime <= 360) { // 05:30-06:00
    return { status: 'Tepat Waktu', session: 'berangkat', shift: 'pagi' };
  }
  if (currentTime > 360 && currentTime <= 380) { // 06:01-06:20 (toleransi 20 menit)
    return { status: 'Terlambat', session: 'berangkat', shift: 'pagi' };
  }
  
  // Cek sesi pulang pagi
  if (currentTime >= 600 && currentTime <= 660) { // 10:00-11:00
    return { status: 'Tepat Waktu', session: 'pulang', shift: 'pagi' };
  }
  if (currentTime > 660 && currentTime <= 680) { // 11:01-11:20 (toleransi 20 menit)
    return { status: 'Terlambat', session: 'pulang', shift: 'pagi' };
  }
  
  // Cek sesi berangkat sore
  if (currentTime >= 840 && currentTime <= 870) { // 14:00-14:30
    return { status: 'Tepat Waktu', session: 'berangkat', shift: 'sore' };
  }
  if (currentTime > 870 && currentTime <= 890) { // 14:31-14:50 (toleransi 20 menit)
    return { status: 'Terlambat', session: 'berangkat', shift: 'sore' };
  }
  
  // Cek sesi pulang sore
  if (currentTime >= 1050 && currentTime <= 1080) { // 17:30-18:00
    return { status: 'Tepat Waktu', session: 'pulang', shift: 'sore' };
  }
  if (currentTime > 1080 && currentTime <= 1100) { // 18:01-18:20 (toleransi 20 menit)
    return { status: 'Terlambat', session: 'pulang', shift: 'sore' };
  }
  
  // Di luar sesi presensi
  return { status: 'Di luar sesi presensi', session: null };
};

// Cek apakah sudah melakukan presensi hari ini
const checkTodayPresence = async (session) => {
  if (!currentUser) return false;
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const presenceRef = db.collection('presensi');
    const query = presenceRef
      .where('uid', '==', currentUser.uid)
      .where('waktu', '>=', today)
      .where('waktu', '<', tomorrow)
      .where('jenis', '==', session);
    
    const snapshot = await query.get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking today presence:', error);
    return false;
  }
};

// Muat data profil pengguna
const loadUserProfile = async () => {
  if (!currentUser) return;
  
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    
    if (doc.exists) {
      userProfile = doc.data();
      
      // Update UI dengan data profil
      if ($('#nama')) $('#nama').value = userProfile.nama || '';
      if ($('#alamat')) $('#alamat').value = userProfile.alamat || '';
      if ($('#pfp')) {
        $('#pfp').src = userProfile.fotoProfil || 
          `https://api.dicebear.com/7.x/initials/svg?seed=${userProfile.nama || 'User'}&backgroundColor=ffb300,ffd54f&radius=20`;
      }
      
      // Jika data profil kosong, tampilkan popup
      if ((!userProfile.nama || !userProfile.alamat) && $('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    } else {
      // Buat profil default jika belum ada
      const emailPrefix = currentUser.email.split('@')[0];
      const defaultProfile = {
        uid: currentUser.uid,
        nama: emailPrefix,
        alamat: 'Fupa',
        email: currentUser.email,
        role: currentUser.uid === 'O1SJ7hYop3UJjDcsA3JqT29aapI3' || 
              currentUser.uid === 'uB2XsyM6fXUj493cRlHCqpe2fxH3' ? 'admin' : 'karyawan',
        fotoProfil: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('users').doc(currentUser.uid).set(defaultProfile);
      userProfile = defaultProfile;
      
      // Tampilkan popup untuk melengkapi data
      if ($('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
    showToast('Gagal memuat profil', 'error');
  }
};

// Muat riwayat presensi
const loadPresenceHistory = async (limit = 20) => {
  if (!currentUser) return;
  
  try {
    let query = db.collection('presensi')
      .orderBy('waktu', 'desc');
    
    // Jika user adalah karyawan, filter hanya presensinya sendiri
    if (userProfile.role === 'karyawan') {
      query = query.where('uid', '==', currentUser.uid);
    }
    
    // Terapkan limit jika bukan 'all'
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }
    
    const snapshot = await query.get();
    const historyList = $('#logList') || $('#tableBody');
    
    if (!historyList) return;
    
    // Kosongkan daftar
    historyList.innerHTML = '';
    
    if (snapshot.empty) {
      historyList.innerHTML = '<div style="padding: 20px; text-align: center; opacity: 0.7;">Tidak ada riwayat presensi</div>';
      return;
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      
      if (userProfile.role === 'karyawan') {
        item.className = 'riwayat-item';
        item.innerHTML = `
          <div class="riwayat-jenis">
            <span class="material-symbols-rounded">${data.jenis === 'berangkat' ? 'login' : 'logout'}</span>
            ${data.jenis === 'berangkat' ? 'Berangkat' : 'Pulang'}
            <span class="status ${data.status === 'Tepat Waktu' ? 's-good' : data.status === 'Terlambat' ? 's-warn' : 's-bad'}" style="margin-left:auto;font-size:12px">
              ${data.status.toLowerCase()}
            </span>
          </div>
          <div class="riwayat-time">
            ${formatDate(data.waktu)}
          </div>
        `;
      } else {
        // Tampilan untuk admin (dalam tabel)
        item.className = 'presence-row';
        item.innerHTML = `
          <tr>
            <td>${formatDate(data.waktu, false)}<br>${data.waktu.toDate().toLocaleTimeString('id-ID')}</td>
            <td>${data.nama}</td>
            <td>${data.jenis === 'berangkat' ? 'Berangkat' : 'Pulang'}</td>
            <td><span class="status ${data.status === 'Tepat Waktu' ? 's-good' : data.status === 'Terlambat' ? 's-warn' : 's-bad'}">${data.status.toLowerCase()}</span></td>
            <td>${data.koordinat || '-'}</td>
            <td>${data.foto ? `<a href="${data.foto}" target="_blank">Lihat Foto</a>` : '-'}</td>
          </tr>
        `;
      }
      
      historyList.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading presence history:', error);
    showToast('Gagal memuat riwayat presensi', 'error');
  }
};

// Muat notifikasi
const loadNotifications = async () => {
  if (!currentUser) return;
  
  try {
    let query;
    
    if (userProfile.role === 'admin') {
      // Admin melihat semua notifikasi cuti
      query = db.collection('notifikasi')
        .where('tipe', '==', 'cuti')
        .orderBy('waktu', 'desc');
    } else {
      // Karyawan melihat notifikasi untuk dirinya
      query = db.collection('notifikasi')
        .where('targetUID', '==', currentUser.uid)
        .orderBy('waktu', 'desc');
    }
    
    const snapshot = await query.get();
    const notifList = $('#notifList') || $('#cutiList');
    
    if (!notifList) return;
    
    // Kosongkan daftar
    notifList.innerHTML = '';
    
    if (snapshot.empty) {
      notifList.innerHTML = '<div style="padding: 20px; text-align: center; opacity: 0.7;">Tidak ada notifikasi</div>';
      
      // Update badge notifikasi
      if ($('#notifBadge')) {
        $('#notifBadge').style.display = 'none';
      }
      
      return;
    }
    
    // Update badge notifikasi
    if ($('#notifBadge')) {
      $('#notifBadge').textContent = snapshot.size;
      $('#notifBadge').style.display = snapshot.size > 0 ? 'grid' : 'none';
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      
      if (userProfile.role === 'admin') {
        // Tampilan notifikasi untuk admin (permintaan cuti)
        item.className = 'cuti-item';
        item.innerHTML = `
          <div><strong>${data.nama}</strong> mengajukan cuti <strong>${data.jenis}</strong></div>
          <div>Tanggal: ${formatDate(data.tanggal, false)}</div>
          <div>Keterangan: ${data.keterangan || '-'}</div>
          <div style="font-size:12px;opacity:0.7">Diajukan pada: ${formatDate(data.waktu)}</div>
          <div class="cuti-actions">
            <button class="btn approve-btn" data-id="${doc.id}" data-uid="${data.uid}" data-nama="${data.nama}" data-jenis="${data.jenis}" data-tanggal="${data.tangcal}" data-keterangan="${data.keterangan || ''}" style="background:var(--good)">
              <span class="material-symbols-rounded">check</span> Setujui
            </button>
            <button class="btn reject-btn" data-id="${doc.id}" data-uid="${data.uid}" style="background:var(--bad)">
              <span class="material-symbols-rounded">close</span> Tolak
            </button>
          </div>
        `;
      } else {
        // Tampilan notifikasi untuk karyawan
        item.className = 'notif-item';
        
        let actionButton = '';
        if (data.tipe === 'cuti' && data.status === 'disetujui') {
          actionButton = `
            <button class="btn create-entry-btn" data-tanggal="${data.tanggal}" data-jenis="${data.jenis}" style="background:var(--good); margin-left: 8px;">
              <span class="material-symbols-rounded">add</span> Buat Entri
            </button>
          `;
        }
        
        item.innerHTML = `
          <div class="notif-content">
            <div style="font-weight:600">${data.pesan}</div>
            <div style="font-size:12px;opacity:0.7">${formatDate(data.waktu)}</div>
          </div>
          <div class="notif-actions">
            ${actionButton}
            <button class="icon-btn mark-read" data-id="${doc.id}" title="Tandai sudah dibaca" style="font-size:16px">
              <span class="material-symbols-rounded">check_circle</span>
            </button>
          </div>
        `;
      }
      
      notifList.appendChild(item);
    });
    
    // Tambahkan event listener untuk button notifikasi
    setTimeout(() => {
      // Untuk admin: approve/reject cuti
      document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', handleApproveCuti);
      });
      
      document.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', handleRejectCuti);
      });
      
      // Untuk karyawan: buat entri dan tandai sudah dibaca
      document.querySelectorAll('.create-entry-btn').forEach(btn => {
        btn.addEventListener('click', handleCreateEntry);
      });
      
      document.querySelectorAll('.mark-read').forEach(btn => {
        btn.addEventListener('click', handleMarkAsRead);
      });
    }, 100);
  } catch (error) {
    console.error('Error loading notifications:', error);
    showToast('Gagal memuat notifikasi', 'error');
  }
};

// Handle approve cuti
const handleApproveCuti = async (e) => {
  const id = e.target.closest('.approve-btn').dataset.id;
  const uid = e.target.closest('.approve-btn').dataset.uid;
  const nama = e.target.closest('.approve-btn').dataset.nama;
  const jenis = e.target.closest('.approve-btn').dataset.jenis;
  const tanggal = e.target.closest('.approve-btn').dataset.tanggal;
  const keterangan = e.target.closest('.approve-btn').dataset.keterangan;
  
  try {
    // Update status cuti
    await db.collection('cuti').doc(id).update({
      status: 'disetujui',
      diprosesPada: firebase.firestore.FieldValue.serverTimestamp(),
      diprosesOleh: currentUser.uid
    });
    
    // Buat notifikasi untuk karyawan
    await db.collection('notifikasi').add({
      tipe: 'cuti',
      targetUID: uid,
      pesan: `Cuti ${jenis} Anda pada ${formatDate(new Date(tanggal), false)} telah disetujui`,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'disetujui',
      tanggal: new Date(tanggal),
      jenis: jenis,
      keterangan: keterangan
    });
    
    // Hapus notifikasi permintaan cuti
    await db.collection('notifikasi').doc(id).delete();
    
    showToast('Cuti disetujui', 'success');
    loadNotifications();
  } catch (error) {
    console.error('Error approving cuti:', error);
    showToast('Gagal menyetujui cuti', 'error');
  }
};

// Handle reject cuti
const handleRejectCuti = async (e) => {
  const id = e.target.closest('.reject-btn').dataset.id;
  const uid = e.target.closest('.reject-btn').dataset.uid;
  
  try {
    // Update status cuti
    await db.collection('cuti').doc(id).update({
      status: 'ditolak',
      diprosesPada: firebase.firestore.FieldValue.serverTimestamp(),
      diprosesOleh: currentUser.uid
    });
    
    // Buat notifikasi untuk karyawan
    await db.collection('notifikasi').add({
      tipe: 'cuti',
      targetUID: uid,
      pesan: 'Cuti Anda ditolak',
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'ditolak'
    });
    
    // Hapus notifikasi permintaan cuti
    await db.collection('notifikasi').doc(id).delete();
    
    showToast('Cuti ditolak', 'success');
    loadNotifications();
  } catch (error) {
    console.error('Error rejecting cuti:', error);
    showToast('Gagal menolak cuti', 'error');
  }
};

// Handle create entry dari notifikasi cuti yang disetujui
const handleCreateEntry = async (e) => {
  const tanggal = e.target.closest('.create-entry-btn').dataset.tanggal;
  const jenisCuti = e.target.closest('.create-entry-btn').dataset.jenis;
  
  try {
    // Buat entri presensi untuk cuti
    await db.collection('presensi').add({
      uid: currentUser.uid,
      nama: userProfile.nama,
      waktu: new Date(tanggal),
      jenis: 'cuti',
      status: jenisCuti === 'sakit' ? 'Sakit' : 'Izin',
      koordinat: '-',
      foto: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Entri presensi cuti berhasil dibuat', 'success');
    
    // Muat ulang riwayat presensi
    loadPresenceHistory($('#historyFilter') ? $('#historyFilter').value : 20);
  } catch (error) {
    console.error('Error creating presence entry:', error);
    showToast('Gagal membuat entri presensi', 'error');
  }
};

// Handle mark as read
const handleMarkAsRead = async (e) => {
  const id = e.target.closest('.mark-read').dataset.id;
  
  try {
    // Hapus notifikasi
    await db.collection('notifikasi').doc(id).delete();
    
    showToast('Notifikasi ditandai sudah dibaca', 'success');
    loadNotifications();
  } catch (error) {
    console.error('Error marking notification as read:', error);
    showToast('Gagal menandai notifikasi', 'error');
  }
};

// Inisialisasi kamera
const initCamera = async () => {
  if (!($('#cameraPreview') || $('#cameraPlaceholder'))) return;
  
  try {
    // Hentikan stream kamera jika sudah ada
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    
    // Dapatkan akses ke kamera
    cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    
    // Tampilkan preview kamera
    if ($('#cameraPreview')) {
      $('#cameraPreview').srcObject = cameraStream;
      $('#cameraPreview').style.display = 'block';
      $('#cameraPlaceholder').style.display = 'none';
    }
  } catch (error) {
    console.error('Error accessing camera:', error);
    showToast('Tidak dapat mengakses kamera', 'error');
    
    if ($('#cameraPlaceholder')) {
      $('#cameraPlaceholder').innerHTML = `
        <span class="material-symbols-rounded" style="font-size:48px">no_photography</span>
        <div style="margin-top: 10px;">Kamera tidak dapat diakses</div>
      `;
    }
  }
};

// Ambil foto dari kamera
const capturePhoto = () => {
  if (!cameraStream || !($('#cameraPreview') && $('#photoPreview'))) return;
  
  try {
    const video = $('#cameraPreview');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set ukuran canvas sesuai video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Gambar frame video ke canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Konversi canvas ke data URL
    capturedPhoto = canvas.toDataURL('image/jpeg');
    
    // Tampilkan preview foto
    $('#photoPreview').src = capturedPhoto;
    $('#photoPreview').style.display = 'block';
    $('#cameraPreview').style.display = 'none';
    
    showToast('Foto berhasil diambil', 'success');
  } catch (error) {
    console.error('Error capturing photo:', error);
    showToast('Gagal mengambil foto', 'error');
  }
};

// Upload presensi
const uploadPresence = async () => {
  if (!currentUser || !capturedPhoto || !($('#jenis'))) return;
  
  const jenis = $('#jenis').value;
  const statusInfo = getPresenceStatus();
  
  // Validasi sesi presensi
  if (statusInfo.status === 'Libur') {
    showToast('Hari ini libur, tidak dapat melakukan presensi', 'error');
    return;
  }
  
  if (statusInfo.status === 'Di luar sesi presensi') {
    showToast('Di luar sesi presensi', 'error');
    return;
  }
  
  if (statusInfo.session !== jenis) {
    showToast(`Saat ini bukan sesi presensi ${jenis}`, 'error');
    return;
  }
  
  // Cek apakah sudah melakukan presensi untuk sesi ini hari ini
  const alreadyPresence = await checkTodayPresence(jenis);
  if (alreadyPresence) {
    showToast(`Anda sudah melakukan presensi ${jenis} hari ini`, 'error');
    return;
  }
  
  try {
    // Tampilkan loading
    $('#uploadBtn').disabled = true;
    $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
    
    // Dapatkan koordinat
    let coordinates = '-';
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });
      
      coordinates = `${position.coords.latitude}, ${position.coords.longitude}`;
      if ($('#locText')) {
        $('#locText').textContent = coordinates;
      }
    } catch (error) {
      console.error('Error getting location:', error);
      showToast('Tidak dapat mendapatkan lokasi', 'warning');
    }
    
    // Konversi data URL ke blob
    const response = await fetch(capturedPhoto);
    const blob = await response.blob();
    
    // Kompres gambar
    const compressedBlob = await compressImage(blob, 10);
    
    // Upload ke Cloudinary
    const fotoUrl = await uploadToCloudinary(compressedBlob);
    
    // Simpan data presensi ke Firestore
    await db.collection('presensi').add({
      uid: currentUser.uid,
      nama: userProfile.nama,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      jenis: jenis,
      status: statusInfo.status,
      koordinat: coordinates,
      foto: fotoUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Buat notifikasi untuk admin (jika karyawan)
    if (userProfile.role === 'karyawan') {
      await db.collection('notifikasi').add({
        tipe: 'presensi',
        targetRole: 'admin',
        pesan: `${userProfile.nama} telah melakukan presensi ${jenis}`,
        waktu: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    showToast('Presensi berhasil dicatat', 'success');
    
    // Reset UI
    $('#uploadBtn').disabled = false;
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
    $('#photoPreview').style.display = 'none';
    
    // Muat ulang kamera
    initCamera();
    
    // Muat ulang riwayat presensi
    loadPresenceHistory($('#historyFilter') ? $('#historyFilter').value : 20);
  } catch (error) {
    console.error('Error uploading presence:', error);
    showToast('Gagal mengupload presensi', 'error');
    
    $('#uploadBtn').disabled = false;
    $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  }
};

// Ajukan cuti
const submitCuti = async () => {
  if (!currentUser || !($('#cutiJenis') && $('#cutiTanggal'))) return;
  
  const jenis = $('#cutiJenis').value;
  const tanggal = $('#cutiTanggal').value;
  const keterangan = $('#cutiCatatan').value || '';
  
  if (!tanggal) {
    showToast('Pilih tanggal cuti', 'error');
    return;
  }
  
  try {
    // Tampilkan loading
    $('#ajukanCutiBtn').disabled = true;
    $('#ajukanCutiBtn').innerHTML = '<span class="spinner"></span> Mengajukan...';
    
    // Simpan data cuti
    const cutiRef = await db.collection('cuti').add({
      uid: currentUser.uid,
      nama: userProfile.nama,
      jenis: jenis,
      tanggal: new Date(tanggal),
      keterangan: keterangan,
      status: 'pending',
      diajukanPada: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Buat notifikasi untuk admin
    await db.collection('notifikasi').add({
      tipe: 'cuti',
      targetRole: 'admin',
      pesan: `${userProfile.nama} mengajukan cuti ${jenis}`,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      cutiId: cutiRef.id,
      uid: currentUser.uid,
      nama: userProfile.nama,
      jenis: jenis,
      tanggal: new Date(tanggal),
      keterangan: keterangan
    });
    
    showToast('Cuti berhasil diajukan', 'success');
    $('#cutiDlg').close();
    
    // Reset form
    $('#cutiTanggal').value = '';
    $('#cutiCatatan').value = '';
    
    $('#ajukanCutiBtn').disabled = false;
    $('#ajukanCutiBtn').innerHTML = '<span class="material-symbols-rounded">send</span> Ajukan';
  } catch (error) {
    console.error('Error submitting cuti:', error);
    showToast('Gagal mengajukan cuti', 'error');
    
    $('#ajukanCutiBtn').disabled = false;
    $('#ajukanCutiBtn').innerHTML = '<span class="material-symbols-rounded">send</span> Ajukan';
  }
};

// Kirim pengumuman
const sendAnnouncement = async () => {
  if (!currentUser || !($('#announceText') && $('#announceTarget'))) return;
  
  const text = $('#announceText').value;
  const target = $('#announceTarget').value;
  
  if (!text) {
    showToast('Tulis pengumuman terlebih dahulu', 'error');
    return;
  }
  
  try {
    // Tampilkan loading
    $('#sendAnnounce').disabled = true;
    $('#sendAnnounce').innerHTML = '<span class="spinner"></span> Mengirim...';
    
    let targetUIDs = [];
    
    if (target === 'all') {
      // Dapatkan semua UID karyawan
      const snapshot = await db.collection('users')
        .where('role', '==', 'karyawan')
        .get();
      
      snapshot.forEach(doc => {
        targetUIDs.push(doc.id);
      });
    } else {
      // Dapatkan UID yang dipilih
      const selectedUsers = document.querySelectorAll('.user-item.selected');
      selectedUsers.forEach(user => {
        targetUIDs.push(user.dataset.uid);
      });
    }
    
    // Kirim notifikasi ke setiap target
    for (const uid of targetUIDs) {
      await db.collection('notifikasi').add({
        tipe: 'pengumuman',
        targetUID: uid,
        pesan: text,
        waktu: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    showToast('Pengumuman berhasil dikirim', 'success');
    $('#announceText').value = '';
    
    $('#sendAnnounce').disabled = false;
    $('#sendAnnounce').innerHTML = '<span class="material-symbols-rounded">send</span> Kirim';
  } catch (error) {
    console.error('Error sending announcement:', error);
    showToast('Gagal mengirim pengumuman', 'error');
    
    $('#sendAnnounce').disabled = false;
    $('#sendAnnounce').innerHTML = '<span class="material-symbols-rounded">send</span> Kirim';
  }
};

// Ekspor data ke CSV
const exportToCSV = async () => {
  if (!currentUser) return;
  
  try {
    // Tampilkan loading
    $('#exportCsv').disabled = true;
    $('#exportCsv').innerHTML = '<span class="spinner"></span> Mengekspor...';
    
    // Dapatkan filter
    const namaFilter = $('#fNama') ? $('#fNama').value : '';
    const periode = $('#fPeriode') ? $('#fPeriode').value : 'harian';
    const dari = $('#fDari') ? $('#fDari').value : '';
    const sampai = $('#fSampai') ? $('#fSampai').value : '';
    
    // Buat query berdasarkan filter
    let query = db.collection('presensi').orderBy('waktu', 'desc');
    
    // Filter nama
    if (namaFilter) {
      // Untuk filter nama, kita perlu mendapatkan semua data dulu lalu filter di client
      // karena Firestore tidak mendukung pencarian substring yang efisien
    }
    
    // Filter periode
    if (periode !== 'all' && (dari || sampai)) {
      let startDate, endDate;
      
      if (periode === 'custom' && dari && sampai) {
        startDate = new Date(dari);
        endDate = new Date(sampai);
        endDate.setDate(endDate.getDate() + 1); // Sampai akhir hari
      } else {
        const now = new Date();
        
        switch (periode) {
          case 'harian':
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now);
            endDate.setDate(endDate.getDate() + 1);
            break;
          case 'mingguan':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - startDate.getDay()); // Mulai minggu (Minggu)
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 7);
            break;
          case 'bulanan':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
          case 'tahunan':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear() + 1, 0, 1);
            break;
        }
      }
      
      query = query.where('waktu', '>=', startDate).where('waktu', '<', endDate);
    }
    
    // Dapatkan semua data presensi
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      showToast('Tidak ada data untuk diekspor', 'warning');
      $('#exportCsv').disabled = false;
      $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
      return;
    }
    
    // Format data untuk CSV
    let csvData = [];
    const dataByUser = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Filter nama di client side jika diperlukan
      if (namaFilter && !data.nama.toLowerCase().includes(namaFilter.toLowerCase())) {
        return;
      }
      
      if (!dataByUser[data.uid]) {
        dataByUser[data.uid] = {
          nama: data.nama,
          presensi: []
        };
      }
      
      dataByUser[data.uid].presensi.push({
        waktu: data.waktu.toDate(),
        jenis: data.jenis,
        status: data.status,
        koordinat: data.koordinat
      });
    });
    
    // Urutkan berdasarkan nama (A-Z)
    const sortedUsers = Object.values(dataByUser).sort((a, b) => 
      a.nama.localeCompare(b.nama)
    );
    
    // Buat header CSV
    csvData.push(['Nama', 'Tanggal', 'Jam', 'Jenis', 'Status', 'Koordinat']);
    
    // Tambahkan data untuk setiap user
    sortedUsers.forEach(user => {
      // Urutkan presensi oleh tanggal (lama ke baru)
      user.presensi.sort((a, b) => a.waktu - b.waktu);
      
      // Tambahkan data presensi
      user.presensi.forEach(presensi => {
        const date = presensi.waktu.toLocaleDateString('id-ID');
        const time = presensi.waktu.toLocaleTimeString('id-ID');
        
        csvData.push([
          user.nama,
          date,
          time,
          presensi.jenis,
          presensi.status,
          presensi.koordinat
        ]);
      });
      
      // Tambahkan baris kosong antar user (konsistensi visual)
      csvData.push([]);
    });
    
    // Konversi ke string CSV
    const csvString = csvData.map(row => 
      row.map(field => `"${field}"`).join(',')
    ).join('\n');
    
    // Buat blob dan download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `presensi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV berhasil diekspor', 'success');
    $('#exportCsv').disabled = false;
    $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
  } catch (error) {
    console.error('Error exporting CSV:', error);
    showToast('Gagal mengekspor CSV', 'error');
    
    $('#exportCsv').disabled = false;
    $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
  }
};

// Update waktu server secara real-time
const updateServerTime = () => {
  const now = new Date();
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  
  if ($('#serverTime')) {
    $('#serverTime').textContent = now.toLocaleDateString('id-ID', options);
  }
};

// Update status presensi secara real-time
const updatePresenceStatus = () => {
  const statusInfo = getPresenceStatus();
  presenceStatus = statusInfo;
  
  if ($('#statusText') && $('#statusChip')) {
    $('#statusText').textContent = statusInfo.status;
    
    // Update class status chip
    $('#statusChip').className = 'status ';
    if (statusInfo.status === 'Tepat Waktu') {
      $('#statusChip').classList.add('s-good');
    } else if (statusInfo.status === 'Terlambat') {
      $('#statusChip').classList.add('s-warn');
    } else if (statusInfo.status === 'Libur') {
      $('#statusChip').classList.add('s-bad');
    } else {
      $('#statusChip').classList.add('s-bad');
    }
  }
};

// Inisialisasi PWA
const initPWA = () => {
  // Event listener untuk beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if ($('#installBtn')) {
      $('#installBtn').style.display = 'block';
    }
  });
  
  // Event listener untuk install button
  if ($('#installBtn')) {
    $('#installBtn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        showToast('Aplikasi berhasil diinstall', 'success');
      }
      
      // We've used the prompt, and can't use it again, throw it away
      deferredPrompt = null;
      
      // Hide the install button
      if ($('#installBtn')) {
        $('#installBtn').style.display = 'none';
      }
    });
  }
};

// Inisialisasi aplikasi
const initApp = () => {
  // Update waktu server setiap detik
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Update status presensi setiap menit
  updatePresenceStatus();
  setInterval(updatePresenceStatus, 60000);
  
  // Inisialisasi PWA
  initPWA();
  
  // Pantau perubahan autentikasi
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      await loadUserProfile();
      
      // Muat data berdasarkan role
      if (userProfile) {
        await loadPresenceHistory($('#historyFilter') ? $('#historyFilter').value : 20);
        await loadNotifications();
        
        // Inisialisasi kamera untuk karyawan
        if (userProfile.role === 'karyawan') {
          await initCamera();
        }
      }
    } else {
      // Redirect ke halaman login jika belum login
      if (!window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
    }
  });
  
  // Event listener untuk UI elements
  if ($('#snapBtn')) {
    $('#snapBtn').addEventListener('click', capturePhoto);
  }
  
  if ($('#uploadBtn')) {
    $('#uploadBtn').addEventListener('click', uploadPresence);
  }
  
  if ($('#saveProfileBtn')) {
    $('#saveProfileBtn').addEventListener('click', async () => {
      try {
        await db.collection('users').doc(currentUser.uid).update({
          nama: $('#nama').value,
          alamat: $('#alamat').value,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('Profil berhasil disimpan', 'success');
        $('#profileDlg').close();
        
        // Muat ulang profil
        await loadUserProfile();
      } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Gagal menyimpan profil', 'error');
      }
    });
  }
  
  if ($('#logoutBtn')) {
    $('#logoutBtn').addEventListener('click', () => {
      auth.signOut().then(() => {
        showToast('Berhasil keluar', 'success');
        window.location.href = 'index.html';
      }).catch((error) => {
        console.error('Error signing out:', error);
        showToast('Gagal keluar', 'error');
      });
    });
  }
  
  if ($('#ajukanCutiBtn')) {
    $('#ajukanCutiBtn').addEventListener('click', submitCuti);
  }
  
  if ($('#sendAnnounce')) {
    $('#sendAnnounce').addEventListener('click', sendAnnouncement);
  }
  
  if ($('#exportCsv')) {
    $('#exportCsv').addEventListener('click', exportToCSV);
  }
  
  if ($('#historyFilter')) {
    $('#historyFilter').addEventListener('change', (e) => {
      loadPresenceHistory(e.target.value);
    });
  }
  
  if ($('#fPeriode')) {
    $('#fPeriode').addEventListener('change', (e) => {
      if ($('#customDateRange')) {
        $('#customDateRange').style.display = e.target.value === 'custom' ? 'flex' : 'none';
      }
    });
  }
  
  if ($('#applyFilter')) {
    $('#applyFilter').addEventListener('click', () => {
      loadPresenceHistory($('#fShow') ? $('#fShow').value : 20);
    });
  }
  
  if ($('#announceTarget')) {
    $('#announceTarget').addEventListener('change', (e) => {
      if ($('#userSelection')) {
        $('#userSelection').style.display = e.target.value === 'specific' ? 'block' : 'none';
        
        // Muat daftar user jika diperlukan
        if (e.target.value === 'specific') {
          loadUserList();
        }
      }
    });
  }
  
  // Event listener untuk dialog
  if ($('#profileBtn')) {
    $('#profileBtn').addEventListener('click', () => {
      $('#profileDlg').showModal();
    });
  }
  
  if ($('#notifBtn')) {
    $('#notifBtn').addEventListener('click', () => {
      $('#notifDlg').showModal();
    });
  }
  
  if ($('#cutiFab')) {
    $('#cutiFab').addEventListener('click', () => {
      // Set default date to today
      if ($('#cutiTanggal')) {
        $('#cutiTanggal').valueAsDate = new Date();
      }
      $('#cutiDlg').showModal();
    });
  }
  
  if ($('#timeRulesFab')) {
    $('#timeRulesFab').addEventListener('click', () => {
      $('#timeRulesDlg').showModal();
    });
  }
};

// Muat daftar user untuk admin
const loadUserList = async () => {
  if (!currentUser || userProfile.role !== 'admin') return;
  
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'karyawan')
      .get();
    
    const userList = $('#userList') || $('#rulesUserList');
    if (!userList) return;
    
    userList.innerHTML = '';
    
    if (snapshot.empty) {
      userList.innerHTML = '<div style="padding: 10px; text-align: center; opacity: 0.7;">Tidak ada karyawan</div>';
      return;
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      item.className = 'user-item';
      item.dataset.uid = doc.id;
      item.textContent = data.nama;
      
      item.addEventListener('click', () => {
        item.classList.toggle('selected');
      });
      
      userList.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading user list:', error);
    showToast('Gagal memuat daftar karyawan', 'error');
  }
};

// Jalankan inisialisasi ketika DOM sudah dimuat
document.addEventListener('DOMContentLoaded', initApp);