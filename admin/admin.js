// ===============================
// KONFIGURASI 
// ===============================
const GAS_URL = "https://script.google.com/macros/s/AKfycbyKBHseSt8bdyO05fUw52Nzs6sGJ18tIkTvl2FfTKz2Ey0TKiW2hxJu4i_z7Ur7-doP/exec";
 
// ===============================
// MASTER LAYER
// ===============================

let masterLayer = [];
let masterReady = false;

async function loadMasterLayer() {

  const res = await fetch(GAS_URL + "?action=master");
  masterLayer = await res.json();
  masterReady = true;
  


}

// ===============================
// MEMBUAT OPTION DROPDOWN
// ===============================
function getLayerOptions(selected = "") {

  return masterLayer.map(item => {

    const pilih = item.layer === selected ? "selected" : "";

    return `<option value="${item.layer}" ${pilih}>${item.layer}</option>`;

  }).join("");

}

// ===============================
// FILTER DROPDOWN LAYER
// ===============================

function filterLayerDropdown(keyword, selectId, selected = "") {

    const ddl = document.getElementById(selectId);
    if (!ddl) return;

    keyword = keyword.trim().toLowerCase();

    let hasil;

    if (keyword === "") {

        // tampilkan maksimal 8 layer pertama
        hasil = masterLayer.slice(0,8);

    } else {

        hasil = masterLayer.filter(item =>
            item.layer.toLowerCase().includes(keyword)
        );

    }

    if (hasil.length === 0){

        ddl.innerHTML = `
            <option value="">
                Tidak ada layer ditemukan
            </option>
        `;

        return;

    }

    ddl.innerHTML = hasil.map(item => {

        const pilih =
            item.layer === selected ? "selected" : "";

        return `
            <option value="${item.layer}" ${pilih}>
                ${item.layer}
            </option>
        `;

    }).join("");

}

// ===============================
// FUNGSI GLOBAL: MENU EDIT PER LAYER
// ===============================


function attachEditMenu(layer, data) {
  layer._data = data;
  layer.off('click.popupMenu');
  layer.unbindPopup();
  layer.bindPopup(() => {
     window.currentLayer = layer;
    const d = layer._data;
    return `
     <div class="popup-form">

      <div class="popup-title">
      ${d.nama}
      </div>
      
      <div class="popup-info">
      <b>Status</b><br>
      ${d.status}
      </div>
      
      <div class="popup-info">
      <b>Kategori</b><br>
      ${d.kategori}
      </div>
      
      <div class="popup-info">
      <b>Tema</b><br>
      ${d.tema}
      </div>
      
      <div class="popup-info">
      <b>Layer</b><br>
      ${d.layer}
      </div>
      
      <div class="popup-info">
      <b>OPD</b><br>
      ${d.owner_opd}
      </div>
      <button class="popup-button" onclick="bukaMenuEdit(window.currentLayer)">✏ Edit Data</button>
      <br><br>
      <button
      class="popup-button popup-button-danger"
      onclick="hapusLayerSekarang()">
      🗑 Hapus Data
      </button>
      </div>
    `;
  });

}

function bukaMenuEdit(layer) {
  const d = layer._data;
  window.currentLayer = layer;

   L.popup()
    .setLatLng(layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter())
    .setContent(`
      <div class="popup-form">

      <div class="popup-title">
      ${d.nama}
      </div>
      
      <div class="popup-info">
      Pilih tindakan yang ingin dilakukan
      </div>
      
      <button
      class="popup-button"
      onclick="editAtributLayer()">
      
      ✏ Edit Atribut
      
      </button>
      
      <br><br>
      
      <button
      class="popup-button popup-button-secondary"
      onclick="editGeometriLayer()">
      
      📐 Edit Geometri
      
      </button>

      <br><br>

      <button
      class="popup-button popup-button-danger"
      onclick="hapusLayerSekarang()">
      
      🗑 Hapus Data
      
      </button>
      
      </div>

    `)
    .openOn(map);
}

