// Inisialisasi Firebase
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

// Utility functions
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg, type = 'info') {
  // Create toast element if not exists
  let toastEl = document.getElementById('toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.style = `
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      background: #111;
      color: #fff;
      padding: 10px 14px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.15);
      z-index: 10;
      display: none;
    `;
    document.body.appendChild(toastEl);
  }

  const colors = {
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f9a825',
    info: '#111'
  };
  toastEl.style.backgroundColor = colors[type] || colors.info;
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  setTimeout(() => {
    toastEl.style.display = 'none';
  }, 3000);
}

// Function to get server timestamp from Firestore
function getServerTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

// Function to compress image to 10KB and remove metadata
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxSize = 1024; // Max dimension
        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with quality adjustment to achieve ~10KB
        let quality = 0.9;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (blob.size > 10 * 1024 && quality > 0.1) {
              quality -= 0.1;
              tryCompress();
            } else {
              resolve(blob);
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

// Function to upload image to Cloudinary
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
    console.error('Error uploading image:', error);
    throw error;
  }
}

// Function to get current session (shift) based on server time
function getCurrentShift(serverTime) {
  // If serverTime is not provided, use client time as fallback
  const now = serverTime ? new Date(serverTime) : new Date();
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) {
    return 'pagi';
  } else if (hour >= 12 && hour < 18) {
    return 'sore';
  } else {
    return null; // Outside shift hours
  }
}

// Function to get presence status based on time and shift
function getPresenceStatus(serverTime, jenis, shift) {
  const now = serverTime ? new Date(serverTime) : new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  if (day === 0) return 'Libur';

  const hour = now.getHours();
  const minute = now.getMinutes();

  if (jenis === 'izin') {
    return 'Izin';
  }

  if (shift === 'pagi') {
    if (jenis === 'berangkat') {
      // Tepat waktu: 05.30 - 06.00
      if (hour < 5 || (hour === 5 && minute < 30)) return 'Di luar sesi presensi';
      if (hour === 5 && minute >= 30 && minute <= 59) return 'Tepat Waktu';
      if (hour === 6 && minute <= 20) return 'Terlambat';
      if (hour > 6 || (hour === 6 && minute > 20)) return 'Di luar sesi presensi';
    } else if (jenis === 'pulang') {
      // Tepat waktu: 10.00 - 11.00
      if (hour < 10) return 'Di luar sesi presensi';
      if (hour >= 10 && hour < 11) return 'Tepat Waktu';
      if (hour === 11 && minute <= 20) return 'Terlambat';
      if (hour > 11 || (hour === 11 && minute > 20)) return 'Di luar sesi presensi';
    }
  } else if (shift === 'sore') {
    if (jenis === 'berangkat') {
      // Tepat waktu: 14.00 - 14.30
      if (hour < 14) return 'Di luar sesi presensi';
      if (hour === 14 && minute <= 30) return 'Tepat Waktu';
      if (hour === 14 && minute > 30 && minute <= 50) return 'Terlambat';
      if (hour > 14 || (hour === 14 && minute > 50)) return 'Di luar sesi presensi';
    } else if (jenis === 'pulang') {
      // Tepat waktu: 17.30 - 18.30
      if (hour < 17) return 'Di luar sesi presensi';
      if (hour === 17 && minute >= 30) return 'Tepat Waktu';
      if (hour === 18 && minute <= 30) return 'Tepat Waktu';
      if (hour === 18 && minute > 30 && minute <= 50) return 'Terlambat';
      if (hour > 18 || (hour === 18 && minute > 50)) return 'Di luar sesi presensi';
    }
  }

  return 'Tidak Valid';
}

// Function to format date for display
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

// Function to format date for CSV export (YYYY-MM-DD)
function formatDateForCSV(date) {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}

// Function to check if user has already performed a presence for the current session today
async function checkExistingPresence(uid, jenis, serverTime) {
  const now = serverTime ? new Date(serverTime) : new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  try {
    const presenceRef = db.collection('presences');
    const query = presenceRef
      .where('uid', '==', uid)
      .where('jenis', '==', jenis)
      .where('waktu', '>=', todayStart)
      .where('waktu', '<', todayEnd);

    const snapshot = await query.get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking existing presence:', error);
    return false;
  }
}

// Function to get user profile
async function getUserProfile(uid) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      return userDoc.data();
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

// Function to update user profile
async function updateUserProfile(uid, data) {
  try {
    await db.collection('users').doc(uid).set(data, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
}

// Function to get all presences for admin
async function getPresences(filter = {}) {
  let query = db.collection('presences').orderBy('waktu', 'desc');

  if (filter.nama) {
    // We need to get user IDs that have the name, then filter by UID
    const usersSnapshot = await db.collection('users')
      .where('nama', '>=', filter.nama)
      .where('nama', '<=', filter.nama + '\uf8ff')
      .get();
    const uids = usersSnapshot.docs.map(doc => doc.id);
    query = query.where('uid', 'in', uids);
  }

  if (filter.dari && filter.sampai) {
    const startDate = new Date(filter.dari);
    const endDate = new Date(filter.sampai);
    endDate.setDate(endDate.getDate() + 1); // Include end date
    query = query.where('waktu', '>=', startDate).where('waktu', '<', endDate);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Function to export presences to CSV
function exportToCSV(presences, filename) {
  const headers = ['Nama', 'Tanggal', 'Shift', 'Jenis', 'Status', 'Koordinat'];
  const rows = presences.map(p => [
    p.nama,
    formatDateForCSV(p.waktu.toDate()),
    p.shift,
    p.jenis,
    p.status,
    p.koordinat
  ]);

  // Sort by name (A-Z) and then by date
  rows.sort((a, b) => {
    if (a[0] !== b[0]) {
      return a[0].localeCompare(b[0]);
    }
    return new Date(a[1]) - new Date(b[1]);
  });

  let csvContent = headers.join(',') + '\n';
  rows.forEach(row => {
    csvContent += row.join(',') + '\n';
  });

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

// Function to initialize auth state change
function initAuth(callback) {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // User is signed in
      const userProfile = await getUserProfile(user.uid);
      if (userProfile) {
        callback(user, userProfile);
      } else {
        // If user profile doesn't exist, we might need to create one
        toast('Profil pengguna tidak ditemukan.', 'error');
        auth.signOut();
        window.location.href = 'index.html';
      }
    } else {
      // User is signed out
      window.location.href = 'index.html';
    }
  });
}