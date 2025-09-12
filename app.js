// app.js - Core functionality for Fupa Snack System

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

// Cloudinary configuration
const cloudinaryCloudName = 'da7idhh4f';
const cloudinaryUploadPreset = 'FupaSnack';

// User roles
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
const DEFAULT_TIME_RULES = {
  berangkat: { start: { hour: 5, minute: 30 }, end: { hour: 6, minute: 0 } },
  pulang: { start: { hour: 10, minute: 0 }, end: { hour: 11, minute: 0 } },
  tolerance: 20, // minutes
  libur: [0] // Sunday
};

// Global variables
let currentUser = null;
let userData = null;
let currentLocation = null;
let cameraStream = null;
let capturedBlob = null;

// Utility functions
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg, type = 'info') {
  const t = $("#toast") || document.createElement('div');
  if (!t.id) {
    t.id = 'toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);z-index:10;display:none;';
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
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDateTime(date) {
  return `${formatDate(date)} - ${formatTime(date)}`;
}

function getDayName(dayIndex) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[dayIndex];
}

// Authentication functions
function redirectByRole(uid) {
  if (ADMIN_UIDS.includes(uid)) {
    return "admin.html";
  } else if (KARYAWAN_UIDS.includes(uid)) {
    return "karyawan.html";
  } else {
    auth.signOut();
    return null;
  }
}

// Image compression and upload functions
async function compressImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Calculate new dimensions maintaining aspect ratio
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
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0, width, height);
      
      // Get compressed image as blob
      canvas.toBlob((compressedBlob) => {
        if (compressedBlob.size > 25 * 1024) {
          // Recursively compress if still too large
          const quality = Math.max(0.1, (25 * 1024) / compressedBlob.size * 0.9);
          canvas.toBlob(
            (finalBlob) => resolve(finalBlob),
            'image/jpeg',
            quality
          );
        } else {
          resolve(compressedBlob);
        }
      }, 'image/jpeg', 0.9);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

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

// Location functions
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
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

// Camera functions
async function initCamera(videoElement) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: false 
    });
    
    if (videoElement) {
      videoElement.srcObject = stream;
    }
    
    cameraStream = stream;
    return stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    toast('Tidak dapat mengakses kamera', 'error');
    throw error;
  }
}

function captureImage(videoElement, canvasElement) {
  if (!videoElement || !canvasElement) return null;
  
  const context = canvasElement.getContext('2d');
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  
  context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  
  return new Promise((resolve) => {
    canvasElement.toBlob(resolve, 'image/jpeg', 0.9);
  });
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

// Time and session checking functions
function checkPresensiSession(jenis, customRules = null) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  const rules = customRules || DEFAULT_TIME_RULES;
  const session = rules[jenis];
  
  if (!session) {
    return { inSession: false, status: 'tidak tersedia' };
  }
  
  const startTime = session.start.hour * 60 + session.start.minute;
  const endTime = session.end.hour * 60 + session.end.minute;
  const toleranceEnd = endTime + rules.tolerance;
  
  // Check if it's Sunday (libur)
  if (now.getDay() === 0) {
    return { inSession: false, status: 'libur' };
  }
  
  if (currentTime >= startTime && currentTime <= endTime) {
    return { inSession: true, status: 'tepat waktu' };
  } else if (currentTime > endTime && currentTime <= toleranceEnd) {
    return { inSession: true, status: 'terlambat' };
  } else {
    return { inSession: false, status: 'diluar sesi' };
  }
}

// User profile functions
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

