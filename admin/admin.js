// ===============================
// KONFIGURASI
// ===============================
const GAS_URL = "https://script.google.com/macros/s/AKfycbyKBHseSt8bdyO05fUw52Nzs6sGJ18tIkTvl2FfTKz2Ey0TKiW2hxJu4i_z7Ur7-doP/exec";

// ===============================
// INISIALISASI MAP
// ===============================
const map = L.map('map').setView([-8.5, 119.9], 10);

// OSM (default)
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

//Skala Peta
L.control.scale().addTo(map);

//Kompas
new L.Control.Compass({ autoActive: true, showDigit: true }).addTo(map);

// SATELIT ESRI
const esriSat = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri'
});

// Tambah ke map (default OSM)
osm.addTo(map);

const baseMaps = {
  "OpenStreetMap": osm,
  "Satelit Esri": esriSat
};

L.control.layers(baseMaps).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// ===============================
// KONTROL DRAW
// ===============================
const drawControl = new L.Control.Draw({
  edit: {
    featureGroup: drawnItems
  },
  draw: {
    polygon: true,
    polyline: true,
    rectangle: false,
    circle: false,
    marker: true,
    circlemarker: false
  }
});
map.addControl(drawControl);

// ===============================
// SEARCH LOKASI (PHOTON + BOUND MAP)
let searchMarker;

const photon = new L.Control.Geocoder.Photon();

const geocoder = L.Control.geocoder({
  defaultMarkGeocode: false,
  geocoder: photon
})
.on('markgeocode', function(e) {

  map.fitBounds(e.geocode.bbox);

  if (searchMarker) map.removeLayer(searchMarker);

  searchMarker = L.marker(e.geocode.center)
    .addTo(map)
    .bindPopup(e.geocode.name)
    .openPopup();

  searchMarker.on('popupclose', function () {
    map.removeLayer(searchMarker);
  });

})
.addTo(map);

// ===============================
// EVENT: TAMBAH DATA
// ===============================
map.on(L.Draw.Event.CREATED, function (e) {

  const layer = e.layer;
  const geom = layer.toGeoJSON().geometry;

  drawnItems.addLayer(layer);

  const form = `
    <div>
      <label>Nama Lokasi</label><br>
      <input type="text" id="nama_lokasi"><br><br>

      <label>Status</label><br>
      <input type="text" id="status_lokasi"><br><br>

      <button onclick="simpanData()">Simpan</button>
    </div>
  `;

  layer.bindPopup(form).openPopup();

  window.simpanData = function() {

    const nama = document.getElementById("nama_lokasi").value;
    const status = document.getElementById("status_lokasi").value;

    if (!nama) {
      alert("Nama harus diisi");
      return;
    }

    const payload = {
  action: "create",
  nama: nama,
  status: status,
  geometry: geom
};

    fetch(GAS_URL, {
  method: "POST",
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(resp => {
  layer.options.id = resp.id;   // INI PALING PENTING
  alert("Data tersimpan!");
  layer.bindPopup(`<b>${nama}</b><br>Status: ${status}`);
})
.catch(err => alert("Gagal menyimpan data: " + err));
  };

});

// ===============================
// EVENT: EDIT DATA
// ===============================
map.on('draw:edited', function (e) {
  e.layers.eachLayer(function (layer) {
    const geom = layer.toGeoJSON().geometry;
    const id = layer.options.id || prompt("Masukkan ID data yang mau diupdate:");

    fetch(GAS_URL + "?id=" + id, {
      method: "PUT",
      body: JSON.stringify({ geometry: JSON.stringify(geom) })
    })
    .then(res => res.text())
    .then(msg => alert("Data berhasil diperbarui"))
    .catch(err => alert("Gagal update data: " + err));
  });
});

// ===============================
// EVENT: HAPUS DATA
// ===============================
map.on('draw:deleted', function (e) {
  e.layers.eachLayer(function (layer) {
    const id = layer.options.id;

    fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "delete",
        id: id
      })
    })
    .then(res => res.text())
    .then(msg => alert("Data terhapus"))
    .catch(err => alert("Gagal hapus data: " + err));
  });
});

// ===============================
// LOAD DATA AWAL
// ===============================
 fetch("https://script.google.com/macros/s/AKfycbyKBHseSt8bdyO05fUw52Nzs6sGJ18tIkTvl2FfTKz2Ey0TKiW2hxJu4i_z7Ur7-doP/exec")
      .then(res => res.json())
      .then(data => {
        // Misal data = [{nama:"Kantor A", lat:-8.5, lon:119.9}, ...]
        console.log(data);
        data.data.forEach(d => {
           if (!d.geometry) return;

          let layer; // WAJIB ADA INI

            const type = d.geometry.type;
            const coords = d.geometry.coordinates;
          
            if (type === "Point") {
              const [lon, lat] = coords;
              layer = L.marker([lat, lon], { id: d.id });
              layer.bindPopup(`<b>${d.nama_sekolah}</b>`);
            } 
            else if (type === "LineString") {
              const latlngs = coords.map(([lon, lat]) => [lat, lon]);
              layer = L.polyline(latlngs, { id: d.id })
                .bindPopup(`<b>${d.nama_sekolah}</b>`);
            } 
           else if (type === "Polygon") {
              const latlngs = coords.map(ring =>
              ring.map(([lon, lat]) => [lat, lon])
              );
              layer = L.polygon(latlngs, { id: d.id })
                .bindPopup(`<b>${d.nama_sekolah}</b>`);
            }

  // PENTING: MASUKKAN KE drawnItems, BUKAN map
  drawnItems.addLayer(layer);
});
      })
      .catch(err => console.error(err));
