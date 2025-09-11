// app.js - Core Application Logic for Fupa Snack System

// Firebase initialization
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

// Cloudinary configuration
const cloudinaryCloudName = 'da7idhh4f';
const cloudinaryUploadPreset = 'FupaSnack';

// User roles definition
const ADMIN_UIDS = [
  "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
];

const KARYAWAN_UIDS = [
  "7NJ9xoMgQlUbi68CMQWFN5bYvF62", // x@fupa.id
  "Jn7Fghq1fkNGx8f0z8sTGkxH94E2", // cabang1@fupa.id
  "vB3i5h6offMxQslKf2U0J1ElpWS2", // cabang2@fupa.id
  "tIGmvfnqtxf5QJlfPUy9O1uzHJ73", // cabang3@fupa.id
  "zl7xjZaI6BdCLT7Z2WA34oTcFV42"  // cabang4@fupa.id
];

// Default time rules
const TIME_RULES = {
  berangkat: { start: { hour: 5, minute: 30 }, end: { hour: 6, minute: 0 } },
  pulang: { start: { hour: 10, minute: 0 }, end: { hour: 11, minute: 0 } },
  tolerance: 20, // minutes
  libur: [0] // Sunday
};

// Global variables
let currentUser = null;
let userData = null;
let customRules = {};
let presenceStatus = null;
let allUsers = [];

// Utility functions
const $ = (sel) => document.querySelector(sel);
const toast = (msg, type = 'info') => {
  const t = $("#toast");
  if (!t) return alert(msg);
  
  // Set background color based on type
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

// Check if user is admin
function isAdmin(uid) {
  return ADMIN_UIDS.includes(uid);
}

// Check if user is karyawan
function isKaryawan(uid) {
  return KARYAWAN_UIDS.includes(uid);
}

// Get server time from Firebase
function getServerTime() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

// Compress image to 25KB and remove EXIF data
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate new dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        const maxDimension = 800; // Max width or height
        
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
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Get compressed image as blob
        canvas.toBlob((blob) => {
          if (blob.size > 25 * 1024) {
            // Recursively compress if still too large
            const quality = Math.max(0.1, (25 * 1024) / blob.size * 0.9);
            canvas.toBlob(
              (compressedBlob) => resolve(compressedBlob),
              'image/jpeg',
              quality
            );
          } else {
            resolve(blob);
          }
        }, 'image/jpeg', 0.9);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload image to Cloudinary
async function uploadToCloudinary(blob) {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', cloudinaryUploadPreset);
  formData.append('cloud_name', cloudinaryCloudName);
  
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

// Check if today is Sunday
function isSunday() {
  return new Date().getDay() === 0;
}

// Check if current time is within presensi session
function checkPresensiSession(jenis) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  // Get rules for current user (custom or default)
  const rules = customRules[currentUser.uid] || TIME_RULES;
  
  if (isSunday() && !rules.forceWork) {
    return { inSession: false, status: 'libur' };
  }
  
  const session = rules[jenis];
  if (!session) {
    return { inSession: false, status: 'tidak tersedia' };
  }
  
  const startTime = session.start.hour * 60 + session.start.minute;
  const endTime = session.end.hour * 60 + session.end.minute;
  const toleranceEnd = endTime + rules.tolerance;
  
  if (currentTime >= startTime && currentTime <= endTime) {
    return { inSession: true, status: 'tepat waktu' };
  } else if (currentTime > endTime && currentTime <= toleranceEnd) {
    return { inSession: true, status: 'terlambat' };
  } else {
    return { inSession: false, status: 'diluar sesi' };
  }
}

// Record presence to Firestore
async function recordPresence(jenis, status, coordinates, imageUrl) {
  try {
    await db.collection('presences').add({
      userId: currentUser.uid,
      userName: userData.nama || currentUser.email,
      jenis,
      status,
      coordinates,
      imageUrl,
      timestamp: getServerTime()
    });
    return true;
  } catch (error) {
    console.error('Error recording presence:', error);
    return false;
  }
}

// Get user's current location
function getCurrentLocation() {
  return new Promise((resolve, reject) {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
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
}

// Initialize camera
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    const videoElement = $('#cam');
    if (videoElement) {
      videoElement.srcObject = stream;
    }
    return stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    toast('Tidak dapat mengakses kamera', 'error');
    throw error;
  }
}

// Capture image from camera
function captureImage(videoElement) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9);
  });
}

