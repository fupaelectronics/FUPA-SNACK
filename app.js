// app.js - Core Application Logic for Fupa Snack Sistem

// Cloudinary configuration
const cloudinaryConfig = {
  cloudName: 'da7idhh4f',
  uploadPreset: 'FupaSnack',
  apiKey: '843915719972164', // Cloudinary API key (public)
};

// Admin UIDs
const adminUIDs = [
  'O1SJ7hYop3UJjDcsA3JqT29aapI3', // karomi@fupa.id
  'uB2XsyM6fXUj493cRlHCqpe2fxH3'  // annisa@fupa.id
];

// Default time rules
const defaultTimeRules = {
  berangkatStart: '05:30',
  berangkatEnd: '06:00',
  pulangStart: '10:00',
  pulangEnd: '11:00',
  toleransi: 20, // dalam menit
  libur: [0] // 0 = Minggu
};

// Utility functions
const utils = {
  // Format date to Indonesian format
  formatDate: (date) => {
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
  },
  
  // Get current time in HH:MM format
  getTimeString: (date) => {
    return date.toTimeString().substring(0, 5);
  },
  
  // Convert time string to minutes
  timeToMinutes: (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  },
  
  // Check if current time is within presensi session
  checkPresensiSession: (currentTime, rules = defaultTimeRules) => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTimeMinutes = utils.timeToMinutes(currentTime);
    
    // Check if today is holiday
    if (rules.libur.includes(currentDay)) {
      return { status: 'libur', message: 'Hari libur' };
    }
    
    // Check berangkat session
    const berangkatStart = utils.timeToMinutes(rules.berangkatStart);
    const berangkatEnd = utils.timeToMinutes(rules.berangkatEnd);
    const toleransi = rules.toleransi;
    
    // Check pulang session
    const pulangStart = utils.timeToMinutes(rules.pulangStart);
    const pulangEnd = utils.timeToMinutes(rules.pulangEnd);
    
    if (currentTimeMinutes >= berangkatStart && currentTimeMinutes <= berangkatEnd) {
      return { status: 'berangkat', message: 'Sesi presensi berangkat' };
    } else if (currentTimeMinutes > berangkatEnd && currentTimeMinutes <= berangkatEnd + toleransi) {
      return { status: 'terlambat-berangkat', message: 'Terlambat presensi berangkat' };
    } else if (currentTimeMinutes >= pulangStart && currentTimeMinutes <= pulangEnd) {
      return { status: 'pulang', message: 'Sesi presensi pulang' };
    } else if (currentTimeMinutes > pulangEnd && currentTimeMinutes <= pulangEnd + toleransi) {
      return { status: 'terlambat-pulang', message: 'Terlambat presensi pulang' };
    } else {
      return { status: 'diluar-sesi', message: 'Di luar sesi presensi' };
    }
  },
  
  // Compress image to 10KB (COMPRESSX)
  compressImage: (file, maxSizeKB = 10) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Calculate new dimensions
          let width = img.width;
          let height = img.height;
          const maxDimension = 800;
          
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw image on canvas
          ctx.drawImage(img, 0, 0, width, height);
          
          // Get compressed data URL
          let quality = 0.9;
          let compressedDataUrl;
          
          // Function to try compression with different quality levels
          const tryCompression = () => {
            compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            const sizeKB = Math.floor((compressedDataUrl.length * 3) / 4 / 1024);
            
            if (sizeKB > maxSizeKB && quality > 0.1) {
              quality -= 0.1;
              return tryCompression();
            }
            
            return compressedDataUrl;
          };
          
          const result = tryCompression();
          resolve(result);
        };
        
        img.onerror = (error) => {
          reject(error);
        };
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
    });
  },
  
  // Upload image to Cloudinary
  uploadToCloudinary: (dataUrl) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', dataUrl);
      formData.append('upload_preset', cloudinaryConfig.uploadPreset);
      formData.append('cloud_name', cloudinaryConfig.cloudName);
      
      fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
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
      .catch(error => {
        reject(error);
      });
    });
  },
  
  // Get current location
  getCurrentLocation: () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  },
  
  // Calculate distance between two coordinates in meters
  calculateDistance: (lat1, lng1, lat2, lng2) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  },
  
  // Check if user is near predefined location (office)
  isNearOffice: (userLat, userLng, officeLat = -6.2088, officeLng = 106.8456, maxDistance = 500) => {
    const distance = utils.calculateDistance(userLat, userLng, officeLat, officeLng);
    return distance <= maxDistance;
  },
  
  // Show toast notification
  showToast: (message, type = 'info') => {
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
    
    setTimeout(() => {
      toast.style.display = "none";
    }, 3000);
  }
};

