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

// Variabel global
let currentUser = null;
let userData = null;
let stream = null;
let currentPhoto = null;
let hasPresencedToday = {};

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const showToast = (message, type = 'info') => {
  const toast = $("#toast");
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
const getServerTimestamp = async () => {
  try {
    const docRef = db.collection('serverTime').doc('current');
    await docRef.set({ timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    const doc = await docRef.get();
    return doc.exists ? doc.data().timestamp.toDate() : new Date();
  } catch (error) {
    console.error("Error getting server timestamp:", error);
    return new Date();
  }
};

// Fungsi untuk menentukan shift berdasarkan waktu
const getShiftFromTime = (time) => {
  const hour = time.getHours();
  return (hour >= 5 && hour < 12) ? 'pagi' : 'sore';
};

// Fungsi untuk menentukan status presensi
const getPresenceStatus = (time, jenis) => {
  const day = time.getDay();
  if (day === 0) return 'Libur'; // Minggu
  
  const hour = time.getHours();
  const minutes = time.getMinutes();
  const totalMinutes = hour * 60 + minutes;
  
  // Aturan waktu default
  if (jenis === 'izin') return 'Izin';
  
  if (jenis === 'berangkat') {
    if (getShiftFromTime(time) === 'pagi') {
      if (totalMinutes >= 330 && totalMinutes <= 360) return 'Tepat Waktu'; // 05:30-06:00
      if (totalMinutes > 360 && totalMinutes <= 380) return 'Terlambat'; // hingga 06:20
    } else {
      if (totalMinutes >= 840 && totalMinutes <= 870) return 'Tepat Waktu'; // 14:00-14:30
      if (totalMinutes > 870 && totalMinutes <= 890) return 'Terlambat'; // hingga 14:50
    }
  }
  
  if (jenis === 'pulang') {
    if (getShiftFromTime(time) === 'pagi') {
      if (totalMinutes >= 600 && totalMinutes <= 660) return 'Tepat Waktu'; // 10:00-11:00
      if (totalMinutes > 660 && totalMinutes <= 680) return 'Terlambat'; // hingga 11:20
    } else {
      if (totalMinutes >= 1050 && totalMinutes <= 1110) return 'Tepat Waktu'; // 17:30-18:30
      if (totalMinutes > 1110 && totalMinutes <= 1130) return 'Terlambat'; // hingga 18:50
    }
  }
  
  return 'Di luar sesi presensi';
};

// Fungsi untuk memeriksa apakah sudah melakukan presensi hari ini
const checkIfAlreadyPresenced = async (userId, jenis) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const querySnapshot = await db.collection('presensi')
      .where('uid', '==', userId)
      .where('waktu', '>=', startOfDay)
      .where('jenis', '==', jenis)
      .get();
    
    return !querySnapshot.empty;
  } catch (error) {
    console.error("Error checking presence:", error);
    return false;
  }
};

// Fungsi untuk mengompres gambar
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
        
        // Konversi ke blob dengan kualitas 0.6 (bisa disesuaikan)
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
        }, 'image/jpeg', 0.6);
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
    formData.append('cloud_name', 'da7idhh4f');
    
    const response = await fetch('https://api.cloudinary.com/v1_1/da7idhh4f/image/upload', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    throw error;
  }
};

// Fungsi untuk mendapatkan lokasi pengguna
const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
};

// Fungsi untuk memulai kamera
const startCamera = async () => {
  try {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    
    const videoElement = $('#cameraPreview');
    if (videoElement) {
      videoElement.srcObject = stream;
      videoElement.style.display = 'block';
      $('#cameraPlaceholder').style.display = 'none';
    }
  } catch (error) {
    console.error("Error accessing camera:", error);
    showToast("Tidak dapat mengakses kamera", "error");
  }
};

// Fungsi untuk mengambil foto
const takePhoto = () => {
  const video = $('#cameraPreview');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const photoDataUrl = canvas.toDataURL('image/jpeg');
  $('#photoPreview').src = photoDataUrl;
  $('#photoPreview').style.display = 'block';
  $('#cameraPreview').style.display = 'none';
  
  // Konversi data URL ke blob
  fetch(photoDataUrl)
    .then(res => res.blob())
    .then(blob => {
      currentPhoto = blob;
    });
  
  return photoDataUrl;
};

