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
const db = firebase.firestore();

// Fungsi utilitas
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const toast = (msg, type = 'info') => {
  const t = $("#toast");
  if (!t) return alert(msg);
  
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

// Variabel global
let currentUser = null;
let userData = null;
let userPresenceHistory = [];
let allPresenceHistory = [];
let currentStream = null;
let capturedPhoto = null;
let currentLocation = null;

// Fungsi untuk mendapatkan waktu Indonesia
function getWIBTime() {
  const now = new Date();
  const offset = 7; // WIB is UTC+7
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * offset));
}

// Fungsi untuk memeriksa status presensi berdasarkan waktu
function getPresenceStatus(shift, jenis, waktu) {
  const now = waktu || getWIBTime();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Hari Minggu adalah libur
  if (day === 0) return { status: "Libur", color: "s-bad" };
  
  // Konversi waktu ke menit sejak tengah malam
  const currentMinutes = hours * 60 + minutes;
  
  // Aturan waktu default
  const rules = {
    pagi: {
      berangkat: { start: 5*60+30, end: 6*60, lateEnd: 6*60+20 },
      pulang: { start: 10*60, end: 11*60, lateEnd: 11*60+20 }
    },
    sore: {
      berangkat: { start: 14*60, end: 14*60+30, lateEnd: 14*60+50 },
      pulang: { start: 17*60+30, end: 18*60+30, lateEnd: 18*60+50 }
    }
  };
  
  // Jika jenis izin, selalu diizinkan
  if (jenis === "izin") return { status: "Izin", color: "s-warn" };
  
  // Periksa sesuai shift dan jenis
  if (rules[shift] && rules[shift][jenis]) {
    const rule = rules[shift][jenis];
    
    if (currentMinutes >= rule.start && currentMinutes <= rule.end) {
      return { status: "Tepat Waktu", color: "s-good" };
    } else if (currentMinutes > rule.end && currentMinutes <= rule.lateEnd) {
      return { status: "Terlambat", color: "s-warn" };
    }
  }
  
  return { status: "Di luar sesi presensi", color: "s-bad" };
}

// Fungsi untuk menentukan shift berdasarkan waktu
function getCurrentShift() {
  const now = getWIBTime();
  const hours = now.getHours();
  
  if (hours >= 5 && hours < 12) return "pagi";
  if (hours >= 12 && hours < 18) return "sore";
  return "pagi"; // Default ke pagi
}

// Fungsi untuk memuat data pengguna
async function loadUserData(uid) {
  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) {
      userData = doc.data();
      return userData;
    } else {
      // Jika data user tidak ada, buat dokumen baru
      userData = {
        nama: "",
        alamat: "",
        foto: `https://api.dicebear.com/7.x/initials/svg?seed=${uid}&backgroundColor=ffb300,ffd54f&radius=20`,
        role: "karyawan",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection("users").doc(uid).set(userData);
      return userData;
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    toast("Gagal memuat data pengguna", "error");
    return null;
  }
}

// Fungsi untuk memperbarui profil pengguna
async function updateProfile(uid, data) {
  try {
    await db.collection("users").doc(uid).update({
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    userData = { ...userData, ...data };
    toast("Profil berhasil diperbarui", "success");
    return true;
  } catch (error) {
    console.error("Error updating profile:", error);
    toast("Gagal memperbarui profil", "error");
    return false;
  }
}

// Fungsi untuk mendapatkan lokasi pengguna
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation tidak didukung"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        resolve(currentLocation);
      },
      (error) => {
        console.error("Error getting location:", error);
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Fungsi untuk mengakses kamera
async function startCamera() {
  try {
    const video = $("#cameraVideo");
    if (!video) return;
    
    // Hentikan stream sebelumnya jika ada
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    
    // Dapatkan akses ke kamera
    currentStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "user" }, 
      audio: false 
    });
    
    video.srcObject = currentStream;
    video.style.display = "block";
    $("#cameraPlaceholder").style.display = "none";
    
    return true;
  } catch (error) {
    console.error("Error accessing camera:", error);
    $("#cameraPlaceholder").style.display = "flex";
    $("#cameraVideo").style.display = "none";
    toast("Tidak dapat mengakses kamera", "error");
    return false;
  }
}

// Fungsi untuk mengambil foto
function capturePhoto() {
  const video = $("#cameraVideo");
  const canvas = $("#photoCanvas");
  const preview = $("#photoPreview");
  
  if (!video || !canvas || !preview) return null;
  
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Konversi canvas ke data URL
  capturedPhoto = canvas.toDataURL('image/jpeg', 0.7);
  preview.src = capturedPhoto;
  preview.style.display = "block";
  video.style.display = "none";
  
  return capturedPhoto;
}