// Load user profile
async function loadUserProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      userData = doc.data();
      return userData;
    } else {
      // Create new user profile if doesn't exist
      userData = {
        nama: currentUser.email.split('@')[0],
        alamat: '',
        photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.email}&backgroundColor=ffb300,ffd54f&radius=20`
      };
      await db.collection('users').doc(uid).set(userData);
      return userData;
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
    return null;
  }
}

// Update user profile
async function updateUserProfile(uid, updates) {
  try {
    await db.collection('users').doc(uid).update(updates);
    userData = { ...userData, ...updates };
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
}

// Submit cuti request - PERBAIKAN: Kirim notifikasi ke semua admin
async function submitCutiRequest(jenis, tanggal, catatan) {
  try {
    // Buat permintaan cuti
    const cutiRef = await db.collection('cuti_requests').add({
      userId: currentUser.uid,
      userName: userData.nama || currentUser.email,
      jenis,
      tanggal,
      catatan,
      status: 'pending',
      timestamp: getServerTime()
    });
    
    // Kirim notifikasi ke semua admin
    const notificationsBatch = db.batch();
    const notificationsRef = db.collection('notifications');
    
    ADMIN_UIDS.forEach(adminUid => {
      const newNotificationRef = notificationsRef.doc();
      notificationsBatch.set(newNotificationRef, {
        type: 'cuti_request',
        cutiId: cutiRef.id,
        userId: adminUid,
        message: `Permintaan cuti ${jenis} dari ${userData.nama || currentUser.email} pada ${tanggal}`,
        timestamp: getServerTime(),
        read: false
      });
    });
    
    await notificationsBatch.commit();
    return true;
  } catch (error) {
    console.error('Error submitting cuti request:', error);
    return false;
  }
}

// Load presence history
async function loadPresenceHistory(uid, limit = 20) {
  try {
    let query = db.collection('presences')
      .where('userId', '==', uid)
      .orderBy('timestamp', 'desc');
    
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading presence history:', error);
    return [];
  }
}

// Load all presence data for admin
async function loadAllPresenceHistory(filters = {}) {
  try {
    let query = db.collection('presences').orderBy('timestamp', 'desc');
    
    if (filters.nama) {
      // This would need an index for searching by name
      query = query.where('userName', '>=', filters.nama)
                   .where('userName', '<=', filters.nama + '\uf8ff');
    }
    
    if (filters.tanggal) {
      const startDate = new Date(filters.tanggal);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
      query = query.where('timestamp', '>=', startDate)
                   .where('timestamp', '<', endDate);
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading all presence history:', error);
    return [];
  }
}

// Export to CSV with STDR format
function exportToCSV(data, filename) {
  // Group data by user name
  const groupedData = {};
  data.forEach(item => {
    if (!groupedData[item.userName]) {
      groupedData[item.userName] = [];
    }
    groupedData[item.userName].push(item);
  });
  
  // Sort each group by timestamp
  Object.keys(groupedData).forEach(name => {
    groupedData[name].sort((a, b) => {
      return new Date(a.timestamp.toDate()) - new Date(b.timestamp.toDate());
    });
  });
  
  // Get sorted user names
  const sortedNames = Object.keys(groupedData).sort();
  
  // Create CSV content
  let csvContent = 'Nama,Waktu,Jenis,Status,Koordinat,URL Foto\n';
  
  sortedNames.forEach(name => {
    groupedData[name].forEach(item => {
      const time = item.timestamp.toDate();
      const timeStr = time.toLocaleString('id-ID');
      const coordsStr = item.coordinates ? `${item.coordinates.lat},${item.coordinates.lng}` : '';
      
      csvContent += `"${name}","${timeStr}","${item.jenis}","${item.status}","${coordsStr}","${item.imageUrl || ''}"\n`;
    });
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
}

// Send announcement - PERBAIKAN: Pastikan notifikasi dikirim ke karyawan
async function sendAnnouncement(target, message, specificUsers = []) {
  try {
    let targetUsers = [];
    
    if (target === 'all') {
      // Get all karyawan UIDs
      targetUsers = KARYAWAN_UIDS;
    } else {
      targetUsers = specificUsers;
    }
    
    // Create notification for each target user
    const batch = db.batch();
    const notificationsRef = db.collection('notifications');
    
    targetUsers.forEach(uid => {
      const newNotificationRef = notificationsRef.doc();
      batch.set(newNotificationRef, {
        type: 'announcement',
        message: message,
        timestamp: getServerTime(),
        read: false,
        userId: uid,
        from: currentUser.uid,
        fromName: userData.nama || currentUser.email
      });
    });
    
    await batch.commit();
    
    // Tambahkan juga ke collection announcements untuk riwayat
    await db.collection('announcements').add({
      message: message,
      target: target,
      specificUsers: target === 'specific' ? specificUsers : [],
      timestamp: getServerTime(),
      from: currentUser.uid,
      fromName: userData.nama || currentUser.email
    });
    
    return true;
  } catch (error) {
    console.error('Error sending announcement:', error);
    return false;
  }
}

// Load notifications
async function loadNotifications(uid, limit = 20) {
  try {
    let query = db.collection('notifications')
      .where('userId', '==', uid)
      .orderBy('timestamp', 'desc');
    
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading notifications:', error);
    return [];
  }
}

// Mark notification as read
async function markNotificationAsRead(notificationId) {
  try {
    await db.collection('notifications').doc(notificationId).update({
      read: true
    });
    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
}

// Set custom time rules - PERBAIKAN: Gunakan penargetan UID
async function setCustomTimeRules(target, rules, specificUsers = []) {
  try {
    let targetUsers = [];
    
    if (target === 'all') {
      // Apply to all karyawan
      targetUsers = KARYAWAN_UIDS;
    } else {
      targetUsers = specificUsers;
    }
    
    // Create/update time rules for each target user
    const batch = db.batch();
    const rulesRef = db.collection('time_rules');
    
    targetUsers.forEach(uid => {
      const userRulesRef = rulesRef.doc(uid);
      batch.set(userRulesRef, {
        ...rules,
        updatedAt: getServerTime(),
        updatedBy: currentUser.uid
      });
    });
    
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Error setting custom time rules:', error);
    return false;
  }
}

// Set OVD rules - PERBAIKAN: Gunakan penargetan UID
async function setOvdRules(target, setting, specificUsers = []) {
  try {
    let targetUsers = [];
    
    if (target === 'all') {
      // Apply to all karyawan
      targetUsers = KARYAWAN_UIDS;
    } else {
      targetUsers = specificUsers;
    }
    
    // Create/update OVD rules for each target user
    const batch = db.batch();
    const ovdRef = db.collection('ovd_rules');
    
    targetUsers.forEach(uid => {
      const userOvdRef = ovdRef.doc(uid);
      batch.set(userOvdRef, {
        value: setting,
        updatedAt: getServerTime(),
        updatedBy: currentUser.uid
      });
    });
    
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Error setting OVD rules:', error);
    return false;
  }
}

// Load custom time rules
async function loadCustomTimeRules() {
  try {
    const snapshot = await db.collection('time_rules').get();
    const rules = {};
    snapshot.forEach(doc => {
      rules[doc.id] = doc.data();
    });
    return rules;
  } catch (error) {
    console.error('Error loading custom time rules:', error);
    return {};
  }
}

// Load all users
async function loadAllUsers() {
  try {
    const snapshot = await db.collection('users').get();
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return allUsers;
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

// Load cuti requests
async function loadCutiRequests() {
  try {
    const snapshot = await db.collection('cuti_requests')
      .where('status', '==', 'pending')
      .orderBy('timestamp', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading cuti requests:', error);
    return [];
  }
}

// Update cuti request status
async function updateCutiRequest(requestId, status) {
  try {
    await db.collection('cuti_requests').doc(requestId).update({
      status: status,
      reviewedAt: getServerTime(),
      reviewedBy: currentUser.uid
    });
    
    // Get the request to send notification
    const requestDoc = await db.collection('cuti_requests').doc(requestId).get();
    const request = requestDoc.data();
    
    // Send notification to user
    await db.collection('notifications').add({
      type: 'cuti_response',
      userId: request.userId,
      message: `Pengajuan cuti Anda ${status === 'approved' ? 'disetujui' : 'ditolak'}`,
      timestamp: getServerTime(),
      read: false
    });
    
    // If approved, create CUTIDS records
    if (status === 'approved') {
      const cutiDate = new Date(request.tanggal);
      
      // Create CUTIDS record for berangkat
      await db.collection('presences').add({
        userId: request.userId,
        userName: request.userName,
        jenis: 'berangkat',
        status: `cuti:${request.jenis}`,
        timestamp: new Date(cutiDate.setHours(6, 0, 0)), // 6 AM
        coordinates: null,
        imageUrl: null
      });
      
      // Create CUTIDS record for pulang
      await db.collection('presences').add({
        userId: request.userId,
        userName: request.userName,
        jenis: 'pulang',
        status: `cuti:${request.jenis}`,
        timestamp: new Date(cutiDate.setHours(15, 0, 0)), // 3 PM
        coordinates: null,
        imageUrl: null
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error updating cuti request:', error);
    return false;
  }
}

// Create new user
async function createUser(email, password) {
  try {
    // Create user in Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Create user profile in Firestore
    await db.collection('users').doc(user.uid).set({
      email: email,
      nama: email.split('@')[0],
      alamat: '',
      role: 'karyawan',
      photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${email}&backgroundColor=ffb300,ffd54f&radius=20`,
      createdAt: getServerTime()
    });
    
    return user;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// Initialize presence status checking
