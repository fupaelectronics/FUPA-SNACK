// riwayatpresensi.js - Modul untuk mengelola riwayat presensi

class RiwayatPresensi {
  constructor(db) {
    this.db = db;
    this.presensi = [];
    this.filteredPresensi = [];
    this.currentFilter = {
      nama: '',
      periode: 'harian',
      show: '50',
      dari: '',
      sampai: ''
    };
  }

  // Memuat data presensi dari Firestore
  async loadPresensi() {
    try {
      const snapshot = await this.db.collection('presensi')
        .orderBy('waktu', 'desc')
        .get();
      
      this.presensi = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        this.presensi.push({
          id: doc.id,
          ...data,
          // Format waktu untuk display
          waktuDisplay: data.waktu ? this.formatDate(data.waktu.toDate()) : 'Loading...'
        });
      });
      
      this.applyFilters();
      return this.presensi;
    } catch (error) {
      console.error('Error loading presensi:', error);
      throw error;
    }
  }

  // Format tanggal untuk display
  formatDate(date) {
    if (!date) return '';
    
    const options = {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    };
    
    return date.toLocaleDateString('id-ID', options);
  }

  // Terapkan filter
  applyFilters() {
    let filtered = [...this.presensi];
    
    // Filter berdasarkan nama
    if (this.currentFilter.nama) {
      const searchTerm = this.currentFilter.nama.toLowerCase();
      filtered = filtered.filter(p => 
        p.nama.toLowerCase().includes(searchTerm)
      );
    }
    
    // Filter berdasarkan periode
    const now = new Date();
    switch (this.currentFilter.periode) {
      case 'harian':
        filtered = filtered.filter(p => {
          const presensiDate = p.waktu.toDate();
          return presensiDate.toDateString() === now.toDateString();
        });
        break;
      case 'mingguan':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        filtered = filtered.filter(p => {
          const presensiDate = p.waktu.toDate();
          return presensiDate >= startOfWeek;
        });
        break;
      case 'bulanan':
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        filtered = filtered.filter(p => {
          const presensiDate = p.waktu.toDate();
          return presensiDate >= startOfMonth;
        });
        break;
      case 'tahunan':
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        filtered = filtered.filter(p => {
          const presensiDate = p.waktu.toDate();
          return presensiDate >= startOfYear;
        });
        break;
      case 'custom':
        if (this.currentFilter.dari && this.currentFilter.sampai) {
          const dari = new Date(this.currentFilter.dari);
          const sampai = new Date(this.currentFilter.sampai);
          sampai.setHours(23, 59, 59, 999);
          
          filtered = filtered.filter(p => {
            const presensiDate = p.waktu.toDate();
            return presensiDate >= dari && presensiDate <= sampai;
          });
        }
        break;
    }
    
    // Batasi jumlah yang ditampilkan
    if (this.currentFilter.show !== 'all') {
      const limit = parseInt(this.currentFilter.show);
      filtered = filtered.slice(0, limit);
    }
    
    this.filteredPresensi = filtered;
    return this.filteredPresensi;
  }

  // Ekspor data ke CSV
  exportToCSV() {
    if (this.filteredPresensi.length === 0) {
      throw new Error('Tidak ada data untuk diekspor');
    }
    
    // Urutkan data sesuai format STDR: per karyawan, kemudian per tanggal
    const sortedData = [...this.filteredPresensi].sort((a, b) => {
      // Urutkan berdasarkan nama
      if (a.nama < b.nama) return -1;
      if (a.nama > b.nama) return 1;
      
      // Kemudian urutkan berdasarkan tanggal
      return a.waktu.toDate() - b.waktu.toDate();
    });
    
    // Header CSV
    let csv = 'Nama,Tanggal,Shift,Jenis,Status,Koordinat\n';
    
    // Data CSV
    sortedData.forEach((presensi, index) => {
      // Tambahkan baris kosong antar blok karyawan yang berbeda
      if (index > 0 && sortedData[index - 1].nama !== presensi.nama) {
        csv += '\n';
      }
      
      const row = [
        `"${presensi.nama}"`,
        this.formatDateForCSV(presensi.waktu.toDate()),
        `"${presensi.shift}"`,
        `"${presensi.jenis}"`,
        `"${presensi.status}"`,
        `"${presensi.koordinat.latitude},${presensi.koordinat.longitude}"`
      ];
      
      csv += row.join(',') + '\n';
    });
    
    return csv;
  }

  // Format tanggal untuk CSV
  formatDateForCSV(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `"${day}/${month}/${year} ${hours}:${minutes}"`;
  }

  // Update filter
  updateFilter(newFilter) {
    this.currentFilter = { ...this.currentFilter, ...newFilter };
    return this.applyFilters();
  }
}