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
const storage = firebase.storage();

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

// Format tanggal singkat
const formatTanggalSingkat = (timestamp) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return date.toLocaleDateString('id-ID');
};

// Format jam
const formatJam = (timestamp) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return date.toLocaleTimeString('id-ID');
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
        
        // Kompres dengan kualitas yang disesuaikan untuk mencapai ~10KB
        let quality = 0.9;
        let compressedDataUrl;
        
        do {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          quality -= 0.1;
        } while (quality > 0.1 && compressedDataUrl.length > maxSizeKB * 1024 * 1.37); // 1.37 faktor konversi base64
        
        resolve(compressedDataUrl);
      };
    };
    reader.onerror = error => reject(error);
  });
};

// Upload gambar ke Cloudinary
const uploadKeCloudinary = (dataUrl) => {
  return new Promise((resolve, reject) => {
    // Data Cloudinary dari pedoman
    const cloudName = 'da7idhh4f';
    const uploadPreset = 'FupaSnack';
    
    // Konversi data URL ke blob
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', uploadPreset);
        
        return fetch(`https://api.cloudinary.com/v1_1/${cloudName}/upload`, {
          method: 'POST',
          body: formData
        });
      })
      .then(response => response.json())
      .then(data => {
        if (data.secure_url) {
          resolve(data.secure_url);
        } else {
          reject(new Error('Upload ke Cloudinary gagal'));
        }
      })
      .catch(error => reject(error));
  });
};

// Fungsi untuk mendapatkan status presensi berdasarkan waktu
const dapatkanStatusPresensi = (waktu, jenis) => {
  const now = waktu.toDate();
  const hari = now.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const jam = now.getHours();
  const menit = now.getMinutes();
  
  // Hari Minggu adalah libur
  if (hari === 0) return "Libur";
  
  // Tentukan status berdasarkan jenis presensi dan waktu
  if (jenis === "berangkat") {
    // Shift pagi: 05.30–06.00 WIB
    const waktuTepatAwal = 5 * 60 + 30; // 05:30 dalam menit
    const waktuTepatAkhir = 6 * 60;     // 06:00 dalam menit
    const waktuTerlambatAkhir = 6 * 60 + 20; // 06:20 dalam menit
    
    const totalMenit = jam * 60 + menit;
    
    if (totalMenit >= waktuTepatAwal && totalMenit <= waktuTepatAkhir) {
      return "Tepat Waktu";
    } else if (totalMenit > waktuTepatAkhir && totalMenit <= waktuTerlambatAkhir) {
      return "Terlambat";
    } else {
      return "Di luar sesi presensi";
    }
  } else if (jenis === "pulang") {
    // Shift pagi pulang: 10.00–11.00 WIB
    const waktuTepatAwal = 10 * 60;     // 10:00 dalam menit
    const waktuTepatAkhir = 11 * 60;    // 11:00 dalam menit
    const waktuTerlambatAkhir = 11 * 60 + 20; // 11:20 dalam menit
    
    const totalMenit = jam * 60 + menit;
    
    if (totalMenit >= waktuTepatAwal && totalMenit <= waktuTepatAkhir) {
      return "Tepat Waktu";
    } else if (totalMenit > waktuTepatAkhir && totalMenit <= waktuTerlambatAkhir) {
      return "Terlambat";
    } else {
      return "Di luar sesi presensi";
    }
  }
  
  return "Tidak Valid";
};

