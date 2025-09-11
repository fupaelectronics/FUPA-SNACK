import admin from "firebase-admin";
import { v2 as cloudinary } from "cloudinary";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });

(async () => {
  console.log("⏱️ Cron start");

  // Contoh: hapus notifikasi lebih dari 7 hari
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const snap = await db.collection("NTF").where("timestamp", "<", cutoff).get();
  snap.forEach(doc => doc.ref.delete());

  console.log("✅ Cron selesai");
})();