function initPresenceStatusChecker() {
  // Check every minute
  setInterval(() => {
    updatePresenceStatus();
  }, 60000);
  
  // Initial check
  updatePresenceStatus();
}

// Update presence status display
function updatePresenceStatus() {
  if (!currentUser || isAdmin(currentUser.uid)) return;
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Check if it's Sunday
  if (isSunday() && !(customRules[currentUser.uid] && customRules[currentUser.uid].forceWork)) {
    presenceStatus = { status: 'libur', text: 'Hari Libur' };
  } 
  // Check if it's before berangkat time
  else if (currentHour < 5 || (currentHour === 5 && currentMinute < 30)) {
    presenceStatus = { status: 'waiting', text: 'Menunggu Sesi Presensi' };
  }
  // Check if it's berangkat session
  else if (
    (currentHour === 5 && currentMinute >= 30) || 
    (currentHour === 6 && currentMinute <= 0)
  ) {
    presenceStatus = { status: 'active', text: 'Sesi Presensi Berangkat' };
  }
  // Check if it's between sessions
  else if (
    (currentHour === 6 && currentMinute > 0) || 
    currentHour === 7 || currentHour === 8 || currentHour === 9 ||
    (currentHour === 10 && currentMinute < 0)
  ) {
    presenceStatus = { status: 'between', text: 'Di Antara Sesi Presensi' };
  }
  // Check if it's pulang session
  else if (
    (currentHour === 10 && currentMinute >= 0) || 
    (currentHour === 11 && currentMinute <= 0)
  ) {
    presenceStatus = { status: 'active', text: 'Sesi Presensi Pulang' };
  }
  // After pulang session
  else {
    presenceStatus = { status: 'ended', text: 'Sesi Presensi Berakhir' };
  }
  
  // Update UI if on karyawan page
  if (window.location.pathname.endsWith('karyawan.html')) {
    const statusElement = $('#statusText');
    const statusChip = $('#statusChip');
    
    if (statusElement && statusChip) {
      statusElement.textContent = presenceStatus.text;
      
      // Update chip color based on status
      statusChip.className = 'status ';
      switch (presenceStatus.status) {
        case 'active':
          statusChip.classList.add('s-good');
          break;
        case 'waiting':
        case 'between':
          statusChip.classList.add('s-warn');
          break;
        case 'libur':
        case 'ended':
          statusChip.classList.add('s-bad');
          break;
      }
    }
  }
}