// Fungsi untuk mengecek apakah hari ini adalah waktu presensi
const cekWaktuPresensi = () => {
  const now = new Date();
  const hari = now.getDay();
  const jam = now.getHours();
  const menit = now.getMinutes();
  const totalMenit = jam * 60 + menit;
  
  // Hari Minggu adalah libur
  if (hari === 0) return { status: "Libur", sesi: null };
  
  // Cek sesi berangkat pagi: 05.30–06.20 WIB
  const berangkatAwal = 5 * 60 + 30; // 05:30
  const berangkatAkhir = 6 * 60 + 20; // 06:20
  
  // Cek sesi pulang pagi: 10.00–11.20 WIB
  const pulangAwal = 10 * 60;     // 10:00
  const pulangAkhir = 11 * 60 + 20; // 11:20
  
  if (totalMenit >= berangkatAwal && totalMenit <= berangkatAkhir) {
    return { status: "Tepat Waktu", sesi: "berangkat" };
  } else if (totalMenit >= pulangAwal && totalMenit <= pulangAkhir) {
    return { status: "Tepat Waktu", sesi: "pulang" };
  } else if (totalMenit > berangkatAkhir && totalMenit < pulangAwal) {
    return { status: "Di luar sesi presensi", sesi: null };
  } else if (totalMenit > pulangAkhir) {
    return { status: "Di luar sesi presensi", sesi: null };
  } else {
    return { status: "Belum waktu presensi", sesi: null };
  }
};

// Fungsi untuk mengekspor data ke CSV
const eksporKeCSV = (data, namaFile) => {
  // Format data sesuai STDR
  const dataTertata = [];
  const karyawanMap = new Map();
  
  // Kelompokkan data berdasarkan nama karyawan
  data.forEach(item => {
    if (!karyawanMap.has(item.nama)) {
      karyawanMap.set(item.nama, []);
    }
    karyawanMap.get(item.nama).push(item);
  });
  
  // Urutkan nama karyawan secara alfabetis
  const namaTerurut = Array.from(karyawanMap.keys()).sort();
  
  // Format data untuk setiap karyawan
  namaTerurut.forEach(nama => {
    const presensiKaryawan = karyawanMap.get(nama);
    
    // Urutkan presensi berdasarkan tanggal
    presensiKaryawan.sort((a, b) => a.waktu.seconds - b.waktu.seconds);
    
    // Tambahkan ke data tertata
    presensiKaryawan.forEach(item => {
      dataTertata.push({
        Nama: item.nama,
        Tanggal: formatTanggalSingkat(item.waktu),
        Jam: formatJam(item.waktu),
        Jenis: item.jenis === 'berangkat' ? 'Berangkat' : 'Pulang',
        Status: item.status,
        Koordinat: item.koordinat || '-',
        'URL Selfie': item.selfie || '-'
      });
    });
    
    // Tambahkan baris kosong antar karyawan
    dataTertata.push({});
  });
  
  // Konversi ke CSV
  const header = Object.keys(dataTertata[0]).join(',');
  const rows = dataTertata.map(item => 
    Object.values(item).map(value => 
      typeof value === 'string' && value.includes(',') ? `"${value}"` : value
    ).join(',')
  );
  
  const csvContent = [header, ...rows].join('\n');
  
  // Buat blob dan unduh
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${namaFile}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Fungsi untuk memuat data user
const muatDataUser = async (uid) => {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      return userDoc.data();
    } else {
      // Buat dokumen user baru jika tidak ada
      const userData = {
        nama: '',
        alamat: '',
        foto: `https://api.dicebear.com/7.x/initials/svg?seed=User&backgroundColor=ffb300,ffd54f&radius=20`,
        role: ADMIN_UIDS.includes(uid) ? 'admin' : 'karyawan',
        dibuat: firebase.firestore.FieldValue.serverTimestamp(),
        diupdate: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('users').doc(uid).set(userData);
      return userData;
    }
  } catch (error) {
    console.error('Error memuat data user:', error);
    showToast('Gagal memuat data profil', 'error');
    return null;
  }
};

