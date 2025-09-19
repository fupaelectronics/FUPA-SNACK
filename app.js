// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyApYdiUlLMb9ihBkLnCjDpLJHqYFRFS3Fw",
  authDomain: "fupa-snack.firebaseapp.com",
  projectId: "fupa-snack",
  storageBucket: "fupa-snack.firebasestorage.app",
  messagingSenderId: "972524876738",
  appId: "1:972524876738:web:dd0d57dd8bf2d8a8dd9c5b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// UID roles
const ADMIN_UIDS = new Set([
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
]);

const KARYAWAN_UIDS = new Set([
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
]);

// Utility functions
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg, type = 'info') {
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
}

// Format date for display
function formatDate(date) {
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
}

// Format date for storage
function formatDateForStorage(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Check if today is Sunday
function isSunday() {
  return new Date().getDay() === 0;
}

// Get current shift based on time
function getCurrentShift() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'pagi';
  if (hour >= 12 && hour < 18) return 'sore';
  return null;
}

// Check if in presensi session
function isInPresensiSession(shift, jenis) {
  if (jenis === 'izin') return true;
  
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeValue = hour * 100 + minute;
  
  if (shift === 'pagi') {
    if (jenis === 'berangkat') return timeValue >= 530 && timeValue <= 600;
    if (jenis === 'pulang') return timeValue >= 1000 && timeValue <= 1100;
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') return timeValue >= 1400 && timeValue <= 1430;
    if (jenis === 'pulang') return timeValue >= 1730 && timeValue <= 1830;
  }
  
  return false;
}

// Check if terlambat
function isTerlambat(shift, jenis) {
  if (jenis === 'izin') return false;
  
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeValue = hour * 100 + minute;
  
  if (shift === 'pagi') {
    if (jenis === 'berangkat') return timeValue > 600 && timeValue <= 620;
    if (jenis === 'pulang') return timeValue > 1100 && timeValue <= 1120;
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') return timeValue > 1430 && timeValue <= 1450;
    if (jenis === 'pulang') return timeValue > 1830 && timeValue <= 1850;
  }
  
  return false;
}

// Get status presensi
function getStatusPresensi(shift, jenis) {
  if (isSunday()) return { status: 'Libur', class: 's-bad' };
  if (jenis === 'izin') return { status: 'Izin', class: 's-warn' };
  if (!isInPresensiSession(shift, jenis)) return { status: 'Di luar sesi presensi', class: 's-bad' };
  if (isTerlambat(shift, jenis)) return { status: 'Terlambat', class: 's-warn' };
  return { status: 'Tepat Waktu', class: 's-good' };
}

// Compress image to 50kb and remove metadata
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate new dimensions
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
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob with quality adjustment
        let quality = 0.9;
        let compressedBlob = null;
        
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (blob.size <= 50 * 1024 || quality <= 0.1) {
              compressedBlob = blob;
              resolve(compressedBlob);
            } else {
              quality -= 0.1;
              tryCompress();
            }
          }, 'image/jpeg', quality);
        };
        
        tryCompress();
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload image to Cloudinary
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
    throw error;
  }
}

// Initialize camera
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    
    const video = $('#cameraPreview');
    if (video) {
      video.srcObject = stream;
      video.play();
    }
    
    return stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    toast('Tidak dapat mengakses kamera', 'error');
    throw error;
  }
}

// Take picture from camera
function takePicture(video, canvas) {
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg');
}

// Get current location
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

// Check if user has already presensi today for this type
async function hasPresensiToday(uid, jenis) {
  try {
    const today = formatDateForStorage(new Date());
    const presensiRef = db.collection('presences');
    const snapshot = await presensiRef
      .where('userId', '==', uid)
      .where('date', '==', today)
      .where('jenis', '==', jenis)
      .get();
    
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking presensi:', error);
    return false;
  }
}

