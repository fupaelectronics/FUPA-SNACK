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

// Admin UIDs
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
];

// Karyawan UIDs
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

// Utility functions
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const showToast = (message, type = 'info') => {
  const toast = document.getElementById('toast');
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

// Format date to Indonesian format
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

// Get user role from UID
const getUserRole = (uid) => {
  if (ADMIN_UIDS.includes(uid)) return 'admin';
  if (KARYAWAN_UIDS.includes(uid)) return 'karyawan';
  return null;
};

// Compress image to 10KB and remove metadata
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set maximum dimensions
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Get compressed image as Blob
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.6); // Adjust quality as needed
      };
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Upload image to Cloudinary
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
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
};

// Get current location
const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
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
      { timeout: 10000 }
    );
  });
};

// Check if today is a holiday based on rules
const isHoliday = async (uid) => {
  try {
    // First check if user has custom rules
    const userRulesDoc = await db.collection('aturanwaktuuser').doc(uid).get();
    let liburDays = [0]; // Default: Sunday is holiday
    
    if (userRulesDoc.exists) {
      liburDays = userRulesDoc.data().hari_libur || [0];
    } else {
      // Check default rules
      const defaultRulesQuery = await db.collection('aturanwaktudefault').limit(1).get();
      if (!defaultRulesQuery.empty) {
        const defaultRules = defaultRulesQuery.docs[0].data();
        liburDays = defaultRules.hari_libur || [0];
      }
    }
    
    const today = new Date().getDay();
    return liburDays.includes(today);
  } catch (error) {
    console.error('Error checking holiday:', error);
    return false;
  }
};

// Get attendance status based on time and rules
const getAttendanceStatus = async (uid, type) => {
  try {
    // Check if today is holiday
    const holiday = await isHoliday(uid);
    if (holiday) return 'Libur';
    
    // Get current time
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Convert to minutes
    
    // Get rules
    let rules = {};
    const userRulesDoc = await db.collection('aturanwaktuuser').doc(uid).get();
    
    if (userRulesDoc.exists) {
      rules = userRulesDoc.data();
    } else {
      // Get default rules
      const defaultRulesQuery = await db.collection('aturanwaktudefault').limit(1).get();
      if (!defaultRulesQuery.empty) {
        rules = defaultRulesQuery.docs[0].data();
      } else {
        // Use hardcoded defaults if no rules exist
        rules = {
          jam_berangkat: 330, // 05:30 in minutes
          jam_pulang: 600,    // 10:00 in minutes
          toleransi: 20
        };
      }
    }
    
    // Convert time strings to minutes if needed
    const convertTimeToMinutes = (time) => {
      if (typeof time === 'string') {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      }
      return time;
    };
    
    const jamBerangkat = convertTimeToMinutes(rules.jam_berangkat);
    const jamPulang = convertTimeToMinutes(rules.jam_pulang);
    const toleransi = rules.toleransi || 20;
    
    if (type === 'berangkat') {
      if (currentTime < jamBerangkat - toleransi || currentTime > jamPulang + toleransi) {
        return 'Di Luar Sesi Presensi';
      } else if (currentTime <= jamBerangkat + toleransi) {
        return 'Tepat Waktu';
      } else {
        return 'Terlambat';
      }
    } else if (type === 'pulang') {
      if (currentTime < jamBerangkat - toleransi || currentTime > jamPulang + toleransi) {
        return 'Di Luar Sesi Presensi';
      } else if (currentTime <= jamPulang + toleransi) {
        return 'Tepat Waktu';
      } else {
        return 'Terlambat';
      }
    }
    
    return 'Tidak Valid';
  } catch (error) {
    console.error('Error getting attendance status:', error);
    return 'Error';
  }
};

// Initialize camera
const initCamera = async (videoElement) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    videoElement.srcObject = stream;
    return stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    showToast('Tidak dapat mengakses kamera', 'error');
    throw error;
  }
};

// Capture photo from video stream
const capturePhoto = (videoElement, canvasElement) => {
  const context = canvasElement.getContext('2d');
  context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  return canvasElement.toDataURL('image/jpeg');
};

