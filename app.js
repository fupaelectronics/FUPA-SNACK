// app.js
// Cara setup:
// 1. Tambahkan sebelum </body> di setiap HTML (index.html, karyawan.html, admin.html):
//    <script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
//    <script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
//    <script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
//    <script defer src="app.js"></script>
// 2. Pastikan setiap halaman memiliki elemen dengan ID sesuai: 
//    #toast, #serverTime, #pfp, #nama, #alamat, #loginBtn, #email, #password, dll.

// Inisialisasi Firebase
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
const db   = firebase.firestore();

// Cloudinary config
const CLOUD_NAME    = 'da7idhh4f';
const UPLOAD_PRESET = 'FupaSnack';

// Role UIDs
const ADMIN_UIDS     = new Set([
  "O1SJ7hYop3UJjDcsA3JqT29aapI3",
  "uB2XsyM6fXUj493cRlHCqpe2fxH3"
]);
const KARYAWAN_UIDS = new Set([
  "7NJ9xoMgQlUbi68CMQWFN5bYvF62",
  "Jn7Fghq1fkNGx8f0z8sTGkxH94E2",
  "vB3i5h6offMxQslKf2U0J1ElpWS2",
  "tIGmvfnqtxf5QJlfPUy9O1uzHJ73",
  "zl7xjZaI6BdCLT7Z2WA34oTcFV42",
  "NainrtLo3BWRSJKImgIBYNLJEIv2",
  "9Y9s8E23TNbMlO9vZBVKQCGGG0Z2",
  "dDq2zTPs12Tn2v0Zh4IdObDcD7g2",
  "Tkqf05IzI9UTvy4BF0nWtZwbz8j2",
  "pMbjHKjsZLWtNHi7PTc8cDJ254w2",
  "G0qTjLBc6MeRMPziNTzIT6N32ZM2"
]);

// Default presensi rules (AturanDefaultWaktu)
let timeRules = {
  berangkat: "05:30",
  pulang:    "10:00",
  tol:       20,
  libur:     [0]  // Minggu
};

// Util UI
function toast(msg, type = 'info') {
  const t = document.querySelector('#toast');
  if (!t) return alert(msg);
  const colors = {
    success: '#2e7d32',
    error:   '#c62828',
    warning: '#f9a825',
    info:    '#111'
  };
  t.style.backgroundColor = colors[type] || colors.info;
  t.textContent = msg;
  t.style.display   = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// Live server time
function updateServerTime() {
  const now = new Date();
  const opts = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  };
  const el = document.querySelector('#serverTime');
  if (el) el.textContent = now.toLocaleDateString('id-ID', opts);
}

// Load custom time rules from Firestore (SfTime)
async function loadTimeRules() {
  try {
    const snap = await db.collection('timeRules').get();
    snap.docs.forEach(doc => {
      const d = doc.data();
      timeRules = {
        berangkat: d.berangkat || timeRules.berangkat,
        pulang:    d.pulang    || timeRules.pulang,
        tol:       d.tol       || timeRules.tol,
        libur:     d.libur     || timeRules.libur
      };
    });
  } catch (e) {
    console.error('Error loading timeRules:', e);
  }
}

// Redirect by role
function redirectByRole(uid) {
  if (ADMIN_UIDS.has(uid))     return 'admin.html';
  if (KARYAWAN_UIDS.has(uid)) return 'karyawan.html';
  return null;
}

