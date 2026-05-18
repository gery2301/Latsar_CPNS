// ===============================
// KONFIGURASI
// ===============================
const GAS_URL = "https://script.google.com/macros/s/AKfycbyKBHseSt8bdyO05fUw52Nzs6sGJ18tIkTvl2FfTKz2Ey0TKiW2hxJu4i_z7Ur7-doP/exec";

// ===============================
// FUNGSI GLOBAL: MENU EDIT PER LAYER
// ===============================


function attachEditMenu(layer, data) {
  layer._data = data;

  layer.bindPopup(() => {
    const d = layer._data;
    window.currentLayer = layer;
    return `
      <b>${d.nama}</b><br>
      Status: ${d.status}<br><br>
      <button onclick="bukaMenuEdit(window.currentLayer)">Edit</button>
    `;
  });

  layer.on('click', function () {
    window.currentLayer = layer;
  });
}

function bukaMenuEdit(layer) {
  const d = layer._data;
  window.currentLayer = layer;

   L.popup()
    .setLatLng(layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter())
    .setContent(`
      <b>${d.nama}</b><br><br>
      Mau edit apa?<br><br>
      <button onclick="editAtributLayer()">Edit Nama & Status</button><br><br>
      <button onclick="editGeometriLayer()">Edit Bentuk Geometri</button>
    `)
    .openOn(map);
}

function editAtributLayer() {
  const layer = window.currentLayer;
  const d = layer._data;

  L.popup()
    .setLatLng(layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter())
    .setContent(`
      <label>Nama</label><br>
      <input id="edit_nama" value="${d.nama}"><br><br>
      <label>Status</label><br>
      <input id="edit_status" value="${d.status}"><br><br>
      <button onclick="simpanEditAtribut()">Simpan</button>
    `)
    .openOn(map);
}

function simpanEditAtribut() {
  const layer = window.currentLayer;

  const nama = document.getElementById('edit_nama').value;
  const status = document.getElementById('edit_status').value;

  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "update_atribut",
      id: layer._data.id,
      nama: nama,
      status: status
    })
  })
  .then(res => res.text())
  .then(() => {
    layer._data.nama = nama;
    layer._data.status = status;
    layer.closePopup();
    layer.openPopup(); // ini otomatis render popup A lagi
  });
}

function editGeometriLayer() {
  // Cari tombol edit bawaan Leaflet Draw
  const editBtn = document.querySelector('.leaflet-draw-edit-edit');

  if (editBtn) {
    editBtn.click(); // otomatis masuk mode edit NORMAL
  }
}

// ===============================
// INISIALISASI MAP
// ===============================
const map = L.map('map').setView([-8.5, 119.9], 10);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

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

// UPDATE BBOX PHOTON SESUAI VIEW MAP
map.on('moveend', function () {
  const b = map.getBounds();

  photon.options.params = {
    bbox: [
      b.getWest(),
      b.getSouth(),
      b.getEast(),
      b.getNorth()
    ].join(',')
  };
});

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

 layer.setPopupContent(form).openPopup();

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
  layer.options.id = resp.id;

  const dataBaru = {
    id: resp.id,
    nama: nama,
    status: status,
    geometry: geom
  };

  layer._data = dataBaru;
  
  attachEditMenu(layer, dataBaru);

  alert("Data tersimpan!");
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
    const id = layer.options.id;

    fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "update",
        id: id,
        geometry: geom
      })
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
  .then(resp => {
    
    const data = resp.data;
    console.log(data);
    
    data.forEach(d => {
      if (!d.geometry) return;

      let layer = null;
      const type = d.geometry.type;
      const coords = d.geometry.coordinates;

      if (type === "Point") {
        const [lon, lat] = coords;
        layer = L.marker([lat, lon]);
      } 
      else if (type === "LineString") {
        const latlngs = coords.map(([lon, lat]) => [lat, lon]);
        layer = L.polyline(latlngs);
      } 
      else if (type === "Polygon") {
        const latlngs = coords.map(ring =>
          ring.map(([lon, lat]) => [lat, lon])
        );
        layer = L.polygon(latlngs);
      }

      if (!layer) return;

      // simpan ID & atribut di layer (PENTING)
      layer.options.id = d.id;

      const dataFix = {
        id: d.id,
        nama: d.nama_sekolah,
        status: d.status
      };

      layer._data = dataFix;

// WAJIB: masuk ke drawnItems supaya bisa diedit
drawnItems.addLayer(layer);

// popup edit
attachEditMenu(layer, dataFix);
    });

  })
  .catch(err => console.error(err));

