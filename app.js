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
const toast = (msg, type = 'info') => {
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
};

// Fungsi untuk mendapatkan role user
async function getUserRole(uid) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      return userDoc.data().role;
    }
    return null;
  } catch (error) {
    console.error("Error getting user role:", error);
    return null;
  }
}

// Fungsi redirect berdasarkan role
async function redirectByRole(uid) {
  const role = await getUserRole(uid);
  if (role === 'admin') {
    return "admin.html";
  } else if (role === 'karyawan') {
    return "karyawan.html";
  } else {
    auth.signOut();
    return null;
  }
}

// Fungsi untuk mendapatkan waktu server
function getServerTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

// Fungsi untuk kompres gambar (menggunakan Canvas API)
function compressImage(file, maxSizeKB = 10) {
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
        const maxDimension = 800; // maksimal dimensi
        
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
        
        // Konversi ke blob dengan kualitas 0.7 (70%)
        canvas.toBlob(
          (blob) => {
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
          },
          'image/jpeg',
          0.7
        );
      };
    };
    reader.onerror = error => reject(error);
  });
}

// Fungsi untuk upload gambar ke Cloudinary
async function uploadToCloudinary(blob) {
  const cloudName = 'da7idhh4f';
  const uploadPreset = 'FupaSnack';
  
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', uploadPreset);
  
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData
      }
    );
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

// Fungsi untuk mendapatkan aturan waktu
async function getTimeRules(uid) {
  try {
    // Cek aturan khusus user
    const userRulesDoc = await db.collection('aturanwaktuuser').doc(uid).get();
    if (userRulesDoc.exists) {
      return userRulesDoc.data();
    }
    
    // Jika tidak ada, gunakan aturan default
    const defaultRulesDoc = await db.collection('aturanwaktudefault').doc('default').get();
    if (defaultRulesDoc.exists) {
      return defaultRulesDoc.data();
    }
    
    // Jika tidak ada aturan sama sekali, kembalikan default hardcoded
    return {
      jam_berangkat: '05:30',
      jam_pulang: '10:00',
      toleransi: 20, // dalam menit
      hari_libur: [0] // 0 = Minggu
    };
  } catch (error) {
    console.error('Error getting time rules:', error);
    return {
      jam_berangkat: '05:30',
      jam_pulang: '10:00',
      toleransi: 20,
      hari_libur: [0]
    };
  }
}

// Fungsi untuk menentukan status presensi
async function getPresenceStatus(uid, waktu, jenis) {
  const rules = await getTimeRules(uid);
  
  // Parse waktu
  const now = new Date(waktu);
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Cek hari libur
  if (rules.hari_libur.includes(day)) {
    return 'Libur';
  }
  
  // Parse jam dari aturan
  const [berangkatJam, berangkatMenit] = rules.jam_berangkat.split(':').map(Number);
  const [pulangJam, pulangMenit] = rules.jam_pulang.split(':').map(Number);
  
  // Hitung waktu dalam menit untuk memudahkan perbandingan
  const currentTimeInMinutes = hours * 60 + minutes;
  const berangkatTimeInMinutes = berangkatJam * 60 + berangkatMenit;
  const pulangTimeInMinutes = pulangJam * 60 + pulangMenit;
  
  // Tentukan batas waktu berdasarkan jenis presensi
  let batasAwal, batasAkhir, batasTepatWaktu;
  
  if (jenis === 'berangkat') {
    batasAwal = berangkatTimeInMinutes - rules.toleransi;
    batasTepatWaktu = berangkatTimeInMinutes;
    batasAkhir = berangkatTimeInMinutes + rules.toleransi;
  } else {
    batasAwal = pulangTimeInMinutes - rules.toleransi;
    batasTepatWaktu = pulangTimeInMinutes;
    batasAkhir = pulangTimeInMinutes + rules.toleransi;
  }
  
  // Tentukan status
  if (currentTimeInMinutes < batasAwal || currentTimeInMinutes > batasAkhir) {
    return 'Di Luar Sesi Presensi';
  } else if (currentTimeInMinutes <= batasTepatWaktu) {
    return 'Tepat Waktu';
  } else {
    return 'Terlambat';
  }
}

// Fungsi untuk format CSV sesuai STDR
function formatCSV(data) {
  // Urutkan berdasarkan nama
  data.sort((a, b) => a.nama.localeCompare(b.nama));
  
  let csvContent = "Nama,Tanggal,Jam,Jenis,Status,Koordinat\n";
  let currentUser = '';
  
  data.forEach((item, index) => {
    // Jika berganti user, tambahkan baris kosong
    if (currentUser !== item.nama) {
      if (index > 0) {
        csvContent += "\n"; // Baris kosong antar user
      }
      currentUser = item.nama;
    }
    
    const date = new Date(item.timestamp?.toDate() || item.waktu);
    const tanggal = date.toLocaleDateString('id-ID');
    const jam = date.toLocaleTimeString('id-ID');
    
    csvContent += `"${item.nama}",${tanggal},${jam},${item.jenis},${item.status},"${item.koordinat}"\n`;
  });
  
  return csvContent;
}

// Fungsi untuk download CSV
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Fungsi untuk mendapatkan lokasi user
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

// Inisialisasi camera
async function initCamera(videoElement) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    videoElement.srcObject = stream;
    return stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    throw error;
  }
}

// Capture foto dari camera
function capturePhoto(videoElement, canvasElement) {
  const context = canvasElement.getContext('2d');
  context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  return canvasElement.toDataURL('image/jpeg');
}

// Event listener untuk PWA install button
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', () => {
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