// Auth state listener
auth.onAuthStateChanged(async user => {
  const page = window.location.pathname.split('/').pop();
  if (!user) {
    if (page !== 'index.html') window.location.href = 'index.html';
    return;
  }
  if (page === 'index.html') {
    const dest = redirectByRole(user.uid);
    if (dest) {
      window.location.href = dest;
    } else {
      await auth.signOut();
      toast('Akun belum diberi peran!', 'error');
    }
    return;
  }
  // Prevent role mix
  if (page === 'karyawan.html' && ADMIN_UIDS.has(user.uid)) {
    window.location.href = 'admin.html';
    return;
  }
  if (page === 'admin.html'   && KARYAWAN_UIDS.has(user.uid)) {
    window.location.href = 'karyawan.html';
    return;
  }
  // Setelah validasi, muat data dasar
  startServerTime();
  await loadTimeRules();
  loadUserProfile(user);
  loadAnnouncements();
  if (page === 'karyawan.html') {
    loadNotifications(user.uid);
    loadHistory(user.uid);
  }
  if (page === 'admin.html') {
    loadLeaveRequests();
    loadAllHistory();
  }
});

// Mulai update waktu
function startServerTime() {
  updateServerTime();
  setInterval(updateServerTime, 1000);
}

// Load profile & set UI
async function loadUserProfile(user) {
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    const d   = doc.data() || {};
    const img = document.querySelector('#pfp');
    if (img && d.photoURL) img.src = d.photoURL;
    const nm = document.querySelector('#nama');
    if (nm) nm.value = d.name || '';
    const ad = document.querySelector('#alamat');
    if (ad) ad.value = d.address || '';
  } catch (e) {
    console.error('Error loading profile:', e);
  }
}

// ––– Lanjutan di part 2 –––
// ––– Lanjutan di part 2 –––