// Fungsi untuk menyimpan data presensi
const savePresence = async (jenis) => {
  try {
    const userId = currentUser.uid;
    const alreadyPresenced = await checkIfAlreadyPresenced(userId, jenis);
    
    if (alreadyPresenced) {
      showToast(`Anda sudah melakukan presensi ${jenis} hari ini`, "warning");
      return false;
    }
    
    // Dapatkan waktu server
    const serverTime = await getServerTimestamp();
    
    // Dapatkan lokasi
    const location = await getCurrentLocation();
    const locationStr = `${location.lat}, ${location.lng}`;
    
    // Tentukan status
    const status = getPresenceStatus(serverTime, jenis);
    
    // Tentukan shift
    const shift = getShiftFromTime(serverTime);
    
    // Kompres dan upload foto
    if (!currentPhoto) {
      showToast("Ambil foto terlebih dahulu", "error");
      return false;
    }
    
    const compressedPhoto = await compressImage(currentPhoto);
    const photoUrl = await uploadToCloudinary(compressedPhoto);
    
    // Simpan ke Firestore
    await db.collection('presensi').add({
      uid: userId,
      nama: userData.nama,
      waktu: serverTime,
      jenis: jenis,
      status: status,
      shift: shift,
      koordinat: locationStr,
      selfie: photoUrl
    });
    
    showToast(`Presensi ${jenis} berhasil dicatat`, "success");
    return true;
  } catch (error) {
    console.error("Error saving presence:", error);
    showToast("Gagal menyimpan presensi", "error");
    return false;
  }
};

// Fungsi untuk memuat riwayat presensi
const loadPresenceHistory = async (filters = {}) => {
  try {
    let query = db.collection('presensi').orderBy('waktu', 'desc');
    
    // Terapkan filter
    if (filters.nama) {
      query = query.where('nama', '==', filters.nama);
    }
    
    if (filters.startDate && filters.endDate) {
      query = query.where('waktu', '>=', filters.startDate)
                  .where('waktu', '<=', filters.endDate);
    }
    
    const querySnapshot = await query.get();
    const presenceData = [];
    
    querySnapshot.forEach((doc) => {
      presenceData.push({ id: doc.id, ...doc.data() });
    });
    
    return presenceData;
  } catch (error) {
    console.error("Error loading presence history:", error);
    showToast("Gagal memuat riwayat presensi", "error");
    return [];
  }
};