// Firestore collections
const collections = {
  USERS: 'users',
  PRESENCES: 'presences',
  PRESENCES_CUTI: 'presences_cuti',
  CUTI_REQUESTS: 'cuti_requests',
  NOTIFICATIONS: 'notifications',
  TIME_RULES: 'time_rules',
  OVERRIDE_RULES: 'override_rules',
  ANNOUNCEMENTS: 'announcements'
};

// Initialize camera
const camera = {
  video: null,
  canvas: null,
  stream: null,
  photo: null,
  
  init: async (videoElement, canvasElement) => {
    camera.video = videoElement;
    camera.canvas = canvasElement;
    
    try {
      camera.stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: false 
      });
      camera.video.srcObject = camera.stream;
    } catch (error) {
      console.error('Error accessing camera:', error);
      utils.showToast('Tidak dapat mengakses kamera', 'error');
    }
  },
  
  takePicture: () => {
    if (!camera.video || !camera.canvas) return null;
    
    const context = camera.canvas.getContext('2d');
    camera.canvas.width = camera.video.videoWidth;
    camera.canvas.height = camera.video.videoHeight;
    context.drawImage(camera.video, 0, 0, camera.canvas.width, camera.canvas.height);
    
    return camera.canvas.toDataURL('image/png');
  },
  
  stop: () => {
    if (camera.stream) {
      camera.stream.getTracks().forEach(track => track.stop());
    }
  }
};

// User management
const userManager = {
  currentUser: null,
  
  init: () => {
    const userData = localStorage.getItem('user');
    if (userData) {
      userManager.currentUser = JSON.parse(userData);
    }
    
    return userManager.currentUser;
  },
  
  isAdmin: () => {
    return userManager.currentUser && adminUIDs.includes(userManager.currentUser.uid);
  },
  
  updateProfile: async (data) => {
    try {
      await db.collection(collections.USERS).doc(userManager.currentUser.uid).update(data);
      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      return false;
    }
  },
  
  getProfile: async () => {
    try {
      const doc = await db.collection(collections.USERS).doc(userManager.currentUser.uid).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Error getting profile:', error);
      return null;
    }
  },
  
  createUser: async (email, password, userData) => {
    try {
      // Create user in Firebase Auth
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Set user data in Firestore
      await db.collection(collections.USERS).doc(user.uid).set({
        ...userData,
        email: email,
        role: 'karyawan', // Default role
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true, uid: user.uid };
    } catch (error) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }
  }
};

