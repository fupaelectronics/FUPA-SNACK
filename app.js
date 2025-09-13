// Konstanta dan variabel global
const CLOUDINARY_CLOUD_NAME = "da7idhh4f";
const CLOUDINARY_UPLOAD_PRESET = "FupaSnack";

// Format waktu Indonesia
function formatWaktu(tanggal) {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  return tanggal.toLocaleDateString('id-ID', options);
}

// Kompres gambar ke 10KB
async function kompresGambar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Hitung ukuran baru dengan tetap mempertahankan aspect ratio
        let width = img.width;
        let height = img.height;
        const maxSize = 800; // Max dimension
        
        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Gambar ulang gambar dengan kualitas lebih rendah
        ctx.drawImage(img, 0, 0, width, height);
        
        // Konversi ke blob dengan kualitas 0.6 (bisa disesuaikan)
        canvas.toBlob((blob) => {
          // Jika masih lebih besar dari 10KB, kurangi kualitas
          if (blob.size > 10 * 1024) {
            canvas.toBlob(
              (compressedBlob) => resolve(compressedBlob),
              'image/jpeg',
              0.5
            );
          } else {
            resolve(blob);
          }
        }, 'image/jpeg', 0.6);
      };
    };
    reader.onerror = error => reject(error);
  });
}

// Upload gambar ke Cloudinary
async function uploadKeCloudinary(blob) {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
  
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error('Gagal mengupload gambar');
  }
}

// Deteksi lokasi pengguna
function dapatkanLokasi() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung'));
    }
    
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
      { timeout: 10000 }
    );
  });
}

// Validasi waktu presensi
function validasiWaktuPresensi(jenis) {
  const sekarang = new Date();
  const jam = sekarang.getHours();
  const menit = sekarang.getMinutes();
  const totalMenit = jam * 60 + menit;
  
  // Aturan default
  const berangkatAwal = 5 * 60 + 30; // 05:30
  const berangkatAkhir = 6 * 60;     // 06:00
  const pulangAwal = 10 * 60;        // 10:00
  const pulangAkhir = 11 * 60;       // 11:00
  const toleransi = 20;              // 20 menit
  
  if (jenis === 'berangkat') {
    if (totalMenit >= berangkatAwal && totalMenit <= berangkatAkhir) {
      return { status: 'tepat_waktu', waktu: sekarang };
    } else if (totalMenit > berangkatAkhir && totalMenit <= berangkatAkhir + toleransi) {
      return { status: 'terlambat', waktu: sekarang };
    } else {
      return { status: 'diluar_sesi', waktu: sekarang };
    }
  } else if (jenis === 'pulang') {
    if (totalMenit >= pulangAwal && totalMenit <= pulangAkhir) {
      return { status: 'tepat_waktu', waktu: sekarang };
    } else if (totalMenit > pulangAkhir && totalMenit <= pulangAkhir + toleransi) {
      return { status: 'terlambat', waktu: sekarang };
    } else {
      return { status: 'diluar_sesi', waktu: sekarang };
    }
  }
  
  return { status: 'invalid', waktu: sekarang };
}

// Format data untuk CSV
function formatDataUntukCSV(data) {
  // Implementasi format STDR
  // Urutkan berdasarkan nama karyawan (A-Z)
  data.sort((a, b) => a.nama.localeCompare(b.nama));
  
  let csvContent = "Nama,Tanggal,Jam,Jenis,Status,Koordinat\n";
  
  // Kelompokkan berdasarkan nama
  const groupedData = {};
  data.forEach(item => {
    if (!groupedData[item.nama]) {
      groupedData[item.nama] = [];
    }
    groupedData[item.nama].push(item);
  });
  
  // Urutkan setiap kelompok berdasarkan tanggal dan waktu
  for (const nama in groupedData) {
    groupedData[nama].sort((a, b) => {
      const dateA = new Date(a.tanggal + ' ' + a.jam);
      const dateB = new Date(b.tanggal + ' ' + b.jam);
      return dateA - dateB;
    });
    
    // Tambahkan data ke CSV
    groupedData[nama].forEach(item => {
      csvContent += `"${item.nama}","${item.tanggal}","${item.jam}","${item.jenis}","${item.status}","${item.koordinat}"\n`;
    });
    
    // Tambahkan baris kosong antar blok karyawan
    csvContent += "\n";
  }
  
  return csvContent;
}

// Download CSV
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}