// AUTO COLLECTION: pastikan dokumen dasar ada
async function ensureCollections() {
  // Pastikan dokumen pengguna (users) ada untuk semua UID
  const uids = [...ADMIN_UIDS, ...KARYAWAN_UIDS];
  const usersCol = db.collection('users');
  for (const uid of uids) {
    const doc = usersCol.doc(uid);
    const snap = await doc.get();
    if (!snap.exists) {
      await doc.set({
        userId: uid,
        name: '',
        address: '',
        photoURL: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }
  // Pastikan dokumen timeRules default ada
  const trDoc = db.collection('timeRules').doc('default');
  const trSnap = await trDoc.get();
  if (!trSnap.exists) {
    await trDoc.set({
      berangkat: timeRules.berangkat,
      pulang:    timeRules.pulang,
      tol:       timeRules.tol,
      libur:     timeRules.libur,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}
ensureCollections();

// STATUS PRESENSI: hitung status berdasarkan aturan & OVD
async function getPresenceStatus(ts) {
  const now = ts ? ts.toDate() : new Date();
  const h = now.getHours();
  // muat OVD hari ini
  const ovdSnap = await db.collection('ovd').doc('today').get();
  const ovd = ovdSnap.exists ? ovdSnap.data().mode : 'auto';
  if (ovd === 'forceOn') return 'Sesi Presensi Berangkat';
  if (ovd === 'forceOff') return 'Libur';
  // default:
  const day = now.getDay();
  if (timeRules.libur.includes(day)) return 'Libur';
  // berangkat window
  const [bh, bm] = timeRules.berangkat.split(':').map(Number);
  const [ph, pm] = timeRules.pulang.split(':').map(Number);
  const tol = timeRules.tol;
  const diff = (d1, d2) => (d1 - d2) / 60000; // menit
  const tmin = now.getHours() * 60 + now.getMinutes();
  const bmin = bh * 60 + bm;
  const pmin = ph * 60 + pm;
  if (tmin >= bmin - tol && tmin <= bmin + tol) return 'Sesi Presensi Berangkat';
  if (tmin >= pmin - tol && tmin <= pmin + tol) return 'Sesi Presensi Pulang';
  if (tmin < bmin - tol || (tmin > bmin + tol && tmin < pmin - tol) || tmin > pmin + tol) return 'Di Luar Sesi Presensi';
  return tmin < bmin ? 'Di Luar Sesi Presensi' :
         tmin <= bmin + tol ? 'Tepat Waktu' : 'Terlambat';
}

// KOMPRES & UPLOAD IMAGE ke Cloudinary
function compressImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    const fr  = new FileReader();
    fr.onload = () => {
      img.src = fr.result;
    };
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx    = canvas.getContext('2d');
      const scale  = 400 / img.width;
      canvas.width  = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async blob => {
        // quality iterasi hingga <10kb
        let q = 0.9, b;
        do {
          b = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
          q -= 0.1;
        } while (b.size > 10000 && q > 0);
        res(b);
      }, 'image/jpeg', q);
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function uploadToCloudinary(blob) {
  const data = new FormData();
  data.append('file', blob);
  data.append('upload_preset', UPLOAD_PRESET);
  const resp = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
    method: 'POST', body: data
  });
  const j = await resp.json();
  return j.secure_url;
}

// LOAD ANNOUNCEMENTS (PAG)
function loadAnnouncements() {
  db.collection('announcements')
    .orderBy('timestamp','desc')
    .onSnapshot(snap => {
      const list = document.querySelector('#announceList');
      if (!list) return;
      list.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const el = document.createElement('div');
        el.classList.add('notif-item');
        el.innerHTML = `
          <div class="notif-content">
            <div style="font-weight:600">${d.content}</div>
            <div style="font-size:12px;opacity:.7">${new Date(d.timestamp.toDate()).toLocaleString('id-ID')}</div>
          </div>`;
        list.appendChild(el);
      });
    });
}

// KARYAWAN –– NOTIFICATIONS (NTF)
function loadNotifications(uid) {
  db.collection('notifications')
    .where('targetUid','==',uid)
    .orderBy('timestamp','desc')
    .onSnapshot(snap => {
      const btn = document.querySelector('#notifBtn');
      const badge = document.querySelector('#notifBadge');
      const list = document.querySelector('#notifList');
      if (!list) return;
      list.innerHTML = '';
      let count = 0;
      snap.forEach(doc => {
        const d = doc.data();
        const item = document.createElement('div');
        item.classList.add('notif-item');
        item.dataset.id = doc.id;
        item.innerHTML = `
          <div class="notif-content">
            <div style="font-weight:600">${d.content}</div>
            <div style="font-size:12px;opacity:.7">${new Date(d.timestamp.toDate()).toLocaleString('id-ID')}</div>
          </div>
          <div class="notif-actions">
            <button class="icon-btn mark-read" title="Tandai sudah dibaca">
              <span class="material-symbols-rounded">check_circle</span>
            </button>
          </div>`;
        list.appendChild(item);
        if (!d.read) count++;
      });
      badge.textContent = count;
      // mark-read handler
      list.querySelectorAll('.mark-read').forEach(btn => {
        btn.onclick = async () => {
          const docId = btn.closest('.notif-item').dataset.id;
          await db.collection('notifications').doc(docId).update({ read:true });
          toast('Notifikasi sudah dibaca','success');
        };
      });
    });
}

// KARYAWAN –– RIWAYAT PRESENSI
async function loadHistory(uid) {
  const f = document.querySelector('#historyFilter').value;
  let q = db.collection('presences')
            .where('userId','==',uid)
            .orderBy('timestamp','desc');
  if (f !== 'all') q = q.limit(Number(f));
  const snap = await q.get();
  const list = document.querySelector('#logList');
  if (!list) return;
  list.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    const el = document.createElement('div');
    el.classList.add('riwayat-item');
    el.innerHTML = `
      <div class="riwayat-jenis">
        <span class="material-symbols-rounded">${d.type==='berangkat'?'login':'logout'}</span>
        ${d.type}
        <span class="status ${d.status==='tepat waktu'?'s-good':d.status==='Libur'?'s-bad':'s-warn'}" style="margin-left:auto;font-size:12px">
          ${d.status}
        </span>
      </div>
      <div class="riwayat-time">${new Date(d.timestamp.toDate()).toLocaleString('id-ID')}</div>`;
    list.appendChild(el);
  });
}