// Export to CSV
function exportToCSV(data, filename) {
  const csvContent = [];
  
  // Header
  csvContent.push(['Nama', 'Tanggal', 'Shift', 'Jenis', 'Status', 'Koordinat'].join(','));
  
  // Data
  data.forEach(item => {
    csvContent.push([
      item.nama,
      item.tanggal,
      item.shift,
      item.jenis,
      item.status,
      item.koordinat
    ].join(','));
  });
  
  const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Initialize app
function initApp() {
  // Check authentication state
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // User is signed in
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        
        // Redirect based on role
        if (ADMIN_UIDS.has(user.uid) && !window.location.pathname.endsWith('admin.html')) {
          window.location.href = 'admin.html';
        } else if (KARYAWAN_UIDS.has(user.uid) && !window.location.pathname.endsWith('karyawan.html')) {
          window.location.href = 'karyawan.html';
        } else {
          // Load appropriate page content
          if (window.location.pathname.endsWith('karyawan.html')) {
            initKaryawanPage(user, userData);
          } else if (window.location.pathname.endsWith('admin.html')) {
            initAdminPage(user, userData);
          }
        }
      } else {
        // User document doesn't exist, create one
        await db.collection('users').doc(user.uid).set({
          email: user.email,
          nama: user.email.split('@')[0],
          alamat: '',
          shift: 'pagi',
          foto: `https://api.dicebear.com/7.x/initials/svg?seed=${user.email}&backgroundColor=ffb300,ffd54f&radius=20`,
          role: ADMIN_UIDS.has(user.uid) ? 'admin' : 'karyawan',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Reload page
        window.location.reload();
      }
    } else {
      // User is signed out, redirect to login
      if (!window.location.pathname.endsWith('index.html')) {
        window.location.href = 'index.html';
      }
    }
  });
}

