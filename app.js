// app.js
// Shared app logic for karyawan.html and admin.html
// Assumes firebase compat is loaded and firebase.initializeApp() already called in the page.

const db = firebase.firestore();
const auth = firebase.auth();

// Cloudinary config (from PEDOMAN)
const CLOUDINARY_CLOUD_NAME = "da7idhh4f";
const CLOUDINARY_UPLOAD_PRESET = "FupaSnack";

// Default aturan waktu (ISO hh:mm)
const ATURAN_DEFAULT = {
  jam_berangkat: "05:30",
  jam_pulang: "10:00",
  toleransi_menit: 20,
  hari_libur: ["Sunday"]
};

// --- Utility functions ---
function el(sel) { return document.querySelector(sel); }
function toast(msg, color = "#111") {
  const t = document.getElementById('toast');
  if (!t) { console.log(msg); return; }
  t.style.backgroundColor = color;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(()=> t.style.display='none', 3000);
}

function parseTimeToMinutes(hhmm) {
  const [h,m] = hhmm.split(":").map(x=>parseInt(x,10));
  return h*60 + m;
}

function formatDateTime(ts) {
  if (!ts) return "-";
  let d;
  if (ts.toDate) d = ts.toDate();
  else d = new Date(ts);
  return d.toLocaleString('id-ID', { dateStyle:'long', timeStyle:'medium' });
}

// Get server timestamp by writing & reading a doc (common trick)
async function getServerTimestamp() {
  const ref = db.collection('_meta').doc('_serverTime');
  await ref.set({ t: firebase.firestore.FieldValue.serverTimestamp() });
  const snap = await ref.get();
  return snap.get('t');
}

