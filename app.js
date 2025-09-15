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

// UID Admin dan Karyawan
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

// Format tanggal Indonesia
const formatTanggal = (timestamp) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
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

// Format waktu saja
const formatWaktu = (timestamp) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return date.toLocaleTimeString('id-ID');
};

// Deteksi status presensi berdasarkan waktu
const getStatusPresensi = (jenis, waktu) => {
  if (!waktu) return { status: 'Tidak Valid', kelas: 's-bad' };
  
  const now = waktu.toDate();
  const hari = now.getDay(); // 0 = Minggu, 1 = Senin, dst
  const jam = now.getHours();
  const menit = now.getMinutes();
  
  // Hari Minggu libur
  if (hari === 0) {
    return { status: 'Libur', kelas: 's-bad' };
  }
  
  // Shift pagi: berangkat 05.30–06.00, pulang 10.00–11.00
  // Shift sore: berangkat 14.00-14.30, pulang 17.30-18.00
  if (jenis === 'berangkat') {
    // Cek shift pagi
    if ((jam === 5 && menit >= 30) || (jam === 6 && menit <= 0)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    } 
    // Cek shift sore
    else if ((jam === 14 && menit >= 0 && menit <= 30) || (jam === 14 && menit <= 30)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    }
    // Terlambat (≤ 20 menit)
    else if (
      (jam === 6 && menit <= 20) || // shift pagi
      (jam === 14 && menit <= 50)   // shift sore
    ) {
      return { status: 'Terlambat', kelas: 's-warn' };
    }
    // Di luar sesi
    else {
      return { status: 'Di Luar Sesi', kelas: 's-bad' };
    }
  } 
  else if (jenis === 'pulang') {
    // Cek shift pagi
    if ((jam === 10 && menit >= 0) || (jam === 11 && menit <= 0)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    } 
    // Cek shift sore
    else if ((jam === 17 && menit >= 30) || (jam === 18 && menit <= 0)) {
      return { status: 'Tepat Waktu', kelas: 's-good' };
    }
    // Terlambat (≤ 20 menit)
    else if (
      (jam === 11 && menit <= 20) || // shift pagi
      (jam === 18 && menit <= 20)    // shift sore
    ) {
      return { status: 'Terlambat', kelas: 's-warn' };
    }
    // Di luar sesi
    else {
      return { status: 'Di Luar Sesi', kelas: 's-bad' };
    }
  }
  
  return { status: 'Tidak Valid', kelas: 's-bad' };
};

// Kompres gambar sebelum upload ke Cloudinary
const kompresGambar = (file, maxSizeKB = 10) => {
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
        ctx.drawImage(img, 0, 0, width, height);
        
        // Kompres dengan kualitas sesuai untuk mencapai ~10KB
        let quality = 0.8;
        let compressedDataUrl;
        
        do {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          quality -= 0.1;
        } while (quality > 0.1 && compressedDataUrl.length > maxSizeKB * 1024);
        
        // Konversi data URL ke blob
        fetch(compressedDataUrl)
          .then(res => res.blob())
          .then(blob => resolve(blob))
          .catch(err => reject(err));
      };
    };
    reader.onerror = error => reject(error);
  });
};

// Upload gambar ke Cloudinary
const uploadKeCloudinary = (file) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Kompres gambar terlebih dahulu
      const compressedFile = await kompresGambar(file);
      
      const formData = new FormData();
      formData.append('file', compressedFile);
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
          reject(new Error('Upload gagal'));
        }
      })
      .catch(error => reject(error));
    } catch (error) {
      reject(error);
    }
  });
};

// Fungsi untuk mendapatkan waktu server dari Firestore
const getWaktuServer = async () => {
  try {
    const docRef = db.collection('serverTime').doc('current');
    const doc = await docRef.get();
    
    if (doc.exists) {
      return doc.data().timestamp;
    } else {
      // Jika belum ada, buat timestamp baru
      const timestamp = firebase.firestore.FieldValue.serverTimestamp();
      await docRef.set({ timestamp });
      return timestamp;
    }
  } catch (error) {
    console.error('Error mendapatkan waktu server:', error);
    return firebase.firestore.Timestamp.now();
  }
};

// Fungsi untuk memeriksa apakah sudah presensi hari ini
const sudahPresensiHariIni = async (uid, jenis) => {
  try {
    const sekarang = new Date();
    const awalHari = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate());
    const akhirHari = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() + 1);
    
    const querySnapshot = await db.collection('presensi')
      .where('uid', '==', uid)
      .where('jenis', '==', jenis)
      .where('waktu', '>=', awalHari)
      .where('waktu', '<=', akhirHari)
      .get();
      
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error memeriksa presensi:', error);
    return false;
  }
};

// Fungsi untuk mendapatkan koordinat geolokasi
const dapatkanKoordinat = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolokasi tidak didukung'));
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
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  });
};