// Fungsi untuk mengompres gambar
function compressImage(dataUrl, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Skala ukuran jika diperlukan
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Konversi ke JPEG dan kompres
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    
    img.onerror = function() {
      resolve(dataUrl); // Fallback ke original jika gagal
    };
  });
}

// Fungsi untuk mengupload foto ke Cloudinary
async function uploadToCloudinary(imageData) {
  const cloudName = "da7idhh4f";
  const uploadPreset = "FupaSnack";
  
  try {
    // Kompres gambar terlebih dahulu
    const compressedImage = await compressImage(imageData, 800, 0.7);
    
    const formData = new FormData();
    formData.append("file", compressedImage);
    formData.append("upload_preset", uploadPreset);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    throw new Error("Gagal mengupload foto");
  }
}

// Fungsi untuk mencatat presensi
async function recordPresence(uid, data) {
  try {
    // Periksa apakah sudah ada presensi dengan jenis yang sama hari ini
    const today = getWIBTime();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const existingPresence = await db.collection("presensi")
      .where("uid", "==", uid)
      .where("jenis", "==", data.jenis)
      .where("waktu", ">=", today)
      .where("waktu", "<", tomorrow)
      .get();
    
    if (!existingPresence.empty && data.jenis !== "izin") {
      toast(`Anda sudah melakukan presensi ${data.jenis} hari ini`, "warning");
      return false;
    }
    
    // Upload foto ke Cloudinary
    const fotoUrl = await uploadToCloudinary(data.foto);
    
    // Simpan data presensi
    const presenceData = {
      uid: uid,
      nama: data.nama,
      waktu: firebase.firestore.FieldValue.serverTimestamp(),
      shift: data.shift,
      jenis: data.jenis,
      status: data.status,
      koordinat: new firebase.firestore.GeoPoint(data.koordinat.lat, data.koordinat.lng),
      foto: fotoUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection("presensi").add(presenceData);
    toast("Presensi berhasil dicatat", "success");
    return true;
  } catch (error) {
    console.error("Error recording presence:", error);
    toast("Gagal mencatat presensi", "error");
    return false;
  }
}

// Fungsi untuk memuat riwayat presensi
async function loadPresenceHistory(uid, isAdmin = false) {
  try {
    let query = db.collection("presensi").orderBy("waktu", "desc");
    
    if (!isAdmin) {
      // Untuk karyawan, hanya tampilkan presensi sendiri
      query = query.where("uid", "==", uid);
    }
    
    const snapshot = await query.limit(100).get();
    const history = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      history.push({
        id: doc.id,
        waktu: data.waktu ? data.waktu.toDate() : new Date(),
        nama: data.nama || "Unknown",
        shift: data.shift || "pagi",
        jenis: data.jenis || "berangkat",
        status: data.status || "Tepat Waktu",
        koordinat: data.koordinat ? `${data.koordinat.latitude}, ${data.koordinat.longitude}` : "0, 0",
        foto: data.foto || ""
      });
    });
    
    if (isAdmin) {
      allPresenceHistory = history;
    } else {
      userPresenceHistory = history;
    }
    
    return history;
  } catch (error) {
    console.error("Error loading presence history:", error);
    toast("Gagal memuat riwayat presensi", "error");
    return [];
  }
}