// Fungsi untuk mengekspor data ke CSV
const exportToCSV = (data, filename = 'presensi.csv') => {
  if (data.length === 0) {
    showToast("Tidak ada data untuk diekspor", "warning");
    return;
  }
  
  // Urutkan data berdasarkan nama dan waktu
  const sortedData = data.sort((a, b) => {
    if (a.nama < b.nama) return -1;
    if (a.nama > b.nama) return 1;
    return a.waktu - b.waktu;
  });
  
  // Format data untuk CSV
  let csvContent = "Nama,Waktu,Shift,Jenis,Status,Koordinat\n";
  
  sortedData.forEach((item) => {
    const waktu = item.waktu.toDate ? item.waktu.toDate() : new Date(item.waktu);
    const waktuStr = waktu.toLocaleString('id-ID');
    
    csvContent += `"${item.nama}",${waktuStr},${item.shift},${item.jenis},${item.status},"${item.koordinat}"\n`;
  });
  
  // Buat blob dan unduh
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Fungsi untuk memuat dan menampilkan profil pengguna
const loadUserProfile = async () => {
  try {
    if (!currentUser) return;
    
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    
    if (userDoc.exists) {
      userData = userDoc.data();
      
      // Isi form profil jika ada
      if ($('#nama')) $('#nama').value = userData.nama || '';
      if ($('#alamat')) $('#alamat').value = userData.alamat || '';
      if ($('#pfp')) {
        $('#pfp').src = userData.photoURL || 
          `https://api.dicebear.com/7.x/initials/svg?seed=${userData.nama || 'User'}&backgroundColor=ffb300,ffd54f&radius=20`;
      }
      
      // Periksa apakah profil sudah lengkap
      if ((!userData.nama || !userData.alamat) && $('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    } else {
      // Buat dokumen pengguna baru jika belum ada
      await db.collection('users').doc(currentUser.uid).set({
        email: currentUser.email,
        nama: '',
        alamat: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Tampilkan dialog profil untuk melengkapi data
      if ($('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
  }
};

// Fungsi untuk menyimpan profil pengguna
const saveUserProfile = async () => {
  try {
    const nama = $('#nama').value.trim();
    const alamat = $('#alamat').value.trim();
    const fileInput = $('#pfpFile');
    
    if (!nama || !alamat) {
      showToast("Nama dan alamat harus diisi", "error");
      return;
    }
    
    let photoURL = userData?.photoURL || '';
    
    // Upload foto profil jika ada
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const compressedFile = await compressImage(file, 20);
      photoURL = await uploadToCloudinary(compressedFile);
    }
    
    // Simpan ke Firestore
    await db.collection('users').doc(currentUser.uid).update({
      nama: nama,
      alamat: alamat,
      photoURL: photoURL,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    userData = { ...userData, nama, alamat, photoURL };
    
    // Perbarui foto profil jika ada
    if ($('#pfp') && photoURL) {
      $('#pfp').src = photoURL;
    }
    
    showToast("Profil berhasil disimpan", "success");
    $('#profileDlg').close();
  } catch (error) {
    console.error("Error saving user profile:", error);
    showToast("Gagal menyimpan profil", "error");
  }
};

// Fungsi untuk logout
const logout = async () => {
  try {
    // Hentikan kamera jika sedang berjalan
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    await auth.signOut();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error signing out:", error);
  }
};

// Fungsi untuk memeriksa status auth dan role
const checkAuthState = () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      
      // Dapatkan data pengguna dari Firestore
      await loadUserProfile();
      
      // Perbarui UI berdasarkan halaman
      if (window.location.pathname.includes('karyawan.html')) {
        initKaryawanPage();
      } else if (window.location.pathname.includes('admin.html')) {
        initAdminPage();
      }
    } else {
      // Redirect ke halaman login jika belum login
      if (!window.location.pathname.includes('index.html')) {
        window.location.href = "index.html";
      }
    }
  });
};

// Inisialisasi halaman karyawan
const initKaryawanPage = async () => {
  // Mulai kamera
  await startCamera();
  
  // Perbarui waktu server secara real-time
  const updateServerTime = async () => {
    const serverTime = await getServerTimestamp();
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
    
    if ($('#serverTime')) {
      $('#serverTime').textContent = serverTime.toLocaleDateString('id-ID', options);
    }
    
    // Perbarui status presensi
    if ($('#statusText')) {
      const jenis = $('#jenis').value;
      const status = getPresenceStatus(serverTime, jenis);
      
      $('#statusText').textContent = status;
      
      // Ubah warna status berdasarkan kondisi
      const statusChip = $('#statusChip');
      statusChip.className = 'status ';
      
      if (status === 'Tepat Waktu') {
        statusChip.classList.add('s-good');
      } else if (status === 'Terlambat' || status === 'Izin') {
        statusChip.classList.add('s-warn');
      } else if (status === 'Di luar sesi presensi') {
        statusChip.classList.add('s-bad');
      } else {
        statusChip.classList.add('s-good'); // Libur
      }
    }
    
    // Perbarui shift
    if ($('#shiftText')) {
      $('#shiftText').textContent = getShiftFromTime(serverTime);
    }
  };
  
  // Perbarui waktu setiap detik
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Dapatkan lokasi pengguna
  try {
    const location = await getCurrentLocation();
    if ($('#locText')) {
      $('#locText').textContent = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
    }
  } catch (error) {
    console.error("Error getting location:", error);
    if ($('#locText')) {
      $('#locText').textContent = "Tidak dapat mengakses lokasi";
    }
  }
  
  // Event listener untuk tombol ambil foto
  if ($('#snapBtn')) {
    $('#snapBtn').addEventListener('click', () => {
      takePhoto();
      $('#uploadBtn').disabled = false;
    });
  }
  
  // Event listener untuk tombol upload
  if ($('#uploadBtn')) {
    $('#uploadBtn').addEventListener('click', async () => {
      $('#uploadBtn').disabled = true;
      $('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
      
      const jenis = $('#jenis').value;
      const success = await savePresence(jenis);
      
      if (success) {
        $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
        $('#photoPreview').style.display = 'none';
        $('#cameraPreview').style.display = 'block';
        $('#cameraPlaceholder').style.display = 'none';
        currentPhoto = null;
        
        // Mulai ulang kamera
        await startCamera();
      } else {
        $('#uploadBtn').disabled = false;
        $('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
      }
    });
  }
  
  // Event listener untuk perubahan jenis presensi
  if ($('#jenis')) {
    $('#jenis').addEventListener('change', async () => {
      const serverTime = await getServerTimestamp();
      const jenis = $('#jenis').value;
      const status = getPresenceStatus(serverTime, jenis);
      
      $('#statusText').textContent = status;
    });
  }
};

// Inisialisasi halaman admin
const initAdminPage = async () => {
  // Perbarui waktu server secara real-time
  const updateServerTime = async () => {
    const serverTime = await getServerTimestamp();
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
    
    if ($('#serverTime')) {
      $('#serverTime').textContent = serverTime.toLocaleDateString('id-ID', options);
    }
  };
  
  // Perbarui waktu setiap detik
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Muat data presensi
  const loadPresenceData = async (filters = {}) => {
    const data = await loadPresenceHistory(filters);
    
    if ($('#tableBody')) {
      $('#tableBody').innerHTML = '';
      
      if (data.length === 0) {
        $('#tableBody').innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
        return;
      }
      
      data.forEach(item => {
        const waktu = item.waktu.toDate ? item.waktu.toDate() : new Date(item.waktu);
        const waktuStr = waktu.toLocaleString('id-ID');
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${waktuStr}</td>
          <td>${item.nama}</td>
          <td>${item.jenis}</td>
          <td><span class="status ${item.status === 'Tepat Waktu' ? 's-good' : item.status === 'Terlambat' ? 's-warn' : 's-bad'}">${item.status}</span></td>
          <td>${item.koordinat}</td>
          <td><a href="${item.selfie}" target="_blank">Lihat Foto</a></td>
        `;
        
        $('#tableBody').appendChild(row);
      });
    }
  };
  
  // Muat data awal
  await loadPresenceData();
  
  // Event listener untuk filter
  if ($('#applyFilter')) {
    $('#applyFilter').addEventListener('click', async () => {
      const filters = {};
      
      // Filter nama
      if ($('#fNama') && $('#fNama').value) {
        filters.nama = $('#fNama').value;
      }
      
      // Filter periode
      if ($('#fPeriode') && $('#fPeriode').value) {
        const today = new Date();
        
        switch ($('#fPeriode').value) {
          case 'harian':
            filters.startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            filters.endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            break;
          case 'mingguan':
            const dayOfWeek = today.getDay();
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
            startOfWeek.setHours(0, 0, 0, 0);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 7);
            
            filters.startDate = startOfWeek;
            filters.endDate = endOfWeek;
            break;
          case 'bulanan':
            filters.startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            filters.endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            break;
          case 'tahunan':
            filters.startDate = new Date(today.getFullYear(), 0, 1);
            filters.endDate = new Date(today.getFullYear() + 1, 0, 1);
            break;
          case 'custom':
            if ($('#fDari') && $('#fSampai')) {
              filters.startDate = new Date($('#fDari').value);
              filters.endDate = new Date($('#fSampai').value);
              filters.endDate.setDate(filters.endDate.getDate() + 1); // Sampai akhir hari
            }
            break;
        }
      }
      
      await loadPresenceData(filters);
      showToast("Filter diterapkan", "success");
    });
  }
  
  // Event listener untuk ekspor CSV
  if ($('#exportCsv')) {
    $('#exportCsv').addEventListener('click', async () => {
      $('#exportCsv').disabled = true;
      $('#exportCsv').innerHTML = '<span class="spinner"></span> Mengekspor...';
      
      try {
        const data = await loadPresenceHistory();
        exportToCSV(data, `presensi_${new Date().toISOString().split('T')[0]}.csv`);
        showToast("CSV berhasil diekspor", "success");
      } catch (error) {
        console.error("Error exporting CSV:", error);
        showToast("Gagal mengekspor CSV", "error");
      } finally {
        $('#exportCsv').disabled = false;
        $('#exportCsv').innerHTML = '<span class="material-symbols-rounded">download</span> Ekspor CSV';
      }
    });
  }
  
  // Toggle custom date range
  if ($('#fPeriode')) {
    $('#fPeriode').addEventListener('change', () => {
      if ($('#customDateRange')) {
        $('#customDateRange').style.display = 
          $('#fPeriode').value === 'custom' ? 'flex' : 'none';
      }
    });
  }
};

// Event listener untuk halaman
document.addEventListener('DOMContentLoaded', () => {
  // Event listener untuk dialog profil
  if ($('#profileBtn')) {
    $('#profileBtn').addEventListener('click', () => {
      if ($('#profileDlg')) {
        $('#profileDlg').showModal();
      }
    });
  }
  
  // Event listener untuk simpan profil
  if ($('#saveProfileBtn')) {
    $('#saveProfileBtn').addEventListener('click', saveUserProfile);
  }
  
  // Event listener untuk logout
  if ($('#logoutBtn')) {
    $('#logoutBtn').addEventListener('click', logout);
  }
  
  // Event listener untuk upload foto profil
  if ($('#pfpFile')) {
    $('#pfpFile').addEventListener('change', (event) => {
      if (event.target.files.length > 0) {
        const file = event.target.files[0];
        const reader = new FileReader();
        
        reader.onload = (e) => {
          if ($('#pfp')) {
            $('#pfp').src = e.target.result;
          }
        };
        
        reader.readAsDataURL(file);
      }
    });
  }
  
  // Periksa status auth
  checkAuthState();
});