function editAtributLayer() {
  const layer = window.currentLayer;
  const d = layer._data;

  L.popup({
    minWidth: 380,
    maxWidth: 380
})
    .setLatLng(layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter())
    .setContent(`
    <div class="popup-form">
      <label class="popup-label">Nama</label><br>
      <input class="popup-input" id="edit_nama" value="${d.nama}"><br><br>
      
      <label class="popup-label">Status</label><br>
      <input class="popup-input" id="edit_status" value="${d.status}"><br><br>

      <label class="popup-label">Cari Layer</label><br>
      <div class="layer-picker">
      <input
      class="popup-input layer-search"
      id="search_layer"
      placeholder="🔍 Cari layer...">
      
      <select
      class="popup-select layer-list"
      id="edit_layer"
      size="8">
      </select>
      </div>
      <br><br>

      <label class="popup-label">Tema</label><br>
      <input
      class="popup-input popup-readonly"
      id="edit_tema"
      readonly><br><br>

      <label class="popup-label">OPD</label><br>
      <input
      class="popup-input popup-readonly"
      id="edit_owner"
      readonly><br><br>
      
      <button
      id="btnEdit"
      class="popup-button"
      onclick="simpanEditAtribut()">Simpan</button></div>
    `)
    .openOn(map);

  setTimeout(() => {

  if (masterReady && document.getElementById("edit_layer")) {

     const ddl = document.getElementById("edit_layer");
     const search = document.getElementById("search_layer");
    // isi awal
//filterLayerDropdown("", "edit_layer", d.layer);
filterLayerDropdown("", "edit_layer", d.layer);
ddl.value = d.layer;
search.value = d.layer;

 // SEMBUNYIKAN DULU
ddl.style.display = "none";

    // TAMPILKAN LIST SAAT INPUT DIKLIK
search.addEventListener("focus", function(){
  ddl.classList.add("show");
    filterLayerDropdown(
        "",
        "edit_layer",
        ddl.value
    );
});

   search.addEventListener("input", function(){
    ddl.classList.add("show");
    filterLayerDropdown(
        search.value,
        "edit_layer",
        ddl.value
    );
    updateInfoLayer();
});


document.addEventListener("click", function(e){
   
     if(!search.contains(e.target) &&
       !ddl.contains(e.target)){
        ddl.classList.remove("show");
    }
});

function updateInfoLayer(){
  if(!ddl.value){
        document.getElementById("edit_tema").value="";
        document.getElementById("edit_owner").value="";
        return;
    }

    const master = masterLayer.find(
        item => item.layer === ddl.value
    );

    document.getElementById("edit_tema").value =
        master ? master.tema : "";

    document.getElementById("edit_owner").value =
        master ? master.owner_opd : "";

}

updateInfoLayer();

ddl.addEventListener("change", function(){
    updateInfoLayer();
    search.value = ddl.value;
    ddl.classList.remove("show");
});

  }

},100);
  
}