// Render user list for selection
function renderUserList(containerId, selectedArray) {
  const container = $(containerId);
  container.innerHTML = '';
  
  allUsers.forEach(user => {
    if (KARYAWAN_UIDS.includes(user.id)) {
      const userItem = document.createElement('div');
      userItem.className = `user-item ${selectedArray.includes(user.id) ? 'selected' : ''}`;
      userItem.innerHTML = `
        <input type="checkbox" id="user-${user.id}" value="${user.id}" 
               ${selectedArray.includes(user.id) ? 'checked' : ''}
               onchange="toggleUserSelection('${user.id}', this.checked, '${containerId}')">
        <label for="user-${user.id}">
          <strong>${user.nama || user.email}</strong><br>
          <small>${user.id}</small>
        </label>
      `;
      container.appendChild(userItem);
    }
  });
}

// Fungsi untuk toggle seleksi user
function toggleUserSelection(userId, isSelected, containerId) {
  if (containerId === '#ovdUserList') {
    if (isSelected) {
      if (!selectedOvdUsers.includes(userId)) {
        selectedOvdUsers.push(userId);
      }
    } else {
      selectedOvdUsers = selectedOvdUsers.filter(id => id !== userId);
    }
  } else if (containerId === '#announceUserList') {
    if (isSelected) {
      if (!selectedAnnounceUsers.includes(userId)) {
        selectedAnnounceUsers.push(userId);
      }
    } else {
      selectedAnnounceUsers = selectedAnnounceUsers.filter(id => id !== userId);
    }
  } else if (containerId === '#rulesUserList') {
    if (isSelected) {
      if (!selectedRulesUsers.includes(userId)) {
        selectedRulesUsers.push(userId);
      }
    } else {
      selectedRulesUsers = selectedRulesUsers.filter(id => id !== userId);
    }
  }
}