// Fungsi untuk memperbarui data user
const perbaruiDataUser = async (uid, data) => {
  try {
    await db.collection('users').doc(uid).update({
      ...data,
      diupdate: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error memperbarui data user:', error);
    showToast('Gagal menyimpan profil', 'error');
    return false;
  }
};

// Fungsi untuk memuat riwayat presensi
const muatRiwayatPresensi = async (uid, filter = { limit: 20 }) => {
  try {
    let query = db.collection('presensi');
    
    // Jika bukan admin, filter berdasarkan UID
    const userData = await muatDataUser(uid);
    if (userData.role !== 'admin') {
      query = query.where('uid', '==', uid);
    }
    
    // Terapkan filter lainnya
    if (filter.nama) {
      query = query.where('nama', '==', filter.nama);
    }
    
    if (filter.periode && filter.periode !== 'harian') {
      const now = new Date();
      let startDate;
      
      switch (filter.periode) {
        case 'mingguan':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          break;
        case 'bulanan':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'tahunan':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case 'custom':
          if (filter.dari && filter.sampai) {
            startDate = new Date(filter.dari);
            const endDate = new Date(filter.sampai);
            query = query.where('waktu', '>=', startDate)
                         .where('waktu', '<=', endDate);
          }
          break;
      }
      
      if (filter.periode !== 'custom' && startDate) {
        query = query.where('waktu', '>=', startDate);
      }
    }
    
    // Urutkan berdasarkan waktu terbaru dan batasi hasil
    query = query.orderBy('waktu', 'desc');
    
    if (filter.limit && filter.limit !== 'all') {
      query = query.limit(parseInt(filter.limit));
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error memuat riwayat presensi:', error);
    showToast('Gagal memuat riwayat presensi', 'error');
    return [];
  }
};

// Fungsi untuk memuat notifikasi
const muatNotifikasi = async (uid) => {
  try {
    const userData = await muatDataUser(uid);
    let query = db.collection('notifikasi');
    
    if (userData.role === 'admin') {
      // Admin melihat semua notifikasi cuti
      query = query.where('tipe', '==', 'cuti');
    } else {
      // Karyawan melihat notifikasi untuk UID mereka atau untuk semua
      query = query.where('targetUID', 'in', [uid, 'all']);
    }
    
    query = query.orderBy('waktu', 'desc').limit(50);
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error memuat notifikasi:', error);
    showToast('Gagal memuat notifikasi', 'error');
    return [];
  }
};

// Fungsi untuk membuat notifikasi
const buatNotifikasi = async (data) => {
  try {
    await db.collection('notifikasi').add({
      ...data,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      dibaca: false
    });
    return true;
  } catch (error) {
    console.error('Error membuat notifikasi:', error);
    showToast('Gagal membuat notifikasi', 'error');
    return false;
  }
};

// Fungsi untuk menghapus notifikasi
const hapusNotifikasi = async (id) => {
  try {
    await db.collection('notifikasi').doc(id).delete();
    return true;
  } catch (error) {
    console.error('Error menghapus notifikasi:', error);
    showToast('Gagal menghapus notifikasi', 'error');
    return false;
  }
};

// Fungsi untuk menandai notifikasi sebagai sudah dibaca
const tandaiNotifikasiDibaca = async (id) => {
  try {
    await db.collection('notifikasi').doc(id).update({
      dibaca: true
    });
    return true;
  } catch (error) {
    console.error('Error menandai notifikasi:', error);
    return false;
  }
};

// Fungsi untuk membuat presensi
const buatPresensi = async (data) => {
  try {
    const waktuSekarang = firebase.firestore.FieldValue.serverTimestamp();
    const status = dapatkanStatusPresensi(waktuSekarang, data.jenis);
    
    await db.collection('presensi').add({
      ...data,
      waktu: waktuSekarang,
      status: status
    });
    
    // Buat notifikasi untuk user
    await buatNotifikasi({
      tipe: 'presensi',
      targetUID: data.uid,
      judul: 'Presensi Berhasil',
      isi: `Presensi ${data.jenis} Anda pada ${formatTanggal(waktuSekarang)} berstatus ${status}`,
      targetRole: 'karyawan'
    });
    
    return true;
  } catch (error) {
    console.error('Error membuat presensi:', error);
    showToast('Gagal membuat presensi', 'error');
    return false;
  }
};

// Fungsi untuk mengajukan cuti
const ajukanCuti = async (data) => {
  try {
    const cutiRef = await db.collection('cuti').add({
      ...data,
      status: 'pending',
      diajukan: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Buat notifikasi untuk admin
    await buatNotifikasi({
      tipe: 'cuti',
      targetUID: 'all',
      targetRole: 'admin',
      judul: 'Pengajuan Cuti',
      isi: `${data.nama} mengajukan cuti ${data.jenis} pada ${formatTanggalSingkat(data.tanggal)}`,
      data: { cutiId: cutiRef.id, uid: data.uid }
    });
    
    return true;
  } catch (error) {
    console.error('Error mengajukan cuti:', error);
    showToast('Gagal mengajukan cuti', 'error');
    return false;
  }
};

// Fungsi untuk memproses cuti (approve/reject)
const prosesCuti = async (cutiId, status, adminUid, adminNama) => {
  try {
    const cutiDoc = await db.collection('cuti').doc(cutiId).get();
    if (!cutiDoc.exists) {
      showToast('Data cuti tidak ditemukan', 'error');
      return false;
    }
    
    const cutiData = cutiDoc.data();
    
    // Update status cuti
    await db.collection('cuti').doc(cutiId).update({
      status: status,
      diproses: firebase.firestore.FieldValue.serverTimestamp(),
      diprosesOleh: adminUid
    });
    
    // Jika disetujui, buat entri presensi
    if (status === 'disetujui') {
      await db.collection('presensi').add({
        uid: cutiData.uid,
        nama: cutiData.nama,
        jenis: 'cuti',
        status: cutiData.jenis,
        waktu: cutiData.tanggal,
        koordinat: '-',
        selfie: '-',
        catatan: cutiData.catatan || ''
      });
    }
    
    // Buat notifikasi untuk karyawan
    await buatNotifikasi({
      tipe: 'hasil_cuti',
      targetUID: cutiData.uid,
      judul: 'Hasil Pengajuan Cuti',
      isi: `Pengajuan cuti ${cutiData.jenis} Anda pada ${formatTanggalSingkat(cutiData.tanggal)} telah ${status === 'disetujui' ? 'disetujui' : 'ditolak'} oleh ${adminNama}`,
      targetRole: 'karyawan'
    });
    
    return true;
  } catch (error) {
    console.error('Error memproses cuti:', error);
    showToast('Gagal memproses cuti', 'error');
    return false;
  }
};

// Fungsi untuk mendapatkan daftar semua karyawan
const muatDaftarKaryawan = async () => {
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'karyawan')
      .orderBy('nama')
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error memuat daftar karyawan:', error);
    showToast('Gagal memuat daftar karyawan', 'error');
    return [];
  }
};

// Fungsi untuk membuat user baru (hanya admin)
const buatUserBaru = async (email, password, data) => {
  try {
    // Buat user di Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;
    
    // Simpan data user di Firestore
    await db.collection('users').doc(uid).set({
      ...data,
      role: 'karyawan',
      dibuat: firebase.firestore.FieldValue.serverTimestamp(),
      diupdate: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('Error membuat user baru:', error);
    showToast('Gagal membuat user baru', 'error');
    return false;
  }
};

// Event listener untuk auth state changes
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // User sudah login, muat data user
    const userData = await muatDataUser(user.uid);
    
    if (userData) {
      // Jika nama atau alamat kosong, tampilkan popup
      if ((!userData.nama || !userData.alamat) && window.showProfileModal) {
        window.showProfileModal();
      }
      
      // Update UI dengan data user
      if (window.updateUserProfile) {
        window.updateUserProfile(userData);
      }
      
      // Muat notifikasi
      if (window.loadNotifications) {
        window.loadNotifications();
      }
      
      // Muat riwayat presensi
      if (window.loadPresenceHistory) {
        window.loadPresenceHistory();
      }
    }
  } else {
    // User belum login, redirect ke index.html
    if (window.location.pathname !== '/index.html' && 
        !window.location.pathname.endsWith('/')) {
      window.location.href = 'index.html';
    }
  }
});