function simpanEditAtribut() {
  const layer = window.currentLayer;

  const nama = document.getElementById('edit_nama').value;
  const status = document.getElementById('edit_status').value;
  const layerNama = document.getElementById('edit_layer').value;
  const master =
  masterLayer.find(item => item.layer === layerNama);
   if(!master){
      alert("Layer belum dipilih.");
      return;
  }

  const kategori =
  master ? master.kategori : "";

  const tema =
  master ? master.tema : "";
  
  const ownerOpd =
  master ? master.owner_opd : "";


const btn = document.getElementById("btnEdit");

btn.disabled = true;
btn.innerHTML = "⏳ Menyimpan...";
  
  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "update_atribut",
      id: layer._data.id,
      nama: nama,
      status: status,
      kategori: kategori,
      tema: tema,
      layer: layerNama,
      owner_opd: ownerOpd
    })
  })
  .then(res => res.text())
  .then(msg => {

    msg = msg.trim();
    if (msg !== "atribut updated") {
        alert(msg);
        return;
    }
    layer._data.nama = nama;
    layer._data.status = status;
    layer._data.kategori = kategori;
    layer._data.tema = tema;
    layer._data.layer = layerNama;
    layer._data.owner_opd = ownerOpd;

    // hapus dari seluruh group lama
    Object.values(layerGroups).forEach(g => g.removeLayer(layer));

    // masukkan lagi sesuai layer baru
    registerLayer(layer, layer._data);    
    
    btn.innerHTML = "✓ Tersimpan";

setTimeout(() => {

    map.closePopup();

    attachEditMenu(layer, layer._data);

setTimeout(() => {
    layer.openPopup();
},100);


}, 500);
  })
   .catch(err => {
    btn.disabled = false;
    btn.innerHTML = "Simpan";
    alert("Gagal menyimpan atribut: " + err) ;
});
}

function registerLayer(layer, data) {

    const key = `${data.owner_opd}_${data.layer}`;

    // kalau grup belum ada, buat dulu
    if (!layerGroups[key]) {

      layerGroups[key] = L.layerGroup();
      
      overlayMaps[key] = layerGroups[key];
      
      layerControl.addOverlay(layerGroups[key], key);
      
      map.addLayer(layerGroups[key]);

    }

    layerGroups[key].addLayer(layer);

}

function editGeometriLayer() {

  map.closePopup();
   const layer = window.currentLayer;

    editState.mode = "edit";
    editState.layer = layer;
    editState.dirty = false;

    editState.originalGeometry =
        JSON.parse(JSON.stringify(layer.toGeoJSON().geometry));
      // nonaktifkan edit semua layer
    drawnItems.eachLayer(function(l){
        if(l.editing){
        l.editing.disable();
    }
    });

    // aktifkan edit layer yang dipilih
    if(layer.editing){
    layer.editing.enable();
    }
    map.getContainer().style.cursor = "crosshair";
    showEditHint();
}
function hapusLayerSekarang(){

    const layer = window.currentLayer;

    if(!layer) return;

    if(!confirm("Yakin ingin menghapus data ini?")){
        return;
    }

    fetch(GAS_URL,{
        method:"POST",
        body:JSON.stringify({
            action:"delete",
            id:layer.options.id
        })
    })
    .then(res=>res.text())
    .then(msg=>{

        msg = msg.trim();

        if(msg !== "deleted"){
            alert(msg);
            return;
        }

        Object.values(layerGroups)
            .forEach(g=>g.removeLayer(layer));

        drawnItems.removeLayer(layer);

        map.closePopup();

        alert("Data berhasil dihapus");

    })
    .catch(err=>{
        alert("Gagal menghapus : "+err);
    });

}

// ===============================
// INISIALISASI MAP
// ===============================
const map = L.map('map').setView([-8.5, 119.9], 10);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Edit langsung pada drawnItems
const editToolbar = new L.EditToolbar.Edit(map,{
    featureGroup: drawnItems
});

let editHint = null;
let editState = {
    mode: null,
    // "create" atau "edit"
    layer: null,
    dirty: false,
    originalGeometry: null
};