// ADMIN –– SEMUA RIWAYAT & EXPORT CSV (CRUD + STDR)
let allHistoryCache = [];
async function loadAllHistory() {
  const nameF = document.querySelector('#fNama').value.toLowerCase();
  const per   = document.querySelector('#fPeriode').value;
  const show  = document.querySelector('#fShow').value;
  let q = db.collection('presences').orderBy('timestamp','desc');
  // filter nama
  if (nameF) {
    const users = await db.collection('users')
                          .where('nameLower','>=',nameF)
                          .where('nameLower','<',nameF+'\uf8ff')
                          .get();
    const uids = users.docs.map(d=>d.id);
    q = q.where('userId','in',uids.length?uids:['']); 
  }
  // periode
  const now = new Date();
  let start, end;
  switch(per) {
    case 'harian':
      start = new Date(now.setHours(0,0,0,0));
      end   = new Date(now.setHours(23,59,59,999));
      break;
    case 'mingguan':
      const day = now.getDay();
      start = new Date(now.setDate(now.getDate()-day),0,0,0,0);
      end   = new Date(now.setDate(now.getDate()+(6-day)),23,59,59,999);
      break;
    case 'bulanan':
      start = new Date(now.getFullYear(),now.getMonth(),1);
      end   = new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999);
      break;
    case 'tahunan':
      start = new Date(now.getFullYear(),0,1);
      end   = new Date(now.getFullYear(),11,31,23,59,59,999);
      break;
    case 'custom':
      start = new Date(document.querySelector('#fDari').value);
      end   = new Date(document.querySelector('#fSampai').value);
      end.setHours(23,59,59,999);
      break;
  }
  if (start && end) q = q.where('timestamp','>=',start).where('timestamp','<=',end);
  const snap = await q.get();
  const data = snap.docs.map(d=> ({ id:d.id, ...d.data() }) );
  allHistoryCache = data;
  renderHistoryTable(data, show);
}