// Presence functions
async function recordPresence(userId, userName, jenis, status, coordinates, imageUrl) {
  try {
    await db.collection('presences').add({
      userId,
      userName,
      jenis,
      status,
      coordinates,
      imageUrl,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error recording presence:', error);
    return false;
  }
}

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

async function loadAllPresenceHistory(filters = {}) {
  try {
    let query = db.collection('presences').orderBy('timestamp', 'desc');
    
    if (filters.nama) {
      query = query.where('userName', '>=', filters.nama)
                   .where('userName', '<=', filters.nama + '\uf8ff');
    }
    
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      end.setDate(end.getDate() + 1); // Include the end date
      
      query = query.where('timestamp', '>=', start)
                   .where('timestamp', '<=', end);
    }
    
    if (filters.limit && filters.limit !== 'all') {
      query = query.limit(parseInt(filters.limit));
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading all presence history:', error);
    return [];
  }
}

// Cuti functions
async function submitCutiRequest(userId, userName, jenis, tanggal, catatan) {
  try {
    await db.collection('cuti_requests').add({
      userId,
      userName,
      jenis,
      tanggal,
      catatan,
      status: 'pending',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Send notification to admin
    await db.collection('notifications').add({
      type: 'cuti_request',
      userId,
      userName,
      message: `Pengajuan cuti ${jenis} pada ${tanggal}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    
    return true;
  } catch (error) {
    console.error('Error submitting cuti request:', error);
    return false;
  }
}

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

async function updateCutiRequest(requestId, status) {
  try {
    await db.collection('cuti_requests').doc(requestId).update({
      status: status,
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
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

// Notification functions
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

// Announcement functions
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
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false,
        userId: uid,
        from: currentUser.uid,
        fromName: userData.nama || currentUser.email
      });
    });
    
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Error sending announcement:', error);
    return false;
  }
}

// Time rules functions
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
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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

async function getCustomTimeRules(uid) {
  try {
    const doc = await db.collection('time_rules').doc(uid).get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.error('Error getting custom time rules:', error);
    return null;
  }
}

// OVD functions (Override presensi rules)
async function setOVDSetting(setting) {
  try {
    await db.collection('system_settings').doc('ovd').set({
      value: setting,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.uid
    });
    return true;
  } catch (error) {
    console.error('Error setting OVD:', error);
    return false;
  }
}

async function getOVDSetting() {
  try {
    const doc = await db.collection('system_settings').doc('ovd').get();
    if (doc.exists) {
      return doc.data().value;
    }
    return 'auto'; // Default value
  } catch (error) {
    console.error('Error getting OVD setting:', error);
    return 'auto';
  }
}

// CSV export functions
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

// User management functions
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
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return user;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// Auto ALPA system (to be called by cron job)
async function checkAndRecordAlpa() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    // Check if it's Sunday
    if (now.getDay() === 0) return;
    
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Check for each user
    for (const user of users) {
      if (!KARYAWAN_UIDS.includes(user.id)) continue;
      
      // Check if user has presence records for today
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      
      const presenceSnapshot = await db.collection('presences')
        .where('userId', '==', user.id)
        .where('timestamp', '>=', todayStart)
        .where('timestamp', '<=', todayEnd)
        .get();
      
      const hasPresence = !presenceSnapshot.empty;
      
      // If no presence and it's past tolerance time for pulang, record ALPA
      if (!hasPresence && currentTime > (DEFAULT_TIME_RULES.pulang.end.hour * 60 + DEFAULT_TIME_RULES.pulang.end.minute + DEFAULT_TIME_RULES.tolerance)) {
        // Record ALPA for both berangkat and pulang
        await db.collection('presences').add({
          userId: user.id,
          userName: user.nama || user.email,
          jenis: 'berangkat',
          status: 'alpa',
          timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0), // 6 AM
          coordinates: null,
          imageUrl: null
        });
        
        await db.collection('presences').add({
          userId: user.id,
          userName: user.nama || user.email,
          jenis: 'pulang',
          status: 'alpa',
          timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0), // 3 PM
          coordinates: null,
          imageUrl: null
        });
      }
    }
  } catch (error) {
    console.error('Error in ALPA system:', error);
  }
}

// DELLTE system - Delete old notifications (to be called by cron job)
async function deleteOldNotifications() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const notificationsSnapshot = await db.collection('notifications')
      .where('timestamp', '<=', sevenDaysAgo)
      .get();
    
    const batch = db.batch();
    notificationsSnapshot.forEach(doc => {
      // Check if notification type should be preserved
      const data = doc.data();
      if (!['OCD', 'CUTIDS', 'CSVMD', 'PAG'].includes(data.type)) {
        batch.delete(doc.ref);
      }
    });
    
    await batch.commit();
    console.log('Old notifications deleted successfully');
  } catch (error) {
    console.error('Error deleting old notifications:', error);
  }
}

// CSVMD system - Monthly CSV export notification (to be called by cron job)
async function sendMonthlyCSVNotification() {
  try {
    const now = new Date();
    // Check if it's the end of the month and time is 13:00 WIB
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    if (now.getDate() === lastDayOfMonth.getDate() && now.getHours() === 13) {
      // Send notification to admin
      for (const adminUid of ADMIN_UIDS) {
        await db.collection('notifications').add({
          type: 'CSVMD',
          userId: adminUid,
          message: 'Laporan CSV bulanan siap diunduh',
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          read: false
        });
      }
    }
  } catch (error) {
    console.error('Error in CSVMD system:', error);
  }
}

// Initialize the app
function initApp() {
  // Check auth state
  auth.onAuthStateChanged(async function(user) {
    if (user) {
      currentUser = user;
      console.log("User logged in:", user.uid);
      
      // Check if user has access
      if (!ADMIN_UIDS.includes(user.uid) && !KARYAWAN_UIDS.includes(user.uid)) {
        toast('Akses ditolak. Akun tidak memiliki izin.', 'error');
        await auth.signOut();
        window.location.href = 'index.html';
        return;
      }
      
      // Load user profile
      userData = await loadUserProfile(user.uid);
      
      // Redirect based on role
      const currentPage = window.location.pathname.split('/').pop();
      const redirectPage = redirectByRole(user.uid);
      
      if (currentPage === 'index.html' && redirectPage) {
        window.location.href = redirectPage;
      } else if (currentPage !== 'index.html' && !redirectPage) {
        await auth.signOut();
        window.location.href = 'index.html';
      }
      
      // Initialize page-specific functionality
      if (typeof initPage === 'function') {
        initPage(user);
      }
    } else {
      console.log("No user, redirecting to login");
      if (!window.location.pathname.endsWith('index.html')) {
        window.location.href = 'index.html';
      }
    }
  });
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);