function showEditHint(){

    hideEditHint();

    editHint = document.createElement("div");

    editHint.id = "editHint";

    editHint.innerHTML = `
       <div style="
            font-size:17px;
            font-weight:600;
            margin-bottom:8px;
            display:flex;
            align-items:center;
            gap:8px;
        ">
            ✏️ <span>Mode Edit Geometri</span>
        </div>

        <div style="
            display:flex;
            flex-direction:column;
            gap:6px;
            font-size:14px;
        ">

            <div>
                <b>⏎ Enter</b>
                <span style="opacity:.8;">&nbsp;Simpan perubahan</span>
            </div>

            <div>
                <b>⎋ Esc</b>
                <span style="opacity:.8;">&nbsp;Batalkan edit</span>
            </div>

        </div>
    `;


    Object.assign(editHint.style,{
        position:"absolute",
        top:"18px",
        right:"120px",
        minWidth:"260px",
        background:"rgba(30,30,30,.78)",
        backdropFilter:"blur(10px)",
        WebkitBackdropFilter:"blur(10px)",
        color:"#fff",
        padding:"18px 20px",
        borderRadius:"18px",
        zIndex:9999,
        fontSize:"15px",
        fontFamily:"Inter, Segoe UI, sans-serif",
        lineHeight:"1.5",
        boxShadow:"0 14px 36px rgba(0,0,0,.28)",
        border:"1px solid rgba(255,255,255,.12)",
        animation:"fadeHint .18s ease",
        transition:"all .18s ease",
        borderRadius:"18px"
    });

    map.getContainer().appendChild(editHint);

}

function hideEditHint(){

    if(editHint){

        editHint.remove();

        editHint = null;

    }

}

function bukaKonfirmasiSimpan(){

    const layer = editState.layer;

    if(!layer) return;

    L.popup({
        minWidth:360,
        maxWidth:360,
        closeButton:false
    })
    .setLatLng(
        layer.getLatLng ?
        layer.getLatLng() :
        layer.getBounds().getCenter()
    )
    .setContent(`

        <div class="popup-form">

            <div class="popup-title">
                💾 Simpan Perubahan?
            </div>

            <div class="popup-info">
                Apakah Anda sudah selesai mengedit geometri?
            </div>

            <br>

            <button
                class="popup-button"
                onclick="konfirmasiSimpanYa()">

                ✓ Ya, Simpan

            </button>

            <br><br>

            <button
                class="popup-button popup-button-secondary"
                onclick="map.closePopup()">

                ✏ Lanjutkan Edit

            </button>

        </div>

    `)
    .openOn(map);

}

function bukaKonfirmasiBatal(){

    const layer = editState.layer;

    if(!layer) return;

    L.popup({
        minWidth:360,
        maxWidth:360,
        closeButton:false
    })
    .setLatLng(
        layer.getLatLng ?
        layer.getLatLng() :
        layer.getBounds().getCenter()
    )
    .setContent(`

        <div class="popup-form">
            <div class="popup-title">
                ⚠ Batalkan Edit?
            </div>

            <div class="popup-info">
                Semua perubahan geometri akan dibatalkan.
            </div>
            <br>
            <button
                class="popup-button popup-button-danger"
                onclick="konfirmasiBatalYa()"> Ya, Batalkan
            </button>
            <br><br>
            <button
                class="popup-button popup-button-secondary"
                onclick="map.closePopup()">
                Kembali Mengedit
            </button>
        </div>
    `)
    .openOn(map);
}

// ===============================
// KONFIRMASI SIMPAN
// ===============================
function konfirmasiSimpanYa(){
   map.closePopup();
      // Delay kecil supaya popup benar-benar tertutup
      // sebelum Leaflet.Draw melakukan save
      setTimeout(() => {
        editToolbar.save();
      },50);
    }
// ===============================
// KONFIRMASI BATAL
// ===============================
function konfirmasiBatalYa(){

    map.closePopup();

    if(editState.dirty){
    editToolbar.revertLayers();
    }
    if(editState.layer){
    editState.layer.editing.disable();
    }

    hideEditHint();

    map.getContainer().style.cursor="";

    if(editState.layer){
        attachEditMenu(
            editState.layer,
            editState.layer._data
        );
        editState.layer.openPopup();
    }
    editState.mode = null;
    editState.layer = null;
    editState.dirty = false;
    editState.originalGeometry = null;
}

// Menyimpan grup layer berdasarkan OPD + Layer
const layerGroups = {};
const overlayMaps = {};

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

