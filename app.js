// File app.js - Berisi fungsi-fungsi umum yang digunakan di semua halaman

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

// UID Admin
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
];

// UID Karyawan
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
const utils = {
  // Format tanggal Indonesia
  formatDate: (date, options = {}) => {
    const defaultOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    
    return date.toLocaleDateString('id-ID', { ...defaultOptions, ...options });
  },
  
  // Redirect berdasarkan role
  redirectByRole: (uid) => {
    if (ADMIN_UIDS.includes(uid)) {
      return "./admin.html";
    } else if (KARYAWAN_UIDS.includes(uid)) {
      return "./karyawan.html";
    } else {
      auth.signOut();
      return null;
    }
  },
  
  // Toast notification
  toast: (msg, type = 'info', duration = 3000) => {
    // Cari atau buat elemen toast
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.style.cssText = `
        position: fixed;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        padding: 10px 14px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.15);
        z-index: 10;
        display: none;
      `;
      document.body.appendChild(toast);
    }
    
    // Set background color berdasarkan tipe pesan
    const colors = {
      success: '#2e7d32',
      error: '#c62828',
      warning: '#f9a825',
      info: '#111'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.style.color = '#fff';
    toast.textContent = msg;
    toast.style.display = "block";
    
    setTimeout(() => { 
      toast.style.display = "none"; 
    }, duration);
  },
  
  // Kompres gambar (placeholder - implementasi nyata perlu menggunakan Cloudinary)
  compressImage: (file, maxSizeKB = 10) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // Implementasi kompresi sederhana
        // Dalam implementasi nyata, gunakan Cloudinary dengan upload preset
        resolve(e.target.result);
      };
      reader.readAsDataURL(file);
    });
  },
  
  // Validasi email
  isValidEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
};

// Ekspor untuk penggunaan di modul lain
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { firebaseConfig, ADMIN_UIDS, KARYAWAN_UIDS, utils };
}