// Fungsi untuk memuat riwayat presensi
const muatRiwayatPresensi = async (uid, limit = 20) => {
  try {
    let query = db.collection('presensi')
      .orderBy('waktu', 'desc');
    
    // Jika bukan admin, filter berdasarkan UID
    if (uid && !ADMIN_UIDS.includes(uid)) {
      query = query.where('uid', '==', uid);
    }
    
    // Terapkan limit jika bukan "all"
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }
    
    const snapshot = await query.get();
    const riwayat = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      riwayat.push({
        id: doc.id,
        ...data,
        statusObj: getStatusPresensi(data.jenis, data.waktu)
      });
    });
    
    return riwayat;
  } catch (error) {
    console.error('Error memuat riwayat presensi:', error);
    return [];
  }
};

// Fungsi untuk memuat notifikasi
const muatNotifikasi = async (uid, role) => {
  try {
    let query = db.collection('notifikasi')
      .orderBy('waktu', 'desc')
      .limit(20);
    
    // Admin melihat notifikasi untuk admin
    if (role === 'admin') {
      query = query.where('targetRole', '==', 'admin');
    } 
    // Karyawan melihat notifikasi untuk UID mereka
    else {
      query = query.where('targetUID', '==', uid);
    }
    
    const snapshot = await query.get();
    const notifikasi = [];
    
    snapshot.forEach(doc => {
      notifikasi.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return notifikasi;
  } catch (error) {
    console.error('Error memuat notifikasi:', error);
    return [];
  }
};

// Fungsi untuk membuat notifikasi
const buatNotifikasi = (data) => {
  return db.collection('notifikasi').add({
    ...data,
    waktu: firebase.firestore.FieldValue.serverTimestamp(),
    dibaca: false
  });
};

// Fungsi untuk menandai notifikasi sebagai telah dibaca
const tandaiNotifikasiDibaca = (notifId) => {
  return db.collection('notifikasi').doc(notifId).update({
    dibaca: true
  });
};

// Fungsi untuk menghapus notifikasi
const hapusNotifikasi = (notifId) => {
  return db.collection('notifikasi').doc(notifId).delete();
};

// Fungsi untuk mengajukan cuti
const ajukanCuti = (data) => {
  return db.collection('cuti').add({
    ...data,
    status: 'pending',
    waktuAjukan: firebase.firestore.FieldValue.serverTimestamp()
  });
};

// Fungsi untuk memproses cuti (admin)
const prosesCuti = (cutiId, status, adminUid) => {
  return db.collection('cuti').doc(cutiId).update({
    status,
    waktuProses: firebase.firestore.FieldValue.serverTimestamp(),
    adminUid
  });
};

// Fungsi untuk membuat entri presensi dari cuti
const buatEntriDariCuti = (cutiData) => {
  return db.collection('presensi').add({
    uid: cutiData.uid,
    nama: cutiData.nama,
    jenis: 'cuti',
    status: cutiData.jenis,
    waktu: cutiData.tanggal, // tanggal cuti yang dipilih
    koordinat: { lat: 0, lng: 0 },
    selfie: '',
    dariCuti: true
  });
};

// Fungsi untuk ekspor data ke CSV
const eksporKeCSV = (data, filename) => {
  // Format data sesuai STDR
  const formattedData = formatDataSTDR(data);
  
  // Buat header CSV
  const headers = ['Nama', 'Tanggal', 'Jam', 'Jenis', 'Status', 'Koordinat'];
  let csv = headers.join(',') + '\n';
  
  // Tambahkan data
  formattedData.forEach(blok => {
    blok.entries.forEach(entry => {
      const row = [
        `"${blok.nama}"`,
        `"${entry.tanggal}"`,
        `"${entry.jam}"`,
        `"${entry.jenis}"`,
        `"${entry.status}"`,
        `"${entry.koordinat}"`
      ];
      csv += row.join(',') + '\n';
    });
    csv += '\n'; // Baris kosong antar blok
  });
  
  // Buat file dan unduh
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Format data sesuai STDR (Standar)
const formatDataSTDR = (data) => {
  // Kelompokkan data berdasarkan nama karyawan
  const groupedByNama = {};
  
  data.forEach(item => {
    if (!groupedByNama[item.nama]) {
      groupedByNama[item.nama] = [];
    }
    groupedByNama[item.nama].push(item);
  });
  
  // Urutkan nama A-Z
  const sortedNames = Object.keys(groupedByNama).sort();
  
  // Format setiap blok
  const result = [];
  
  sortedNames.forEach(nama => {
    // Urutkan entri berdasarkan tanggal
    const entries = groupedByNama[nama]
      .sort((a, b) => a.waktu - b.waktu)
      .map(entry => {
        const date = entry.waktu.toDate();
        return {
          tanggal: date.toLocaleDateString('id-ID'),
          jam: date.toLocaleTimeString('id-ID'),
          jenis: entry.jenis,
          status: entry.statusObj.status,
          koordinat: `${entry.koordinat.lat}, ${entry.koordinat.lng}`
        };
      });
    
    result.push({
      nama,
      entries
    });
  });
  
  return result;
};

// Fungsi untuk memuat daftar karyawan (admin)
const muatDaftarKaryawan = async () => {
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'karyawan')
      .get();
    
    const karyawan = [];
    snapshot.forEach(doc => {
      karyawan.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return karyawan;
  } catch (error) {
    console.error('Error memuat daftar karyawan:', error);
    return [];
  }
};

// Fungsi untuk membuat akun karyawan baru (admin)
const buatAkunKaryawan = async (email, password, data) => {
  try {
    // Buat user di Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Simpan data tambahan di Firestore
    await db.collection('users').doc(user.uid).set({
      email,
      nama: data.nama,
      alamat: data.alamat,
      role: 'karyawan',
      fotoProfil: data.fotoProfil || '',
      dibuatPada: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return user;
  } catch (error) {
    console.error('Error membuat akun karyawan:', error);
    throw error;
  }
};

// Fungsi untuk update profil pengguna
const updateProfil = async (uid, data) => {
  try {
    await db.collection('users').doc(uid).update(data);
    return true;
  } catch (error) {
    console.error('Error update profil:', error);
    throw error;
  }
};

// Fungsi untuk upload foto profil ke Cloudinary
const uploadFotoProfil = async (file, uid) => {
  try {
    const url = await uploadKeCloudinary(file);
    await db.collection('users').doc(uid).update({
      fotoProfil: url
    });
    return url;
  } catch (error) {
    console.error('Error upload foto profil:', error);
    throw error;
  }
};

// Inisialisasi kamera
const initKamera = async (videoElement, canvasElement) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    
    videoElement.srcObject = stream;
    
    return {
      stream,
      ambilFoto: () => {
        const context = canvasElement.getContext('2d');
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        
        return new Promise((resolve) => {
          canvasElement.toBlob(resolve, 'image/jpeg', 0.8);
        });
      },
      stop: () => {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  } catch (error) {
    console.error('Error mengakses kamera:', error);
    throw error;
  }
};

// Fungsi untuk memeriksa dan menampilkan dialog install PWA
const initPWA = () => {
  let deferredPrompt;
  const installBtn = document.getElementById('installBtn');
  
  if (!installBtn) return;
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'block';
    
    installBtn.addEventListener('click', () => {
      installBtn.style.display = 'none';
      deferredPrompt.prompt();
      
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User menerima install');
        } else {
          console.log('User menolak install');
        }
        deferredPrompt = null;
      });
    });
  });
};

