// Inisialisasi Firebase
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
const storage = firebase.storage();

// Variabel global
let currentUser = null;
let userRole = null;
let userData = null;
let cameraStream = null;
let capturedPhoto = null;
let currentLocation = null;

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

// Fungsi untuk mendapatkan waktu server dari Firebase
const getServerTimestamp = async () => {
  try {
    const docRef = db.collection('timestamps').doc('serverTime');
    await docRef.set({ timestamp: new Date() });
    const doc = await docRef.get();
    return doc.exists ? doc.data().timestamp.toDate() : new Date();
  } catch (error) {
    console.error("Error getting server timestamp:", error);
    return new Date();
  }
};

// Fungsi untuk mendapatkan status presensi berdasarkan waktu
const getPresenceStatus = (time, jenis) => {
  if (jenis === 'izin') return 'Izin';
  
  const day = time.getDay();
  if (day === 0) return 'Libur'; // Minggu
  
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  // Aturan waktu
  const shiftPagiBerangkatStart = 5 * 60 + 30; // 05:30
  const shiftPagiBerangkatEnd = 6 * 60; // 06:00
  const shiftPagiPulangStart = 10 * 60; // 10:00
  const shiftPagiPulangEnd = 11 * 60; // 11:00
  
  const shiftSoreBerangkatStart = 14 * 60; // 14:00
  const shiftSoreBerangkatEnd = 14 * 60 + 30; // 14:30
  const shiftSorePulangStart = 17 * 60 + 30; // 17:30
  const shiftSorePulangEnd = 18 * 60 + 30; // 18:30
  
  // Toleransi keterlambatan 20 menit
  const toleransi = 20;
  
  // Cek sesi presensi
  let inSession = false;
  let isLate = false;
  
  if (userData && userData.shift === 'pagi') {
    if (jenis === 'berangkat') {
      inSession = totalMinutes >= shiftPagiBerangkatStart && totalMinutes <= shiftPagiBerangkatEnd + toleransi;
      isLate = totalMinutes > shiftPagiBerangkatEnd && totalMinutes <= shiftPagiBerangkatEnd + toleransi;
    } else if (jenis === 'pulang') {
      inSession = totalMinutes >= shiftPagiPulangStart && totalMinutes <= shiftPagiPulangEnd + toleransi;
      isLate = totalMinutes > shiftPagiPulangEnd && totalMinutes <= shiftPagiPulangEnd + toleransi;
    }
  } else if (userData && userData.shift === 'sore') {
    if (jenis === 'berangkat') {
      inSession = totalMinutes >= shiftSoreBerangkatStart && totalMinutes <= shiftSoreBerangkatEnd + toleransi;
      isLate = totalMinutes > shiftSoreBerangkatEnd && totalMinutes <= shiftSoreBerangkatEnd + toleransi;
    } else if (jenis === 'pulang') {
      inSession = totalMinutes >= shiftSorePulangStart && totalMinutes <= shiftSorePulangEnd + toleransi;
      isLate = totalMinutes > shiftSorePulangEnd && totalMinutes <= shiftSorePulangEnd + toleransi;
    }
  }
  
  if (!inSession && jenis !== 'izin') return 'Di luar sesi presensi';
  return isLate ? 'Terlambat' : 'Tepat Waktu';
};

// Fungsi untuk mendapatkan lokasi pengguna
const getLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation tidak didukung"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        resolve(coords);
      },
      (error) => {
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};

// Fungsi untuk menginisialisasi kamera
const initCamera = async () => {
  try {
    // Hentikan stream kamera yang ada
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    
    // Dapatkan akses ke kamera
    cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    
    const videoElement = $('#cameraPreview');
    if (videoElement) {
      videoElement.srcObject = cameraStream;
    }
    
    return true;
  } catch (error) {
    console.error("Error accessing camera:", error);
    showToast("Tidak dapat mengakses kamera", "error");
    return false;
  }
};

// Fungsi untuk mengambil foto
const capturePhoto = () => {
  return new Promise((resolve) => {
    const video = $('#cameraPreview');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.8);
  });
};

// Fungsi untuk mengompres gambar
const compressImage = (blob, maxSizeKB = 50) => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = function() {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Hitung ukuran baru dengan menjaga aspect ratio
      let width = img.width;
      let height = img.height;
      let quality = 0.9;
      
      // Turunkan kualitas hingga ukuran sesuai
      const adjustQuality = () => {
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((compressedBlob) => {
          if (compressedBlob.size / 1024 > maxSizeKB && quality > 0.1) {
            quality -= 0.1;
            adjustQuality();
          } else {
            resolve(compressedBlob);
          }
        }, 'image/jpeg', quality);
      };
      
      adjustQuality();
    };
    
    img.src = url;
  });
};

