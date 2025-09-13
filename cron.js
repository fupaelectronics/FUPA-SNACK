// Script untuk cleanup otomatis setiap 3 hari sekali
const admin = require('firebase-admin');

// Inisialisasi Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Hapus notifikasi yang lebih lama dari 3 hari
async function cleanupNotifications() {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const snapshot = await db.collection('notifications')
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(threeDaysAgo))
      .get();
    
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.size} old notifications`);
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
  }
}

// Jalankan cleanup
async function runCleanup() {
  await cleanupNotifications();
  process.exit(0);
}

runCleanup();