// Fungsi untuk logout
const logout = () => {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  }).catch(error => {
    console.error('Error logout:', error);
    showToast('Gagal logout', 'error');
  });
};

// Inisialisasi umum untuk semua halaman
document.addEventListener('DOMContentLoaded', function() {
  // Inisialisasi PWA
  initPWA();
  
  // Cek status auth
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // Jika tidak login, redirect ke index.html
      if (!window.location.pathname.endsWith('index.html')) {
        window.location.href = 'index.html';
      }
      return;
    }
    
    // Jika sudah login, pastikan di halaman yang sesuai
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const role = userData.role;
      
      // Redirect ke halaman yang sesuai berdasarkan role
      if (role === 'admin' && !window.location.pathname.endsWith('admin.html')) {
        window.location.href = 'admin.html';
      } else if (role === 'karyawan' && !window.location.pathname.endsWith('karyawan.html')) {
        window.location.href = 'karyawan.html';
      }
      
      // Jika data user baru kosong, tampilkan popup
      if ((!userData.nama || !userData.alamat) && !sessionStorage.getItem('profileUpdated')) {
        tampilkanPopupUpdateProfil(user.uid);
      }
    }
  });
});

// Tampilkan popup update profil jika data belum lengkap
const tampilkanPopupUpdateProfil = (uid) => {
  // Implementasi popup update profil
  const popup = document.createElement('div');
  popup.innerHTML = `
    <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:1000;">
      <div style="background:white; padding:20px; border-radius:10px; width:90%; max-width:400px;">
        <h3>Lengkapi Profil Anda</h3>
        <p>Silakan lengkapi data profil Anda sebelum menggunakan aplikasi.</p>
        <div style="margin-bottom:10px;">
          <input type="text" id="popupNama" placeholder="Nama lengkap" style="width:100%; padding:8px; margin-bottom:10px;">
          <input type="text" id="popupAlamat" placeholder="Alamat" style="width:100%; padding:8px;">
        </div>
        <button id="simpanProfilBtn" style="background:#FFB300; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer;">Simpan</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  document.getElementById('simpanProfilBtn').addEventListener('click', async () => {
    const nama = document.getElementById('popupNama').value;
    const alamat = document.getElementById('popupAlamat').value;
    
    if (!nama || !alamat) {
      showToast('Harap isi semua field', 'error');
      return;
    }
    
    try {
      await updateProfil(uid, { nama, alamat });
      sessionStorage.setItem('profileUpdated', 'true');
      popup.remove();
      showToast('Profil berhasil diperbarui', 'success');
    } catch (error) {
      console.error('Error update profil:', error);
      showToast('Gagal update profil', 'error');
    }
  });
};