// Initialize karyawan page
function initKaryawanPage(user, userData) {
  // Update profile data
  if ($('#nama')) $('#nama').value = userData.nama || '';
  if ($('#alamat')) $('#alamat').value = userData.alamat || '';
  if ($('#pfp')) $('#pfp').src = userData.foto || `https://api.dicebear.com/7.x/initials/svg?seed=${user.email}&backgroundColor=ffb300,ffd54f&radius=20`;
  
  // Update server time
  function updateServerTime() {
    if ($('#serverTime')) {
      $('#serverTime').textContent = formatDate(new Date());
    }
  }
  
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Update status presensi
  function updatePresenceStatus() {
    if (isSunday()) {
      $('#statusText').textContent = 'Libur';
      $('#statusChip').className = 'status s-bad';
      $('#statusChip').innerHTML = '<span class="material-symbols-rounded">beach_access</span><span id="statusText">Libur</span>';
      return;
    }
    
    const shift = userData.shift || 'pagi';
    const currentShift = getCurrentShift();
    
    if (currentShift !== shift) {
      $('#statusText').textContent = 'Di luar sesi presensi';
      $('#statusChip').className = 'status s-bad';
      $('#statusChip').innerHTML = '<span class="material-symbols-rounded">schedule</span><span id="statusText">Di luar sesi presensi</span>';
      return;
    }
    
    const jenis = $('#jenis') ? $('#jenis').value : 'berangkat';
    const status = getStatusPresensi(shift, jenis);
    
    $('#statusText').textContent = status.status;
    $('#statusChip').className = `status ${status.class}`;
    
    let icon = 'check_circle';
    if (status.class === 's-warn') icon = 'warning';
    if (status.class === 's-bad') icon = 'error';
    
    $('#statusChip').innerHTML = `<span class="material-symbols-rounded">${icon}</span><span id="statusText">${status.status}</span>`;
  }
  
  updatePresenceStatus();
  
  // Update location
  function updateLocation() {
    getCurrentLocation().then(location => {
      if ($('#locText')) {
        $('#locText').textContent = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
      }
    }).catch(error => {
      console.error('Error getting location:', error);
      if ($('#locText')) {
        $('#locText').textContent = 'Tidak dapat mengakses lokasi';
      }
    });
  }
  
  updateLocation();
  
  // Initialize camera
  let cameraStream = null;
  const video = $('#cameraPreview');
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  
  if (video) {
    initCamera().then(stream => {
      cameraStream = stream;
    }).catch(error => {
      console.error('Error initializing camera:', error);
    });
  }
  
  // Event listeners
  if ($('#snapBtn')) {
    $('#snapBtn').addEventListener('click', () => {
      if (!cameraStream) {
        toast('Kamera belum siap', 'error');
        return;
      }
      
      const photoData = takePicture(video, canvas);
      $('#photoPreview').src = photoData;
      $('#photoPreview').style.display = 'block';
      $('#cameraPreview').style.display = 'none';
      $('#uploadBtn').disabled = false;
      
      toast('Foto berhasil diambil', 'success');
    });
  }
  
  if ($('#uploadBtn')) {
    $('#uploadBtn').addEventListener('click', async () => {
      const jenis = $('#jenis').value;
      const hasPresensi = await hasPresensiToday(user.uid, jenis);
      
      if (hasPresensi && jenis !== 'izin') {
        toast(`Anda sudah melakukan presensi ${jenis} hari ini`, 'error');
        return;
      }
      
      $('#uploadBtn').disabled = true;
      $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
      
      try {
        // Get current location
        const location = await getCurrentLocation();
        const locText = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
        
        // Get status
        const shift = userData.shift;
        const statusInfo = getStatusPresensi(shift, jenis);
        
        // Convert dataURL to blob
        const photoData = $('#photoPreview').src;
        const response = await fetch(photoData);
        const blob = await response.blob();
        
        // Compress and upload image
        const compressedBlob = await compressImage(blob);
        const photoUrl = await uploadToCloudinary(compressedBlob);
        
        // Save to Firestore
        await db.collection('presences').add({
          userId: user.uid,
          nama: userData.nama,
          email: user.email,
          shift: jenis === 'izin' ? 'Penuh' : shift,
          jenis: jenis,
          status: statusInfo.status,
          koordinat: locText,
          foto: photoUrl,
          date: formatDateForStorage(new Date()),
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        toast('Presensi berhasil dicatat', 'success');
        $('#uploadBtn').disabled = false;
        $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
        
        // Reset camera
        $('#photoPreview').style.display = 'none';
        $('#cameraPreview').style.display = 'block';
        
      } catch (error) {
        console.error('Error uploading presensi:', error);
        toast('Gagal mengupload presensi', 'error');
        $('#uploadBtn').disabled = false;
        $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      }
    });
  }
  
  if ($('#jenis')) {
    $('#jenis').addEventListener('change', updatePresenceStatus);
  }
  
  if ($('#profileBtn')) {
    $('#profileBtn').addEventListener('click', () => {
      $('#profileDlg').showModal();
    });
  }
  
  if ($('#saveProfileBtn')) {
    $('#saveProfileBtn').addEventListener('click', async () => {
      const nama = $('#nama').value;
      const alamat = $('#alamat').value;
      const shift = $('#shiftSelect').value;
      const file = $('#pfpFile').files[0];
      
      try {
        let fotoUrl = userData.foto;
        
        if (file) {
          const compressedBlob = await compressImage(file);
          fotoUrl = await uploadToCloudinary(compressedBlob);
        }
        
        await db.collection('users').doc(user.uid).update({
          nama: nama,
          alamat: alamat,
          shift: shift,
          foto: fotoUrl
        });
        
        toast('Profil berhasil disimpan', 'success');
        $('#profileDlg').close();
        window.location.reload();
      } catch (error) {
        console.error('Error saving profile:', error);
        toast('Gagal menyimpan profil', 'error');
      }
    });
  }
  
  if ($('#logoutBtn')) {
    $('#logoutBtn').addEventListener('click', () => {
      auth.signOut().then(() => {
        toast('Berhasil keluar', 'success');
        window.location.href = 'index.html';
      }).catch(error => {
        console.error('Error signing out:', error);
        toast('Gagal keluar', 'error');
      });
    });
  }
  
  if ($('#pfpFile')) {
    $('#pfpFile').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          $('#pfp').src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

// Initialize admin page
function initAdminPage(user, userData) {
  // Update profile data
  if ($('#nama')) $('#nama').value = userData.nama || '';
  if ($('#alamat')) $('#alamat').value = userData.alamat || '';
  if ($('#pfp')) $('#pfp').src = userData.foto || `https://api.dicebear.com/7.x/initials/svg?seed=${user.email}&backgroundColor=ffb300,ffd54f&radius=20`;
  
  // Update server time
  function updateServerTime() {
    if ($('#serverTime')) {
      $('#serverTime').textContent = formatDate(new Date());
    }
  }
  
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Load presensi data
  let allPresences = [];
  let filteredPresences = [];
  
  async function loadPresences() {
    try {
      const snapshot = await db.collection('presences')
        .orderBy('timestamp', 'desc')
        .get();
      
      allPresences = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        allPresences.push({
          id: doc.id,
          ...data,
          tanggal: data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString('id-ID') : '-',
          jam: data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString('id-ID') : '-'
        });
      });
      
      applyFilters();
    } catch (error) {
      console.error('Error loading presences:', error);
      toast('Gagal memuat data presensi', 'error');
    }
  }
  
  function applyFilters() {
    const namaFilter = $('#fNama').value.toLowerCase();
    const periodeFilter = $('#fPeriode').value;
    const showFilter = $('#fShow').value;
    
    filteredPresences = allPresences.filter(presence => {
      // Filter by name
      if (namaFilter && !presence.nama.toLowerCase().includes(namaFilter)) {
        return false;
      }
      
      // Filter by period
      if (periodeFilter !== 'all') {
        const presenceDate = presence.timestamp ? new Date(presence.timestamp.toDate()) : new Date();
        const today = new Date();
        
        if (periodeFilter === 'harian') {
          if (presenceDate.toDateString() !== today.toDateString()) return false;
        } else if (periodeFilter === 'mingguan') {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          weekStart.setHours(0, 0, 0, 0);
          
          if (presenceDate < weekStart) return false;
        } else if (periodeFilter === 'bulanan') {
          if (presenceDate.getMonth() !== today.getMonth() || 
              presenceDate.getFullYear() !== today.getFullYear()) {
            return false;
          }
        } else if (periodeFilter === 'tahunan') {
          if (presenceDate.getFullYear() !== today.getFullYear()) return false;
        } else if (periodeFilter === 'custom') {
          const dariDate = new Date($('#fDari').value);
          const sampaiDate = new Date($('#fSampai').value);
          sampaiDate.setHours(23, 59, 59, 999);
          
          if (presenceDate < dariDate || presenceDate > sampaiDate) return false;
        }
      }
      
      return true;
    });
    
    // Apply show filter
    if (showFilter !== 'all') {
      filteredPresences = filteredPresences.slice(0, parseInt(showFilter));
    }
    
    renderPresences();
  }
  
  function renderPresences() {
    const tableBody = $('#tableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (filteredPresences.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px">Tidak ada data presensi</td></tr>';
      return;
    }
    
    filteredPresences.forEach(presence => {
      const row = document.createElement('tr');
      
      // Determine status class
      let statusClass = 's-good';
      if (presence.status === 'Terlambat') statusClass = 's-warn';
      if (presence.status === 'Libur' || presence.status === 'Di luar sesi presensi') statusClass = 's-bad';
      if (presence.status === 'Izin') statusClass = 's-warn';
      
      row.innerHTML = `
        <td>${presence.tanggal}<br>${presence.jam}</td>
        <td>${presence.nama}</td>
        <td>${presence.jenis}</td>
        <td><span class="status ${statusClass}">${presence.status}</span></td>
        <td>${presence.koordinat}</td>
        <td><a href="${presence.foto}" target="_blank">Lihat Foto</a></td>
      `;
      
      tableBody.appendChild(row);
    });
  }
  
  // Event listeners
  if ($('#applyFilter')) {
    $('#applyFilter').addEventListener('click', applyFilters);
  }
  
  if ($('#fPeriode')) {
    $('#fPeriode').addEventListener('change', () => {
      const period = $('#fPeriode').value;
      $('#customDateRange').style.display = period === 'custom' ? 'flex' : 'none';
      applyFilters();
    });
  }
  
  if ($('#fNama')) {
    $('#fNama').addEventListener('input', applyFilters);
  }
  
  if ($('#fShow')) {
    $('#fShow').addEventListener('change', applyFilters);
  }
  
  if ($('#fDari') && $('#fSampai')) {
    $('#fDari').addEventListener('change', applyFilters);
    $('#fSampai').addEventListener('change', applyFilters);
  }
  
  if ($('#exportCsv')) {
    $('#exportCsv').addEventListener('click', () => {
      const namaFilter = $('#fNama').value;
      const periodeFilter = $('#fPeriode').value;
      
      let filename = `presensi-${new Date().toISOString().split('T')[0]}`;
      if (namaFilter) filename += `-${namaFilter}`;
      if (periodeFilter !== 'all') filename += `-${periodeFilter}`;
      
      filename += '.csv';
      
      const csvData = filteredPresences.map(p => ({
        nama: p.nama,
        tanggal: p.tanggal,
        shift: p.shift,
        jenis: p.jenis,
        status: p.status,
        koordinat: p.koordinat
      }));
      
      exportToCSV(csvData, filename);
      toast('CSV berhasil diekspor', 'success');
    });
  }
  
  if ($('#profileBtn')) {
    $('#profileBtn').addEventListener('click', () => {
      $('#profileDlg').showModal();
    });
  }
  
  if ($('#saveProfileBtn')) {
    $('#saveProfileBtn').addEventListener('click', async () => {
      const nama = $('#nama').value;
      const alamat = $('#alamat').value;
      const file = $('#pfpFile').files[0];
      
      try {
        let fotoUrl = userData.foto;
        
        if (file) {
          const compressedBlob = await compressImage(file);
          fotoUrl = await uploadToCloudinary(compressedBlob);
        }
        
        await db.collection('users').doc(user.uid).update({
          nama: nama,
          alamat: alamat,
          foto: fotoUrl
        });
        
        toast('Profil berhasil disimpan', 'success');
        $('#profileDlg').close();
        window.location.reload();
      } catch (error) {
        console.error('Error saving profile:', error);
        toast('Gagal menyimpan profil', 'error');
      }
    });
  }
  
  if ($('#logoutBtn')) {
    $('#logoutBtn').addEventListener('click', () => {
      auth.signOut().then(() => {
        toast('Berhasil keluar', 'success');
        window.location.href = 'index.html';
      }).catch(error => {
        console.error('Error signing out:', error);
        toast('Gagal keluar', 'error');
      });
    });
  }
  
  if ($('#pfpFile')) {
    $('#pfpFile').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          $('#pfp').src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  // Load initial data
  loadPresences();
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);