// ===============================
// KONFIGURASI
// ===============================
const GAS_URL = "https://script.google.com/macros/s/AKfycbyKBHseSt8bdyO05fUw52Nzs6sGJ18tIkTvl2FfTKz2Ey0TKiW2hxJu4i_z7Ur7-doP/exec";

// ===============================
// INISIALISASI MAP
// ===============================
const map = L.map('map').setView([-8.5, 119.9], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

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
// EVENT: TAMBAH DATA
// ===============================
map.on(L.Draw.Event.CREATED, function (e) {
  const layer = e.layer;
  const geom = layer.toGeoJSON().geometry;

  const nama = prompt("Masukkan nama lokasi:");
  if (!nama) return;

  const payload = {
    action: "create",
    nama: nama,
    geometry: JSON.stringify(geom)
  };

  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  })
  .then(res => res.text())
  .then(msg => {
    alert("Data tersimpan!");
    layer.bindPopup(`<b>${nama}</b>`).addTo(drawnItems);
  })
  .catch(err => alert("Gagal menyimpan data: " + err));
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
    const id = layer.options.id || prompt("Masukkan ID data yang mau dihapus:");
    fetch(GAS_URL + "?id=" + id, { method: "DELETE" })
    .then(res => res.text())
    .then(msg => alert("Data terhapus"))
    .catch(err => alert("Gagal hapus data: " + err));
  });
});

// ===============================
// LOAD DATA AWAL
// ===============================
fetch(GAS_URL)
  .then(res => res.json())
  .then(data => {
    data.forEach(d => {
      const geom = JSON.parse(d.geometry);
      const layer = L.geoJSON(geom).addTo(drawnItems);
      layer.bindPopup(`<b>${d.nama}</b>`);
      layer.eachLayer(l => l.options.id = d.id); // simpan ID
    });
  })
  .catch(err => console.error(err));
