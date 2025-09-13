const admin = require('firebase-admin');
const cron = require('node-cron');

// Inisialisasi Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();

// Sistem ALPA: Mengecek dan mencatat alpa
async function checkAndRecordAlpa() {
  console.log('Running ALPA system...');
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  // Check if it's Sunday
  if (now.getDay() === 0) {
    console.log('Hari Minggu, tidak ada presensi.');
    return;
  }
  
  // Default time rules
  const DEFAULT_TIME_RULES = {
    berangkat: { start: { hour: 5, minute: 30 }, end: { hour: 6, minute: 0 } },
    pulang: { start: { hour: 10, minute: 0 }, end: { hour: 11, minute: 0 } },
    tolerance: 20, // minutes
    libur: [0] // Sunday
  };
  
  // Get all users
  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Check for each user
  for (const user of users) {
    // Skip non-karyawan (assuming we have a role field, or we can check by UID)
    // Jika tidak ada field role, kita asumsikan semua user di collection users adalah karyawan
    // Atau kita bisa bandingkan dengan UID yang diketahui dari admin (tapi tidak praktis)
    
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
    const pulangEndTime = DEFAULT_TIME_RULES.pulang.end.hour * 60 + DEFAULT_TIME_RULES.pulang.end.minute;
    const pulangToleranceEnd = pulangEndTime + DEFAULT_TIME_RULES.tolerance;
    
    if (!hasPresence && currentTime > pulangToleranceEnd) {
      console.log(`Recording ALPA for user: ${user.nama || user.id}`);
      
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
}

// Sistem DELLTE: Menghapus notifikasi lama (setiap 7 hari)
async function deleteOldNotifications() {
  console.log('Running DELLTE system...');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const notificationsSnapshot = await db.collection('notifications')
    .where('timestamp', '<=', sevenDaysAgo)
    .get();
  
  const batch = db.batch();
  notificationsSnapshot.forEach(doc => {
    // Check if notification type should be preserved
    const data = doc.data();
    const preserveTypes = ['OCD', 'CUTIDS', 'CSVMD', 'PAG'];
    if (!preserveTypes.includes(data.type)) {
      batch.delete(doc.ref);
    }
  });
  
  await batch.commit();
  console.log('Old notifications deleted successfully');
}

// Sistem CSVMD: Mengirim notifikasi unduh CSV setiap akhir bulan pukul 13:00 WIB
async function sendMonthlyCSVNotification() {
  console.log('Running CSVMD system...');
  const now = new Date();
  // Check if it's the end of the month and time is 13:00 WIB (dalam UTC, WIB adalah UTC+7, jadi 06:00 UTC)
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  if (now.getDate() === lastDayOfMonth.getDate() && now.getHours() === 6) {
    console.log('Sending monthly CSV notification...');
    
    // Dapatkan UID admin
    const ADMIN_UIDS = [
      "O1SJ7hYop3UJjDcsA3JqT29aapI3", // karomi@fupa.id
      "uB2XsyM6fXUj493cRlHCqpe2fxH3"  // annisa@fupa.id
    ];
    
    // Send notification to each admin
    for (const adminUid of ADMIN_UIDS) {
      await db.collection('notifications').add({
        type: 'CSVMD',
        userId: adminUid,
        message: 'Laporan CSV bulanan siap diunduh',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      });
    }
    
    console.log('Monthly CSV notifications sent');
  } else {
    console.log('Not the end of month or not 13:00 WIB');
  }
}

// Jadwalkan cron jobs
// Jalankan setiap hari jam 18:00 WIB (11:00 UTC) untuk ALPA dan DELLTE
cron.schedule('0 11 * * *', async () => {
  console.log('Running scheduled cron jobs at 18:00 WIB');
  await checkAndRecordAlpa();
  await deleteOldNotifications();
});

// Jalankan setiap hari jam 06:00 UTC (13:00 WIB) untuk CSVMD
cron.schedule('0 6 * * *', async () => {
  console.log('Running scheduled cron jobs at 13:00 WIB');
  await sendMonthlyCSVNotification();
});

console.log('Cron jobs scheduled successfully');