// Load user's profile, and if missing allow minimal profile creation (name+address)
async function loadProfileAndEnsure(uid) {
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (snap.exists) return snap.data();
  // If user doc missing, create minimal doc with role fallback: try to infer from known UIDs
  // Pedoman: don't force logout if user doc missing.
  const fallbackRole = inferRoleFromUid(uid);
  const base = {
    uid,
    name: "",
    alamat: "",
    role: fallbackRole,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await userRef.set(base);
  return base;
}

// Simple mapping fallback - uses the UIDs listed in pedoman (if you prefer role from users doc, it will be used)
function inferRoleFromUid(uid) {
  const adminUids = new Set(['O1SJ7hYop3UJjDcsA3JqT29aapI3','uB2XsyM6fXUj493cRlHCqpe2fxH3']);
  if (adminUids.has(uid)) return 'admin';
  // list of karyawan UIDs per pedoman (only some are listed; adapt as needed)
  const kU = new Set([
    '7NJ9xoMgQlUbi68CMQWFN5bYvF62','Jn7Fghq1fkNGx8f0z8sTGkxH94E2','vB3i5h6offMxQslKf2U0J1ElpWS2',
    'tIGmvfnqtxf5QJlfPUy9O1uzHJ73','zl7xjZaI6BdCLT7Z2WA34oTcFV42','NainrtLo3BWRSJKImgIBYNLJEIv2',
    '9Y9s8E23TNbMlO9vZBVKQCGGG0Z2','dDq2zTPs12Tn2v0Zh4IdObDcD7g2','Tkqf05IzI9UTvy4BF0nWtZwbz8j2',
    'pMbjHKjsZLWtNHi7PTc8cDJ254w2','G0qTjLBc6MeRMPziNTzIT6N32ZM2','7NJ9xoMgQlUbi68CMQWFN5bYvF62'
  ]);
  if (kU.has(uid)) return 'karyawan';
  return 'karyawan';
}

// Determine presensi status given now and aturan (object with jam_berangkat/jam_pulang/toleransi)
function determinePresensiStatus(nowDate, aturan, jenis) {
  // jenis: 'berangkat' or 'pulang'
  const dayName = nowDate.toLocaleDateString('en-US', {weekday:'long'});
  if (aturan.hari_libur && aturan.hari_libur.includes(dayName)) return 'Libur';
  const nowMinutes = nowDate.getHours()*60 + nowDate.getMinutes();
  const berangkatStart = parseTimeToMinutes(aturan.jam_berangkat);
  const pulangStart = parseTimeToMinutes(aturan.jam_pulang);
  const tol = aturan.toleransi_menit || 20;

  if (jenis === 'berangkat') {
    const windowStart = berangkatStart;
    const windowEnd = berangkatStart + (30); // allow 30 min session length (as baseline)
    if (nowMinutes < windowStart - tol) return 'Di Luar Sesi Presensi';
    if (nowMinutes <= berangkatStart + tol) return 'Tepat Waktu';
    if (nowMinutes <= windowEnd + tol) return 'Terlambat';
    return 'Di Luar Sesi Presensi';
  } else {
    // pulang
    const windowStart = pulangStart;
    const windowEnd = pulangStart + 60; // allow home session window
    if (nowMinutes < windowStart - tol) return 'Di Luar Sesi Presensi';
    if (nowMinutes <= pulangStart + tol) return 'Tepat Waktu';
    if (nowMinutes <= windowEnd + tol) return 'Terlambat';
    return 'Di Luar Sesi Presensi';
  }
}

// Compress image using CompressorJS to attempt target <= 10KB
function compressToTarget(file, targetBytes = 10240, minQuality = 0.25) {
  return new Promise((res, rej) => {
    // iterative approach: reduce quality until <= target or reach minQuality
    let q = 0.9;
    const attempt = () => {
      new Compressor(file, {
        quality: q,
        convertTypes: ['image/png','image/jpeg','image/webp'],
        success(result) {
          result.arrayBuffer().then(buf => {
            const size = buf.byteLength;
            if (size <= targetBytes || q <= minQuality) {
              res(new Blob([buf], { type: result.type }));
            } else {
              q = Math.max(minQuality, q - 0.15);
              attempt();
            }
          }).catch(rej);
        },
        error(err) { rej(err); }
      });
    };
    attempt();
  });
}

// Upload blob to Cloudinary unsigned
async function uploadToCloudinary(blob, folder = "presensi") {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', folder);

  const resp = await fetch(url, { method: 'POST', body: form });
  if (!resp.ok) throw new Error('Cloudinary upload failed');
  return resp.json();
}


// --- Core flows ---

// PRESENSI: take file (file object from input), jenis, uid, nama
async function submitPresensi(file, jenis, user) {
  try {
    toast('Mengompres gambar...');
    const compressed = await compressToTarget(file, 10240);
    toast('Uploading selfie...');
    const cloud = await uploadToCloudinary(compressed, `FupaSnack/presensi_${user.uid}`);
    const serverTime = await getServerTimestamp();
    // choose aturan: per user override or default
    const aturanUserSnap = await db.collection('aturanwaktuuser').doc(user.uid).get();
    const aturan = aturanUserSnap.exists ? aturanUserSnap.data() : ATURAN_DEFAULT;
    const status = determinePresensiStatus(serverTime.toDate ? serverTime.toDate() : new Date(), aturan, jenis);

    const doc = {
      uid: user.uid,
      nama: user.name || "",
      jenis, // berangkat / pulang
      status,
      waktu: serverTime,
      koordinat: user.lastCoords || "-",
      selfie: cloud.secure_url || cloud.url || "-",
      keterangan: ""
    };
    await db.collection('presensi').add(doc);
    toast('Presensi disimpan', '#2e7d32');
    return { ok: true, doc };
  } catch (e) {
    console.error(e);
    toast('Gagal upload presensi', '#c62828');
    return { ok: false, error: e };
  }
}

// CUTI: employee creates request
async function ajukanCuti(uid, nama, tanggal, jenis, keterangan) {
  const t = await db.collection('cuti').add({
    uid, nama, tanggal, jenis, keterangan,
    status: 'pending',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  // create admin notification
  await db.collection('notifikasi').add({
    jenis: 'cuti_request',
    targetRole: 'admin',
    refId: t.id,
    pesan: `${nama} mengajukan cuti tanggal ${tanggal}`,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    isRead: false
  });
  toast('Pengajuan cuti dikirim', '#2e7d32');
  return t.id;
}

// ADMIN: approve/decline cuti
async function putuskanCuti(cutiId, approve, adminUid, adminName) {
  const ref = db.collection('cuti').doc(cutiId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Cuti tidak ditemukan');
  const data = snap.data();
  await ref.update({ status: approve ? 'disetujui' : 'ditolak' });
  // notify employee
  await db.collection('notifikasi').add({
    uid: data.uid,
    jenis: 'cuti_status',
    refId: cutiId,
    pesan: approve ? `Cuti Anda disetujui` : `Cuti Anda ditolak`,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    isRead: false
  });
  if (approve) {
    // create presensi entry for that date
    await db.collection('presensi').add({
      uid: data.uid,
      nama: data.nama || '',
      tanggal: data.tanggal,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      jenis: 'Cuti',
      status: 'Full',
      koordinat: '-',
      selfie: '-',
      keterangan: 'Cuti disetujui oleh ' + adminName
    });
  }
  toast('Keputusan cuti tersimpan', '#2e7d32');
}

// NOTIFICATIONS listener (example usage)
function listenNotificationsFor(user) {
  const q = db.collection('notifikasi')
             .where('timestamp','!=',null)
             .orderBy('timestamp','desc')
             .limit(50);
  return q.onSnapshot(snap => {
    const arr = [];
    snap.forEach(d => {
      const data = d.data();
      // basic filter: show if targetRole matches or uid matches
      if (data.targetRole === 'karyawan' || data.targetRole === 'admin' || data.uid === user.uid || !data.targetRole) {
        arr.push({ id: d.id, ...data });
      }
    });
    // call UI update function (page should define onNotificationsUpdate to consume)
    if (window.onNotificationsUpdate) window.onNotificationsUpdate(arr);
  });
}

// EXPORT CSV (Admin)
async function exportCsv(params = {}) {
  // params: {namaFilter, periode:'harian'|'mingguan'|'bulanan'|'tahunan'|'custom', dari, sampai}
  const q = db.collection('presensi').orderBy('waktu','asc');
  const snap = await q.get();
  // group by name
  const map = {};
  snap.forEach(d => {
    const r = d.data();
    const n = r.nama || r.uid;
    if (!map[n]) map[n] = [];
    map[n].push(r);
  });
  // build CSV according to STDR: alphabetic names, each block sorted ascending by date
  const names = Object.keys(map).sort((a,b) => a.localeCompare(b, 'id'));
  let csv = '';
  for (const name of names) {
    csv += `Nama: ${name}\n`;
    const rows = map[name].sort((a,b) => new Date(a.waktu.seconds*1000) - new Date(b.waktu.seconds*1000));
    rows.forEach(r => {
      const waktu = r.waktu && r.waktu.toDate ? r.waktu.toDate().toLocaleString('id-ID') : (r.waktu || '-');
      csv += `${waktu},${r.nama || ''},${r.jenis || ''},${r.status || ''},${r.koordinat || ''},${r.selfie || ''}\n`;
    });
    csv += '\n';
  }
  // download
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rekap_presensi_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Exported API for pages:
window.FupaApp = {
  loadProfileAndEnsure,
  submitPresensi,
  ajukanCuti,
  putuskanCuti,
  listenNotificationsFor,
  exportCsv,
  getServerTimestamp,
  determinePresensiStatus,
  ATURAN_DEFAULT
};