// Fungsi untuk mengupload gambar ke Cloudinary
const uploadToCloudinary = async (blob) => {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', 'FupaSnack');
  formData.append('cloud_name', 'da7idhh4f');
  
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/da7idhh4f/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    throw new Error("Gagal mengupload gambar");
  }
};

// Fungsi untuk mencatat presensi
const recordAttendance = async (jenis) => {
  try {
    // Validasi
    if (!currentUser) {
      showToast("Anda harus login terlebih dahulu", "error");
      return false;
    }
    
    if (!capturedPhoto) {
      showToast("Ambil foto terlebih dahulu", "error");
      return false;
    }
    
    // Dapatkan waktu server
    const serverTime = await getServerTimestamp();
    
    // Dapatkan lokasi
    let location = null;
    try {
      location = await getLocation();
    } catch (error) {
      console.error("Error getting location:", error);
      showToast("Tidak dapat mendapatkan lokasi", "error");
      return false;
    }
    
    // Tentukan status presensi
    const status = getPresenceStatus(serverTime, jenis);
    
    // Kompres gambar
    const compressedImage = await compressImage(capturedPhoto);
    
    // Upload gambar ke Cloudinary
    const imageUrl = await uploadToCloudinary(compressedImage);
    
    // Simpan data presensi ke Firestore
    const attendanceData = {
      userId: currentUser.uid,
      userName: userData.name,
      userEmail: currentUser.email,
      timestamp: firebase.firestore.Timestamp.fromDate(serverTime),
      jenis: jenis,
      status: status,
      shift: jenis === 'izin' ? 'Penuh' : userData.shift,
      location: new firebase.firestore.GeoPoint(location.latitude, location.longitude),
      imageUrl: imageUrl,
      accuracy: location.accuracy
    };
    
    await db.collection('presensi').add(attendanceData);
    
    // Reset state
    capturedPhoto = null;
    $('#uploadBtn').disabled = true;
    $('#snapBtn').disabled = false;
    
    showToast("Presensi berhasil dicatat", "success");
    return true;
  } catch (error) {
    console.error("Error recording attendance:", error);
    showToast("Gagal mencatat presensi: " + error.message, "error");
    return false;
  }
};

