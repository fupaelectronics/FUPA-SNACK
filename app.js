// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const toast = (msg, type = 'info') => {
  // Buat elemen toast jika belum ada
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed; left:50%; bottom:18px; transform:translateX(-50%); color:#fff; padding:10px 14px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.15); z-index:10; display:none;';
    document.body.appendChild(t);
  }
  
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
const getServerTime = async () => {
  try {
    const docRef = firebase.firestore().collection('serverTime').doc('current');
    await docRef.set({ timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    const doc = await docRef.get();
    return doc.exists ? doc.data().timestamp.toDate() : new Date();
  } catch (error) {
    console.error('Error getting server time:', error);
    return new Date();
  }
};

// Fungsi untuk menentukan shift berdasarkan waktu
const getShift = (date) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'pagi';
  if (hour >= 12 && hour < 18) return 'sore';
  return 'malam'; // Di luar shift, tapi untuk presensi izin akan dihandle terpisah
};

// Fungsi untuk menentukan status presensi
const getStatusPresensi = (jenis, waktu, shift) => {
  const now = waktu;
  const day = now.getDay(); // 0 = Minggu, 1 = Senin, ... 6 = Sabtu

  // Jika Minggu
  if (day === 0) {
    return 'Libur';
  }

  const jam = now.getHours();
  const menit = now.getMinutes();

  if (jenis === 'izin') {
    return 'Izin';
  }

  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      // Tepat waktu: 05.30 - 06.00
      if (jam === 5 && menit >= 30 || jam === 6 && menit <= 0) {
        return 'Tepat Waktu';
      } else if (jam === 6 && menit > 0 && menit <= 20) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    } else if (jenis === 'pulang') {
      // Tepat waktu: 10.00 - 11.00
      if (jam === 10 && menit >= 0 || jam === 11 && menit <= 0) {
        return 'Tepat Waktu';
      } else if (jam === 11 && menit > 0 && menit <= 20) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    }
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') {
      // Tepat waktu: 14.00 - 14.30
      if (jam === 14 && menit >= 0 && menit <= 30) {
        return 'Tepat Waktu';
      } else if (jam === 14 && menit > 30 && menit <= 50) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    } else if (jenis === 'pulang') {
      // Tepat waktu: 17.30 - 18.30
      if (jam === 17 && menit >= 30 || jam === 18 && menit <= 30) {
        return 'Tepat Waktu';
      } else if (jam === 18 && menit > 30 && menit <= 50) {
        return 'Terlambat';
      } else {
        return 'Di luar sesi presensi';
      }
    }
  }

  return 'Di luar sesi presensi';
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
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.9;
        let compressedDataUrl;
        do {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          quality -= 0.1;
        } while (compressedDataUrl.length > maxSizeKB * 1024 && quality > 0.1);
        resolve(compressedDataUrl);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

// Fungsi untuk upload ke Cloudinary
const uploadToCloudinary = (dataUrl) => {
  return new Promise((resolve, reject) => {
    const uploadPreset = 'FupaSnack';
    const cloudName = 'da7idhh4f';
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('upload_preset', uploadPreset);

    fetch(url, {
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

// Fungsi untuk memformat tanggal Indonesia
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

// Fungsi untuk memformat tanggal menjadi YYYY-MM-DD
const formatDateOnly = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Fungsi untuk memeriksa apakah sudah presensi hari ini untuk jenis tertentu
const sudahPresensiHariIni = async (userId, jenis, tanggal) => {
  const tanggalStr = formatDateOnly(tanggal);
  const presensiRef = firebase.firestore().collection('presences');
  const query = presensiRef.where('userId', '==', userId)
                           .where('jenis', '==', jenis)
                           .where('tanggal', '==', tanggalStr);
  const snapshot = await query.get();
  return !snapshot.empty;
};

// Fungsi untuk menambahkan data presensi
const tambahPresensi = async (data) => {
  const presensiRef = firebase.firestore().collection('presences');
  return await presensiRef.add({
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
};

// Fungsi untuk mendapatkan riwayat presensi per user (karyawan)
const getRiwayatPresensi = async (userId, limit = 50) => {
  const presensiRef = firebase.firestore().collection('presences');
  let query = presensiRef.where('userId', '==', userId)
                         .orderBy('createdAt', 'desc')
                         .limit(limit);
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Fungsi untuk mendapatkan semua riwayat presensi (admin)
const getAllRiwayatPresensi = async (limit = 50) => {
  const presensiRef = firebase.firestore().collection('presences');
  let query = presensiRef.orderBy('createdAt', 'desc').limit(limit);
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Fungsi untuk export CSV sesuai format STDR
const exportToCSV = (data) => {
  // Urutkan berdasarkan nama
  data.sort((a, b) => a.nama.localeCompare(b.nama));

  // Buat blok per karyawan
  const grouped = {};
  data.forEach(item => {
    if (!grouped[item.nama]) {
      grouped[item.nama] = [];
    }
    grouped[item.nama].push(item);
  });

  // Urutkan setiap blok berdasarkan tanggal
  for (let nama in grouped) {
    grouped[nama].sort((a, b) => new Date(a.waktu) - new Date(b.waktu));
  }

  // Buat CSV
  let csv = 'Nama,Tanggal,Shift,Jenis,Status,Koordinat\n';
  for (let nama in grouped) {
    grouped[nama].forEach(item => {
      const tanggal = item.tanggal || formatDateOnly(item.waktu.toDate());
      csv += `"${nama}",${tanggal},${item.shift},${item.jenis},${item.status},${item.koordinat}\n`;
    });
    csv += '\n'; // Baris kosong antar blok
  }

  return csv;
};

// Fungsi untuk mendownload CSV
const downloadCSV = (csv, filename) => {
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