// cron.js - Automated tasks for Fupa Snack system
const admin = require('firebase-admin');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Run ALPA system - automatically record absence
async function runAlpaSystem() {
  console.log('Running ALPA system...');
  
  // Get all karyawan
  const karyawanSnapshot = await db.collection('users')
    .where('role', '==', 'karyawan')
    .get();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Check each karyawan
  for (const doc of karyawanSnapshot.docs) {
    const user = doc.data();
    
    // Check if already has presence record for today
    const presenceSnapshot = await db.collection('presences')
      .where('userId', '==', doc.id)
      .where('timestamp', '>=', today)
      .where('timestamp', '<', tomorrow)
      .get();
    
    // If no presence records, create ALPA records
    if (presenceSnapshot.empty) {
      // Create ALPA for berangkat
      await db.collection('presences').add({
        userId: doc.id,
        userName: user.nama || user.email,
        jenis: 'berangkat',
        status: 'alpa',
        timestamp: new Date(today.getTime() + (6 * 60 * 60 * 1000)), // 6 AM
        coordinates: null,
        imageUrl: null
      });
      
      // Create ALPA for pulang
      await db.collection('presences').add({
        userId: doc.id,
        userName: user.nama || user.email,
        jenis: 'pulang',
        status: 'alpa',
        timestamp: new Date(today.getTime() + (15 * 60 * 60 * 1000)), // 3 PM
        coordinates: null,
        imageUrl: null
      });
      
      console.log(`Created ALPA records for ${user.nama || user.email}`);
    }
  }
}

// Run DELLTE system - delete old notifications
async function runDellteSystem() {
  console.log('Running DELLTE system...');
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  // Get old notifications (excluding certain types)
  const notificationsSnapshot = await db.collection('notifications')
    .where('timestamp', '<', sevenDaysAgo)
    .where('type', 'not-in', ['OCD', 'CUTIDS', 'CSVMD', 'PAG'])
    .get();
  
  // Delete in batches
  const batch = db.batch();
  notificationsSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  console.log(`Deleted ${notificationsSnapshot.size} old notifications`);
}

// Run CSVMD system - send monthly CSV notification
async function runCsvmdSystem() {
  console.log('Running CSVMD system...');
  
  // Check if it's the end of the month
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (tomorrow.getMonth() !== today.getMonth()) {
    // It's the last day of the month, send notification to admin
    await db.collection('notifications').add({
      type: 'CSVMD',
      message: 'Laporan presensi bulanan siap diunduh',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      userId: ADMIN_UIDS[0] // Send to first admin
    });
    
    console.log('Sent monthly CSV notification to admin');
  }
}

// Main function
async function main() {
  try {
    await runAlpaSystem();
    await runDellteSystem();
    await runCsvmdSystem();
    console.log('All cron tasks completed successfully');
  } catch (error) {
    console.error('Error running cron tasks:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { runAlpaSystem, runDellteSystem, runCsvmdSystem };