function renderHistoryTable(data, show) {
  const body = document.querySelector('#tableBody');
  if (!body) return;
  body.innerHTML = '';
  const toShow = show==='all'?data:data.slice(0,Number(show));
  toShow.forEach(d => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(d.timestamp.toDate()).toLocaleDateString('id-ID')}<br>${new Date(d.timestamp.toDate()).toLocaleTimeString('id-ID')}</td>
      <td>${d.name}</td>
      <td>${d.type}</td>
      <td><span class="status ${d.status==='tepat waktu'?'s-good':d.status==='Libur'?'s-bad':'s-warn'}">${d.status}</span></td>
      <td>${d.coords || '-'}</td>
      <td>${d.photoURL?`<a href="${d.photoURL}" target="_blank">Lihat Foto</a>`:'-'}</td>`;
    body.appendChild(row);
  });
}

// ADMIN –– PENGAJUAN CUTI (CUTIY & CUTIX)
function loadLeaveRequests() {
  db.collection('notifications')
    .where('type','==','cutiRequest')
    .orderBy('timestamp','desc')
    .onSnapshot(snap => {
      const list = document.querySelector('#cutiList');
      if (!list) return;
      list.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const item = document.createElement('div');
        item.classList.add('cuti-item');
        item.dataset.id = doc.id;
        item.innerHTML = `
          <div><strong>${d.name}</strong> mengajukan cuti <strong>${d.cutiJenis}</strong></div>
          <div>Tanggal: ${d.cutiTanggal}</div>
          <div>Keterangan: ${d.cutiCatatan||'-'}</div>
          <div style="font-size:12px;opacity:.7">Diajukan pada: ${new Date(d.timestamp.toDate()).toLocaleString('id-ID')}</div>
          <div class="cuti-actions">
            <button class="btn approve-btn" style="background:var(--good)">
              <span class="material-symbols-rounded">check</span> Setujui
            </button>
            <button class="btn reject-btn" style="background:var(--bad)">
              <span class="material-symbols-rounded">close</span> Tolak
            </button>
          </div>`;
        list.appendChild(item);
      });
      // approve
      list.querySelectorAll('.approve-btn').forEach(btn => btn.onclick = async () => {
        const id = btn.closest('.cuti-item').dataset.id;
        const doc = await db.collection('notifications').doc(id).get();
        const d = doc.data();
        // buat riwayat CUTIX
        await db.collection('presences').add({
          userId:   d.userId,
          name:     d.name,
          type:     'cuti',
          status:   d.cutiJenis,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        // notif ke karyawan
        await db.collection('notifications').add({
          targetUid: d.userId,
          content:   `Cuti ${d.cutiJenis} Anda disetujui`,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          read:      false,
          type:      'cutiApproved'
        });
        // tandai request sudah diproses
        await db.collection('notifications').doc(id).update({ processed:true });
        toast('Cuti disetujui','success');
      });
      // reject
      list.querySelectorAll('.reject-btn').forEach(btn => btn.onclick = async () => {
        const id = btn.closest('.cuti-item').dataset.id;
        const doc = await db.collection('notifications').doc(id).get();
        const d = doc.data();
        // notif ke karyawan
        await db.collection('notifications').add({
          targetUid: d.userId,
          content:   `Cuti ${d.cutiJenis} Anda ditolak`,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          read:      false,
          type:      'cutiRejected'
        });
        await db.collection('notifications').doc(id).update({ processed:true });
        toast('Cuti ditolak','warning');
      });
    });
}

// KARYAWAN –– AJUKAN CUTI
document.querySelector('#ajukanCutiBtn')?.addEventListener('click', async () => {
  const jenis   = document.querySelector('#cutiJenis').value;
  const tanggal = document.querySelector('#cutiTanggal').value;
  const catatan = document.querySelector('#cutiCatatan').value;
  const user    = auth.currentUser;
  const prof    = await db.collection('users').doc(user.uid).get();
  const name    = prof.data().name || '';
  // buat notifikasi request ke semua admin
  const now     = firebase.firestore.FieldValue.serverTimestamp();
  for (const aid of ADMIN_UIDS) {
    await db.collection('notifications').add({
      userId:      user.uid,
      name,
      cutiJenis:   jenis,
      cutiTanggal: tanggal,
      cutiCatatan: catatan,
      targetUid:   aid,
      content:     `${name} mengajukan cuti ${jenis}`,
      timestamp:   now,
      read:        false,
      type:        'cutiRequest'
    });
  }
  toast('Cuti berhasil diajukan','success');
  document.querySelector('#cutiDlg').close();
});

// KARYAWAN –– ALUR PRESENSI
let videoStream, snapshotBlob;
async function initCamera() {
  const video = document.querySelector('video');
  if (!video) return;
  videoStream = await navigator.mediaDevices.getUserMedia({ video:true });
  video.srcObject = videoStream;
  await video.play();
}
document.querySelector('#snapBtn')?.addEventListener('click', () => {
  const video = document.querySelector('video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height= video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  canvas.toBlob(b => {
    snapshotBlob = b;
    const img = document.querySelector('#previewImg');
    if (img) img.src = URL.createObjectURL(b);
    document.querySelector('#uploadBtn').disabled = false;
  },'image/jpeg');
});

document.querySelector('#uploadBtn')?.addEventListener('click', async () => {
  const jenis = document.querySelector('#jenis').value;
  const user  = auth.currentUser;
  document.querySelector('#uploadBtn').disabled = true;
  document.querySelector('#uploadBtn').innerHTML = '<span class="spinner"></span> Mengupload...';
  // koordinat
  const pos = await new Promise(r => navigator.geolocation.getCurrentPosition(r));
  const coords = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
  // compress & upload
  const blob = await compressImage(new File([snapshotBlob],'selfie.jpg'));
  const url  = await uploadToCloudinary(blob);
  // status
  const status = await getPresenceStatus();
  // simpan presensi
  await db.collection('presences').add({
    userId:    user.uid,
    name:      (await db.collection('users').doc(user.uid).get()).data().name||'',
    coords,
    photoURL:  url,
    type:      jenis,
    status,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  // notif ke admin
  for (const aid of ADMIN_UIDS) {
    await db.collection('notifications').add({
      targetUid: aid,
      content:   `${user.email} melakukan presensi ${jenis} (${status})`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read:      false,
      type:      'presence'
    });
  }
  toast('Presensi berhasil dicatat','success');
  document.querySelector('#uploadBtn').innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  loadHistory(user.uid);
});

// PROFIL UPDATE
document.querySelector('#saveProfileBtn')?.addEventListener('click', async () => {
  const user = auth.currentUser;
  const file = document.querySelector('#pfpFile').files[0];
  let url;
  if (file) {
    const blob = await compressImage(file);
    url = await uploadToCloudinary(blob);
  }
  const name    = document.querySelector('#nama').value;
  const address = document.querySelector('#alamat').value;
  await db.collection('users').doc(user.uid).update({
    name,
    nameLower: name.toLowerCase(),
    address,
    ...(url?{ photoURL:url }:{}),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  toast('Profil berhasil disimpan','success');
  document.querySelector('#profileDlg').close();
  loadUserProfile(user);
});

// OVERRIDE PRESENSI (OVD)
document.querySelector('#saveSchedule')?.addEventListener('click', async () => {
  const mode = document.querySelector('#wajibHari').value;
  await db.collection('ovd').doc('today').set({ mode });
  toast('Pengaturan presensi hari ini disimpan','success');
});

// ATURAN WAKTU KUSTOM (SfTime)
document.querySelector('#saveRulesBtn')?.addEventListener('click', async () => {
  const target = document.querySelector('#rulesTarget').value;
  const ber    = document.querySelector('#rulesBerangkat').value;
  const pul    = document.querySelector('#rulesPulang').value;
  const opts   = Array.from(document.querySelector('#rulesLibur').selectedOptions).map(o => Number(o.value));
  if (target === 'all') {
    await db.collection('timeRules').doc('default').set({ berangkat:ber, pulang:pul, tol:timeRules.tol, libur:opts });
  } else {
    // karyawan tertentu
    const list = document.querySelectorAll('#rulesUserList .user-item.selected');
    for (const el of list) {
      const uid = ADMIN_UIDS.has(el.textContent)? null : KARYAWAN_UIDS.has(el.textContent)? el.textContent : null;
      if (uid) {
        await db.collection('timeRules').doc(uid).set({ berangkat:ber, pulang:pul, tol:timeRules.tol, libur:opts });
      }
    }
  }
  toast('Aturan waktu berhasil disimpan','success');
  document.querySelector('#timeRulesDlg').close();
  await loadTimeRules();
});

// EVENT FILTER & CSV
document.querySelector('#applyFilter')?.addEventListener('click', loadAllHistory);
document.querySelector('#exportCsv')?.addEventListener('click', () => {
  // Buat CSV dari allHistoryCache sesuai STDR
  let csv = 'Nama,Timestamp,Jenis,Status,Koordinat,Selfie URL\n';
  allHistoryCache.sort((a,b)=> a.name.localeCompare(b.name) || a.timestamp.toDate() - b.timestamp.toDate());
  allHistoryCache.forEach(d => {
    csv += `"${d.name}","${d.timestamp.toDate().toLocaleString('id-ID')}","${d.type}","${d.status}","${d.coords||''}","${d.photoURL||''}"\n`;
  });
  const blob = new Blob([csv],{ type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `rekap_presensi_${new Date().toISOString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV berhasil diekspor','success');
});

// DOM READY: pasang listener filter history
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#historyFilter')?.addEventListener('change', () => {
    const uid = auth.currentUser?.uid;
    if (uid) loadHistory(uid);
  });
  document.querySelector('#fPeriode')?.addEventListener('change', () => {
    document.querySelector('#customDateRange').style.display = 
      document.querySelector('#fPeriode').value === 'custom' ? 'flex' : 'none';
  });
  document.querySelector('#fShow')?.addEventListener('change', () => loadAllHistory());
});