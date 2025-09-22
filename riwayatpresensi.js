// Fungsi untuk memuat riwayat presensi
async function loadPresenceHistory(filters = {}) {
  try {
    let query = db.collection('presences').orderBy('timestamp', 'desc');
    
    // Terapkan filter nama
    if (filters.nama) {
      query = query.where('userName', '>=', filters.nama).where('userName', '<=', filters.nama + '\uf8ff');
    }
    
    // Terapkan filter periode
    if (filters.periode) {
      const now = new Date();
      let startDate;
      
      switch (filters.periode) {
        case 'harian':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'mingguan':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          break;
        case 'bulanan':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'tahunan':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        case 'custom':
          if (filters.dari && filters.sampai) {
            startDate = new Date(filters.dari);
            const endDate = new Date(filters.sampai);
            query = query.where('timestamp', '>=', startDate).where('timestamp', '<=', endDate);
          }
          break;
      }
      
      if (filters.periode !== 'custom' && startDate) {
        query = query.where('timestamp', '>=', startDate);
      }
    }
    
    const snapshot = await query.get();
    const presences = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      presences.push({
        id: doc.id,
        waktu: data.timestamp?.toDate() || new Date(),
        nama: data.userName,
        shift: data.shift,
        jenis: data.jenis,
        status: data.status,
        keterangan: data.keterangan,
        koordinat: data.coordinates,
        foto: data.imageUrl
      });
    });
    
    return presences;
  } catch (error) {
    console.error('Error loading presence history:', error);
    throw error;
  }
}

// Fungsi untuk mengekspor data ke CSV
function exportToCSV(presences, filters = {}) {
  if (presences.length === 0) {
    toast('Tidak ada data untuk diekspor', 'warning');
    return;
  }
  
  // Urutkan data sesuai format STDR
  const sortedPresences = [...presences].sort((a, b) => {
    // Urutkan berdasarkan nama (A-Z)
    const nameCompare = a.nama.localeCompare(b.nama);
    if (nameCompare !== 0) return nameCompare;
    
    // Kemudian urutkan berdasarkan tanggal (lama ke baru)
    return a.waktu - b.waktu;
  });
  
  // Format data ke CSV
  let csvContent = 'Nama,Tanggal,Shift,Jenis,Status,Koordinat\n';
  
  let currentName = '';
  sortedPresences.forEach((presence, index) => {
    // Tambahkan baris kosong antar blok nama yang berbeda
    if (currentName !== presence.nama && index > 0) {
      csvContent += '\n';
    }
    currentName = presence.nama;
    
    const dateStr = presence.waktu.toLocaleDateString('id-ID');
    const coordsStr = `${presence.koordinat?.latitude?.toFixed(4) || '0'}, ${presence.koordinat?.longitude?.toFixed(4) || '0'}`;
    
    csvContent += `"${presence.nama}","${dateStr}","${presence.shift}","${presence.jenis}","${presence.keterangan}","${coordsStr}"\n`;
  });
  
  // Buat file dan unduh
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  
  // Buat nama file berdasarkan filter
  let fileName = 'presensi_';
  if (filters.periode) fileName += `${filters.periode}_`;
  if (filters.nama) fileName += `${filters.nama.replace(/\s+/g, '_')}_`;
  fileName += new Date().toISOString().split('T')[0] + '.csv';
  
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  toast('CSV berhasil diekspor', 'success');
}

// Fungsi untuk menampilkan data di tabel
function renderPresenceTable(presences, limit = 50) {
  const tableBody = $('#tableBody');
  tableBody.innerHTML = '';
  
  const limitedPresences = limit === 'all' ? presences : presences.slice(0, limit);
  
  if (limitedPresences.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data presensi</td></tr>';
    return;
  }
  
  limitedPresences.forEach(presence => {
    const row = document.createElement('tr');
    
    // Format waktu
    const waktuStr = presence.waktu.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }) + '<br>' + presence.waktu.toLocaleTimeString('id-ID');
    
    // Tentukan kelas status
    let statusClass = 's-bad';
    let statusIcon = 'schedule';
    
    if (presence.status === 'tepat_waktu') {
      statusClass = 's-good';
      statusIcon = 'check_circle';
    } else if (presence.status === 'terlambat') {
      statusClass = 's-warn';
      statusIcon = 'warning';
    } else if (presence.status === 'izin') {
      statusClass = 's-warn';
      statusIcon = 'event_available';
    }
    
    // Format koordinat
    const coordsStr = presence.koordinat ? 
      `${presence.koordinat.latitude?.toFixed(4) || '0'}, ${presence.koordinat.longitude?.toFixed(4) || '0'}` : 
      '0, 0';
    
    row.innerHTML = `
      <td>${waktuStr}</td>
      <td>${presence.nama}</td>
      <td>${presence.jenis}</td>
      <td><span class="status ${statusClass}"><span class="material-symbols-rounded">${statusIcon}</span>${presence.keterangan}</span></td>
      <td>${coordsStr}</td>
      <td><a href="${presence.foto}" target="_blank">Lihat Foto</a></td>
    `;
    
    tableBody.appendChild(row);
  });
}