const layerControl = L.control.layers(
    baseMaps,
    overlayMaps
).addTo(map);


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
let createState = {
    layer: null,
    saved: false
};
map.on(L.Draw.Event.CREATED, function (e) {

   createState.layer = e.layer;
    createState.saved = false;

const layer = createState.layer;


  drawnItems.addLayer(layer);

  const form = `
    <div>
      <label>Nama Lokasi</label><br>
      <input class="popup-input" type="text" id="nama_lokasi">

      <label>Status</label><br>
       <input class="popup-input" type="text" id="status_lokasi">

      <div class="layer-picker">

      <input
      class="popup-input layer-search"
      id="search_layer_create"
      placeholder="🔍 Cari layer...">
      
      <select
      class="popup-select layer-list"
      id="layer_lokasi"
      size="8">
      </select>
      </div>
      
      <br>

      <label>Tema</label><br>
      <input class="popup-input" id="tema_lokasi" readonly>

      <label>OPD</label><br>
      <input class="popup-input" id="owner_lokasi" readonly>

      <button
        id="btnSimpan"
        class="popup-button"
        onclick="simpanData()">
            Simpan
      </button>
          </div>
        `;

 layer.bindPopup(form,{
    minWidth:420,
    maxWidth:420
}).openPopup();
  

layer.on("popupclose", function () {

   if (!createState.saved) {
        drawnItems.removeLayer(layer);
    }

});
  
  setTimeout(() => {
  if (masterReady && document.getElementById("layer_lokasi")) {
    document.getElementById("layer_lokasi").innerHTML = getLayerOptions();
     
    const ddl = document.getElementById("layer_lokasi");
    const search = document.getElementById("search_layer_create");

   // awalnya dropdown disembunyikan
   ddl.classList.remove("show");

    // TAMPILKAN LIST SAAT INPUT DIKLIK
    search.addEventListener("focus", function(){
    ddl.classList.add("show");
    filterLayerDropdown(
        "",
        "layer_lokasi",
        ddl.value
    );
});

//filterLayerDropdown("", "layer_lokasi");
//mengetik
search.addEventListener("input", function(){
 ddl.classList.add("show");
    filterLayerDropdown(
        search.value,
        "layer_lokasi",
        ddl.value
    );
    updateInfoLayer();
});

// klik di luar
document.addEventListener("click", function(e){
    if(!search.contains(e.target) &&
       !ddl.contains(e.target)){
        ddl.classList.remove("show");
    }
});


function updateInfoLayer(){
 if(!ddl.value){
        document.getElementById("tema_lokasi").value="";
        document.getElementById("owner_lokasi").value="";
        return;
    }
 
    const master = masterLayer.find(
        item => item.layer === ddl.value
    );

    document.getElementById("tema_lokasi").value =
        master ? master.tema : "";

    document.getElementById("owner_lokasi").value =
        master ? master.owner_opd : "";

}

updateInfoLayer();

ddl.addEventListener("change", function(){
    updateInfoLayer();
    search.value = ddl.value;
    ddl.classList.remove("show");
});
  }
  }, 100);

  window.simpanData = function() {

    const nama = document.getElementById("nama_lokasi").value;
    const status = document.getElementById("status_lokasi").value;
    const layerNama = document.getElementById("layer_lokasi").value;

    // cari data master berdasarkan layer yang dipilih
    const master = masterLayer.find(item => item.layer === layerNama);
    if(!master){
     alert("Layer belum dipilih.");
     return;
     }
    
    const kategori = master ? master.kategori : "";
    const ownerOpd = master ? master.owner_opd : "";
    const tema = master ? master.tema : "";

    if (!nama) {
      alert("Nama harus diisi");
      return;
    }

    const btn = document.getElementById("btnSimpan");

btn.disabled = true;
btn.innerHTML = "⏳ Menyimpan...";

    const payload = {
  action: "create",
  nama: nama,
  status: status,
  kategori: kategori,
  tema:tema,   
  layer: layerNama,
  owner_opd: ownerOpd,
  geometry: createState.layer.toGeoJSON().geometry
};

    fetch(GAS_URL, {
  method: "POST",
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(resp => {

    
    if (!resp.id) {
        alert("Server tidak mengembalikan ID.");
        return;
    }
 
  createState.saved = true;
  layer.options.id = resp.id;

  const dataBaru = {
    id: resp.id,
    nama: nama,
    status: status,
    kategori: kategori,
    tema: tema,   
    layer: layerNama,
    owner_opd: ownerOpd,
    geometry: createState.layer.toGeoJSON().geometry
  };

  layer._data = dataBaru;
  
  btn.innerHTML = "✓ Tersimpan";
  setTimeout(() => {

    map.closePopup();
    attachEditMenu(layer, dataBaru);
    registerLayer(layer, dataBaru);
    layer.openPopup();

}, 600);
})
.catch(err => {

    btn.disabled = false;
    btn.innerHTML = "Simpan";

    alert("Gagal menyimpan data: " + err);

});
  };

}); 

// ===============================
// EVENT: EDIT DATA
// ===============================

// ===============================
// DETEKSI PERUBAHAN GEOMETRI
// ===============================

map.on("draw:editvertex", function () {
    editState.dirty = true;
});

map.on("draw:editmove", function () {
    editState.dirty = true;
});

map.on('draw:edited', function (e) {
    e.layers.eachLayer(function(layer){
        const geom = layer.toGeoJSON().geometry;
        fetch(GAS_URL,{
            method:"POST",
            body:JSON.stringify({

                action:"update",
                id:layer.options.id,
                geometry:geom
            })
        })

        .then(res=>res.text())
        .then(msg=>{
            msg = msg.trim();
          
            if(msg !== "updated"){
                alert(msg);
                return;
            }
          layer.editing.disable();
          editToolbar.disable();

            hideEditHint();

            map.getContainer().style.cursor="";

            editState.mode = null;
            editState.layer = null;
            editState.dirty = false;
            editState.originalGeometry = null;
            attachEditMenu(layer,layer._data);
        
            setTimeout(() => {
              
              layer.openPopup();
            },100);
          })
        .catch(err=>{
            layer.editing.disable();
            editToolbar.disable();
            hideEditHint();
            map.getContainer().style.cursor="";
            alert("Gagal update data : "+err);
        });
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
    .then(msg => {
      
    msg = msg.trim();

    if(msg !== "deleted"){
        alert(msg);
        return;
    }
      
      alert("Data terhapus");
    })
    .catch(err => alert("Gagal hapus data: " + err));
  });
});

// ===============================
// SHORTCUT KEYBOARD EDIT GEOMETRI
// ===============================
document.addEventListener("keydown", function(e){

    // hanya aktif saat sedang edit geometri
    if(editState.mode !== "edit") return;

    // ENTER
    if(e.key === "Enter"){
        e.preventDefault();
        bukaKonfirmasiSimpan();
    }
    // ESC
    if(e.key === "Escape"){
        e.preventDefault();
        bukaKonfirmasiBatal();
    }
});

// ===============================
// LOAD DATA AWAL
// ===============================
fetch(GAS_URL)
       .then(res=>{
    if(!res.ok){
        throw new Error("HTTP "+res.status);
    }
    return res.json();
    })
 
  .then(resp => {
    
    const data = resp.data;
    
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
        nama: d.nama,
        status: d.status,
        kategori: d.kategori,
        tema:d.tema,
        layer: d.layer,
        owner_opd: d.owner_opd
      };

      layer._data = dataFix;

// WAJIB: masuk ke drawnItems supaya bisa diedit
drawnItems.addLayer(layer);

// popup edit
attachEditMenu(layer, dataFix);
registerLayer(layer, dataFix);
    });

  })
  
  .catch(err => {
    alert("Gagal memuat data.");
});
loadMasterLayer();