// Initialize the application
async function initApp() {
  try {
    // Load custom time rules
    customRules = await loadCustomTimeRules();
    
    // Set up auth state listener
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;
        
        // Check if user has access
        if (!isAdmin(user.uid) && !isKaryawan(user.uid)) {
          toast('Akun tidak memiliki akses ke sistem', 'error');
          await auth.signOut();
          window.location.href = 'index.html';
          return;
        }
        
        // Load user profile
        await loadUserProfile(user.uid);
        
        // Redirect based on role
        if (isAdmin(user.uid) && !window.location.pathname.endsWith('admin.html')) {
          window.location.href = 'admin.html';
        } else if (isKaryawan(user.uid) && !window.location.pathname.endsWith('karyawan.html')) {
          window.location.href = 'karyawan.html';
        }
        
        // Initialize presence status checker for karyawan
        if (isKaryawan(user.uid)) {
          initPresenceStatusChecker();
        }
        
        // Load all users for admin features
        if (isAdmin(user.uid)) {
          await loadAllUsers();
        }
      } else {
        // Not signed in, redirect to login
        if (!window.location.pathname.endsWith('index.html')) {
          window.location.href = 'index.html';
        }
      }
    });
  } catch (error) {
    console.error('Error initializing app:', error);
    toast('Gagal memuat aplikasi', 'error');
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Global variables for user selection (used in admin.html)
let selectedOvdUsers = [];
let selectedAnnounceUsers = [];
let selectedRulesUsers = [];