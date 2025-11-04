
    // 1️⃣ Inisialisasi peta
    const map = L.map('map').setView([-8.5, 119.9], 10); // sesuaikan koordinat awal

    // 2️⃣ Tambah basemap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // 3️⃣ Ambil data dari Google Apps Script
    fetch("https://script.google.com/macros/s/AKfycbyKBHseSt8bdyO05fUw52Nzs6sGJ18tIkTvl2FfTKz2Ey0TKiW2hxJu4i_z7Ur7-doP/exec")
      .then(res => res.json())
      .then(data => {
        // Misal data = [{nama:"Kantor A", lat:-8.5, lon:119.9}, ...]
        console.log(data);
        data.data.forEach(d => {
           if (!d.geometry) return;

            const type = d.geometry.type;
            const coords = d.geometry.coordinates;
          
            if (type === "Point") {
              const [lon, lat] = coords;
              L.marker([lat, lon]).addTo(map)
                .bindPopup(`<b>${d.nama_sekolah}</b>`);
            } else if (type === "LineString") {
              const latlngs = coords.map(([lon, lat]) => [lat, lon]);
              L.polyline(latlngs, {color:'blue'}).addTo(map);
            } else if (type === "Polygon") {
              const latlngs = coords.map(ring => ring.map(([lon, lat]) => [lat, lon]));
              L.polygon(latlngs, {color:'green'}).addTo(map);
            }
          });
      })
      .catch(err => console.error(err));