// Fungsi untuk memuat data profil pengguna
const loadUserProfile = async () => {
  try {
    if (!currentUser) return;
    
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
      userData = userDoc.data();
      userRole = userData.role;
      
      // Update UI dengan data profil
      if ($('#profileName')) $('#profileName').textContent = userData.name || 'Nama Pengguna';
      if ($('#profileEmail')) $('#profileEmail').textContent = currentUser.email;
      if ($('#profileAddress')) $('#profileAddress').textContent = userData.address || 'Alamat belum diatur';
      
      // Update foto profil jika ada
      if (userData.photoURL && $('#profilePhoto')) {
        $('#profilePhoto').src = userData.photoURL;
      }
      
      // Tampilkan shift di UI
      if (userData.shift && $('#userShift')) {
        $('#userShift').textContent = userData.shift.charAt(0).toUpperCase() + userData.shift.slice(1);
      }
    } else {
      // Buat dokumen pengguna baru jika tidak ada
      const defaultUserData = {
        name: currentUser.displayName || currentUser.email.split('@')[0],
        email: currentUser.email,
        role: 'karyawan',
        shift: 'pagi',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('users').doc(currentUser.uid).set(defaultUserData);
      userData = defaultUserData;
      userRole = 'karyawan';
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
  }
};

// Fungsi untuk memuat riwayat presensi
const loadAttendanceHistory = async (filters = {}) => {
  try {
    let query = db.collection('presensi').orderBy('timestamp', 'desc');
    
    // Terapkan filter
    if (filters.userId) {
      query = query.where('userId', '==', filters.userId);
    }
    
    if (filters.startDate && filters.endDate) {
      query = query.where('timestamp', '>=', filters.startDate)
                  .where('timestamp', '<=', filters.endDate);
    }
    
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    const snapshot = await query.get();
    const history = [];
    
    snapshot.forEach(doc => {
      history.push({ id: doc.id, ...doc.data() });
    });
    
    return history;
  } catch (error) {
    console.error("Error loading attendance history:", error);
    showToast("Gagal memuat riwayat presensi", "error");
    return [];
  }
};

// Fungsi untuk mengekspor data ke CSV
const exportToCSV = (data, filename) => {
  // Format data sesuai STDR
  const csvData = data.map(item => {
    return {
      'Nama': item.userName,
      'Tanggal': item.timestamp.toDate().toLocaleDateString('id-ID'),
      'Jam': item.timestamp.toDate().toLocaleTimeString('id-ID'),
      'Shift': item.shift,
      'Jenis': item.jenis,
      'Status': item.status,
      'Koordinat': `${item.location.latitude}, ${item.location.longitude}`
    };
  });
  
  // Urutkan data berdasarkan nama dan tanggal
  csvData.sort((a, b) => {
    if (a.Nama < b.Nama) return -1;
    if (a.Nama > b.Nama) return 1;
    
    const dateA = new Date(a.Tanggal.split('/').reverse().join('-'));
    const dateB = new Date(b.Tanggal.split('/').reverse().join('-'));
    
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    
    // Untuk tanggal yang sama, berangkat dulu baru pulang
    if (a.Jenis === 'berangkat' && b.Jenis !== 'berangkat') return -1;
    if (a.Jenis !== 'berangkat' && b.Jenis === 'berangkat') return 1;
    
    return 0;
  });
  
  // Buat konten CSV
  let csvContent = 'Nama,Tanggal,Jam,Shift,Jenis,Status,Koordinat\n';
  
  let currentName = '';
  csvData.forEach((item, index) => {
    // Tambahkan baris kosong antar blok nama
    if (currentName !== item.Nama && index > 0) {
      csvContent += ',, , , , , \n';
    }
    currentName = item.Nama;
    
    csvContent += `"${item.Nama}","${item.Tanggal}","${item.Jam}","${item.Shift}","${item.Jenis}","${item.Status}","${item.Koordinat}"\n`;
  });
  
  // Buat file dan unduh
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Fungsi untuk mengupdate waktu server di UI
const updateServerTime = async () => {
  try {
    const serverTime = await getServerTimestamp();
    const timeElement = $('#serverTime');
    
    if (timeElement) {
      const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Jakarta'
      };
      
      timeElement.textContent = serverTime.toLocaleDateString('id-ID', options);
    }
    
    // Update status presensi jika di halaman karyawan
    if (userRole === 'karyawan' && $('#statusText')) {
      const jenis = $('#jenis').value;
      const status = getPresenceStatus(serverTime, jenis);
      
      $('#statusText').textContent = status;
      
      // Update warna status
      const statusChip = $('#statusChip');
      statusChip.className = 'status ';
      
      if (status === 'Libur') {
        statusChip.classList.add('s-bad');
      } else if (status === 'Tepat Waktu') {
        statusChip.classList.add('s-good');
      } else if (status === 'Terlambat') {
        statusChip.classList.add('s-warn');
      } else {
        statusChip.classList.add('s-bad');
      }
    }
  } catch (error) {
    console.error("Error updating server time:", error);
  }
};

// Fungsi untuk logout
const logout = async () => {
  try {
    // Hentikan kamera jika sedang berjalan
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    
    await auth.signOut();
    window.location.href = 'index.html';
  } catch (error) {
    console.error("Error signing out:", error);
    showToast("Gagal logout", "error");
  }
};

// Inisialisasi aplikasi
const initApp = async () => {
  try {
    // Daftarkan service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('SW registered: ', registration);
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
    }
    
    // Pantau status autentikasi
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;
        await loadUserProfile();
        
        // Redirect berdasarkan role
        const currentPage = window.location.pathname.split('/').pop();
        
        if (userRole === 'admin' && currentPage !== 'admin.html') {
          window.location.href = 'admin.html';
        } else if (userRole === 'karyawan' && currentPage !== 'karyawan.html') {
          window.location.href = 'karyawan.html';
        }
        
        // Inisialisasi berdasarkan halaman
        if (currentPage === 'karyawan.html') {
          initKaryawanPage();
        } else if (currentPage === 'admin.html') {
          initAdminPage();
        }
      } else {
        // Redirect ke login jika tidak terautentikasi
        if (!window.location.pathname.includes('index.html')) {
          window.location.href = 'index.html';
        }
      }
    });
  } catch (error) {
    console.error("Error initializing app:", error);
  }
};

