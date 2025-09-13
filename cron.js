// cron.js - Cron jobs for Fupa Snack Sistem

const admin = require('firebase-admin');
const cron = require('node-cron');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Collections
const collections = {
  NOTIFICATIONS: 'notifications',
  PRESENCES: 'presences',
  USERS: 'users'
};

// Delete old notifications (DEL system)
async function deleteOldNotifications() {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const snapshot = await db.collection(collections.NOTIFICATIONS)
      .where('timestamp', '<=', threeDaysAgo)
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.size} old notifications`);
  } catch (error) {
    console.error('Error deleting old notifications:', error);
  }
}

// Send monthly CSV report (CSVD system)
async function sendMonthlyCSVReport() {
  try {
    // Get first and last day of previous month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Format dates for filename
    const formatDate = (date) => date.toISOString().split('T')[0];
    const startDateStr = formatDate(firstDay);
    const endDateStr = formatDate(lastDay);
    
    // Get all presences for the month
    const snapshot = await db.collection(collections.PRESENCES)
      .where('timestamp', '>=', firstDay)
      .where('timestamp', '<=', lastDay)
      .get();
    
    const presences = snapshot.docs.map(doc => doc.data());
    
    // Group by user
    const users = {};
    presences.forEach(presence => {
      if (!users[presence.uid]) {
        users[presence.uid] = {
          email: presence.email,
          records: []
        };
      }
      users[presence.uid].records.push(presence);
    });
    
    // Sort users alphabetically
    const sortedUsers = Object.keys(users)
      .sort((a, b) => users[a].email.localeCompare(users[b].email))
      .map(uid => users[uid]);
    
    // Create CSV content
    const csvWriter = createCsvWriter({
      path: `/tmp/rekap-${startDateStr}-${endDateStr}.csv`,
      header: [
        { id: 'name', title: 'Nama' },
        { id: 'date', title: 'Tanggal' },
        { id: 'time', title: 'Jam' },
        { id: 'type', title: 'Jenis' },
        { id: 'status', title: 'Status' },
        { id: 'coordinates', title: 'Koordinat' }
      ]
    });
    
    const records = [];
    sortedUsers.forEach(user => {
      // Sort records by date and type
      user.records.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.type === 'berangkat' ? -1 : 1;
      });
      
      user.records.forEach(record => {
        records.push({
          name: user.email.split('@')[0],
          date: record.date,
          time: record.time,
          type: record.type,
          status: record.status,
          coordinates: `${record.location.latitude},${record.location.longitude}`
        });
      });
      
      // Add empty record for spacing
      records.push({
        name: '',
        date: '',
        time: '',
        type: '',
        status: '',
        coordinates: ''
      });
    });
    
    // Write CSV file
    await csvWriter.writeRecords(records);
    
    // Here you would typically send the CSV file via email or upload to storage
    // For now, we'll just log that it was created
    console.log(`Created CSV report for ${startDateStr} to ${endDateStr}`);
    
    // Create notification for admin
    await db.collection(collections.NOTIFICATIONS).add({
      type: 'csv-report',
      title: 'Laporan Bulanan CSV',
      message: `Laporan presensi bulan ${firstDay.toLocaleString('id-ID', { month: 'long', year: 'numeric' })} telah siap untuk diunduh`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      target: 'admin',
      csvUrl: `/tmp/rekap-${startDateStr}-${endDateStr}.csv` // This would be a real URL in production
    });
    
  } catch (error) {
    console.error('Error creating monthly CSV report:', error);
  }
}

// Main cron job function
async function runCronJobs() {
  console.log('Starting Fupa Snack cron jobs...');
  
  // Delete old notifications every day
  await deleteOldNotifications();
  
  // Send monthly report on the first day of the month at 12:00 WIB (05:00 UTC)
  const now = new Date();
  if (now.getDate() === 1) {
    await sendMonthlyCSVReport();
  }
  
  console.log('Cron jobs completed');
}

// Run immediately if called directly
if (require.main === module) {
  runCronJobs().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('Cron job failed:', error);
    process.exit(1);
  });
}

// Export for testing
module.exports = {
  deleteOldNotifications,
  sendMonthlyCSVReport,
  runCronJobs
};