// Presensi system
const presensi = {
  submit: async (type, imageData, location) => {
    try {
      const now = new Date();
      const currentTime = utils.getTimeString(now);
      const sessionInfo = utils.checkPresensiSession(currentTime);
      
      // Check if today is forced off by admin
      const overrideDoc = await db.collection(collections.OVERRIDE_RULES)
        .doc(now.toISOString().split('T')[0])
        .get();
      
      if (overrideDoc.exists && overrideDoc.data().status === 'forceOff') {
        utils.showToast('Hari ini tidak wajib presensi', 'warning');
        return { success: false, message: 'Hari ini tidak wajib presensi' };
      }
      
      // Check if user is near office
      if (!utils.isNearOffice(location.lat, location.lng)) {
        utils.showToast('Anda tidak berada di lokasi kantor', 'error');
        return { success: false, message: 'Anda tidak berada di lokasi kantor' };
      }
      
      // Upload image to Cloudinary
      const imageUrl = await utils.uploadToCloudinary(imageData);
      
      // Save to Firestore
      const presensiData = {
        uid: userManager.currentUser.uid,
        email: userManager.currentUser.email,
        type: type,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date: now.toISOString().split('T')[0],
        time: currentTime,
        status: sessionInfo.status,
        location: new firebase.firestore.GeoPoint(location.lat, location.lng),
        imageUrl: imageUrl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection(collections.PRESENCES).add(presensiData);
      
      // Send notification to admin
      const notificationData = {
        type: 'presensi',
        title: `Presensi ${type}`,
        message: `${userManager.currentUser.email} telah melakukan presensi ${type}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
        target: 'admin'
      };
      
      await db.collection(collections.NOTIFICATIONS).add(notificationData);
      
      utils.showToast(`Presensi ${type} berhasil dicatat`, 'success');
      return { success: true, message: `Presensi ${type} berhasil dicatat` };
    } catch (error) {
      console.error('Error submitting presensi:', error);
      utils.showToast('Gagal mencatat presensi', 'error');
      return { success: false, message: error.message };
    }
  },
  
  getHistory: async (limit = 20, uid = null) => {
    try {
      let query = db.collection(collections.PRESENCES)
        .orderBy('timestamp', 'desc');
      
      if (uid) {
        query = query.where('uid', '==', uid);
      } else if (!userManager.isAdmin()) {
        query = query.where('uid', '==', userManager.currentUser.uid);
      }
      
      if (limit !== 'all') {
        query = query.limit(parseInt(limit));
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting presensi history:', error);
      return [];
    }
  },
  
  exportCSV: async (startDate, endDate) => {
    try {
      let query = db.collection(collections.PRESENCES)
        .where('timestamp', '>=', new Date(startDate))
        .where('timestamp', '<=', new Date(endDate))
        .orderBy('timestamp');
      
      const snapshot = await query.get();
      const data = snapshot.docs.map(doc => doc.data());
      
      // Group by user and sort alphabetically
      const users = {};
      data.forEach(item => {
        if (!users[item.uid]) {
          users[item.uid] = {
            name: item.email.split('@')[0],
            records: []
          };
        }
        users[item.uid].records.push(item);
      });
      
      // Sort users alphabetically
      const sortedUsers = Object.keys(users)
        .sort((a, b) => users[a].name.localeCompare(users[b].name))
        .map(uid => users[uid]);
      
      // Create CSV content
      let csvContent = 'Nama,Tanggal,Jam,Jenis,Status,Koordinat\n';
      
      sortedUsers.forEach(user => {
        // Sort records by date and type (berangkat first)
        user.records.sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.type === 'berangkat' ? -1 : 1;
        });
        
        user.records.forEach(record => {
          csvContent += `"${user.name}","${record.date}","${record.time}","${record.type}","${record.status}","${record.location.latitude},${record.location.longitude}"\n`;
        });
        
        // Add empty line between users
        csvContent += '\n';
      });
      
      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `rekap-presensi-${startDate}-to-${endDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return { success: true };
    } catch (error) {
      console.error('Error exporting CSV:', error);
      return { success: false, error: error.message };
    }
  }
};

// Cuti system
const cutiSystem = {
  request: async (type, date, notes = '') => {
    try {
      const cutiData = {
        uid: userManager.currentUser.uid,
        email: userManager.currentUser.email,
        type: type,
        date: date,
        notes: notes,
        status: 'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection(collections.CUTI_REQUESTS).add(cutiData);
      
      // Send notification to admin
      const notificationData = {
        type: 'cuti-request',
        title: 'Permintaan Cuti',
        message: `${userManager.currentUser.email} mengajukan cuti ${type} pada ${date}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
        target: 'admin'
      };
      
      await db.collection(collections.NOTIFICATIONS).add(notificationData);
      
      utils.showToast('Permintaan cuti berhasil diajukan', 'success');
      return { success: true };
    } catch (error) {
      console.error('Error requesting cuti:', error);
      utils.showToast('Gagal mengajukan cuti', 'error');
      return { success: false, error: error.message };
    }
  },
  
  approve: async (requestId, userId, date, type) => {
    try {
      // Update request status
      await db.collection(collections.CUTI_REQUESTS).doc(requestId).update({
        status: 'approved',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Create cuti presensi record
      const cutiPresensiData = {
        uid: userId,
        date: date,
        type: 'cuti',
        cutiType: type,
        status: 'cuti',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection(collections.PRESENCES_CUTI).add(cutiPresensiData);
      
      // Send notification to user
      const userDoc = await db.collection(collections.USERS).doc(userId).get();
      const userEmail = userDoc.exists ? userDoc.data().email : '';
      
      const notificationData = {
        type: 'cuti-approved',
        title: 'Cuti Disetujui',
        message: `Permintaan cuti ${type} Anda pada ${date} telah disetujui`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
        target: userId,
        targetEmail: userEmail
      };
      
      await db.collection(collections.NOTIFICATIONS).add(notificationData);
      
      utils.showToast('Cuti disetujui', 'success');
      return { success: true };
    } catch (error) {
      console.error('Error approving cuti:', error);
      utils.showToast('Gagal menyetujui cuti', 'error');
      return { success: false, error: error.message };
    }
  },
  
  reject: async (requestId, userId, date, type) => {
    try {
      // Update request status
      await db.collection(collections.CUTI_REQUESTS).doc(requestId).update({
        status: 'rejected',
        rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Send notification to user
      const userDoc = await db.collection(collections.USERS).doc(userId).get();
      const userEmail = userDoc.exists ? userDoc.data().email : '';
      
      const notificationData = {
        type: 'cuti-rejected',
        title: 'Cuti Ditolak',
        message: `Permintaan cuti ${type} Anda pada ${date} telah ditolak`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
        target: userId,
        targetEmail: userEmail
      };
      
      await db.collection(collections.NOTIFICATIONS).add(notificationData);
      
      utils.showToast('Cuti ditolak', 'success');
      return { success: true };
    } catch (error) {
      console.error('Error rejecting cuti:', error);
      utils.showToast('Gagal menolak cuti', 'error');
      return { success: false, error: error.message };
    }
  },
  
  getRequests: async (status = 'pending') => {
    try {
      const snapshot = await db.collection(collections.CUTI_REQUESTS)
        .where('status', '==', status)
        .orderBy('timestamp', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting cuti requests:', error);
      return [];
    }
  }
};

// Notification system
const notificationSystem = {
  get: async (target = null, limit = 20) => {
    try {
      let query = db.collection(collections.NOTIFICATIONS)
        .orderBy('timestamp', 'desc');
      
      if (target) {
        query = query.where('target', '==', target);
      }
      
      if (limit !== 'all') {
        query = query.limit(parseInt(limit));
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting notifications:', error);
      return [];
    }
  },
  
  markAsRead: async (notificationId) => {
    try {
      await db.collection(collections.NOTIFICATIONS).doc(notificationId).update({
        read: true,
        readAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return { success: false, error: error.message };
    }
  },
  
  send: async (title, message, target = 'all', targetEmail = '') => {
    try {
      const notificationData = {
        type: 'announcement',
        title: title,
        message: message,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
        target: target,
        targetEmail: targetEmail
      };
      
      await db.collection(collections.NOTIFICATIONS).add(notificationData);
      
      utils.showToast('Notifikasi berhasil dikirim', 'success');
      return { success: true };
    } catch (error) {
      console.error('Error sending notification:', error);
      utils.showToast('Gagal mengirim notifikasi', 'error');
      return { success: false, error: error.message };
    }
  }
};

// Time rules system
const timeRulesSystem = {
  get: async (uid = null) => {
    try {
      if (uid) {
        const doc = await db.collection(collections.TIME_RULES).doc(uid).get();
        return doc.exists ? doc.data() : null;
      } else {
        const snapshot = await db.collection(collections.TIME_RULES)
          .where('target', '==', 'all')
          .get();
        
        return snapshot.docs.length > 0 ? snapshot.docs[0].data() : null;
      }
    } catch (error) {
      console.error('Error getting time rules:', error);
      return null;
    }
  },
  
  set: async (rules, target = 'all', targetUid = null) => {
    try {
      const rulesData = {
        ...rules,
        target: target,
        targetUid: targetUid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      if (target === 'all') {
        // Delete previous all rules
        const snapshot = await db.collection(collections.TIME_RULES)
          .where('target', '==', 'all')
          .get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        
        // Add new rules
        await db.collection(collections.TIME_RULES).add(rulesData);
      } else {
        // Set rules for specific user
        await db.collection(collections.TIME_RULES).doc(targetUid).set(rulesData);
      }
      
      utils.showToast('Aturan waktu berhasil disimpan', 'success');
      return { success: true };
    } catch (error) {
      console.error('Error setting time rules:', error);
      utils.showToast('Gagal menyimpan aturan waktu', 'error');
      return { success: false, error: error.message };
    }
  }
};

// Override rules system
const overrideSystem = {
  set: async (date, status) => {
    try {
      const overrideData = {
        date: date,
        status: status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: userManager.currentUser.uid
      };
      
      await db.collection(collections.OVERRIDE_RULES).doc(date).set(overrideData);
      
      utils.showToast('Override berhasil disimpan', 'success');
      return { success: true };
    } catch (error) {
      console.error('Error setting override:', error);
      utils.showToast('Gagal menyimpan override', 'error');
      return { success: false, error: error.message };
    }
  },
  
  get: async (date) => {
    try {
      const doc = await db.collection(collections.OVERRIDE_RULES).doc(date).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error('Error getting override:', error);
      return null;
    }
  }
};

// Initialize application
const initApp = () => {
  // Initialize user manager
  userManager.init();
  
  // Start server time update
  setInterval(updateServerTime, 1000);
  
  // Check for service worker support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then(registration => {
          console.log('SW registered: ', registration);
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
  
  // Check for install prompt
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show install button if available
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
      installBtn.style.display = 'block';
      installBtn.addEventListener('click', () => {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choiceResult => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted install');
          }
          deferredPrompt = null;
        });
      });
    }
  });
};

// Update server time display
const updateServerTime = () => {
  const now = new Date();
  const serverTimeElement = document.getElementById('serverTime');
  
  if (serverTimeElement) {
    serverTimeElement.textContent = utils.formatDate(now);
  }
  
  // Update presensi status if on karyawan page
  if (window.location.pathname.endsWith('karyawan.html')) {
    updatePresensiStatus();
  }
};

// Update presensi status display
const updatePresensiStatus = () => {
  const now = new Date();
  const currentTime = utils.getTimeString(now);
  const sessionInfo = utils.checkPresensiSession(currentTime);
  
  const statusElement = document.getElementById('statusText');
  const statusChip = document.getElementById('statusChip');
  
  if (statusElement && statusChip) {
    statusElement.textContent = sessionInfo.message;
    
    // Update status chip color
    statusChip.className = 'status ';
    if (sessionInfo.status.includes('terlambat')) {
      statusChip.classList.add('s-warn');
    } else if (sessionInfo.status === 'diluar-sesi' || sessionInfo.status === 'libur') {
      statusChip.classList.add('s-bad');
    } else {
      statusChip.classList.add('s-good');
    }
  }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);