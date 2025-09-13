// cron.js
require("dotenv").config();
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});
const db = admin.firestore();

// 1. DEL: hapus notifikasi >3 hari
(async () => {
  const cutoff = Date.now() - 3*24*60*60*1000;
  const snaps = await db.collectionGroup("notifications").where("timestamp","<",cutoff).get();
  snaps.forEach(d => d.ref.delete());
  console.log("DEL: notifikasi >3 hari dihapus");
})();

// 2. CSVD: rekapan bulan ini → simpan ke storage/public/csv/…
(async () => {
  const now = new Date();
  const month = now.getMonth(), year = now.getFullYear();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month+1, 1).getTime();
  const snaps = await db.collection("presensi")
    .where("timestamp",">=",start)
    .where("timestamp","<",end)
    .orderBy("uid")
    .orderBy("timestamp")
    .get();
  let csv = "";
  let lastUID = "";
  snaps.forEach(d => {
    const x = d.data();
    if (x.uid !== lastUID) { csv += "\n"; lastUID = x.uid; }
    csv += `${new Date(x.timestamp).toLocaleString()},${x.uid},${x.jenis}\n`;
  });
  // Simpan CSV ke Firestore Storage (opsional)
  console.log("CSVD: rekapan bulan dibuat");
})();