// Fungsi untuk mengekspor data ke CSV
function exportToCSV(data, filename = "presensi.csv") {
  if (data.length === 0) {
    toast("Tidak ada data untuk diekspor", "warning");
    return;
  }
  
  // Urutkan data berdasarkan nama dan waktu
  const sortedData = [...data].sort((a, b) => {
    // Urutkan berdasarkan nama A-Z
    if (a.nama < b.nama) return -1;
    if (a.nama > b.nama) return 1;
    
    // Jika nama sama, urutkan berdasarkan waktu
    return a.waktu - b.waktu;
  });
  
  // Buat header CSV
  let csv = "Nama,Tanggal,Shift,Jenis,Status,Koordinat\n";
  
  // Tambahkan data
  sortedData.forEach(item => {
    const date = item.waktu.toLocaleDateString('id-ID');
    csv += `"${item.nama}","${date}","${item.shift}","${item.jenis}","${item.status}","${item.koordinat}"\n`;
  });
  
  // Buat blob dan download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Fungsi untuk memfilter riwayat presensi
function filterPresenceHistory(filters) {
  let filtered = [...allPresenceHistory];
  
  // Filter berdasarkan nama
  if (filters.nama) {
    const searchTerm = filters.nama.toLowerCase();
    filtered = filtered.filter(item => 
      item.nama.toLowerCase().includes(searchTerm)
    );
  }
  
  // Filter berdasarkan periode
  if (filters.periode && filters.periode !== "all") {
    const now = new Date();
    let startDate;
    
    switch (filters.periode) {
      case "harian":
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "mingguan":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "bulanan":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "tahunan":
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case "custom":
        if (filters.dari && filters.sampai) {
          startDate = new Date(filters.dari);
          const endDate = new Date(filters.sampai);
          endDate.setHours(23, 59, 59, 999);
          
          filtered = filtered.filter(item => {
            const itemDate = item.waktu;
            return itemDate >= startDate && itemDate <= endDate;
          });
        }
        break;
    }
    
    if (filters.periode !== "custom") {
      filtered = filtered.filter(item => item.waktu >= startDate);
    }
  }
  
  // Batasi jumlah data yang ditampilkan
  if (filters.limit && filters.limit !== "all") {
    filtered = filtered.slice(0, parseInt(filters.limit));
  }
  
  return filtered;
}

// Fungsi untuk memuat dan menampilkan riwayat presensi di admin
function renderPresenceTable(data) {
  const tableBody = $("#tableBody");
  if (!tableBody) return;
  
  tableBody.innerHTML = "";
  
  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>`;
    return;
  }
  
  data.forEach(item => {
    const row = document.createElement("tr");
    
    // Format waktu
    const waktuStr = item.waktu.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Tentukan kelas status
    let statusClass = "s-good";
    if (item.status.includes("Terlambat")) statusClass = "s-warn";
    if (item.status.includes("Libur") || item.status.includes("luar")) statusClass = "s-bad";
    
    row.innerHTML = `
      <td>${waktuStr}</td>
      <td>${item.nama}</td>
      <td>${item.jenis}</td>
      <td><span class="status ${statusClass}">${item.status}</span></td>
      <td>${item.koordinat}</td>
      <td><a href="${item.foto}" target="_blank">Lihat Foto</a></td>
    `;
    
    tableBody.appendChild(row);
  });
}

// Fungsi untuk logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = "index.html";
  }).catch(error => {
    console.error("Error signing out:", error);
    toast("Gagal logout", "error");
  });
}

// Inisialisasi aplikasi setelah login
function initApp() {
  // Periksa status auth
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      
      // Muat data pengguna
      userData = await loadUserData(user.uid);
      
      // Jika data user kosong, tampilkan popup profil
      if ((!userData.nama || !userData.alamat) && window.showProfileModal) {
        window.showProfileModal();
      }
      
      // Perbarui UI dengan data pengguna
      updateUIWithUserData();
      
      // Inisialisasi berdasarkan halaman
      if (window.location.pathname.includes("karyawan.html")) {
        initKaryawanPage();
      } else if (window.location.pathname.includes("admin.html")) {
        initAdminPage();
      }
    } else {
      // Redirect ke login jika belum login
      window.location.href = "index.html";
    }
  });
}

// Fungsi untuk memperbarui UI dengan data pengguna
function updateUIWithUserData() {
  if (!userData) return;
  
  // Perbarui elemen profil jika ada
  const namaElem = $("#nama");
  const alamatElem = $("#alamat");
  const pfpElem = $("#pfp");
  
  if (namaElem) namaElem.value = userData.nama || "";
  if (alamatElem) alamatElem.value = userData.alamat || "";
  if (pfpElem) pfpElem.src = userData.foto || `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.uid}&backgroundColor=ffb300,ffd54f&radius=20`;
}

// Inisialisasi halaman karyawan
function initKaryawanPage() {
  // Mulai kamera
  startCamera();
  
  // Dapatkan lokasi
  getLocation().then(loc => {
    $("#locText").textContent = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
  }).catch(error => {
    console.error("Error getting location:", error);
    $("#locText").textContent = "Tidak dapat mengakses lokasi";
  });
  
  // Perbarui waktu server
  function updateServerTime() {
    const now = getWIBTime();
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    
    $("#serverTime").textContent = now.toLocaleDateString('id-ID', options);
    
    // Perbarui status presensi
    const shift = getCurrentShift();
    const jenis = $("#jenis").value;
    const status = getPresenceStatus(shift, jenis, now);
    
    $("#statusText").textContent = status.status;
    $("#statusChip").className = `status ${status.color}`;
  }
  
  // Jalankan pertama kali dan set interval
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Event listener untuk tombol ambil foto
  $("#snapBtn").addEventListener("click", () => {
    capturePhoto();
    $("#uploadBtn").disabled = false;
  });
  
  // Event listener untuk tombol upload
  $("#uploadBtn").addEventListener("click", async () => {
    if (!capturedPhoto) {
      toast("Ambil foto terlebih dahulu", "warning");
      return;
    }
    
    $("#uploadBtn").disabled = true;
    $("#uploadBtn").innerHTML = '<span class="spinner"></span> Mengupload...';
    
    try {
      const shift = getCurrentShift();
      const jenis = $("#jenis").value;
      const now = getWIBTime();
      const status = getPresenceStatus(shift, jenis, now);
      
      // Jika di luar sesi presensi dan bukan izin, batalkan
      if (status.status.includes("luar sesi") && jenis !== "izin") {
        toast("Tidak dalam sesi presensi", "warning");
        $("#uploadBtn").disabled = false;
        $("#uploadBtn").innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
        return;
      }
      
      const success = await recordPresence(currentUser.uid, {
        nama: userData.nama,
        shift: shift,
        jenis: jenis,
        status: status.status,
        koordinat: currentLocation,
        foto: capturedPhoto
      });
      
      if (success) {
        // Reset UI
        capturedPhoto = null;
        $("#photoPreview").style.display = "none";
        startCamera();
      }
    } catch (error) {
      console.error("Error uploading presence:", error);
    }
    
    $("#uploadBtn").disabled = false;
    $("#uploadBtn").innerHTML = '<span class="material-symbols-rounded">cloud_upload</span> Upload';
  });
  
  // Event listener untuk perubahan jenis presensi
  $("#jenis").addEventListener("change", updateServerTime);
}

// Inisialisasi halaman admin
function initAdminPage() {
  // Muat riwayat presensi semua karyawan
  loadPresenceHistory(currentUser.uid, true).then(history => {
    renderPresenceTable(history);
  });
  
  // Perbarui waktu server
  function updateServerTime() {
    const now = getWIBTime();
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    
    $("#serverTime").textContent = now.toLocaleDateString('id-ID', options);
  }
  
  // Jalankan pertama kali dan set interval
  updateServerTime();
  setInterval(updateServerTime, 1000);
  
  // Event listener untuk filter
  $("#applyFilter").addEventListener("click", () => {
    const filters = {
      nama: $("#fNama").value,
      periode: $("#fPeriode").value,
      dari: $("#fDari").value,
      sampai: $("#fSampai").value,
      limit: $("#fShow").value
    };
    
    const filteredData = filterPresenceHistory(filters);
    renderPresenceTable(filteredData);
  });
  
  // Toggle custom date range
  $("#fPeriode").addEventListener("change", () => {
    $("#customDateRange").style.display = 
      $("#fPeriode").value === "custom" ? "flex" : "none";
  });
  
  // Event listener untuk ekspor CSV
  $("#exportCsv").addEventListener("click", () => {
    const filters = {
      nama: $("#fNama").value,
      periode: $("#fPeriode").value,
      dari: $("#fDari").value,
      sampai: $("#fSampai").value,
      limit: "all" // Selalu ekspor semua data yang difilter
    };
    
    const filteredData = filterPresenceHistory(filters);
    exportToCSV(filteredData, `presensi-${new Date().toISOString().slice(0,10)}.csv`);
  });
}

// Event listener untuk menyimpan profil
window.saveProfile = async function() {
  const nama = $("#nama").value;
  const alamat = $("#alamat").value;
  const pfpFile = $("#pfpFile").files[0];
  
  if (!nama || !alamat) {
    toast("Nama dan alamat harus diisi", "warning");
    return;
  }
  
  let fotoUrl = userData.foto;
  
  // Jika ada file foto yang diupload
  if (pfpFile) {
    try {
      const reader = new FileReader();
      reader.onload = async function(e) {
        fotoUrl = await uploadToCloudinary(e.target.result);
        
        // Simpan profil dengan foto baru
        await updateProfile(currentUser.uid, { nama, alamat, foto: fotoUrl });
        $("#profileDlg").close();
      };
      reader.readAsDataURL(pfpFile);
    } catch (error) {
      console.error("Error uploading profile photo:", error);
      toast("Gagal mengupload foto profil", "error");
    }
  } else {
    // Simpan profil tanpa mengubah foto
    await updateProfile(currentUser.uid, { nama, alamat });
    $("#profileDlg").close();
  }
};

// Event listener untuk menampilkan modal profil
window.showProfileModal = function() {
  $("#profileDlg").showModal();
};

// Event listener untuk logout
window.doLogout = function() {
  logout();
};

// Jalankan inisialisasi aplikasi ketika DOM siap
document.addEventListener("DOMContentLoaded", initApp);