// Export data to CSV with STDR format
const exportToCSV = (data, filename) => {
  // Group data by employee name and sort alphabetically
  const groupedData = {};
  data.forEach(item => {
    if (!groupedData[item.nama]) {
      groupedData[item.nama] = [];
    }
    groupedData[item.nama].push(item);
  });
  
  // Sort names alphabetically
  const sortedNames = Object.keys(groupedData).sort();
  
  // Create CSV content
  let csvContent = 'Waktu,Nama,Jenis,Status,Koordinat\n';
  
  sortedNames.forEach(name => {
    // Sort entries by date (oldest first) and then by type (berangkat first)
    const sortedEntries = groupedData[name].sort((a, b) => {
      const dateCompare = new Date(a.timestamp.toDate()) - new Date(b.timestamp.toDate());
      if (dateCompare !== 0) return dateCompare;
      
      // If same date, berangkat comes before pulang
      if (a.jenis === 'berangkat' && b.jenis === 'pulang') return -1;
      if (a.jenis === 'pulang' && b.jenis === 'berangkat') return 1;
      return 0;
    });
    
    // Add entries for this employee
    sortedEntries.forEach(entry => {
      const date = entry.timestamp.toDate();
      const formattedDate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
      csvContent += `"${formattedDate}","${entry.nama}","${entry.jenis}","${entry.status}","${entry.koordinat}"\n`;
    });
    
    // Add empty line between employees (STDR format)
    csvContent += '\n';
  });
  
  // Create download link
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

// Initialize PWA install prompt
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
          console.log('User accepted the install prompt');
        }
        deferredPrompt = null;
      });
    });
  }
});

// Common initialization for authenticated pages
const initAuth = (requiredRole = null) => {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      
      try {
        // Get user data from Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
          // Create user document if it doesn't exist
          const userRole = getUserRole(user.uid);
          if (!userRole) {
            await auth.signOut();
            window.location.href = 'index.html';
            return;
          }
          
          await db.collection('users').doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            nama: '',
            alamat: '',
            role: userRole,
            foto: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          // Show popup to fill name and address
          if (window.showProfilePopup) {
            window.showProfilePopup();
          }
        } else {
          const userData = userDoc.data();
          
          // Check if role is required and matches
          if (requiredRole && userData.role !== requiredRole) {
            await auth.signOut();
            window.location.href = 'index.html';
            return;
          }
        }
        
        resolve(user);
      } catch (error) {
        console.error('Error in auth state change:', error);
        reject(error);
      }
    });
  });
};

// Initialize server time display
const initServerTime = () => {
  const updateTime = () => {
    const now = new Date();
    const serverTimeElement = document.getElementById('serverTime');
    if (serverTimeElement) {
      serverTimeElement.textContent = formatDate(now);
    }
  };
  
  updateTime();
  setInterval(updateTime, 1000);
};

// Initialize notifications
const initNotifications = (uid, role) => {
  let notificationsQuery;
  
  if (role === 'admin') {
    notificationsQuery = db.collection('notifikasi')
      .where('targetRole', '==', 'admin')
      .orderBy('timestamp', 'desc');
  } else {
    notificationsQuery = db.collection('notifikasi')
      .where('uid', '==', uid)
      .orderBy('timestamp', 'desc');
  }
  
  return notificationsQuery.onSnapshot((snapshot) => {
    const notifList = document.getElementById('notifList');
    const notifBadge = document.getElementById('notifBadge');
    
    if (!notifList) return;
    
    notifList.innerHTML = '';
    let unreadCount = 0;
    
    snapshot.forEach((doc) => {
      const notif = doc.data();
      const notifItem = document.createElement('div');
      notifItem.className = 'notif-item';
      notifItem.dataset.id = doc.id;
      
      let actions = '';
      if (role === 'admin' && notif.jenis === 'cuti_request') {
        actions = `
          <div class="notif-actions">
            <button class="icon-btn approve-btn" title="Setujui">
              <span class="material-symbols-rounded">check</span>
            </button>
            <button class="icon-btn reject-btn" title="Tolak">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
        `;
      }
      
      notifItem.innerHTML = `
        <div class="notif-content">
          <div style="font-weight:600">${notif.pesan}</div>
          <div style="font-size:12px;opacity:0.7">${notif.timestamp ? formatDate(notif.timestamp.toDate()) : ''}</div>
        </div>
        ${actions}
      `;
      
      notifList.appendChild(notifItem);
      
      if (!notif.isRead) unreadCount++;
    });
    
    if (notifBadge) {
      notifBadge.textContent = unreadCount;
      notifBadge.style.display = unreadCount > 0 ? 'grid' : 'none';
    }
  });
};

// Mark notification as read
const markNotificationAsRead = async (notifId) => {
  try {
    await db.collection('notifikasi').doc(notifId).update({
      isRead: true
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};