// Inisialisasi halaman karyawan
const initKaryawanPage = async () => {
  try {
    // Update waktu server setiap detik
    updateServerTime();
    setInterval(updateServerTime, 1000);
    
    // Dapatkan lokasi
    try {
      const location = await getLocation();
      currentLocation = location;
      if ($('#locText')) {
        $('#locText').textContent = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
      }
    } catch (error) {
      console.error("Error getting location:", error);
      if ($('#locText')) {
        $('#locText').textContent = 'Tidak dapat mengakses lokasi';
      }
    }
    
    // Inisialisasi kamera
    const cameraSuccess = await initCamera();
    if (!cameraSuccess) {
      $('#cameraPreview').style.display = 'none';
      $('#cameraPlaceholder').style.display = 'flex';
    }
    
    // Event listener untuk tombol ambil foto
    $('#snapBtn').addEventListener('click', async () => {
      try {
        $('#snapBtn').disabled = true;
        $('#snapBtn').innerHTML = '<span class="spinner"></span> Memproses...';
        
        capturedPhoto = await capturePhoto();
        
        // Tampilkan preview foto
        const photoPreview = $('#photoPreview');
        const url = URL.createObjectURL(capturedPhoto);
        photoPreview.src = url;
        photoPreview.style.display = 'block';
        $('#cameraPreview').style.display = 'none';
        
        // Aktifkan tombol upload
        $('#uploadBtn').disabled = false;
        
        $('#snapBtn').disabled = false;
        $('#snapBtn').innerHTML = '<span class="material-symbols-rounded">photo_camera</span> Ambil selfie';
        
        showToast("Foto berhasil diambil", "success");
      } catch (error) {
        console.error("Error capturing photo:", error);
        showToast("Gagal mengambil foto", "error");
        $('#snapBtn').disabled = false;
        $('#snapBtn').innerHTML = '<span class="material-symbols-rounded">photo_camera</span> Ambil selfie';
      }
    });
    
    // Event listener untuk tombol upload
    $('#uploadBtn').addEventListener('click', async () => {
      const jenis = $('#jenis').value;
      $('#uploadBtn').disabled = true;
      $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
      
      await recordAttendance(jenis);
      
      $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      
      // Kembalikan ke mode kamera
      $('#photoPreview').style.display = 'none';
      $('#cameraPreview').style.display = 'block';
      await initCamera();
    });
    
    // Event listener untuk perubahan jenis presensi
    $('#jenis').addEventListener('change', () => {
      updateServerTime(); // Update status berdasarkan jenis yang dipilih
    });
    
    // Event listener untuk dialog profil
    $('#profileBtn').addEventListener('click', () => {
      $('#profileDlg').showModal();
    });
    
    // Event listener untuk simpan profil
    $('#saveProfileBtn').addEventListener('click', async () => {
      try {
        const name = $('#profileNameInput').value;
        const address = $('#profileAddressInput').value;
        const photoFile = $('#profilePhotoInput').files[0];
        
        let photoURL = userData.photoURL;
        
        // Upload foto baru jika ada
        if (photoFile) {
          const compressedPhoto = await compressImage(photoFile, 100);
          photoURL = await uploadToCloudinary(compressedPhoto);
        }
        
        // Update data pengguna
        await db.collection('users').doc(currentUser.uid).update({
          name: name,
          address: address,
          photoURL: photoURL,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update UI
        userData.name = name;
        userData.address = address;
        userData.photoURL = photoURL;
        
        $('#profileName').textContent = name;
        $('#profileAddress').textContent = address;
        if (photoURL) {
          $('#profilePhoto').src = photoURL;
        }
        
        showToast("Profil berhasil diperbarui", "success");
        $('#profileDlg').close();
      } catch (error) {
        console.error("Error updating profile:", error);
        showToast("Gagal memperbarui profil", "error");
      }
    });
    
    // Event listener untuk logout
    $('#logoutBtn').addEventListener('click', logout);
    
  } catch (error) {
    console.error("Error initializing karyawan page:", error);
  }
};

// Inisialisasi halaman admin
const initAdminPage = async () => {
  try {
    // Update waktu server setiap detik
    updateServerTime();
    setInterval(updateServerTime, 1000);
    
    // Muat data presensi
    await loadAndRenderAttendance();
    
    // Event listener untuk filter
    $('#applyFilter').addEventListener('click', async () => {
      await loadAndRenderAttendance();
    });
    
    // Event listener untuk perubahan periode
    $('#fPeriode').addEventListener('change', () => {
      const period = $('#fPeriode').value;
      $('#customDateRange').style.display = period === 'custom' ? 'flex' : 'none';
    });
    
    // Event listener untuk ekspor CSV
    $('#exportCsv').addEventListener('click', async () => {
      try {
        $('#exportCsv').disabled = true;
        $('#exportCsv').innerHTML = '<span class="spinner"></span> Mengekspor...';
        
        const filters = getCurrentFilters();
        const data = await loadAttendanceHistory(filters);
        
        const now = new Date();
        const filename = `presensi_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.csv`;
        
        exportToCSV(data, filename);
        
        showToast("CSV berhasil diekspor", "success");
        $('#exportCsv').disabled = false;
        $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
      } catch (error) {
        console.error("Error exporting CSV:", error);
        showToast("Gagal mengekspor CSV", "error");
        $('#exportCsv').disabled = false;
        $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
      }
    });
    
    // Event listener untuk dialog profil
    $('#profileBtn').addEventListener('click', () => {
      $('#profileDlg').showModal();
    });
    
    // Event listener untuk simpan profil
    $('#saveProfileBtn').addEventListener('click', async () => {
      try {
        const name = $('#profileNameInput').value;
        const address = $('#profileAddressInput').value;
        const photoFile = $('#profilePhotoInput').files[0];
        
        let photoURL = userData.photoURL;
        
        // Upload foto baru jika ada
        if (photoFile) {
          const compressedPhoto = await compressImage(photoFile, 100);
          photoURL = await uploadToCloudinary(compressedPhoto);
        }
        
        // Update data pengguna
        await db.collection('users').doc(currentUser.uid).update({
          name: name,
          address: address,
          photoURL: photoURL,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update UI
        userData.name = name;
        userData.address = address;
        userData.photoURL = photoURL;
        
        $('#profileName').textContent = name;
        $('#profileAddress').textContent = address;
        if (photoURL) {
          $('#profilePhoto').src = photoURL;
        }
        
        showToast("Profil berhasil diperbarui", "success");
        $('#profileDlg').close();
      } catch (error) {
        console.error("Error updating profile:", error);
        showToast("Gagal memperbarui profil", "error");
      }
    });
    
    // Event listener untuk logout
    $('#logoutBtn').addEventListener('click', logout);
    
  } catch (error) {
    console.error("Error initializing admin page:", error);
  }
};

// Fungsi untuk mendapatkan filter saat ini
const getCurrentFilters = () => {
  const filters = {};
  const namaFilter = $('#fNama').value;
  const periode = $('#fPeriode').value;
  const showLimit = $('#fShow').value;
  
  if (namaFilter) {
    // Untuk filter nama, kita perlu mendapatkan userId terlebih dahulu
    // Ini akan diimplementasikan setelah data dimuat
  }
  
  if (showLimit !== 'all') {
    filters.limit = parseInt(showLimit);
  }
  
  // Filter berdasarkan periode
  const now = new Date();
  let startDate, endDate;
  
  switch (periode) {
    case 'harian':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case 'mingguan':
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - dayOfWeek) + 1);
      break;
    case 'bulanan':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'tahunan':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1);
      break;
    case 'custom':
      startDate = new Date($('#fDari').value);
      endDate = new Date($('#fSampai').value);
      endDate.setDate(endDate.getDate() + 1); // Sampai akhir hari
      break;
  }
  
  filters.startDate = firebase.firestore.Timestamp.fromDate(startDate);
  filters.endDate = firebase.firestore.Timestamp.fromDate(endDate);
  
  return filters;
};

// Fungsi untuk memuat dan merender data presensi
const loadAndRenderAttendance = async () => {
  try {
    const filters = getCurrentFilters();
    const data = await loadAttendanceHistory(filters);
    
    // Render data ke tabel
    const tableBody = $('#tableBody');
    tableBody.innerHTML = '';
    
    data.forEach(item => {
      const row = document.createElement('tr');
      
      const waktu = item.timestamp.toDate();
      const waktuStr = waktu.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + '<br>' + waktu.toLocaleTimeString('id-ID');
      
      // Tentukan kelas status
      let statusClass = 's-bad';
      if (item.status === 'Tepat Waktu') statusClass = 's-good';
      if (item.status === 'Terlambat') statusClass = 's-warn';
      if (item.status === 'Izin') statusClass = 's-bad';
      
      row.innerHTML = `
        <td>${waktuStr}</td>
        <td>${item.userName}</td>
        <td>${item.jenis.charAt(0).toUpperCase() + item.jenis.slice(1)}</td>
        <td><span class="status ${statusClass}">${item.status}</span></td>
        <td>${item.location.latitude.toFixed(4)}, ${item.location.longitude.toFixed(4)}</td>
        <td><a href="${item.imageUrl}" target="_blank">Lihat Foto</a></td>
      `;
      
      tableBody.appendChild(row);
    });
    
    if (data.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
    }
  } catch (error) {
    console.error("Error loading attendance data:", error);
    showToast("Gagal memuat data presensi", "error");
  }
};

// Jalankan inisialisasi aplikasi saat DOM siap
document.addEventListener('DOMContentLoaded', initApp);