// ===============================
// KONFIGURASI 
// ===============================

const GAS_URL = "https://script.google.com/macros/s/AKfycbyKBHseSt8bdyO05fUw52Nzs6sGJ18tIkTvl2FfTKz2Ey0TKiW2hxJu4i_z7Ur7-doP/exec";

// ===============================
// POPUP LEAFLET vs HEADER/FOOTER BRAND
// ===============================
// #brandHeader & #brandFooter itu overlay (position:fixed, z-index 20000)
// di atas peta, sedangkan popup Leaflet hidup DI DALAM pane peta (z-index
// jauh di bawah) -- popup gak mungkin "menang" di atas mereka. Jadi
// solusinya: geser PETA sampai popup sepenuhnya ada di antara header dan
// footer.
//
// Percobaan pertama (autoPanPaddingTopLeft/BottomRight bawaan Leaflet)
// TERBUKTI GAGAL di layar user -- makanya sekarang bukan nebak lewat
// padding lagi, tapi UKUR posisi asli popup di layar (getBoundingClientRect)
// dibanding tepi bawah header & tepi atas footer yang asli, lalu
// panBy() sebesar selisihnya. autoPan bawaan Leaflet dimatikan supaya
// dua mekanisme pan gak saling tabrak.
L.Popup.mergeOptions({ autoPan: false });

const POPUP_MARGIN_PX = 12;

function pastikanPopupTerlihat_(popup){
    const el = popup && popup.getElement && popup.getElement();
    const map = popup && popup._map;
    if(!el || !map) return; // popup sudah ditutup

    const header = document.getElementById("brandHeader");
    const footer = document.getElementById("brandFooter");
    const atas = (header ? header.getBoundingClientRect().bottom : 0) + POPUP_MARGIN_PX;
    const bawah = (footer ? footer.getBoundingClientRect().top : window.innerHeight) - POPUP_MARGIN_PX;
    const kiri = POPUP_MARGIN_PX;
    const kanan = window.innerWidth - POPUP_MARGIN_PX;

    // 1. layar pendek: popup lebih tinggi dari ruang yang ada -> kecilin
    //    area kontennya (jadi scroll) sampai muat
    let r = el.getBoundingClientRect();
    const tersedia = bawah - atas;
    const content = el.querySelector(".leaflet-popup-content");
    if(content && r.height > tersedia){
        const kurang = r.height - tersedia;
        content.style.maxHeight = Math.max(140, content.offsetHeight - kurang) + "px";
        content.style.overflowY = "auto";
        r = el.getBoundingClientRect();
    }

    // 2. geser peta. Sisi atas diprioritaskan (judul + tombol tutup
    //    harus kelihatan), sisi bawah cuma sejauh gak bikin atasnya
    //    ketutup lagi.
    let dy = 0, dx = 0;
    if(r.top < atas) dy = r.top - atas;
    else if(r.bottom > bawah) dy = Math.min(r.bottom - bawah, r.top - atas);

    if(r.left < kiri) dx = r.left - kiri;
    else if(r.right > kanan) dx = Math.min(r.right - kanan, r.left - kiri);

    if(dx || dy) map.panBy([dx, dy]);
}

// dipasang di bawah, tepat setelah objek `map` dibuat
function pasangPenjagaPopup_(map){
    map.on("popupopen", e => {
        const popup = e.popup;
        // 2x rAF: tunggu layout popup beres. Cek ulang setelah animasi pan
        // & render chart async (donut/bar di popup ringkasan) selesai --
        // kalau sudah pas, pemanggilan kedua ini gak ngapa-ngapain.
        requestAnimationFrame(() => requestAnimationFrame(() => pastikanPopupTerlihat_(popup)));
        setTimeout(() => pastikanPopupTerlihat_(popup), 500);
    });
}

// Fetch dengan retry otomatis. Google Apps Script Web App (exec URL)
// KADANG (jarang, tapi nyata -- dikonfirmasi user: dibuka fresh di tab
// baru pun kadang tetap gagal, walau deployment-nya cuma 1 & bener)
// balikin error transient (404 "tidak dapat membuka file", dsb). Ini
// masalah infrastruktur Google sendiri, BUKAN salah kode/config kita,
// dan biasanya PULIH SENDIRI dalam hitungan detik. Daripada langsung
// nyerah/nge-throw ke user pas kena gangguan sesaat kayak gini, coba
// ulang dulu beberapa kali dengan jeda singkat sebelum benar-benar
// dianggap gagal.
async function fetchDenganRetry_(url, options, maxRetry = 2, delayMs = 1200){
    let lastErr;
    for(let percobaan = 0; percobaan <= maxRetry; percobaan++){
        try{
            const res = await fetch(url, options);
            if(res.ok) return res;
            lastErr = new Error("HTTP " + res.status);
        } catch(err){
            lastErr = err;
        }
        if(percobaan < maxRetry){
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
}
 
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
  layer.bindPopup(function(sourceLayer){
     window.currentLayer = layer;

    // KHUSUS fitur gabungan Multi* (lihat buatGroupMultiGeometry_):
    // Leaflet motret popup ini per-bagian (masing2 bagian punya
    // popup sendiri2), dan `sourceLayer` di sini adalah BAGIAN FISIK
    // yang barusan diklik user -- bukan grup gabungannya. Kita catat
    // biar nanti pas "Edit Geometri" cuma bagian INI yang dinyalain
    // mode edit-nya, bukan SEMUA bagian sekaligus (fitur kayak
    // kecamatan bisa punya ratusan bagian & puluhan ribu vertex
    // total -- nyalain semua sekaligus bikin browser hang total,
    // lihat catatan performa di buatGroupMultiGeometry_).
    if(layer._isMultiGroup){
        layer._lastClickedPart =
            (sourceLayer && sourceLayer !== layer) ? sourceLayer : null;
    }

    const d = layer._data;

    // fitur SHP (d.atribut ada) punya kolom dinamis sesuai DBF-nya,
    // beda sama fitur manual/digitasi yang field-nya selalu tetap
    // (nama/status/kategori/tema/layer/owner_opd). Judul & isi info
    // dibedakan di sini, tapi kerangka popup + tombol Edit/Hapus-nya
    // tetap sama persis buat dua-duanya.
    let judul, infoHtml;

    if(d.atribut){
        judul = judulFiturShp_(d);
        const skip = new Set(["id","geometry","created_at","updated_at"]);
        const summaryFields = getSummaryFields_(d.layer)
            .filter(k => k in d.atribut && !skip.has(k));
        const fieldsToShow = summaryFields.length ? summaryFields :
            Object.keys(d.atribut).filter(k => !skip.has(k)).slice(0, 4);

        // subjudul (misal nama kecamatan) -- opsional, diatur di panel 🎨 Style
        const subtitleField = getLayerSubtitleField_(d.layer);
        const subtitle = subtitleField ? d.atribut[subtitleField] : null;

        // pisahin field yang mau ditampilkan jadi numerik (jadi kartu
        // statistik) vs teks biasa (baris info kayak sebelumnya) --
        // deteksi ketat biar kode kayak "03" gak ketebak jadi angka
        const numericFields = [];
        const textFields = [];
        fieldsToShow.forEach(k => {
            const val = d.atribut[k];
            const num = parseFloat(val);
            const isNumeric = val !== "" && val !== null && val !== undefined &&
                !isNaN(num) && String(val).trim() === String(num);
            const label = labelKolom_(d.layer, k);
            if(isNumeric) numericFields.push({ key: label, value: num });
            else textFields.push({ key: label, value: val });
        });

        // donut komposisi (misal Desil 1-5 vs Penduduk Lainnya) --
        // CUMA valid kalau dua kolom yang diatur user ada DAN
        // nilainya numerik & masuk akal (subset <= total). Kalau
        // valid, sekalian tambahin kartu persentase-nya (angka yang
        // SAMA yang dipakai buat donut, bukan tebakan baru)
        const donutCfg = getDonutConfig_(d.layer);
        let donutValid = false;
        let donutSubsetLabel = "";
        if(donutCfg){
            const total = parseFloat(d.atribut[donutCfg.total]);
            const subset = parseFloat(d.atribut[donutCfg.subset]);
            donutSubsetLabel = labelKolom_(d.layer, donutCfg.subset);
            if(!isNaN(total) && !isNaN(subset) && total > 0 && subset >= 0 && subset <= total){
                donutValid = true;
                numericFields.push({
                    key: `Proporsi ${donutSubsetLabel}`,
                    value: Math.round((subset / total) * 1000) / 10,
                    suffix: "%"
                });
            }
        }

        const statsHtml = numericFields.length ? `
            <div class="ringkasan-stats">
                ${numericFields.map(f => `
                    <div class="ringkasan-card">
                        <div class="ringkasan-card-value">${f.value.toLocaleString('id-ID')}${f.suffix || ""}</div>
                        <div class="ringkasan-card-label">${f.key}</div>
                    </div>
                `).join("")}
            </div>
        ` : "";

        const textHtml = textFields.map(f => `
            <div class="popup-info"><b>${f.key}</b><br>${f.value ?? ""}</div>
        `).join("");

        infoHtml = `
            ${subtitle ? `<div class="ringkasan-subtitle">${subtitle}</div>` : ""}
            ${statsHtml}
            ${textHtml}
            ${donutValid ? `<div class="ringkasan-chart-box"><canvas id="ringkasanDonut" height="150"></canvas></div>` : ""}
            <div id="ringkasanBantuanBox"></div>
        `;
    } else {
        judul = d.nama;
        infoHtml = `
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
        `;
    }

    return `
     <div class="popup-form">

      <div class="popup-title">
      ${judul}
      </div>

      ${infoHtml}

      <div class="popup-actions">
      ${d.atribut ? `
      <button class="popup-button popup-button-secondary" onclick="bukaDashboardShp(window.currentLayer)">📊 Lihat Dashboard</button>
      <button class="popup-button popup-button-secondary" onclick="bukaDetailIntervensi(window.currentLayer)">🧾 Detail Intervensi Bantuan</button>
      ` : ""}
      <button class="popup-button" onclick="bukaMenuEdit(window.currentLayer)">✏ Edit Data</button>
      <button
      class="popup-button popup-button-danger"
      onclick="hapusLayerSekarang()">
      🗑 Hapus Data
      </button>
      </div>
      </div>
    `;
  }, { minWidth: 260, maxWidth: 340, maxHeight: 420, autoPanPadding: [40, 40] });

  // render chart (donut komposisi + bar bantuan per OPD) SETELAH popup
  // beneran kebuka -- gak bisa sinkron di dalam factory function di
  // atas karena canvas-nya baru ada di DOM abis Leaflet nyuntik HTML
  // popup ke halaman. Pakai event namespaced ".ringkasanChart" biar
  // gampang di-off() ulang tanpa numpuk listener kalau attachEditMenu
  // dipanggil lagi buat layer yang sama (misal abis simpan edit).
  layer.off('popupopen.ringkasanChart');
  layer.on('popupopen.ringkasanChart', function(){
      if(layer._data && layer._data.atribut){
          renderRingkasanCharts_(layer._data);
      }
  });

}

function bukaMenuEdit(layer) {
  const d = layer._data;
  window.currentLayer = layer;

  const judul = d.atribut ? judulFiturShp_(d) : d.nama;
  const aksiEditAtribut = d.atribut ? "editAtributShp()" : "editAtributLayer()";

   L.popup()
    .setLatLng(layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter())
    .setContent(`
      <div class="popup-form">

      <div class="popup-title">
      ${judul}
      </div>
      
      <div class="popup-info">
      Pilih tindakan yang ingin dilakukan
      </div>
      
      <button
      class="popup-button"
      onclick="${aksiEditAtribut}">
      
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


search.addEventListener("blur", function(){
    setTimeout(function(){
        ddl.classList.remove("show");
    },150);

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

// ===============================
// EDIT ATRIBUT — FITUR SHP (kolom dinamis sesuai DBF)
// ===============================
// beda sama editAtributLayer(): SHP gak punya field tetap
// nama/status/layer, jadi form-nya di-generate dari kolom atribut
// yang memang ada di data fitur itu. Layer/kategori/tema/OPD gak
// bisa diubah dari sini (itu level layer, diatur lewat master_layer,
// bukan per-fitur) — konsisten sama endpoint update_shp_atribut
// di backend yang cuma nerima update kolom dinamis.
//
// CATATAN soal tombol "🧾 Kelola Data Bantuan" di bawah form:
// data bantuan TIDAK ikut disimpan tombol "Simpan" di sini. Alasannya
// strukturnya beda level — atribut SHP itu 1 fitur = 1 baris (relasi
// 1:1), sedangkan bantuan itu 1 desa = BANYAK baris di sheet lain
// (data_bantuan), beda OPD/program/tahun. Maksain keduanya ke satu
// form bakal bikin form-nya beranak-pinak & satu tombol Simpan nulis
// ke dua sheet sekaligus (setengah gagal = data gak konsisten).
// Jadi tombol ini cuma PINTU MASUK ke panel Detail Intervensi, tempat
// tiap baris bantuan punya tombol ✏/🗑 sendiri.
function editAtributShp() {
  const layer = window.currentLayer;
  const d = layer._data;

  const skip = new Set(["id", "geometry", "created_at", "updated_at"]);
  const keys = Object.keys(d.atribut).filter(k => !skip.has(k));

  const fields = keys.map(k => `
      <label class="popup-label">${k}</label><br>
      <input
      class="popup-input shp-edit-field"
      data-key="${k}"
      value="${String(d.atribut[k] ?? "").replace(/"/g, "&quot;")}"><br><br>
  `).join("");

  L.popup({
    minWidth: 320,
    maxWidth: 340,
    maxHeight: 380,
    autoPanPadding: [40, 40]
  })
    .setLatLng(layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter())
    .setContent(`
    <div class="popup-form">
      <div class="popup-title">${judulFiturShp_(d)}</div>
      ${fields || '<div class="popup-info">(tidak ada atribut untuk diedit)</div>'}
      <div class="popup-actions">
      <button
      id="btnEditShp"
      class="popup-button"
      onclick="simpanEditAtributShp()">Simpan</button>
      <button
      class="popup-button popup-button-secondary"
      onclick="bukaDetailIntervensi(window.currentLayer)">🧾 Kelola Data Bantuan</button>
      </div>
    </div>
    `)
    .openOn(map);
}

function simpanEditAtributShp() {
  const layer = window.currentLayer;
  const d = layer._data;

  const attributes = {};
  document.querySelectorAll(".shp-edit-field").forEach(input => {
      attributes[input.dataset.key] = input.value;
  });

  const btn = document.getElementById("btnEditShp");
  btn.disabled = true;
  btn.innerHTML = "⏳ Menyimpan...";

  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "update_shp_atribut",
      sheet_name: d.sheet_name,
      id: d.id,
      attributes
    })
  })
  .then(res => res.text())
  .then(msg => {

    msg = msg.trim();
    if (msg !== "atribut updated") {
        alert(msg);
        btn.disabled = false;
        btn.innerHTML = "Simpan";
        return;
    }

    Object.assign(d.atribut, attributes);
    layer._data = d;

    btn.innerHTML = "✓ Tersimpan";

    setTimeout(() => {
        map.closePopup();
        attachEditMenu(layer, layer._data);
        setTimeout(() => {
            layer.openPopup();
        }, 100);
    }, 500);
  })
  .catch(err => {
    btn.disabled = false;
    btn.innerHTML = "Simpan";
    alert("Gagal menyimpan atribut: " + err);
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
     if (!treeLayerObjects[data.layer]) {
        treeLayerObjects[data.layer] = [];
    }

treeLayerObjects[data.layer].push(layer);
}

function toggleLayer(layerName, visible){

    if(!treeLayerObjects[layerName]) return;
    treeLayerObjects[layerName].forEach(layer=>{
        if(visible){
            map.addLayer(layer);
        }else{
            map.removeLayer(layer);
        }
    });
}

// ===============================
// KONFIGURASI TAMPILAN AWAL (nama layer persis seperti di master_layer,
// huruf besar/kecil tidak dibedakan)
// ===============================
// Layer yang otomatis tercentang & tampil di peta begitu website dibuka.
const LAYER_AKTIF_AWAL = ["Kemiskinan"];

// Layer yang ditaruh PALING ATAS di Layer Tree (urutan dalam array =
// urutan tampil). Ini murni urutan TAMPILAN daftar di tree -- urutan
// tumpukan/klik di peta (panel "⚙ Urutan Tampilan Layer", Leaflet panes)
// TIDAK ikut berubah. Kategori & tema yang memuat layer ini ikut naik ke
// atas supaya layernya benar-benar kelihatan paling atas.
const LAYER_TREE_PRIORITAS = ["Kemiskinan"];

function urutkanTreeUntukTampilan_(tree){
    const prio = LAYER_TREE_PRIORITAS.map(n => n.toLowerCase());

    // skor terkecil = paling atas; layer di luar daftar = Infinity
    const skorLayer = nama => {
        const i = prio.indexOf(String(nama).toLowerCase());
        return i === -1 ? Infinity : i;
    };
    const urutkanKunci = (obj, skorFn) => Object.keys(obj)
        .map((k, idx) => ({ k, idx, skor: skorFn(k, obj[k]) }))
        // sort stabil: yang skornya sama tetap sesuai urutan aslinya
        .sort((a, b) => (a.skor === b.skor ? a.idx - b.idx : a.skor - b.skor))
        .map(x => x.k);

    const skorTema = (tema, layers) => Math.min(Infinity, ...Object.keys(layers).map(skorLayer));
    const skorKategori = (kat, temas) =>
        Math.min(Infinity, ...Object.keys(temas).map(t => skorTema(t, temas[t])));

    const hasil = {};
    urutkanKunci(tree, skorKategori).forEach(kat => {
        hasil[kat] = {};
        urutkanKunci(tree[kat], skorTema).forEach(tema => {
            hasil[kat][tema] = {};
            urutkanKunci(tree[kat][tema], nama => skorLayer(nama)).forEach(layer => {
                hasil[kat][tema][layer] = tree[kat][tema][layer];
            });
        });
    });
    return hasil;
}

// Nyalakan layer di LAYER_AKTIF_AWAL. Pakai jalur yang sama persis
// dengan user nyentang checkbox (handleLayerToggle) -- jadi lazy-load,
// progress bar di tree, legenda, dll otomatis ikut. Dipanggil dari
// init().then(...) di bawah.
async function aktifkanLayerAwal_(){
    await Promise.all(LAYER_AKTIF_AWAL.map(async nama => {
        const master = masterLayer.find(m =>
            String(m.layer).toLowerCase() === String(nama).toLowerCase());
        if(!master) return;

        const layerName = master.layer;
        const cb = document.querySelector(`input[data-layer="${CSS.escape(layerName)}"]`);
        const isShp = master.source_type === "shp" && master.sheet_name;

        // centang dulu (kelihatan langsung selagi loading). shpVisibleLayers
        // juga diisi supaya render ulang tree di tengah loading gak
        // ngebalikin centangnya.
        if(cb) cb.checked = true;
        if(isShp) shpVisibleLayers.add(layerName);

        await handleLayerToggle(layerName, true);

        // muatBulkLayer() gagal (alert sudah muncul di sana) -> batalin
        // centang biar checkbox gak bohong
        if(isShp && !shpLoadedLayers.has(layerName)){
            shpVisibleLayers.delete(layerName);
            const cb2 = document.querySelector(`input[data-layer="${CSS.escape(layerName)}"]`);
            if(cb2) cb2.checked = false;
        }
    }));
}

function renderLayerTree(){
    const div = document.getElementById("treeContent");
    div.innerHTML = `
        <div class="tree-toolbar">
            <button type="button" class="tree-toolbar-btn" onclick="bukaAturUrutanLayer()">
                ⚙ Urutan Tampilan Layer
            </button>
            <button type="button" id="btnMigrasiLayerLama" class="tree-toolbar-btn"
                onclick="migrasiSettingLayerLama()" style="margin-top:6px;">
                ⬆ Migrasi Pengaturan Layer Lama
            </button>
        </div>
    `;
   const tree = urutkanTreeUntukTampilan_(window.layerTree);

    for(const kategori in tree){
          let html = `
            <div class="tree-kategori">
                <div class="tree-header kategori-header open"
                   data-title="${kategori}">
                   <span class="tree-arrow">▶</span><span class="tree-header-title">${kategori}</span>
                </div>
                <div class="tree-body show">
        `;

        for(const tema in tree[kategori]){
            html += `
                <div class="tree-tema">
                    <div class="tree-header tema-header open"
                         data-title="${tema}">
                         <span class="tree-arrow">▶</span><span class="tree-header-title">${tema}</span>
                    </div>
                    <div class="tree-body show">
            `;

            for(const layer in tree[kategori][tema]){
                const jumlah =
                    tree[kategori][tema][layer].length ||
                    shpFeatureCounts[layer] || 0;

                const masterInfo = masterLayer.find(item => item.layer === layer);
                const isShp = masterInfo && masterInfo.source_type === "shp";

                // layer manual selalu dianggap "sudah dimuat" (memang
                // sudah dirender pas loadDataAwal/refreshLayerData).
                // layer SHP baru checked kalau memang BENERAN kelihatan
                // di peta sekarang (shpVisibleLayers) -- BUKAN cuma
                // "sudah pernah di-load datanya" (shpLoadedLayers).
                // Dua hal itu bisa beda sejak Dashboard Kabupaten bisa
                // full-load 1 layer cuma buat statistik tanpa
                // nampilinnya (lihat muatBulkLayer/makeVisible &
                // toggleLayer()).
                const isChecked = !isShp || shpVisibleLayers.has(layer);

                // teks di bawah nama layer. SHP yang belum pernah di-load
                // jumlahnya memang belum diketahui (bukan 0) -- "Belum
                // dimuat" lebih jujur daripada "0 fitur". Setelah load
                // selesai, teksnya di-update perbaruiJumlahFiturTree_().
                const sudahDimuat = !isShp || shpLoadedLayers.has(layer);
                const teksJumlah = (jumlah > 0 || sudahDimuat)
                    ? `${jumlah.toLocaleString("id-ID")} fitur`
                    : "Belum dimuat";

                html += `
                    <div class="tree-layer">
                       <label class="tree-layer-label">
                         <input
                         type="checkbox"
                         data-layer="${layer}"
                         ${isChecked ? "checked" : ""}
                         onchange="handleLayerToggle('${layer}',this.checked)">
                         <span class="tree-layer-icon">${isShp ? "📦" : "📂"}</span>
                         <span class="tree-layer-text">
                            <span class="tree-layer-name">${layer}</span>
                            <span class="tree-count" data-count-layer="${layer}">${teksJumlah}</span>
                         </span>
                       </label>
                       <span class="tree-layer-actions">
                        ${isShp ? `
                        <button type="button"
                          class="tree-style-btn"
                          onclick="bukaSearchLayer('${layer}')"
                          title="Cari fitur di layer ini">
                          🔍
                        </button>
                        ` : ""}
                        <button type="button"
                          class="tree-style-btn"
                          onclick="bukaStyleLayer('${layer}')"
                          title="Atur warna & transparansi layer ini">
                          🎨
                        </button>
                        <button type="button"
                          class="tree-style-btn tree-delete-btn"
                          onclick="konfirmasiHapusLayer('${layer}', ${jumlah})"
                          title="Hapus layer ini beserta seluruh datanya">
                          🗑
                        </button>
                       </span>
                    </div>
                    <div class="tree-layer-progress" id="treeProgress_${layer}"></div>
                `;
            }
            html += `
                    </div>
                </div>
            `;
        }
        html += `
                </div>
            </div>
        `;
        div.innerHTML += html;
    }
}

// Update teks jumlah fitur di baris tree tanpa render ulang seluruh tree
// (render ulang bakal ngebuang state collapse & progress bar yang lagi jalan).
function perbaruiJumlahFiturTree_(layerName){
    const el = document.querySelector(`[data-count-layer="${CSS.escape(layerName)}"]`);
    if(el) el.textContent = `${(shpFeatureCounts[layerName] || 0).toLocaleString("id-ID")} fitur`;
}

function setCollapse(header, open){
    const body = header.nextElementSibling;

    if(open){
        body.classList.add("show");
        
        body.style.maxHeight = body.scrollHeight + "px";
        body.style.opacity = "1";
        header.classList.add("open");
     
    }else{
        body.classList.remove("show");
        body.style.maxHeight = "0px";
        body.style.opacity = "0";
        header.classList.remove("open");
    }
}

function refreshTreeHeight(){

    const bodies = [
    ...document.querySelectorAll(".tree-body.show")
      ].reverse();
      bodies.forEach(body=>{
        body.style.maxHeight = "none";
        body.offsetHeight; // force reflow
        const h = body.scrollHeight;
        console.log(
            body.previousElementSibling.dataset.title,
            "scrollHeight =", h
        );
        body.style.maxHeight = h + "px";
     console.log(
            body.previousElementSibling.dataset.title,
            "SET =", body.style.maxHeight
        );
    });
}

function initTreeCollapse(){

    // HEADER KATEGORI
    document.querySelectorAll(".kategori-header, .tema-header")
    .forEach(header=>{

     const body = header.nextElementSibling;

         // sinkronkan kondisi awal
        if(body.classList.contains("show")){
            body.style.maxHeight = body.scrollHeight + "px";
            body.style.opacity = "1";
            header.classList.add("open");
        }else{
            body.style.maxHeight = "0px";
            body.style.opacity = "0";
            header.classList.remove("open");
        }
        header.addEventListener("click",()=>{
            const buka = !body.classList.contains("show");
            setCollapse(header,buka);
        });
    });
}
function registerTree(data){
    if(!treeLayers[data.kategori]){
        treeLayers[data.kategori] = {};
    }
    if(!treeLayers[data.kategori][data.tema]){
        treeLayers[data.kategori][data.tema] = {};
    }
    if(!treeLayers[data.kategori][data.tema][data.layer]){
        treeLayers[data.kategori][data.tema][data.layer] = [];
    }
    treeLayers[data.kategori][data.tema][data.layer].push(data);
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

    // aktifkan edit layer yang dipilih. Untuk fitur gabungan Multi*
    // yang bagiannya lebih dari 1, cuma bagian yang barusan diklik
    // user yang benar2 masuk mode edit (lihat shim .editing di
    // buatGroupMultiGeometry_) -- kasih tau user biar gak bingung
    // kenapa cuma sebagian yang bisa digeser vertex-nya.
    if(layer._isMultiGroup && layer._subLayers.length > 1){
        const idx = (layer._lastClickedPart
            ? layer._subLayers.indexOf(layer._lastClickedPart)
            : 0);
        alert(
            `Fitur ini punya ${layer._subLayers.length} bagian terpisah (pulau/pecahan polygon).\n\n` +
            `Yang masuk mode edit cuma bagian ke-${idx + 1} (yang barusan Anda klik). ` +
            `Kalau mau edit bagian lain, batalkan/simpan dulu, lalu klik bagian lain di peta ` +
            `sebelum pilih "Edit Geometri" lagi.\n\n` +
            `Ini untuk menghindari lag/hang -- menyalakan edit di semua bagian sekaligus ` +
            `bisa membuat browser membeku kalau totalnya belasan/puluhan ribu titik vertex.`
        );
    }

    if(layer.editing){
    layer.editing.enable();
    }
    map.getContainer().style.cursor = "crosshair";
    showEditHint();
}
// ===============================
// HAPUS LAYER (SELURUH DATA-NYA) — DARI TREE
// ===============================
// BEDA sama hapusLayerSekarang() (nama itu agak menjebak) yang cuma
// hapus SATU fitur/desa yang lagi diklik di popup. Ini nge-hapus SATU
// LAYER UTUH: buat SHP artinya seluruh sheet-nya + baris di
// master_layer; buat layer manual/digitasi artinya semua fitur dengan
// nama layer itu di sheet manual + baris di master_layer. Sengaja
// dipisah jadi 2 langkah (konfirmasi -> eksekusi) biar gampang di-cancel
// dan pesannya bisa dibikin SPESIFIK (nyebut nama layer & jumlah
// fitur), bukan "Yakin ingin menghapus?" generik yang gampang kepencet
// gak sengaja.
function konfirmasiHapusLayer(layerName, jumlahFitur){
    const master = masterLayer.find(item => item.layer === layerName);
    const isShp = master && master.source_type === "shp";

    const pesan =
        `Hapus layer "${layerName}"?\n\n` +
        `${jumlahFitur} fitur akan dihapus PERMANEN` +
        (isShp ? ` beserta sheet datanya di Spreadsheet.` : `.`) +
        `\n\nTindakan ini TIDAK BISA DIBATALKAN.`;

    if(!confirm(pesan)) return;

    hapusLayerPenuh_(layerName, isShp);
}

function hapusLayerPenuh_(layerName, isShp){

    // key di layerGroups/overlayMaps itu GABUNGAN `${owner_opd}_${layer}`
    // (lihat registerLayer()), bukan nama layer polos -- makanya
    // owner_opd-nya harus diambil DULU dari masterLayer, SEBELUM baris
    // master_layer-nya sendiri kehapus dari cache di langkah berikutnya.
    const masterSebelumHapus = masterLayer.find(item => item.layer === layerName);
    const key = masterSebelumHapus ? `${masterSebelumHapus.owner_opd}_${layerName}` : null;

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ action: "delete_layer", layer: layerName })
    })
    .then(res => res.text())
    .then(msg => {
        msg = msg.trim();

        if(msg !== "layer deleted"){
            alert("Gagal menghapus layer: " + msg);
            return;
        }

        // ===== bersihin SEMUA jejak layer ini dari state di browser =====

        // 1. buang tiap fitur dari drawnItems + SEMUA layerGroup (jaga-
        // jaga kalau ada yang nyasar ke grup lain)
        if(treeLayerObjects[layerName]){
            treeLayerObjects[layerName].forEach(l => {
                drawnItems.removeLayer(l);
                Object.values(layerGroups).forEach(g => g.removeLayer(l));
            });
            delete treeLayerObjects[layerName];
        }

        // 2. buang grup layer-nya sendiri dari peta + control layer
        // bawaan (lihat catatan di blok BASEMAP soal kenapa objek
        // layerControl ini tetap ada walau gak di-addTo(map))
        if(key && layerGroups[key]){
            map.removeLayer(layerGroups[key]);
            layerControl.removeLayer(layerGroups[key]);
            delete layerGroups[key];
            delete overlayMaps[key];
        }

        // 3. buang dari cache master_layer & tracking SHP
        const idx = masterLayer.findIndex(item => item.layer === layerName);
        if(idx !== -1) masterLayer.splice(idx, 1);
        shpFeatureCounts[layerName] = 0;
        shpLoadedLayers.delete(layerName);
        shpVisibleLayers.delete(layerName);

        // 4. kalau layer ini yang lagi dipakai sebagai sumber Dashboard
        // Kabupaten, jangan biarin nunjuk ke layer yang udah gak ada --
        // rebuild dropdown-nya (biar opsi yang dihapus ikut ilang dari
        // pilihan) + fallback localStorage, biar gak error diam-diam
        if(localStorage.getItem("wgis_dashboard_layer") === layerName){
            localStorage.removeItem("wgis_dashboard_layer");
        }
        populateKabupatenDashboardSelector_();
        refreshDashboardKabupaten();

        // 5. render ulang tree & legenda
        window.layerTree = buildLayerTreeFull(lastData);
        renderLayerTree();
        initTreeCollapse();
        requestAnimationFrame(() => requestAnimationFrame(refreshTreeHeight));
        renderLegendPanel();

        alert(`Layer "${layerName}" berhasil dihapus.`);
    })
    .catch(err => {
        console.error(err);
        alert("Gagal menghubungi server: " + err.message);
    });
}

function hapusLayerSekarang(){

    const layer = window.currentLayer;

    if(!layer) return;

    if(!confirm("Yakin ingin menghapus data ini?")){
        return;
    }

    const d = layer._data;

    fetch(GAS_URL,{
        method:"POST",
        body:JSON.stringify({
            action:"delete",
            id:layer.options.id,
            sheet_name: d.sheet_name // undefined utk data manual -> backend default ke Sheet2
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

        // data manual di-refresh ulang otomatis tiap 5 detik (poll),
        // tapi data SHP gak di-poll -> perlu dibersihin manual di
        // sini biar treeLayerObjects & badge jumlahnya gak nyangkut
        if(treeLayerObjects[d.layer]){
            const idx = treeLayerObjects[d.layer].indexOf(layer);
            if(idx !== -1) treeLayerObjects[d.layer].splice(idx, 1);
        }
        if(d.atribut && shpFeatureCounts[d.layer] !== undefined){
            shpFeatureCounts[d.layer] = Math.max(0, shpFeatureCounts[d.layer] - 1);
            renderLayerTree();
            initTreeCollapse();
            requestAnimationFrame(() => requestAnimationFrame(refreshTreeHeight));
        }

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
pasangPenjagaPopup_(map);

// PENTING: matikan keyboard handler bawaan Leaflet (L.Map.Keyboard).
// Handler ini punya penanganan Escape sendiri (map.closePopup() lalu
// L.DomEvent.stop(e)) yang terpasang LANGSUNG di container peta dan
// AKTIF setiap kali container di-focus() (mis. lewat
// map.getContainer().focus() di lanjutMenggambarCreate()).
// Karena listener-nya ada di container (bukan document) dan memanggil
// stopPropagation, Escape jadi "dicegat" duluan sebelum sempat sampai
// ke document.addEventListener("keydown", ...) di bawah -> popup
// "Batalkan Digitasi" tidak pernah kebuka lagi setelah container
// pernah di-focus(). Semua shortcut Enter/Escape sudah kita tangani
// manual, jadi keyboard handler bawaan ini aman dimatikan total.
map.keyboard.disable();

// Box hint "Mode Digitasi"/"Mode Edit" pakai zIndex:9999 (lihat
// showCreateHint/showEditHint). Pane popup Leaflet default-nya
// jauh di bawah itu (~700), jadi popup konfirmasi bisa ketutup
// oleh hint. Naikkan z-index pane popup supaya selalu di atas.
map.getPane('popupPane').style.zIndex = 10000;

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

function showCreateHint(){

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

            📝 <span>Mode Digitasi</span>

        </div>

        <div style="
            display:flex;
            flex-direction:column;
            gap:6px;
            font-size:14px;
        ">

            <div>

                <b>⏎ Enter</b>

                <span style="opacity:.8;">
                    &nbsp;Lanjut ke pengisian atribut
                </span>

            </div>

            <div>

                <b>⎋ Esc</b>

                <span style="opacity:.8;">
                    &nbsp;Batalkan digitasi
                </span>

            </div>

        </div>

    `;

    Object.assign(editHint.style,{

        position:"absolute",
        top:"18px",
        right:"120px",
        minWidth:"280px",
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
        transition:"all .18s ease"

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

    map.closePopup();

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

    map.closePopup();

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
// KONFIRMASI CREATE
// ===============================

function bukaKonfirmasiSimpanCreate(){

    const layer = createState.layer;

    if(!layer) return;

    map.closePopup();

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
                💾 Simpan Geometri?
            </div>

            <div class="popup-info">
                Apakah Anda sudah selesai menggambar geometri?
            </div>

            <br>

            <button
                class="popup-button"
                onclick="konfirmasiCreateYa()">

                ✓ Ya, Lanjut Isi Data

            </button>

            <br><br>

            <button
                class="popup-button popup-button-secondary"
                onclick="lanjutMenggambarCreate()">

                ✏ Lanjut Menggambar

            </button>

        </div>

    `)
    .openOn(map);

}

function konfirmasiCreateYa(){

    const layer = createState.layer;

    if(!layer) return;
    map.closePopup();

    setTimeout(()=>{

        layer.openPopup();

    },100);

}


function bukaKonfirmasiBatalCreate(){

    const layer = createState.layer;

    if(!layer) return;

    map.closePopup();

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
                ⚠ Batalkan Digitasi?
            </div>

            <div class="popup-info">
                Semua geometri yang sudah digambar akan dihapus.
            </div>

            <br>

            <button
                class="popup-button popup-button-danger"
                onclick="konfirmasiCreateBatal()">

                🗑 Ya, Batalkan

            </button>

            <br><br>

            <button
                class="popup-button popup-button-secondary"
                onclick="lanjutMenggambarCreate()">

                ✏ Kembali Menggambar

            </button>
        </div>
    `)
    .openOn(map);

}

// ===============================
// KONFIRMASI BATAL - SEBELUM ADA
// VERTEX/POINT SAMA SEKALI
// (belum ada layer, jadi posisi
// popup pakai posisi mouse terakhir)
// ===============================
function tutupKonfirmasiBatalAwal(){

    const existing = document.getElementById("konfirmasiBatalAwalBox");

    if(existing){
        existing.remove();
    }

}

function bukaKonfirmasiBatalCreateAwal(){

    tutupKonfirmasiBatalAwal();

    const box = document.createElement("div");
    box.id = "konfirmasiBatalAwalBox";

    box.innerHTML = `

        <div class="popup-form">

            <div class="popup-title">
                ⚠ Batalkan Digitasi?
            </div>

            <div class="popup-info">
                Anda belum menambahkan titik/vertex apapun.
            </div>

            <br>

            <button
                class="popup-button popup-button-danger"
                onclick="konfirmasiCreateBatalAwal()">

                🗑 Ya, Batalkan

            </button>

            <br><br>

            <button
                class="popup-button popup-button-secondary"
                onclick="tutupKonfirmasiBatalAwal()">

                ✏ Kembali Menggambar

            </button>
        </div>
    `;

    Object.assign(box.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "#fff",
        color: "#111",
        padding: "18px 20px",
        borderRadius: "14px",
        zIndex: 10001,
        minWidth: "300px",
        maxWidth: "360px",
        boxShadow: "0 14px 36px rgba(0,0,0,.35)",
        fontFamily: "Inter, Segoe UI, sans-serif"
    });

    map.getContainer().appendChild(box);

}

function konfirmasiCreateBatalAwal(){

    tutupKonfirmasiBatalAwal();

    if(activeDrawTool){
        activeDrawTool.disable();
    }

    createState.drawing = false;
    createState.mode = null;
    activeDrawTool = null;

    hideEditHint();

}

function konfirmasiCreateBatal(){

    const layer = createState.layer;

    if(layer){

        drawnItems.removeLayer(layer);

    }

    map.closePopup();
    hideEditHint();

    createState.layer = null;
    createState.mode = null;
    createState.saved = false;

}

function lanjutMenggambarCreate(){

    const layer = createState.layer;

    if(!layer) return;

    map.closePopup();
    showCreateHint();

    editState.mode = "create";
    editState.layer = layer;
    editState.dirty = false;

    editState.originalGeometry =
        JSON.parse(
            JSON.stringify(
                layer.toGeoJSON().geometry
            )
        );

    setTimeout(()=>{

         if(layer.editing){

            layer.editing.enable();

        }

        map.getContainer().focus();

    },100);

}

// ===============================
// KONFIRMASI SIMPAN
// ===============================
function konfirmasiSimpanYa(){
   map.closePopup();

    const layer = editState.layer;

    // Layer gabungan Multi* (lihat buatGroupMultiGeometry_) gak
    // bisa lewat editToolbar.save() bawaan Leaflet.draw -- itu cuma
    // ngecek flag ".edited" di layer LANGSUNG di dalam drawnItems
    // (top-level), padahal yang beneran ke-drag itu bagian di
    // DALAM featureGroup-nya. Jadi buat kasus ini kita simpan
    // manual: ambil geometry gabungan lewat toGeoJSON() (yang sudah
    // di-shim balikin 1 geometry Multi* utuh), lalu POST sendiri.
    if(layer && layer._isMultiGroup){
        simpanEditGeometriMultiGroup_(layer);
        return;
    }

      // Delay kecil supaya popup benar-benar tertutup
      // sebelum Leaflet.Draw melakukan save
      setTimeout(() => {
        editToolbar.save();
      },50);
    }

// dipakai khusus buat layer gabungan Multi* (lihat komentar di
// konfirmasiSimpanYa di atas) -- isinya sama kayak yang dikerjakan
// map.on('draw:edited', ...) di bawah, cuma dipanggil langsung
// buat 1 layer tertentu, bukan lewat event editToolbar.save().
function simpanEditGeometriMultiGroup_(layer){

    const geom = layer.toGeoJSON().geometry;

    fetch(GAS_URL,{
        method:"POST",
        body:JSON.stringify({
            action:"update",
            id: layer.options.id,
            geometry: geom,
            sheet_name: layer._data ? layer._data.sheet_name : undefined
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

        attachEditMenu(layer, layer._data);

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
}

// ===============================
// KONFIRMASI BATAL
// ===============================
function konfirmasiBatalYa(){

    map.closePopup();

    const layer = editState.layer;

    // Sama seperti simpan: editToolbar.revertLayers() bawaan gak
    // bisa diandalkan buat layer gabungan Multi*, karena dia gak
    // tau harus balikin perubahan di bagian mana di dalam
    // featureGroup. Solusi paling aman: bongkar total layer yang
    // lagi diedit, lalu bangun ulang dari originalGeometry yang
    // sudah di-snapshot pas editGeometriLayer() mulai.
    if(layer && layer._isMultiGroup){
        const freshLayer = batalkanEditGeometriMultiGroup_(layer);

        hideEditHint();
        map.getContainer().style.cursor="";

        if(freshLayer){
            freshLayer.openPopup();
        }

        editState.mode = null;
        editState.layer = null;
        editState.dirty = false;
        editState.originalGeometry = null;
        return;
    }

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

// dipakai khusus buat layer gabungan Multi* (lihat komentar di
// konfirmasiBatalYa di atas). Buang layer lama (yang mungkin sudah
// ke-drag vertex-nya), bangun ulang dari originalGeometry, lalu
// tukar referensinya di semua tempat yang nyimpen layer lama itu
// (drawnItems, layerGroups per OPD, treeLayerObjects) supaya gak
// ada yang nyangkut nunjuk ke layer yang sudah dibuang.
function batalkanEditGeometriMultiGroup_(oldLayer){

    oldLayer.editing.disable();

    const originalGeom = editState.originalGeometry;
    const data = oldLayer._data;
    const paneName = oldLayer.options.pane;

    const freshLayer = buatLayerDariGeometry_(originalGeom, { pane: paneName });
    if(!freshLayer){
        return oldLayer; // safety net -- gagal rebuild, biarin apa adanya
    }

    freshLayer.options.id = oldLayer.options.id;

    drawnItems.removeLayer(oldLayer);
    drawnItems.addLayer(freshLayer);

    Object.values(layerGroups).forEach(g=>{
        if(g.hasLayer(oldLayer)){
            g.removeLayer(oldLayer);
            g.addLayer(freshLayer);
        }
    });

    if(treeLayerObjects[data.layer]){
        const idx = treeLayerObjects[data.layer].indexOf(oldLayer);
        if(idx !== -1) treeLayerObjects[data.layer][idx] = freshLayer;
    }

    attachEditMenu(freshLayer, data);
    applyLayerStyle(data.layer);

    return freshLayer;
}

// Menyimpan grup layer berdasarkan OPD + Layer
const layerGroups = {};
const overlayMaps = {};

// daftar layer berdasarkan nama layer
const treeLayerObjects = {};

// cache data terakhir dari server
let lastData = [];

// ===============================
// TREE LAYER
// ===============================
const treeLayers = {};

// ===============================
// STATE UNTUK LAYER SHP (lazy-load)
// ===============================

// nama layer SHP yang datanya SUDAH pernah di-bulk-load ke peta
// di sesi ini (biar toggle OFF/ON berikutnya gak fetch ulang)
const shpLoadedLayers = new Set();

// nama layer SHP yang BENERAN kelihatan di peta sekarang (di-update
// oleh toggleLayer()). Beda sama shpLoadedLayers di atas: shpLoadedLayers
// cuma berarti "datanya udah pernah di-fetch", shpVisibleLayers berarti
// "lagi ditampilkan". Sengaja dipisah karena Dashboard Kabupaten bisa
// full-load 1 layer buat itung statistik TANPA nampilinnya ke peta
// (lihat muatBulkLayer parameter makeVisible) -- checkbox di tree
// (isChecked di buatTree()) harus ngikutin yang ini, bukan
// shpLoadedLayers, biar gak kecentang sendiri padahal gak kelihatan.
const shpVisibleLayers = new Set();

// cache jumlah fitur per layer SHP, dipakai buat nampilin angka
// di tree SEBELUM layer-nya di-load (dari hasil import atau bulk load
// sebelumnya)
const shpFeatureCounts = {};

// state sementara file SHP/GeoJSON yang lagi di-preview,
// sebelum user klik "Import"
let importState = {
    geojson: null,
    previewLayer: null,
    attributeKeys: []
};

// ===============================
// DATA BANTUAN (intervensi OPD) -- lazy-load SEKALI per sesi
// ===============================
// Sheet "data_bantuan" terpisah dari SHP (relasi satu-desa-banyak-baris,
// gak bisa jadi kolom flat DBF). Di-fetch sekali aja pas pertama kali
// dibutuhkan (bukan polling), dicache di memory buat sisa sesi --
// sama pola kayak masterLayer/shpLoadedLayers.
let bantuanData = null; // null = belum pernah di-fetch
let bantuanFetchPromise = null;

function muatDataBantuan(){
    if(bantuanData !== null) return Promise.resolve(bantuanData);
    if(bantuanFetchPromise) return bantuanFetchPromise;

    bantuanFetchPromise = fetch(GAS_URL + "?action=bantuan")
        .then(res => res.json())
        .then(resp => {
            bantuanData = (resp.status === "ok" && Array.isArray(resp.data)) ? resp.data : [];
            return bantuanData;
        })
        .catch(err => {
            console.error("Gagal memuat data bantuan:", err);
            bantuanData = [];
            return bantuanData;
        });

    return bantuanFetchPromise;
}

// cocokkan baris data_bantuan punya 1 desa, by nama (case-insensitive,
// trim) -- opsional dipersempit pakai kecamatan kalau ada, buat jaga2
// nama desa yang kebetulan sama di kecamatan berbeda
function ambilBantuanUntukDesa_(namaDesa, namaKecamatan){
    if(!bantuanData || !bantuanData.length) return [];

    const nd = String(namaDesa || "").trim().toLowerCase();
    const nk = String(namaKecamatan || "").trim().toLowerCase();

    return bantuanData.filter(b => {
        const cocokDesa = String(b.desa || "").trim().toLowerCase() === nd;
        if(!cocokDesa) return false;
        if(!nk || !b.kecamatan) return true; // gak ada info kecamatan -> jangan terlalu ketat
        return String(b.kecamatan || "").trim().toLowerCase() === nk;
    });
}

// ===============================
// STYLING ENGINE (warna/opacity/z-order per layer)
// ===============================
// Konfigurasi disimpan di localStorage (per-browser, belum ke server) --
// keputusan sadar biar cepat dibangun, bisa diupgrade ke Sheets belakangan
// kalau perlu konsisten antar user.

// cache runtime (bukan localStorage) buat nyimpen min/max hasil hitung
// gradient terakhir per layer -> dipakai buat render legenda
const layerStyleRuntime = {};

// tier dasar urutan klik/tampil: point selalu di atas line, line di
// atas polygon. Di dalam 1 tier, urutannya diatur per-layer lewat
// "Urutan Tampilan Layer" (offset ditambahkan ke base ini).
const PANE_TIER_BASE = { polygon: 400, line: 450, point: 500 };

function geomTier_(type){
    if(type === "Point" || type === "MultiPoint") return "point";
    if(type === "LineString" || type === "MultiLineString") return "line";
    return "polygon"; // Polygon, MultiPolygon, dll
}

// ===============================
// DUKUNGAN GEOMETRY MULTI* (MultiPolygon/MultiLineString/MultiPoint)
// ===============================
// Leaflet.draw PUNYA BUG LAMA (belum di-fix sampai sekarang, lihat
// github.com/Leaflet/Leaflet.draw/issues/999): layer.editing.enable()
// bakal crash ("Cannot read properties of null (reading 'lat')" di
// Projection.SphericalMercator.js) kalau layer-nya adalah 1 L.Polygon/
// L.Polyline yang mewakili geometry Multi* SEJATI (multi-part, misal
// kecamatan yang punya pulau terpisah, atau ruas jalan yang putus jadi
// beberapa segmen). Ini KHUSUS Multi* (3 level nested coordinates),
// bukan Polygon biasa yang cuma punya lubang/hole (2 level) -- itu
// tetap aman dan TIDAK lewat jalur di bawah ini.
//
// Solusinya: pecah tiap "bagian" (part) dari geometry Multi* jadi
// layer Leaflet tersendiri (masing-masing Polygon/LineString/Point
// tunggal, yang memang didukung penuh oleh Leaflet.draw), lalu
// gabungkan semua bagian itu jadi 1 L.featureGroup yang kita kasih
// beberapa method tambahan (shim) supaya kode lain di file ini
// (attachEditMenu, registerLayer, applyLayerStyle, hapusLayerSekarang,
// dst) tetap bisa memperlakukannya PERSIS seperti 1 layer biasa --
// gak perlu tau/peduli itu sebenarnya gabungan banyak bagian.
//
// FeatureGroup Leaflet MEMANG sudah native mendukung .bindPopup(),
// .setStyle(), .getBounds(), dst dengan cara meneruskan (invoke) ke
// semua layer anaknya -- jadi bagian itu otomatis ikut, gak perlu
// di-shim manual. Yang perlu di-shim manual cuma 2: .toGeoJSON()
// (biar hasil gabungannya balik jadi 1 geometry Multi* utuh lagi,
// bukan malah kepisah) dan .editing.enable()/.disable() (biar bisa
// dipanggil kayak layer biasa, padahal di baliknya nyalain/matiin
// editing di SEMUA bagian sekaligus).
function buatGroupMultiGeometry_(subLayers, multiType, paneName){

    const group = L.featureGroup(subLayers, { pane: paneName });

    group._isMultiGroup = true;
    group._multiType = multiType; // "MultiPolygon" / "MultiLineString" / "MultiPoint"
    group._subLayers = subLayers;

    // gabungkan lagi coordinates tiap bagian jadi 1 geometry Multi*
    // yang utuh -- bentuknya HARUS persis kayak hasil toGeoJSON()
    // bawaan Leaflet (Feature + geometry di dalamnya), karena di
    // banyak tempat kodenya manggil layer.toGeoJSON().geometry
    group.toGeoJSON = function(){
        return {
            type: "Feature",
            properties: {},
            geometry: {
                type: multiType,
                coordinates: subLayers.map(l => l.toGeoJSON().geometry.coordinates)
            }
        };
    };

    // nyala/matiin editing. PENTING soal performa: .enable() SENGAJA
    // cuma nyalain 1 bagian (bukan semua sekaligus) -- fitur kayak
    // kecamatan bisa punya ratusan bagian & puluhan ribu vertex
    // total; kalau semua bagian dinyalain edit-nya bersamaan,
    // Leaflet.draw bikin marker vertex + marker tengah untuk SEMUA
    // titik itu sekaligus (puluhan ribu elemen DOM dalam 1 kali
    // jalan) -> tab browser hang total tanpa error apapun.
    //
    // Bagian yang dipilih: yang TERAKHIR DIKLIK user (lihat
    // attachEditMenu -> layer._lastClickedPart, diisi otomatis pas
    // user klik salah satu bagian di peta buat buka popup-nya),
    // atau bagian pertama kalau belum pernah ada yang diklik. Pas
    // simpan (lihat .toGeoJSON() di atas), bagian2 lain yang gak
    // ikut diedit otomatis ikut kebawa apa adanya (gak berubah),
    // jadi hasil akhirnya tetap 1 geometry Multi* yang utuh & benar.
    group.editing = {
        enable: function(){
            const idx = (group._editingPartIndex != null)
                ? group._editingPartIndex
                : (group._lastClickedPart ? subLayers.indexOf(group._lastClickedPart) : 0);

            group._editingPartIndex = idx >= 0 ? idx : 0;
            const sub = subLayers[group._editingPartIndex];
            if(sub && sub.editing){
                sub.editing.enable();
            }
        },
        disable: function(){
            // disable tetap nyapu SEMUA bagian sekaligus -- aman &
            // idempotent (matiin yang gak aktif = no-op), jaga2 kalau
            // ada bagian yang somehow ketinggalan nyala
            subLayers.forEach(l => l.editing && l.editing.disable());
            group._editingPartIndex = null;
        }
    };

    return group;
}

// Bikin 1 layer Leaflet dari 1 object geometry GeoJSON. Kalau
// tipenya Point/LineString/Polygon biasa -> jalan lama persis
// (L.geoJSON(...).getLayers()[0]), gak ada yang berubah. Kalau
// tipenya MultiPolygon/MultiLineString/MultiPoint -> dipecah per
// bagian lalu digabung lewat buatGroupMultiGeometry_ di atas.
function buatLayerDariGeometry_(geometry, opts){

    opts = opts || {};
    const paneName = opts.pane;

    const MULTI_KE_SINGLE = {
        "MultiPolygon": "Polygon",
        "MultiLineString": "LineString",
        "MultiPoint": "Point"
    };

    const singleType = MULTI_KE_SINGLE[geometry.type];

    if(!singleType){
        // tipe single biasa -> cara lama, tidak berubah
        const gLayer = L.geoJSON(geometry, {
            pane: paneName,
            pointToLayer: opts.pointToLayer
        });
        return gLayer.getLayers()[0] || null;
    }

    const subLayers = geometry.coordinates
        .map(partCoords => {
            const partGeom = { type: singleType, coordinates: partCoords };
            const gLayer = L.geoJSON(partGeom, {
                pane: paneName,
                pointToLayer: opts.pointToLayer
            });
            return gLayer.getLayers()[0];
        })
        .filter(Boolean);

    if(!subLayers.length) return null;

    return buatGroupMultiGeometry_(subLayers, geometry.type, paneName);
}

function getLayerZOrder_(){
    try{
        return JSON.parse(localStorage.getItem("wgis_layer_zorder") || "[]");
    }catch(e){ return []; }
}

function saveLayerZOrder_(arr){
    localStorage.setItem("wgis_layer_zorder", JSON.stringify(arr));
}

// index urutan = prioritas relatif SESAMA layer di tier yang sama.
// layer yang belum pernah diatur otomatis ditaruh di urutan
// terakhir (paling atas di tier-nya) & dicatat posisinya.
function getZOrderIndex_(layerName){
    const order = getLayerZOrder_();
    let idx = order.indexOf(layerName);
    if(idx === -1){
        order.push(layerName);
        saveLayerZOrder_(order);
        idx = order.length - 1;
    }
    return idx;
}

// bikin/pastikan pane per (tier, layer) ada, dengan z-index sesuai
// tier dasar + urutan prioritas layer itu
function getPane_(tier, layerName){
    const paneName = "pane_" + tier + "_" + layerName.replace(/[^a-zA-Z0-9_]/g, "_");
    let pane = map.getPane(paneName);
    if(!pane) pane = map.createPane(paneName);
    pane.style.zIndex = PANE_TIER_BASE[tier] + getZOrderIndex_(layerName);
    return paneName;
}

// tarik ulang z-index SEMUA pane yang sudah pernah dibuat, sesuai
// urutan terbaru -- dipanggil abis user ubah urutan di panel
function reapplyAllPanes_(){
    Object.keys(treeLayerObjects).forEach(layerName => {
        (treeLayerObjects[layerName] || []).forEach(layer => {
            if(!layer.options || !layer.options.pane) return;
            const pane = map.getPane(layer.options.pane);
            if(!pane) return;
            const tier = Object.keys(PANE_TIER_BASE).find(t =>
                layer.options.pane.startsWith("pane_" + t + "_")
            );
            if(tier) pane.style.zIndex = PANE_TIER_BASE[tier] + getZOrderIndex_(layerName);
        });
    });
}

function getLayerStyleConfig_(layerName){
    const server = bacaConfigServer_(layerName, "style_config");
    if(server !== undefined){
        try{ return JSON.parse(server); }catch(e){ /* lanjut ke localStorage */ }
    }
    try{
        const raw = localStorage.getItem("wgis_style_" + layerName);
        return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
}

// ===============================
// SYNC CONFIG LAYER KE SERVER (master_layer, kolom label_field dst)
// ===============================
// Dipanggil di 2 tempat: (1) simpanStyleLayer() -- otomatis abis user
// klik Simpan di panel 🎨 Style, SATU request ngirim SEMUA 6 field
// config sekaligus (bukan 1 request per field), dan (2)
// migrasiSettingLayerLama() -- migrasi manual pengaturan lama yang
// masih nyangkut di localStorage 1 browser doang. Update ke
// `masterLayer` (in-memory) langsung juga dilakukan di sini, biar
// SESI INI langsung baca nilai baru tanpa nunggu reload -- browser
// LAIN baru kebagian pas mereka reload (fetch ?action=master ulang).

function ambilConfigLayerSaatIni_(layerName){
    return {
        label_field: getLayerLabelField_(layerName),
        subtitle_field: getLayerSubtitleField_(layerName),
        summary_fields: getSummaryFields_(layerName),
        field_labels: getFieldLabels_(layerName),
        donut_config: getDonutConfig_(layerName) || {},
        style_config: getLayerStyleConfig_(layerName) || {}
    };
}

function terapkanConfigKeMasterLayer_(layerName, patch){
    let entry = masterLayer.find(m => m.layer === layerName);
    if(!entry){
        entry = { layer: layerName };
        masterLayer.push(entry);
    }
    entry.label_field = patch.label_field || "";
    entry.subtitle_field = patch.subtitle_field || "";
    entry.summary_fields = JSON.stringify(patch.summary_fields || []);
    entry.field_labels = JSON.stringify(patch.field_labels || {});
    entry.donut_config = JSON.stringify(patch.donut_config || {});
    entry.style_config = JSON.stringify(patch.style_config || {});
}

// versi async (return Promise<boolean> berhasil/gagal) -- dipakai
// migrasiSettingLayerLama() yang perlu nunggu tiap layer kelar 1-1
// biar bisa laporan hasil akhirnya
async function syncLayerConfigKeServerAsync_(layerName, patchOverride){
    const patch = patchOverride || ambilConfigLayerSaatIni_(layerName);
    terapkanConfigKeMasterLayer_(layerName, patch);

    try{
        const res = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify(Object.assign(
                { action: "update_layer_config", layer: layerName },
                patch
            ))
        });
        const resp = await res.json();
        if(resp.status !== "ok"){
            console.error("Gagal sync config layer ke server:", layerName, resp);
            return false;
        }
        return true;
    }catch(err){
        console.error("Gagal sync config layer ke server:", layerName, err);
        return false;
    }
}

// versi fire-and-forget -- dipakai simpanStyleLayer() biar gak nge-block
// UI pas user klik Simpan, tapi tetap kasih tau kalau ternyata gagal
function syncLayerConfigKeServer_(layerName, patchOverride){
    syncLayerConfigKeServerAsync_(layerName, patchOverride).then(ok => {
        if(!ok){
            alert("Setting tersimpan di browser ini, tapi GAGAL sync ke server. Coba klik Simpan lagi, atau cek koneksi internet.");
        }
    });
}

// cari semua nama layer yang PUNYA setting lokal (localStorage) di
// browser ini -- dasar buat tombol migrasi, biar gak nge-timpa
// setting server pakai data kosong buat layer yang emang gak pernah
// dikustomisasi di browser ini
function cariLayerYangPunyaSettingLokal_(){
    const prefixes = [
        "wgis_label_", "wgis_subtitle_", "wgis_summary_",
        "wgis_fieldlabels_", "wgis_donut_", "wgis_style_"
    ];
    const layerSet = new Set();

    for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        for(const p of prefixes){
            if(key.startsWith(p)){
                layerSet.add(key.slice(p.length));
                break;
            }
        }
    }
    return Array.from(layerSet);
}

async function migrasiSettingLayerLama(){
    const layers = cariLayerYangPunyaSettingLokal_();

    if(!layers.length){
        alert("Nggak ada pengaturan layer tersimpan di browser ini yang perlu dimigrasi.");
        return;
    }

    const ok = confirm(
        `Ditemukan pengaturan lokal untuk ${layers.length} layer di browser ini:\n\n` +
        layers.join(", ") +
        `\n\nPindahkan semua ke server sekarang? (setting server buat layer-layer ini, kalau ada, akan ditimpa)`
    );
    if(!ok) return;

    const btn = document.getElementById("btnMigrasiLayerLama");
    if(btn){ btn.disabled = true; btn.textContent = "⏳ Memigrasi..."; }

    const gagal = [];
    for(const layerName of layers){
        const berhasil = await syncLayerConfigKeServerAsync_(layerName);
        if(!berhasil) gagal.push(layerName);
    }

    if(btn){
        btn.disabled = false;
        btn.textContent = "⬆ Migrasi Pengaturan Layer Lama";
    }

    if(gagal.length){
        alert(`Migrasi selesai, tapi ${gagal.length} layer GAGAL disync:\n${gagal.join(", ")}\n\nCoba klik tombol ini lagi buat yang gagal.`);
    } else {
        alert(`Migrasi selesai! ${layers.length} layer berhasil dipindah ke server. Sekarang browser/perangkat lain bakal lihat setting yang sama.`);
        renderLayerTree();
    }
}

function saveLayerStyleConfig_(layerName, config){
    localStorage.setItem("wgis_style_" + layerName, JSON.stringify(config));
}

// kolom atribut yang dipakai sebagai JUDUL popup, per layer (misal
// "NAMOBJ" buat layer desa). SUMBER UTAMA: server (masterLayer, kolom
// label_field) -- supaya sama di semua browser. Fallback ke
// localStorage kalau server belum punya nilainya (belum pernah
// disimpan/dimigrasi dari browser ini). Kalau belum diatur sama
// sekali, judulFiturShp_ fallback ke nama layer seperti sebelumnya.
function bacaConfigServer_(layerName, kolom){
    const entry = masterLayer.find(m => m.layer === layerName);
    if(!entry) return undefined;
    const v = entry[kolom];
    return (v === undefined || v === null || v === "") ? undefined : v;
}

function getLayerLabelField_(layerName){
    const server = bacaConfigServer_(layerName, "label_field");
    if(server !== undefined) return server;
    return localStorage.getItem("wgis_label_" + layerName) || "";
}

function saveLayerLabelField_(layerName, field){
    if(field){
        localStorage.setItem("wgis_label_" + layerName, field);
    } else {
        localStorage.removeItem("wgis_label_" + layerName);
    }
}

function judulFiturShp_(d){
    const field = getLayerLabelField_(d.layer);
    const nilai = field ? d.atribut[field] : null;
    return "📦 " + (nilai || d.layer);
}

// daftar kolom atribut yang ditampilkan di Popup Summary (popup info
// pertama, bukan Dashboard), per layer -- diatur manual lewat panel
// 🎨 Style. Kalau belum diatur, attachEditMenu fallback ke 4 field
// pertama secara otomatis.
function getSummaryFields_(layerName){
    const server = bacaConfigServer_(layerName, "summary_fields");
    if(server !== undefined){
        try{ return JSON.parse(server); }catch(e){ /* lanjut ke localStorage */ }
    }
    try{
        const raw = localStorage.getItem("wgis_summary_" + layerName);
        return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
}

function saveSummaryFields_(layerName, fields){
    localStorage.setItem("wgis_summary_" + layerName, JSON.stringify(fields));
}

// nama tampilan custom per kolom atribut (misal "jumlah_penerima" ->
// "Jumlah Penerima"), per layer. Kalau kolom gak ada di map ini,
// fallback ke nama kolom mentahnya apa adanya.
function getFieldLabels_(layerName){
    const server = bacaConfigServer_(layerName, "field_labels");
    if(server !== undefined){
        try{ return JSON.parse(server); }catch(e){ /* lanjut ke localStorage */ }
    }
    try{
        const raw = localStorage.getItem("wgis_fieldlabels_" + layerName);
        return raw ? JSON.parse(raw) : {};
    }catch(e){ return {}; }
}

function saveFieldLabels_(layerName, map){
    localStorage.setItem("wgis_fieldlabels_" + layerName, JSON.stringify(map));
}

function labelKolom_(layerName, key){
    const map = getFieldLabels_(layerName);
    return (map && map[key]) ? map[key] : key;
}

// kolom atribut yang dipakai sebagai SUBJUDUL popup (misal kolom
// "kecamatan" di bawah nama desa). Opsional, per layer.
function getLayerSubtitleField_(layerName){
    const server = bacaConfigServer_(layerName, "subtitle_field");
    if(server !== undefined) return server;
    return localStorage.getItem("wgis_subtitle_" + layerName) || "";
}

function saveLayerSubtitleField_(layerName, field){
    if(field){
        localStorage.setItem("wgis_subtitle_" + layerName, field);
    } else {
        localStorage.removeItem("wgis_subtitle_" + layerName);
    }
}

// konfigurasi donut komposisi (misal "Desil 1-5 vs Penduduk Lainnya"):
// {total: "<kolom total>", subset: "<kolom subset>"}. Donut cuma
// dirender kalau DUA-duanya diatur DAN nilainya valid angka di fitur
// yang lagi dibuka -- gak pernah nebak pasangan kolom sendiri.
function getDonutConfig_(layerName){
    const server = bacaConfigServer_(layerName, "donut_config");
    if(server !== undefined){
        try{
            const parsed = JSON.parse(server);
            if(parsed && parsed.total && parsed.subset) return parsed;
        }catch(e){ /* lanjut ke localStorage */ }
    }
    try{
        const raw = localStorage.getItem("wgis_donut_" + layerName);
        return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
}

function saveDonutConfig_(layerName, config){
    if(config && config.total && config.subset){
        localStorage.setItem("wgis_donut_" + layerName, JSON.stringify(config));
    } else {
        localStorage.removeItem("wgis_donut_" + layerName);
    }
}

function hexToRgb_(hex){
    hex = (hex || "#3388ff").replace("#", "");
    if(hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function interpolateColor_(hex1, hex2, t){
    t = Math.max(0, Math.min(1, t));
    const c1 = hexToRgb_(hex1);
    const c2 = hexToRgb_(hex2);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return `rgb(${r},${g},${b})`;
}

// terapkan style tersimpan (kalau ada) ke semua fitur layer ini yang
// LAGI dirender. Kalau belum pernah diatur (config null), sengaja
// dibiarkan pakai default Leaflet -- gak maksa nyentuh tampilan
// layer yang belum pernah disetel usernya.
function applyLayerStyle(layerName){
    const config = getLayerStyleConfig_(layerName);
    if(!config) return;

    const features = treeLayerObjects[layerName] || [];
    if(!features.length) return;

    let min, max, kosong = 0;
    if(config.mode === "gradient" && config.attribute){
        const nilai = features
            .map(l => parseFloat(l._data && l._data.atribut ? l._data.atribut[config.attribute] : NaN))
            .filter(v => !isNaN(v));
        if(nilai.length){
            min = Math.min(...nilai);
            max = Math.max(...nilai);
        }
        // fitur yang nilainya kosong/non-angka diwarnai abu netral --
        // dihitung di sini biar legenda bisa nyebutin "Tidak ada data"
        kosong = features.length - nilai.length;
    }
    layerStyleRuntime[layerName] = { min, max, config, kosong };

    const opacity = (config.opacity ?? 70) / 100;

    features.forEach(layer => {
        let warna = config.color || "#3388ff";

        if(config.mode === "gradient" && config.attribute && min !== undefined){
            const v = parseFloat(layer._data && layer._data.atribut ? layer._data.atribut[config.attribute] : NaN);
            if(!isNaN(v)){
                const t = max === min ? 1 : (v - min) / (max - min);
                warna = interpolateColor_(config.colorMin, config.colorMax, t);
            } else {
                warna = "#cccccc"; // nilai kosong/non-angka -> abu netral
            }
        }

        if(typeof layer.setStyle === "function"){
            // Polygon/Polyline/CircleMarker
            layer.setStyle({
                color: warna,
                fillColor: warna,
                fillOpacity: opacity,
                opacity: opacity,
                weight: 2
            });
        } else if(typeof layer.setOpacity === "function"){
            // L.Marker (icon) -- gak support warna fill, opacity aja
            layer.setOpacity(opacity);
        }
    });

    renderLegendPanel();
}

// Legenda gradient (choropleth). Posisi & tampilan diatur di admin.css
// (#legendPanel / .wgis-legend-*), bukan inline lagi.
//
// Posisi: di dasar peta, TEPAT DI SEBELAH KANAN Layer Tree (bukan di
// bawah/menimpa tree), di atas footer brand -- jadi gak ketutup tree
// yang tinggi maupun footer.
//
// Isi per layer: nama layer, nama ukuran (nama tampilan kolom dari panel
// 🎨 Style, fallback nama kolom mentah) + SATUAN (config.unit, diisi di
// panel 🎨 Style), bar gradient, nilai terendah/tengah/tertinggi
// lengkap dengan satuan, dan keterangan "Tidak ada data" kalau ada
// fitur yang nilainya kosong.
// Default judul ukuran & satuan legenda per layer, dipakai kalau di panel
// 🎨 Style belum diisi "Nama tampilan" kolom / "Satuan Nilai". Kalau
// panel diisi, panel yang menang. Kunci = nama layer (huruf kecil),
// `attribute` = nama kolom gradient-nya (huruf kecil).
const LEGENDA_DEFAULT = {
    "kemiskinan": {
        attribute: "jumlah_mis",
        judul: "Jumlah Masyarakat Desil 1-5",
        dashboard: "Jumlah Penduduk Miskin (Desil 1-5)",
        unit: "orang"
    }
};

function defaultLegenda_(layerName, attr){
    const def = LEGENDA_DEFAULT[String(layerName || "").toLowerCase()];
    if(def && String(attr || "").toLowerCase() === def.attribute) return def;
    return null;
}

// Label kartu "jumlah kolom subset" di Dashboard Kabupaten. Prioritas
// sama dengan legenda: Nama tampilan di panel 🎨 > default di
// LEGENDA_DEFAULT (.dashboard) > nama kolom mentah.
function namaUkuranDashboard_(layerName, attr){
    const custom = (getFieldLabels_(layerName) || {})[attr];
    if(custom) return custom;
    const def = defaultLegenda_(layerName, attr);
    return (def && def.dashboard) ? def.dashboard : attr;
}

function namaUkuranLegenda_(layerName, attr){
    const custom = (getFieldLabels_(layerName) || {})[attr];
    if(custom) return custom;
    const def = defaultLegenda_(layerName, attr);
    return def ? def.judul : attr;
}

function formatNilaiLegend_(v, unit, maxDigit){
    const n = Number(v).toLocaleString("id-ID", { maximumFractionDigits: maxDigit });
    if(!unit) return n;
    return unit === "%" ? n + "%" : n + " " + unit;
}

function renderLegendPanel(){
    let panel = document.getElementById("legendPanel");
    if(!panel){
        panel = document.createElement("div");
        panel.id = "legendPanel";
        document.body.appendChild(panel);
    }

    const rows = Object.keys(layerStyleRuntime)
        .filter(layerName => {
            const rt = layerStyleRuntime[layerName];
            if(!rt || rt.config.mode !== "gradient" || rt.min === undefined) return false;
            // cuma tampilin kalau checkbox layernya lagi kecentang di tree
            const cb = document.querySelector(`input[data-layer="${CSS.escape(layerName)}"]`);
            return cb ? cb.checked : false;
        })
        .map(layerName => {
            const rt = layerStyleRuntime[layerName];
            const def = defaultLegenda_(layerName, rt.config.attribute);
            const unit = (rt.config.unit || "").trim() || (def ? def.unit : "");
            const ukuran = namaUkuranLegenda_(layerName, rt.config.attribute);
            const sama = rt.min === rt.max;
            const tengah = (rt.min + rt.max) / 2;
            const digitTengah = (rt.max - rt.min) >= 10 ? 0 : 2;

            const skala = sama
                ? `<span class="wgis-legend-single">${escHtml_(formatNilaiLegend_(rt.min, unit, 2))} (semua sama)</span>`
                : `<span>${escHtml_(formatNilaiLegend_(rt.min, unit, 2))}</span>
                   <span class="wgis-legend-mid">${escHtml_(formatNilaiLegend_(tengah, unit, digitTengah))}</span>
                   <span>${escHtml_(formatNilaiLegend_(rt.max, unit, 2))}</span>`;

            return `
                <div class="wgis-legend-item">
                    <div class="wgis-legend-layer">${escHtml_(layerName)}</div>
                    <div class="wgis-legend-metric">
                        ${escHtml_(ukuran)}${unit ? ` <span class="wgis-legend-unit">(${escHtml_(unit)})</span>` : ""}
                    </div>
                    <div class="wgis-legend-bar" style="background:linear-gradient(to right, ${rt.config.colorMin}, ${rt.config.colorMax});"></div>
                    <div class="wgis-legend-scale">${skala}</div>
                    ${rt.kosong > 0 ? `
                        <div class="wgis-legend-nodata">
                            <span class="wgis-legend-nodata-swatch"></span>
                            Tidak ada data (${rt.kosong})
                        </div>` : ""}
                </div>
            `;
        }).join("");

    if(!rows){
        panel.style.display = "none";
        return;
    }
    panel.style.display = "";
    panel.innerHTML = `<div class="wgis-legend-items">${rows}</div>`;
}

// ===============================
// PANEL: Atur warna & transparansi 1 layer
// ===============================
function tutupStyleLayer(){
    const panel = document.getElementById("styleLayerPanel");
    if(panel) panel.remove();
}

function bukaStyleLayer(layerName){
    tutupStyleLayer();

    const config = getLayerStyleConfig_(layerName) || {
        mode: "solid",
        color: "#3388ff",
        opacity: 70,
        attribute: "",
        colorMin: "#ffffcc",
        colorMax: "#bd0026"
    };

    // kolom atribut numerik yang bisa dipakai buat gradient -- cuma
    // ada kalau layernya SHP dan datanya udah pernah di-load
    const contoh = (treeLayerObjects[layerName] || [])[0];
    const isShpLoaded = contoh && contoh._data && contoh._data.atribut;
    let opsiAtribut = "";
    let opsiLabelField = "";
    let opsiSubtitleField = "";
    let donutConfig = getDonutConfig_(layerName);
    let opsiDonut = () => "";
    if(isShpLoaded){
        const keys = Object.keys(contoh._data.atribut)
            .filter(k => !["id","geometry","created_at","updated_at"].includes(k));
        const labelField = getLayerLabelField_(layerName);
        const subtitleField = getLayerSubtitleField_(layerName);
        opsiAtribut = keys
            .map(k => `<option value="${k}" ${config.attribute===k ? "selected":""}>${k}</option>`)
            .join("");
        opsiLabelField = keys
            .map(k => `<option value="${k}" ${labelField===k ? "selected":""}>${k}</option>`)
            .join("");
        opsiSubtitleField = keys
            .map(k => `<option value="${k}" ${subtitleField===k ? "selected":""}>${k}</option>`)
            .join("");
        opsiDonut = (nilaiTerpilih) => keys
            .map(k => `<option value="${k}" ${nilaiTerpilih===k ? "selected":""}>${k}</option>`)
            .join("");
    }

    const wrapper = document.createElement("div");
    wrapper.id = "styleLayerPanel";
    wrapper.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:21000; background:#fff; border-radius:10px;
        box-shadow:0 4px 24px rgba(0,0,0,0.25);
        padding:16px 20px; width:340px; max-width:92vw; max-height:88vh;
        overflow-y:auto;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title">🎨 Style: ${layerName}</div>
            <br>

            <label class="popup-label">Transparansi (opacity)</label><br>
            <input type="range" id="style_opacity" min="10" max="100" value="${config.opacity}" style="width:100%;">
            <div style="text-align:right; font-size:12px;" id="style_opacity_val">${config.opacity}%</div>
            <br>

            <label class="popup-label">Mode Warna</label><br>
            <label style="font-weight:400;"><input type="radio" name="style_mode" value="solid" ${config.mode==="solid"?"checked":""}> Warna Solid</label><br>
            <label style="font-weight:400;">
                <input type="radio" name="style_mode" value="gradient" ${config.mode==="gradient"?"checked":""} ${isShpLoaded ? "" : "disabled"}>
                Gradient berdasarkan atribut ${isShpLoaded ? "" : "(load layer SHP ini dulu)"}
            </label>
            <br><br>

            <div id="style_solid_box" style="${config.mode==="gradient" ? "display:none;":""}">
                <label class="popup-label">Warna</label><br>
                <input type="color" id="style_color" value="${config.color}">
            </div>

            <div id="style_gradient_box" style="${config.mode==="gradient" ? "":"display:none;"}">
                <label class="popup-label">Kolom Atribut</label><br>
                <select class="popup-input" id="style_attribute">
                    <option value="">-- pilih kolom --</option>
                    ${opsiAtribut}
                </select>

                <label class="popup-label" style="margin-top:8px; display:inline-block;">Satuan Nilai (tampil di legenda)</label><br>
                <input type="text" class="popup-input" id="style_unit"
                    placeholder="mis. jiwa, orang, KK, %"
                    value="${(config.unit || "").replace(/"/g,"&quot;")}">
                <div class="popup-info" style="font-size:11px; color:#888; margin-top:-2px;">
                    Nama ukuran di legenda diambil dari "Nama tampilan" kolom di daftar Field (bawah).
                </div>

                <div style="display:flex; gap:12px; margin-top:6px; margin-bottom:14px;">
                    <div style="flex:1; text-align:center;">
                        <label class="popup-label" style="display:block; margin-bottom:6px;">Nilai Terendah</label>
                        <input type="color" id="style_colorMin" value="${config.colorMin}" style="width:100%; height:38px; border:1px solid #bbb; border-radius:6px; cursor:pointer;">
                    </div>
                    <div style="flex:1; text-align:center;">
                        <label class="popup-label" style="display:block; margin-bottom:6px;">Nilai Tertinggi</label>
                        <input type="color" id="style_colorMax" value="${config.colorMax}" style="width:100%; height:38px; border:1px solid #bbb; border-radius:6px; cursor:pointer;">
                    </div>
                </div>
            </div>

            ${isShpLoaded ? `
            <label class="popup-label">Kolom untuk Judul Popup</label><br>
            <select class="popup-input" id="style_labelField">
                <option value="">-- pakai nama layer (default) --</option>
                ${opsiLabelField}
            </select>
            <br>

            <label class="popup-label">Kolom Kecamatan/Wilayah (subjudul popup)</label><br>
            <select class="popup-input" id="style_subtitleField">
                <option value="">-- tidak ditampilkan --</option>
                ${opsiSubtitleField}
            </select>
            <br>

            <label class="popup-label">Field di Popup Summary (Ringkasan)</label><br>
            <div class="popup-info" style="font-size:11px; color:#888; margin-top:-4px; margin-bottom:6px;">
                Kotak teks di samping = nama tampilan (kosongkan buat pakai nama kolom apa adanya).
            </div>
            <div style="max-height:220px; overflow-y:auto; border:1px solid #ddd; border-radius:6px; padding:8px; margin-bottom:10px;">
                ${(() => {
                    const keys = Object.keys(contoh._data.atribut)
                        .filter(k => !["id","geometry","created_at","updated_at"].includes(k));
                    const dipilih = getSummaryFields_(layerName);
                    const labelMap = getFieldLabels_(layerName);
                    return keys.map(k => `
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                            <label style="display:flex; align-items:center; gap:4px; font-weight:400; font-size:13px; flex-shrink:0;">
                                <input type="checkbox" class="style_summaryField" value="${k}" ${dipilih.includes(k) ? "checked":""}>
                                <span style="color:#888; font-size:11.5px;">${k}</span>
                            </label>
                            <input type="text" class="style_fieldLabel popup-input" data-key="${k}"
                                placeholder="Nama tampilan..."
                                value="${(labelMap[k] || "").replace(/"/g,"&quot;")}"
                                style="margin:0; padding:4px 8px; font-size:12px; flex:1;">
                        </div>
                    `).join("");
                })()}
            </div>
            <div class="popup-info" style="font-size:11px; color:#888; margin-top:-6px;">
                Kalau tidak dipilih sama sekali, otomatis pakai 4 field pertama.
            </div>

            <label class="popup-label">Grafik Komposisi (Donut) -- opsional</label><br>
            <div class="popup-info" style="font-size:11px; color:#888; margin-top:-4px; margin-bottom:6px;">
                Contoh: Total = jumlah penduduk, Bagian = jumlah desil 1-5.
                Donut cuma muncul kalau dua-duanya keisi angka valid.
            </div>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <div style="flex:1;">
                    <label class="popup-label" style="font-size:12px;">Kolom Total</label><br>
                    <select class="popup-input" id="style_donutTotal">
                        <option value="">-- tidak pakai --</option>
                        ${opsiDonut(donutConfig ? donutConfig.total : "")}
                    </select>
                </div>
                <div style="flex:1;">
                    <label class="popup-label" style="font-size:12px;">Kolom Bagian</label><br>
                    <select class="popup-input" id="style_donutSubset">
                        <option value="">-- tidak pakai --</option>
                        ${opsiDonut(donutConfig ? donutConfig.subset : "")}
                    </select>
                </div>
            </div>
            ` : ""}

            <button class="popup-button" onclick="simpanStyleLayer('${layerName}')">✓ Terapkan</button>
            <br><br>
            <button class="popup-button popup-button-secondary" onclick="tutupStyleLayer()">✕ Tutup</button>
        </div>
    `;

    document.body.appendChild(wrapper);

    document.getElementById("style_opacity").addEventListener("input", function(){
        document.getElementById("style_opacity_val").textContent = this.value + "%";
    });

    document.querySelectorAll('input[name="style_mode"]').forEach(radio => {
        radio.addEventListener("change", function(){
            document.getElementById("style_solid_box").style.display = this.value === "solid" ? "" : "none";
            document.getElementById("style_gradient_box").style.display = this.value === "gradient" ? "" : "none";
        });
    });
}

function simpanStyleLayer(layerName){
    const mode = document.querySelector('input[name="style_mode"]:checked').value;
    const opacity = parseInt(document.getElementById("style_opacity").value, 10);

    const config = { mode, opacity };

    if(mode === "gradient"){
        const attribute = document.getElementById("style_attribute").value;
        if(!attribute){
            alert("Pilih kolom atribut dulu untuk mode gradient.");
            return;
        }
        config.attribute = attribute;
        config.colorMin = document.getElementById("style_colorMin").value;
        config.colorMax = document.getElementById("style_colorMax").value;
        config.unit = document.getElementById("style_unit").value.trim();
    } else {
        config.color = document.getElementById("style_color").value;
    }

    // Titik awal patch = config yang berlaku sekarang; field yang ada di
    // form ditimpa nilai barunya di bawah. Patch ini SATU-SATUNYA yang
    // dikirim ke server & dicatat ke cache masterLayer -- SENGAJA gak
    // dibangun ulang lewat getter (getLayerXxx_), karena getter baca
    // server dulu: kalau server sudah punya nilai lama, getter bakal
    // ngembaliin nilai LAMA itu dan perubahan user gak pernah kepakai.
    const patch = ambilConfigLayerSaatIni_(layerName);

    saveLayerStyleConfig_(layerName, config);
    patch.style_config = config;

    const labelFieldEl = document.getElementById("style_labelField");
    if(labelFieldEl){
        saveLayerLabelField_(layerName, labelFieldEl.value);
        patch.label_field = labelFieldEl.value;
    }

    const subtitleFieldEl = document.getElementById("style_subtitleField");
    if(subtitleFieldEl){
        saveLayerSubtitleField_(layerName, subtitleFieldEl.value);
        patch.subtitle_field = subtitleFieldEl.value;
    }

    const donutTotalEl = document.getElementById("style_donutTotal");
    const donutSubsetEl = document.getElementById("style_donutSubset");
    if(donutTotalEl && donutSubsetEl){
        saveDonutConfig_(layerName, {
            total: donutTotalEl.value,
            subset: donutSubsetEl.value
        });
        patch.donut_config = (donutTotalEl.value && donutSubsetEl.value)
            ? { total: donutTotalEl.value, subset: donutSubsetEl.value }
            : {};
    }

    const summaryChecks = document.querySelectorAll(".style_summaryField");
    if(summaryChecks.length){
        const dipilih = Array.from(summaryChecks)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        saveSummaryFields_(layerName, dipilih);
        patch.summary_fields = dipilih;
    }

    const labelInputs = document.querySelectorAll(".style_fieldLabel");
    if(labelInputs.length){
        const labelMap = {};
        labelInputs.forEach(inp => {
            if(inp.value.trim()) labelMap[inp.dataset.key] = inp.value.trim();
        });
        saveFieldLabels_(layerName, labelMap);
        patch.field_labels = labelMap;
    }

    // simpan otomatis ke server (master_layer) -- update cache masterLayer
    // dulu (sinkron, jadi getter langsung baca nilai baru), POST-nya
    // jalan di belakang. Tombol "Migrasi Pengaturan Layer Lama" cuma
    // tinggal buat mindahin sisa setting lama dari localStorage.
    terapkanConfigKeMasterLayer_(layerName, patch);
    syncLayerConfigKeServer_(layerName, patch);

    applyLayerStyle(layerName);
    tutupStyleLayer();
}

// ===============================
// PANEL: Urutan Tampilan Layer (z-order, buat atur mana yang
// "menang" diklik/tampil kalau ada yang bertampalan)
// ===============================
function tutupAturUrutanLayer(){
    const panel = document.getElementById("zOrderPanel");
    if(panel) panel.remove();
}

function bukaAturUrutanLayer(){
    tutupAturUrutanLayer();

    // urutan disimpan dari index rendah (bawah) ke tinggi (atas).
    // Layer yang ada di masterLayer tapi belum pernah masuk daftar
    // urutan otomatis ditambahin di akhir (getZOrderIndex_ side-effect).
    masterLayer.forEach(item => getZOrderIndex_(item.layer));
    const order = getLayerZOrder_().filter(nama =>
        masterLayer.some(item => item.layer === nama)
    );

    const wrapper = document.createElement("div");
    wrapper.id = "zOrderPanel";
    wrapper.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:21000; background:#fff; border-radius:10px;
        box-shadow:0 4px 24px rgba(0,0,0,0.25);
        padding:16px 20px; width:360px; max-width:92vw; max-height:80vh;
        overflow-y:auto;
    `;

    const rows = order.slice().reverse().map((layerName, i) => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; border-bottom:1px solid #eee;">
            <span style="font-size:13px;">${i+1}. ${layerName}</span>
            <span>
                <button type="button" onclick="pindahUrutanLayer('${layerName}',1)" style="border:none;background:none;cursor:pointer;">▲</button>
                <button type="button" onclick="pindahUrutanLayer('${layerName}',-1)" style="border:none;background:none;cursor:pointer;">▼</button>
            </span>
        </div>
    `).join("");

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title">⚙ Urutan Tampilan Layer</div>
            <div class="popup-info">
                Layer paling atas di daftar ini = paling "menang" kalau
                diklik/tampil saat ada fitur yang bertampalan (dalam
                tier geometri yang sama: Titik selalu di atas Garis,
                Garis selalu di atas Poligon).
            </div>
            <br>
            ${rows || '<div class="popup-info">Belum ada layer.</div>'}
            <br>
            <button class="popup-button popup-button-secondary" onclick="tutupAturUrutanLayer()">✕ Tutup</button>
        </div>
    `;

    document.body.appendChild(wrapper);
}

function pindahUrutanLayer(layerName, arah){
    const order = getLayerZOrder_();
    const idx = order.indexOf(layerName);
    if(idx === -1) return;

    const target = idx + arah;
    if(target < 0 || target >= order.length) return;

    [order[idx], order[target]] = [order[target], order[idx]];
    saveLayerZOrder_(order);

    reapplyAllPanes_();
    bukaAturUrutanLayer(); // re-render panel biar urutan barunya kelihatan
}

function toggleLayer(layerName, visible){

    Object.keys(layerGroups).forEach(key=>{
        // key = "Dinas PU_Jalan Nasional"
        const namaLayer = key.split("_")[1];
        if(namaLayer !== layerName) return;
        if(visible){
            map.addLayer(layerGroups[key]);
        }else{
            map.removeLayer(layerGroups[key]);
        }
    });
}

function buildLayerTree(data){
    const tree = {};
    data.forEach(item=>{
        const kategori = item.kategori || "Tanpa Kategori";
        const tema = item.tema || "Tanpa Tema";
        const layer = item.layer || "Tanpa Layer";

        if(!tree[kategori]){
            tree[kategori] = {};
        }
        if(!tree[kategori][tema]){
            tree[kategori][tema] = {};
        }
        if(!tree[kategori][tema][layer]){
            tree[kategori][tema][layer] = [];
        }
        tree[kategori][tema][layer].push(item);
    });
    return tree;
}

// CATATAN: ada 3 fungsi bernama toggleLayer() di file ini (baris ~658
// & ~2802 duplikat/dead code lama, sudah dicatat di AI_CONTEXT §13
// buat dibersihin lain kali). Karena deklarasi function di JS saling
// nimpa, yang BENERAN kepake cuma definisi PALING BAWAH ini -- makanya
// fix visibilitas (shpVisibleLayers) ditaruh di sini, bukan di dua
// definisi lain di atas.
function toggleLayer(layerName, visible){
    Object.keys(layerGroups).forEach(key=>{
        if(!key.endsWith("_" + layerName)) return;
        if(visible){
            map.addLayer(layerGroups[key]);
        }else{
            map.removeLayer(layerGroups[key]);
        }
    });
    // shpVisibleLayers = layer SHP yang BENERAN kelihatan di peta
    // sekarang. Ini sengaja dipisah dari shpLoadedLayers (yang cuma
    // berarti "datanya sudah pernah di-fetch sesi ini", lihat
    // muatBulkLayer/makeVisible) -- soalnya sejak Dashboard Kabupaten
    // bisa full-load 1 layer cuma buat itung statistik tanpa
    // nampilinnya (makeVisible=false), "sudah di-load" dan "sedang
    // ditampilkan" itu dua hal yang beda dan checkbox tree HARUS
    // ngikutin yang kedua (lihat isChecked di buatTree()).
    if(visible){
        shpVisibleLayers.add(layerName);
    }else{
        shpVisibleLayers.delete(layerName);
    }
}

// ===============================
// TREE LENGKAP (data manual + SEMUA layer di master_layer)
// ===============================
// buildLayerTree(data) di atas cuma bikin node tree dari layer yang
// KEBETULAN punya fitur manual (Sheet2). Layer SHP yang belum
// pernah di-toggle ON (belum di-bulk-load) gak akan pernah punya
// fitur manual, jadi kalau cuma pakai buildLayerTree() dia gak akan
// pernah muncul di tree sama sekali. buildLayerTreeFull() nambahin
// node kosong untuk semua layer yang terdaftar di master_layer,
// supaya layer SHP tetap muncul (dengan badge jumlah dari
// shpFeatureCounts) walau isinya belum di-load ke peta.
function buildLayerTreeFull(manualData){
    const tree = buildLayerTree(manualData);

    masterLayer.forEach(item=>{
        const kategori = item.kategori || "Tanpa Kategori";
        const tema = item.tema || "Tanpa Tema";
        const layer = item.layer || "Tanpa Layer";

        if(!tree[kategori]) tree[kategori] = {};
        if(!tree[kategori][tema]) tree[kategori][tema] = {};
        if(!tree[kategori][tema][layer]) tree[kategori][tema][layer] = [];
    });

    return tree;
}

// ===============================
// PROGRESS BAR LOADING SHP (reusable, dipanggil dari sidebar Dashboard
// Kabupaten & bisa dipakai ulang di tempat lain yang manggil
// muatBulkLayer). 2 fase, JUJUR secara visual:
// - "fetch": request ke server lagi jalan. Backend GAS ngirim 1
//   respons JSON utuh (bukan bertahap/streaming), jadi kita GAK
//   TAU progress aslinya -- makanya animasinya "indeterminate"
//   (bar geser terus, gak diam di angka tertentu, kayak YouTube).
// - "draw": respons udah nyampe, sekarang gambar tiap fitur ke peta
//   per-batch kecil (lihat CHUNK_SIZE di muatBulkLayer). Di fase ini
//   progressnya REAL (angka pasti dari jumlah fitur beneran), bukan
//   animasi palsu.
// ===============================
function htmlProgressBar_(layerName){
    return `
        <div class="wgis-progress-wrap" id="progress_${layerName}">
            <div class="wgis-progress-label" id="progressLabel_${layerName}">
                ⏳ Menghubungi server...
            </div>
            <div class="wgis-progress-track is-indeterminate" id="progressTrack_${layerName}">
                <div class="wgis-progress-fill"></div>
            </div>
        </div>
    `;
}

function updateProgressBar_(layerName, phase, current, total){
    const label = document.getElementById("progressLabel_" + layerName);
    const track = document.getElementById("progressTrack_" + layerName);
    if(!label || !track) return;
    const fill = track.querySelector(".wgis-progress-fill");

    if(phase === "fetch"){
        label.textContent = "⏳ Menghubungi server...";
        track.classList.add("is-indeterminate");
        if(fill) fill.style.width = "";
    } else if(phase === "draw"){
        track.classList.remove("is-indeterminate");
        const pct = total ? Math.round((current / total) * 100) : 0;
        if(fill) fill.style.width = pct + "%";
        label.textContent = `${current} dari ${total} fitur dimuat...`;
    }
}

// ===============================
// TOGGLE LAYER DARI TREE (dengan lazy-load SHP)
// ===============================
// dipanggil dari checkbox di tree. Untuk layer manual, perilakunya
// sama seperti toggleLayer() biasa. Untuk layer SHP yang baru
// PERTAMA KALI di-ON-kan di sesi ini, data fiturnya di-fetch dulu
// (action=bulk) baru dirender -> ini bagian "lazy-load" nya.
async function handleLayerToggle(layerName, visible){

    const master = masterLayer.find(item => item.layer === layerName);
    const isShp = master && master.source_type === "shp" && master.sheet_name;

    if(isShp && visible && !shpLoadedLayers.has(layerName)){
        // wadah progress bar-nya nempel di baris layer ini sendiri di
        // tree (lihat buatTree(), div#treeProgress_<layer>). Dikosongin
        // lagi setelah selesai (baik sukses maupun gagal) biar gak
        // nyangkut nongol terus di tree.
        //
        // PENTING: .tree-body (wadah baris-baris layer) dipatok
        // max-height dalam pixel + overflow:hidden (lihat setCollapse()/
        // refreshTreeHeight()), dihitung dari scrollHeight PAS tree
        // dibuka/dirender -- BUKAN otomatis nyesuain kalau kontennya
        // berubah belakangan. Begitu progress bar disuntik ke sini,
        // tinggi baris ini nambah tapi max-height parent-nya masih
        // yang lama -> progress bar-nya KEPOTONG/ke-cut sama
        // overflow:hidden, kelihatannya kayak "gak nongol" padahal
        // sebenarnya cuma ketutup. Makanya WAJIB refreshTreeHeight()
        // manual di sini tiap kali ukuran baris ini berubah (nambah
        // ATAU balik ngosong).
        const progressContainer = document.getElementById("treeProgress_" + layerName);
        if(progressContainer){
            progressContainer.innerHTML = htmlProgressBar_(layerName);
            refreshTreeHeight();
        }
        try{
            await muatBulkLayer(master.sheet_name, layerName, master,
                (phase, current, total) => updateProgressBar_(layerName, phase, current, total));
        } finally {
            if(progressContainer){
                progressContainer.innerHTML = "";
                refreshTreeHeight();
            }
        }
    }

    toggleLayer(layerName, visible);
    renderLegendPanel();
}

// ===============================
// BULK LOAD DATA SHP (dipanggil sekali per layer per sesi)
// ===============================
// onProgress (opsional): callback(phase, current, total) -- phase
// "fetch" pas nunggu jaringan, "draw" pas gambar ke peta. Kalau gak
// dikasih (caller lama yang belum butuh progress bar), ya gak ada
// yang manggil, perilaku persis kayak sebelumnya.
//
// makeVisible (opsional, default true): registerLayer() di bawah ini
// SELALU bikin fitur baru langsung ke-render ke peta (efek samping dari
// `map.addLayer(layerGroups[key])` pas grupnya baru dibuat -- lihat
// registerLayer()), TERLEPAS dari status checkbox di tree. Ini benar
// buat caller yang memang lagi nyalain layer (checkbox toggle, search,
// import baru). TAPI Dashboard Kabupaten (refreshDashboardKabupaten())
// butuh full-load 1 layer cuma buat itung statistik -- BUKAN buat
// ditampilkan ke peta kalau checkbox-nya emang belum dicentang user.
// Makanya kalau makeVisible=false, begitu semua fitur selesai
// diregister (dan otomatis kepasang ke peta oleh registerLayer), kita
// langsung toggleLayer(layerName, false) buat nyembunyiin lagi --
// datanya TETAP ke-load & ke-cache (shpLoadedLayers, treeLayerObjects)
// buat perhitungan statistik, cuma visualnya yang disembunyikan sampai
// user beneran centang checkbox-nya sendiri.
//
// PENTING soal "website tetap operasional selama loading": fetch-nya
// sendiri dari dulu emang udah non-blocking (gak pernah nge-disable
// apapun di UI). Yang BARU di sini: loop gambar fitur ke peta (dulu
// 1 forEach synchronous yang nge-freeze render browser sesaat kalau
// fiturnya ratusan/berat) sekarang dipecah per-batch (CHUNK_SIZE)
// dengan jeda requestAnimationFrame di antaranya -- browser sempat
// "napas" (render ulang, respon klik) di antara tiap batch, sekalian
// itu momen counter progress "draw" ke-update di layar.
// Single-flight: kalau layer yang sama diminta lagi selagi masih loading
// (misal auto-aktif saat startup + Dashboard Kabupaten sama-sama minta
// layer Kemiskinan), pemanggil kedua cukup NUNGGU load yang sudah
// jalan -- gak fetch & gambar dobel. `bulkVisibleRequested` nyatat
// apakah ada pemanggil yang minta layernya TAMPIL; kalau ada, layer
// gak disembunyikan lagi walau pemanggil pertama makeVisible=false.
const bulkLoadInflight = {};
const bulkVisibleRequested = new Set();

function muatBulkLayer(sheetName, layerName, master, onProgress, makeVisible = true){
    if(makeVisible) bulkVisibleRequested.add(layerName);
    if(bulkLoadInflight[layerName]) return bulkLoadInflight[layerName];

    const p = muatBulkLayerInternal_(sheetName, layerName, master, onProgress, makeVisible)
        .finally(() => {
            delete bulkLoadInflight[layerName];
            bulkVisibleRequested.delete(layerName);
        });
    bulkLoadInflight[layerName] = p;
    return p;
}

async function muatBulkLayerInternal_(sheetName, layerName, master, onProgress, makeVisible = true){
    const CHUNK_SIZE = 25;

    if(onProgress) onProgress("fetch", 0, 0);

    let resp;
    try{
        const res = await fetchDenganRetry_(GAS_URL + "?action=bulk&sheet=" + encodeURIComponent(sheetName));
        resp = await res.json();
    }catch(err){
        console.error(err);
        alert("Gagal memuat data layer " + layerName + ": " + err.message);
        return;
    }

    if(resp.status !== "ok"){

        const sheetHilang = /tidak ditemukan/i.test(resp.message || "");

        if(sheetHilang){
            // sheet datanya udah beneran gak ada (kemungkinan dihapus
            // manual langsung dari Spreadsheet, bukan lewat aplikasi),
            // sementara row master_layer-nya masih nyangkut -> bersihin
            // sendiri biar layer ini gak nongol lagi di tree
            alert(
                `Sheet data untuk layer "${layerName}" sudah tidak ada di Spreadsheet ` +
                `(kemungkinan terhapus manual, bukan lewat aplikasi). ` +
                `Layer ini akan dibersihkan dari daftar.`
            );

            fetch(GAS_URL, {
                method: "POST",
                body: JSON.stringify({ action: "delete_layer", layer: layerName })
            }).catch(err => console.error("Gagal membersihkan master_layer:", err));

            const idx = masterLayer.findIndex(item => item.layer === layerName);
            if(idx !== -1) masterLayer.splice(idx, 1);

            shpFeatureCounts[layerName] = 0;
            shpLoadedLayers.delete(layerName);
            shpVisibleLayers.delete(layerName);

            window.layerTree = buildLayerTreeFull(lastData);
            renderLayerTree();
            initTreeCollapse();
            requestAnimationFrame(() => requestAnimationFrame(refreshTreeHeight));
        } else {
            alert("Gagal memuat data layer " + layerName + ": " + resp.message);
        }

        return;
    }

    const total = resp.data.length;
    if(onProgress) onProgress("draw", 0, total);

    let drawn = 0;
    for(let i = 0; i < resp.data.length; i += CHUNK_SIZE){
        const batch = resp.data.slice(i, i + CHUNK_SIZE);

        batch.forEach(d => {
            if(!d.geometry) return;

            const tier = geomTier_(d.geometry.type);
            const paneName = getPane_(tier, layerName);

            // pakai buatLayerDariGeometry_ biar otomatis support semua
            // tipe geometry (termasuk Multi*, yang dipecah jadi
            // beberapa bagian + digabung lewat featureGroup supaya
            // mode edit gak crash -- lihat catatan panjang di
            // definisi buatLayerDariGeometry_/buatGroupMultiGeometry_)
            const layer = buatLayerDariGeometry_(d.geometry, {
                pane: paneName,
                pointToLayer: (f, latlng) => L.marker(latlng, { pane: paneName })
            });
            if(!layer) return;

            layer.options.id = d.id;

            const dataFix = {
                id: d.id,
                layer: layerName,
                kategori: master ? master.kategori : "",
                tema: master ? master.tema : "",
                owner_opd: master ? master.owner_opd : "",
                sheet_name: sheetName,
                atribut: d
            };

            layer._data = dataFix;

            drawnItems.addLayer(layer);
            attachEditMenu(layer, dataFix);
            registerLayer(layer, dataFix);
        });

        drawn += batch.length;
        if(onProgress) onProgress("draw", drawn, total);

        // kasih browser kesempatan render ulang (update teks counter,
        // tetap responsif ke klik/scroll) sebelum lanjut batch berikutnya
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    shpLoadedLayers.add(layerName);
    shpFeatureCounts[layerName] = resp.data.length;
    perbaruiJumlahFiturTree_(layerName);

    applyLayerStyle(layerName);

    // lihat catatan makeVisible di atas fungsi ini -- registerLayer()
    // udah kadung nampilin semua fitur ke peta pas loop di atas, jadi
    // kalau caller-nya emang cuma butuh DATA-nya (bukan tampilan),
    // sembunyikan lagi di sini. toggleLayer() gak ngutak-atik
    // shpLoadedLayers/treeLayerObjects, jadi datanya tetap kepake buat
    // statistik walau gak kelihatan di peta.
    if(!makeVisible && !bulkVisibleRequested.has(layerName)){
        toggleLayer(layerName, false);
    }
}

// ===============================
// BASEMAP / PETA DASAR
// ===============================
// Semua basemap didefinisikan di SATU tempat (`basemapDefs`) supaya
// picker visual di sidebar kanan (renderBasemapPicker_) bisa dibangun
// otomatis dari sini -- nambah/ganti basemap cukup edit array ini,
// UI-nya ikut sendiri, gak perlu disentuh.
//
// `preview` = URL 1 tile statis di sekitar Labuan Bajo (z=10, x=852,
// y=536) yang dipakai jadi thumbnail kartu pilihan, biar user milih
// berdasarkan RUPA petanya, bukan cuma nebak dari nama teks.

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

// SATELIT ESRI
const esriSat = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri'
});

// TOPOGRAFI ESRI
const esriTopo = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles &copy; Esri'
});

// PETA POLOS (CartoDB Positron) -- latar terang low-contrast, enak buat
// layer choropleth/gradient biar warna datanya yang menonjol
const cartoLight = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors, &copy; CARTO'
});

const basemapDefs = [
  {
    id: "osm",
    nama: "OpenStreetMap",
    ket: "Jalan & tempat umum",
    layer: osm,
    preview: "https://a.tile.openstreetmap.org/10/852/536.png"
  },
  {
    id: "satelit",
    nama: "Satelit",
    ket: "Citra satelit Esri",
    layer: esriSat,
    preview: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/536/852"
  },
  {
    id: "topo",
    nama: "Topografi",
    ket: "Kontur & relief",
    layer: esriTopo,
    preview: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/10/536/852"
  },
  {
    id: "polos",
    nama: "Polos",
    ket: "Latar terang, fokus ke data",
    layer: cartoLight,
    preview: "https://a.basemaps.cartocdn.com/light_all/10/852/536.png"
  }
];

// Dipertahankan untuk kompatibilitas (dipakai waktu bikin objek
// L.control.layers di bawah).
const baseMaps = {};
basemapDefs.forEach(b => { baseMaps[b.nama] = b.layer; });

const BASEMAP_KEY = "wgis_basemap";
const BASEMAP_OPACITY_KEY = "wgis_basemap_opacity";

let basemapAktif = null;

function getBasemapOpacity_(){
    const v = parseInt(localStorage.getItem(BASEMAP_OPACITY_KEY), 10);
    return isNaN(v) ? 100 : Math.min(100, Math.max(10, v));
}

function setBasemapOpacity_(persen){
    persen = Math.min(100, Math.max(10, parseInt(persen, 10) || 100));
    localStorage.setItem(BASEMAP_OPACITY_KEY, persen);
    if(basemapAktif && basemapAktif.layer.setOpacity){
        basemapAktif.layer.setOpacity(persen / 100);
    }
    const lbl = document.getElementById("basemapOpacityVal");
    if(lbl) lbl.textContent = persen + "%";
}

// Ganti basemap aktif. Cuma SATU basemap yang nempel di peta dalam satu
// waktu (yang lama di-removeLayer), persis kayak radio button bawaan
// L.control.layers. Pilihan disimpan di localStorage biar kebawa lagi
// pas halaman di-reload (perilaku baru -- control bawaan Leaflet gak
// nyimpen apa-apa).
function pilihBasemap_(id){
    const def = basemapDefs.find(b => b.id === id) || basemapDefs[0];

    if(basemapAktif && basemapAktif.id === def.id){
        tandaiBasemapAktif_();
        return;
    }

    if(basemapAktif) map.removeLayer(basemapAktif.layer);

    def.layer.addTo(map);
    if(def.layer.setZIndex) def.layer.setZIndex(0);
    if(def.layer.setOpacity) def.layer.setOpacity(getBasemapOpacity_() / 100);

    basemapAktif = def;
    localStorage.setItem(BASEMAP_KEY, def.id);

    tandaiBasemapAktif_();
}

// Sinkronin highlight kartu di sidebar sama basemap yang lagi aktif.
// Dipanggil juga dari renderBasemapPicker_ (pas sidebar pertama kali
// dirender), makanya dibikin defensif terhadap DOM yang belum ada.
function tandaiBasemapAktif_(){
    document.querySelectorAll(".basemap-card").forEach(el => {
        el.classList.toggle("active", !!basemapAktif && el.dataset.basemap === basemapAktif.id);
    });
}

// Render kartu-kartu pilihan basemap ke dalam sidebar kanan.
function renderBasemapPicker_(){
    const grid = document.getElementById("basemapGrid");
    if(!grid) return;

    grid.innerHTML = basemapDefs.map(b => `
        <button type="button" class="basemap-card" data-basemap="${b.id}" title="${b.ket}">
            <span class="basemap-thumb" style="background-image:url('${b.preview}')">
                <span class="basemap-check">✓</span>
            </span>
            <span class="basemap-nama">${b.nama}</span>
        </button>
    `).join("");

    grid.querySelectorAll(".basemap-card").forEach(el => {
        el.addEventListener("click", () => pilihBasemap_(el.dataset.basemap));
    });

    const slider = document.getElementById("basemapOpacity");
    if(slider){
        slider.value = getBasemapOpacity_();
        const lbl = document.getElementById("basemapOpacityVal");
        if(lbl) lbl.textContent = getBasemapOpacity_() + "%";
        slider.addEventListener("input", () => setBasemapOpacity_(slider.value));
    }

    tandaiBasemapAktif_();
}

// Pasang basemap terakhir yang dipilih user (default OSM).
pilihBasemap_(localStorage.getItem(BASEMAP_KEY) || "osm");

//Skala Peta
L.control.scale().addTo(map);

//Kompas
new L.Control.Compass({ autoActive: true, showDigit: true }).addTo(map);

// Control layer bawaan Leaflet SENGAJA tidak lagi di-addTo(map):
// - pemilihan basemap sudah pindah ke panel kanan (#basemapGrid)
// - daftar overlay-nya duplikat persis sama Layer Tree di kiri
// Objeknya TETAP dibuat supaya registerLayer() yang manggil
// layerControl.addOverlay() tetap aman -- Leaflet `_update()` langsung
// return kalau control-nya belum punya container, jadi gak error.
// Kalau suatu saat mau balikin control bawaan, tinggal tambah
// `.addTo(map)` di baris ini.
const layerControl = L.control.layers(
    baseMaps,
    overlayMaps
);


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
    mode: null,
    layer: null,
    saved: false,
    drawing:false,
    canceling: false
};

// referensi tool digitasi (drawPoint/drawLine/drawPolygon)
// yang sedang aktif saat ini, dipakai untuk membatalkan
// atau menyelesaikan gambar lewat keyboard (Enter/Escape)
let activeDrawTool = null;

// posisi mouse terakhir selama proses digitasi, dipakai sebagai
// acuan posisi popup konfirmasi batal SEBELUM ada vertex/point
// sama sekali (saat itu belum ada layer untuk jadi acuan posisi)
let lastDrawMouseLatLng = null;

map.on("mousemove", function(e){
    if(createState.drawing){
        lastDrawMouseLatLng = e.latlng;
    }
});

// Catatan: shortcut Escape bawaan Leaflet.Draw (_cancelDrawing)
// dinonaktifkan langsung di deklarasi drawPoint/drawLine/drawPolygon
// di bagian bawah file, supaya Escape sepenuhnya dikendalikan lewat
// popup konfirmasi kita sendiri, bukan lewat trik intersep event.

map.on(L.Draw.Event.DRAWSTART, function(){

    createState.drawing = true;

});



map.on(L.Draw.Event.CREATED, function (e) {

    createState.mode = "create";
    createState.layer = e.layer;
    createState.saved = false;

const layer = createState.layer;
console.log("CREATED :", e.layerType);


  drawnItems.addLayer(layer);

  const form = `
    <div>
      <label>Nama Lokasi</label><br>
      <input class="popup-input" type="text" id="nama_lokasi">

      <label>Status</label><br>
       <input class="popup-input" type="text" id="status_lokasi">

      <label>Cari Layer</label><br>
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
      <input
      class="popup-input popup-readonly"
      id="tema_lokasi"
      readonly>

      <label>OPD</label><br>
      <input
      class="popup-input popup-readonly"
      id="owner_lokasi"
      readonly>

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
});
 

layer.on("popupclose", function () {

   if (
      !createState.saved &&
      !createState.canceling
   ) {
        drawnItems.removeLayer(layer);
    }

});

// PENTING: bindPopup() di atas cuma "mendaftarkan" konten popup,
// belum benar-benar membuka & merender-nya ke DOM. Popup baru
// benar-benar terbuka belakangan lewat konfirmasiCreateYa()
// (tombol "Ya, Lanjut Isi Data"). Makanya setup dropdown layer
// HARUS nunggu event "popupopen", bukan langsung setTimeout di sini
// -> kalau langsung setTimeout, elemen #layer_lokasi belum ada di
// DOM sama sekali saat itu, jadi listener input/focus-nya gak
// pernah ke-attach dan dropdown/suggestion gak pernah muncul.
layer.on("popupopen", function () {

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
search.addEventListener("blur", function(){
    setTimeout(function(){
        ddl.classList.remove("show");
    },150);
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

}); // end layer.on("popupopen", ...)


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
  hideEditHint();
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
    registerTree(dataBaru);
    layer.openPopup();

     createState.layer = null;
     createState.mode = null;

}, 600);
})
.catch(err => {
    hideEditHint();
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
                geometry:geom,
                sheet_name: layer._data ? layer._data.sheet_name : undefined
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

// ==========================
    // MASIH PROSES DIGITASI
    // BELUM MENJADI LAYER
    // ==========================

    if(
        createState.drawing &&
        !createState.layer
    ){

        // Di fase ini belum ada geometry sama sekali
        // (marker belum diklik / line-polygon belum punya
        // satu vertex pun). Tetap tampilkan popup konfirmasi
        // batal, hanya posisinya pakai lokasi mouse terakhir
        // karena belum ada layer untuk jadi acuan posisi.

        if(e.key === "Escape"){

            e.preventDefault();
            e.stopPropagation();

            bukaKonfirmasiBatalCreateAwal();

            return;

        }

        // Enter di sini hanya berlaku untuk line/polygon yang
        // masih dalam proses digitasi (belum diakhiri dobel klik).
        // _finishShape() akan menyelesaikan shape (memicu CREATED
        // secara sinkron) sama seperti dobel klik, lalu langsung
        // munculkan popup konfirmasi simpan tanpa perlu Enter kedua.

        if(e.key === "Enter"){

            e.preventDefault();
            e.stopPropagation();

            if(
                activeDrawTool &&
                typeof activeDrawTool._finishShape === "function"
            ){

                activeDrawTool._finishShape();

                if(createState.layer){
                    bukaKonfirmasiSimpanCreate();
                }

            }

            return;

        }

    }

    // ==========================
    // SUDAH ADA GEOMETRY
    // (EDIT EXISTING / CREATE BARU)
    // ==========================

    if(
        createState.mode === "create" ||
        editState.mode === "edit" ||
        editState.mode === "create"
    ){

        if(e.key === "Enter"){

            e.preventDefault();

            if(
                createState.mode === "create" ||
                editState.mode === "create"
            ){

                bukaKonfirmasiSimpanCreate();

            }else{

                bukaKonfirmasiSimpan();
            }
        }


        if(e.key === "Escape"){

            e.preventDefault();

            if(
                createState.mode === "create" ||
                editState.mode === "create"
            ){

                bukaKonfirmasiBatalCreate();

            }else{

                bukaKonfirmasiBatal();
            }
        }
        return;

    }

    
}, false);

// ===============================
// LOAD DATA AWAL
// ===============================

function clearRenderedData(){

    drawnItems.clearLayers();
 
    Object.values(layerGroups).forEach(group=>{
        group.clearLayers();
    });
    Object.keys(treeLayerObjects).forEach(key=>{
        delete treeLayerObjects[key];
    });
    Object.keys(treeLayers).forEach(key=>{
        delete treeLayers[key];
    });
 window.layerTree = {};
}

function clearMapLayer(){

    drawnItems.clearLayers();
    Object.values(layerGroups).forEach(group=>{
        group.clearLayers();
    });
}

function renderLayerData(data){

    data.forEach(d => {

        if (!d.geometry) return;

        let layer = null;
        const type = d.geometry.type;
        const coords = d.geometry.coordinates;
        const paneName = getPane_(geomTier_(type), d.layer);

        if (type === "Point") {

            const [lon, lat] = coords;
            layer = L.marker([lat, lon], { pane: paneName });
        }

        else if (type === "LineString") {
            const latlngs = coords.map(([lon,lat]) => [lat,lon]);
            layer = L.polyline(latlngs, { pane: paneName });
        }
        else if (type === "Polygon") {

            const latlngs = coords.map(ring =>
                ring.map(([lon,lat]) => [lat,lon])
            );
            layer = L.polygon(latlngs, { pane: paneName });
        }
        if (!layer) return;

        layer.options.id = d.id;

        const dataFix = {
            id:d.id,
            nama:d.nama,
            status:d.status,
            kategori:d.kategori,
            tema:d.tema,
            layer:d.layer,
            owner_opd:d.owner_opd
        };

        layer._data = dataFix;

        drawnItems.addLayer(layer);

        attachEditMenu(layer,dataFix);
        registerLayer(layer,dataFix);
        registerTree(dataFix);

    });

    // terapkan style tersimpan (kalau ada) per layer unik yang baru
    // dirender di atas
    new Set(data.map(d => d.layer)).forEach(layerName => applyLayerStyle(layerName));

}

async function loadDataAwal() {

try{
        const res = await fetch(GAS_URL);
 
        if(!res.ok){
            throw new Error("HTTP " + res.status);
        }
        const resp = await res.json();
        const data = resp.data;
        lastData = structuredClone(data);

        clearRenderedData();
        window.layerTree = buildLayerTreeFull(data);
        renderLayerTree();
        initTreeCollapse();
        requestAnimationFrame(()=>{
            requestAnimationFrame(()=>{
                refreshTreeHeight();
                setTimeout(()=>{
                    document
                        .getElementById("layerTree")
                        .classList.add("tree-ready");
                },200);
            });
        });
        renderLayerData(data);
        setTimeout(refreshTreeHeight,300);
    }
    catch(err){
        console.error(err);
        alert("Gagal memuat data.");
    }
}

async function refreshLayerData(){

    const res = await fetchDenganRetry_(GAS_URL);
    if(!res.ok){
        throw new Error("HTTP " + res.status);
    }

    const resp = await res.json();
    const newData = resp.data;

    if(JSON.stringify(newData) === JSON.stringify(lastData)){
        console.log("Tidak ada perubahan");
        return;
    }

    console.log("Ada perubahan data");

    lastData = structuredClone(newData);

    // clearRenderedData() di bawah ini bersih-bersih SEMUA layer di
    // peta (termasuk layer SHP yang udah di-bulk-load). Simpan dulu
    // nama layer SHP mana aja yang lagi BENERAN KELIHATAN (shpVisibleLayers,
    // BUKAN shpLoadedLayers -- kalau pakai shpLoadedLayers, layer yang
    // cuma di-load diam-diam sama Dashboard Kabupaten, makeVisible=false,
    // ikut ke-restore jadi kelihatan di sini, padahal harusnya tetap
    // tersembunyi), supaya abis refresh data manual ini, layer SHP yang
    // tadinya udah di-ON gak mendadak hilang dari peta / harus di-toggle
    // manual lagi.
    const previouslyLoadedShp = Array.from(shpVisibleLayers);
    shpLoadedLayers.clear();
    shpVisibleLayers.clear();

    clearRenderedData();
    renderLayerData(newData);
    window.layerTree = buildLayerTreeFull(newData);
    renderLayerTree();

    for(const layerName of previouslyLoadedShp){
        const master = masterLayer.find(item => item.layer === layerName);
        if(master){
            await muatBulkLayer(master.sheet_name, layerName, master);
            // makeVisible default true di atas -> registerLayer() beneran
            // nampilin ulang fiturnya ke peta. Tandai di shpVisibleLayers
            // juga (baru aja di-clear() di atas) biar checkbox tree tetap
            // kecentang setelah refresh data manual ini.
            shpVisibleLayers.add(layerName);
        }
    }
    renderLayerTree();

    requestAnimationFrame(() => {
    
    requestAnimationFrame(()=>{
        initTreeCollapse();
        refreshTreeHeight();
     document
            .getElementById("layerTree")
            .classList.add("tree-ready");
    });
    });
}

// ===============================
// IMPORT SHP / GEOJSON
// ===============================

// shpjs cuma dipakai buat ZIP shapefile, jadi di-load on-demand
// (bukan lewat <script> di HTML) supaya gak nambah beban awal buat
// yang gak pernah pakai fitur import
const SHPJS_CDN = "https://unpkg.com/shpjs@latest/dist/shp.js";

// turf.js cuma dipakai buat SIMPLIFIKASI POLYGON (opsional, lihat
// checkbox "Sederhanakan bentuk" di form import) -- juga on-demand,
// karena kebanyakan import gak butuh ini.
const TURF_CDN = "https://unpkg.com/@turf/turf@6/turf.min.js";

function loadScriptSekali_(src){
    return new Promise((resolve, reject) => {
        if(document.querySelector(`script[src="${src}"]`)){
            resolve();
            return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Gagal memuat " + src));
        document.head.appendChild(s);
    });
}

// ===============================
// DASHBOARD ADAPTIF (per-fitur SHP)
// ===============================
// Dibuka dari tombol "📊 Lihat Dashboard" di Popup Summary
// (attachEditMenu). Cuma BACA data yang sudah tersimpan (d.atribut) --
// gak ada input/edit di sini sama sekali, dan gak ada perubahan ke
// form Create/Edit SHP yang sudah ada. Dashboard dibuat generik:
// TIDAK ada logic khusus per nama layer (Desa/Kecamatan/Jalan/dst),
// murni baca pola nama kolom & tipe datanya.
const CHARTJS_CDN = "https://unpkg.com/chart.js@4/dist/chart.umd.min.js";
let dashboardChartInstances = [];

// Deteksi pola dari 1 objek atribut fitur:
// - temporal: kolom yang namanya berakhiran <prefix>_<tahun 4 digit>,
//   dikelompokkan per prefix, DIANGGAP seri temporal kalau grupnya
//   punya >= 2 titik data (1 titik doang bukan tren)
// - numerikLain: kolom angka yang bukan bagian dari seri temporal
// - lainnya: sisanya (teks/kode wilayah/dll)
// Sengaja TIDAK mencoba menebak pasangan "perbandingan" numerik secara
// generik (misal jumlah_penduduk vs jumlah_miskin) -- itu terlalu
// beresiko salah tebak kalau pola nama kolom SHP-nya nggak konsisten.
// Untuk V1: temporal -> line chart, numerik lain -> stat card.
function deteksiPolaAtribut_(atribut){
    const skip = new Set(["id","geometry","created_at","updated_at"]);
    const keys = Object.keys(atribut).filter(k => !skip.has(k));

    const reTemporal = /^(.*?)_?(\d{4})$/;
    const temporalGroups = {};
    const numerikLain = [];
    const lainnya = [];

    keys.forEach(k => {
        const val = atribut[k];
        const num = parseFloat(val);
        const isNumeric =
            val !== "" && val !== null && val !== undefined &&
            !isNaN(num) && String(val).trim() === String(num);

        const m = k.match(reTemporal);

        if(m && isNumeric){
            const prefix = m[1].replace(/_$/, "") || "nilai";
            const year = parseInt(m[2], 10);
            if(!temporalGroups[prefix]) temporalGroups[prefix] = [];
            temporalGroups[prefix].push({ year, value: num, key: k });
        } else if(isNumeric){
            numerikLain.push({ key: k, value: num });
        } else {
            lainnya.push({ key: k, value: val });
        }
    });

    const temporal = [];
    Object.keys(temporalGroups).forEach(prefix => {
        const series = temporalGroups[prefix].sort((a,b) => a.year - b.year);
        if(series.length >= 2){
            temporal.push({ prefix, series });
        } else {
            // grup cuma 1 titik -> bukan tren, perlakukan sebagai angka biasa
            numerikLain.push({ key: series[0].key, value: series[0].value });
        }
    });

    return { temporal, numerikLain, lainnya };
}

async function bukaDashboardShp(layer){
    const d = layer._data;
    if(!d || !d.atribut) return;

    tutupDashboardShp();

    try{
        await loadScriptSekali_(CHARTJS_CDN);
    }catch(err){
        alert("Gagal memuat library chart: " + err.message);
        return;
    }

    const pola = deteksiPolaAtribut_(d.atribut);
    const judul = judulFiturShp_(d);

    // stat card: semua numerik non-temporal + nilai TAHUN TERBARU dari
    // tiap seri temporal (biar tetap ada angka headline walau grafiknya
    // panjang)
    const statCards = pola.numerikLain.map(n => ({ label: n.key, value: n.value }));
    pola.temporal.forEach(t => {
        const terakhir = t.series[t.series.length - 1];
        statCards.push({ label: `${t.prefix} (${terakhir.year})`, value: terakhir.value });
    });

    const statHtml = statCards.length ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin:14px 0;">
            ${statCards.map(s => `
                <div style="background:#f5f7fa; border-radius:8px; padding:10px 8px; text-align:center;">
                    <div style="font-size:19px; font-weight:700; color:#1976d2;">${s.value.toLocaleString('id-ID')}</div>
                    <div style="font-size:11px; color:#666; margin-top:3px; word-break:break-word;">${s.label}</div>
                </div>
            `).join("")}
        </div>
    ` : "";

    const chartBlocksHtml = pola.temporal.map((t, i) => `
        <div style="margin-top:18px;">
            <div style="font-weight:600; font-size:13px; margin-bottom:8px;">📈 Tren ${t.prefix}</div>
            <canvas id="dashChart_${i}" height="150"></canvas>
        </div>
    `).join("");

    const lainnyaHtml = pola.lainnya.length ? `
        <div style="margin-top:18px; border-top:1px solid #eee; padding-top:10px;">
            <div style="font-weight:600; font-size:13px; margin-bottom:6px;">Info Lainnya</div>
            ${pola.lainnya.map(l => `
                <div style="font-size:13px; margin-bottom:4px;"><b>${l.key}:</b> ${l.value ?? ""}</div>
            `).join("")}
        </div>
    ` : "";

    const kosongHtml = (!statCards.length && !pola.temporal.length) ? `
        <div class="popup-info">Tidak ada data numerik yang bisa divisualisasikan untuk fitur ini.</div>
    ` : "";

    const wrapper = document.createElement("div");
    wrapper.id = "dashboardPanel";
    wrapper.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:21000; background:#fff; border-radius:12px;
        box-shadow:0 4px 28px rgba(0,0,0,0.3);
        padding:20px 22px; width:520px; max-width:94vw; max-height:88vh;
        overflow-y:auto;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title">📊 Dashboard: ${judul}</div>
            ${statHtml}
            ${chartBlocksHtml}
            ${kosongHtml}
            ${lainnyaHtml}
            <div class="popup-actions">
                <button class="popup-button popup-button-secondary" onclick="tutupDashboardShp()">✕ Tutup</button>
            </div>
        </div>
    `;

    document.body.appendChild(wrapper);

    pola.temporal.forEach((t, i) => {
        const ctx = document.getElementById(`dashChart_${i}`);
        if(!ctx) return;
        const chart = new Chart(ctx, {
            type: "line",
            data: {
                labels: t.series.map(s => s.year),
                datasets: [{
                    label: t.prefix,
                    data: t.series.map(s => s.value),
                    borderColor: "#1976d2",
                    backgroundColor: "rgba(25,118,210,0.12)",
                    tension: 0.25,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
        dashboardChartInstances.push(chart);
    });
}

function tutupDashboardShp(){
    dashboardChartInstances.forEach(c => c.destroy());
    dashboardChartInstances = [];
    const panel = document.getElementById("dashboardPanel");
    if(panel) panel.remove();
}

// ===============================
// GRAFIK DI POPUP RINGKASAN (donut komposisi + bar bantuan per OPD)
// ===============================
// Dipanggil tiap popup dibuka (lewat event popupopen.ringkasanChart di
// attachEditMenu). Canvas donut cuma ada di DOM kalau donutValid=true
// (dicek di attachEditMenu), jadi function ini aman dipanggil selalu --
// tinggal cek elemennya ada apa nggak.
async function renderRingkasanCharts_(d){

    const donutCanvas = document.getElementById("ringkasanDonut");
    const bantuanBox = document.getElementById("ringkasanBantuanBox");
    if(!donutCanvas && !bantuanBox) return;

    try{
        await loadScriptSekali_(CHARTJS_CDN);
    }catch(err){
        console.error("Gagal memuat library chart:", err);
        return;
    }

    if(donutCanvas){
        const donutCfg = getDonutConfig_(d.layer);
        if(donutCfg){
            const total = parseFloat(d.atribut[donutCfg.total]);
            const subset = parseFloat(d.atribut[donutCfg.subset]);
            if(!isNaN(total) && !isNaN(subset) && total > 0 && subset >= 0 && subset <= total){
                new Chart(donutCanvas, {
                    type: "doughnut",
                    data: {
                        labels: [labelKolom_(d.layer, donutCfg.subset), "Lainnya"],
                        datasets: [{
                            data: [subset, total - subset],
                            backgroundColor: ["#d32f2f", "#e0e0e0"]
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { position: "bottom", labels: { font: { size: 10 } } }
                        }
                    }
                });
            }
        }
    }

    if(bantuanBox){
        // cocokin data_bantuan pakai nama desa (judul popup, tanpa
        // emoji) + kecamatan (subjudul) kalau ada, biar gak ketuker
        // desa dengan nama sama di kecamatan lain
        const namaDesa = judulFiturShp_(d).replace(/^📦\s*/, "");
        const subtitleField = getLayerSubtitleField_(d.layer);
        const kecamatan = subtitleField ? d.atribut[subtitleField] : null;

        await muatDataBantuan();
        const records = ambilBantuanUntukDesa_(namaDesa, kecamatan);

        // sengaja TIDAK render apa-apa kalau kosong -- jangan
        // paksakan grafik kosong (requirement eksplisit)
        if(!records.length) return;

        const perOpd = {};
        records.forEach(r => {
            const opd = r.opd || "Lainnya";
            const jml = parseFloat(r.jumlah_penerima) || 0;
            perOpd[opd] = (perOpd[opd] || 0) + jml;
        });

        const labels = Object.keys(perOpd);
        const values = labels.map(l => perOpd[l]);

        bantuanBox.innerHTML = `
            <div style="font-weight:600; font-size:12px; margin:12px 0 6px;">Bantuan Diterima per OPD</div>
            <canvas id="ringkasanBantuanChart" height="140"></canvas>
        `;

        new Chart(document.getElementById("ringkasanBantuanChart"), {
            type: "bar",
            data: {
                labels,
                datasets: [{ data: values, backgroundColor: "#1976d2", borderRadius: 4 }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            }
        });
    }
}

// ===============================
// PANEL: Detail Intervensi Bantuan (per OPD -> program -> tahun)
// ===============================
// Baca dari sheet "data_bantuan" (lazy-load sekali per sesi, lihat
// muatDataBantuan()). Kalau sheet-nya belum ada/masih kosong (data
// belum diolah user), tampil pesan kosong yang jelas -- bukan error,
// bukan tabel/grafik kosong.
async function bukaDetailIntervensi(layer){
    const d = layer._data;
    if(!d || !d.atribut) return;

    tutupDetailIntervensi();

    const namaDesa = judulFiturShp_(d).replace(/^📦\s*/, "");
    const subtitleField = getLayerSubtitleField_(d.layer);
    const kecamatan = subtitleField ? d.atribut[subtitleField] : null;

    const overlay = document.createElement("div");
    overlay.id = "detailIntervensiOverlay";
    overlay.style.cssText = `position:fixed; inset:0; background:rgba(15,15,35,0.35); z-index:20999;`;
    overlay.onclick = tutupDetailIntervensi;
    document.body.appendChild(overlay);

    const wrapper = document.createElement("div");
    wrapper.id = "detailIntervensiPanel";
    wrapper.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:21000; background:#fff; border-radius:14px;
        box-shadow:0 12px 40px rgba(0,0,0,0.22);
        padding:20px 22px; width:480px; max-width:94vw; max-height:88vh;
        overflow-y:auto;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="intervensi-header">
                <div class="intervensi-header-icon">🧾</div>
                <div class="intervensi-header-text">
                    <div class="intervensi-title">Detail Intervensi Bantuan</div>
                    <div class="ringkasan-subtitle">${namaDesa}${kecamatan ? " • " + kecamatan : ""}</div>
                </div>
            </div>
            <div id="detailIntervensiBody" style="margin-top:6px;">
                <div class="popup-info">Memuat data...</div>
            </div>
            <div class="popup-actions">
                <button class="popup-button" onclick="bukaFormBantuan('create')">➕ Tambah Bantuan</button>
                <button class="popup-button popup-button-secondary" onclick="tutupDetailIntervensi()">✕ Tutup</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    // konteks desa yang lagi dibuka disimpan di module-level supaya
    // render ulang (setelah tambah/edit/hapus) gak perlu bawa-bawa
    // parameter ke mana-mana
    intervensiKonteks_ = { namaDesa, kecamatan, layer };

    await muatDataBantuan();
    renderDetailIntervensiBody_();
}

// konteks desa aktif di panel Detail Intervensi
let intervensiKonteks_ = null;

function escHtml_(v){
    return String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Render isi panel Detail Intervensi dari cache `bantuanData`.
// Dipisah dari bukaDetailIntervensi() supaya bisa dipanggil ULANG
// setiap kali user tambah/edit/hapus record -- tanpa fetch ulang ke
// server (cache-nya di-update lokal, lihat terapkanPerubahanBantuan_).
//
// PERUBAHAN PENTING dari versi sebelumnya: baris program TIDAK lagi
// digabung lintas tahun. Dulu record dengan opd+program sama tapi tahun
// beda dilebur jadi 1 baris ("Tahun 2023, 2024") -- tampilannya ringkas,
// tapi jadi TIDAK bisa diedit karena 1 baris di layar gak lagi mewakili
// 1 baris di spreadsheet. Sekarang 1 baris = 1 record = 1 row sheet,
// jadi tombol ✏/🗑-nya punya sasaran yang jelas.
function renderDetailIntervensiBody_(){
    const body = document.getElementById("detailIntervensiBody");
    if(!body || !intervensiKonteks_) return; // panel sudah keburu ditutup

    const { namaDesa, kecamatan } = intervensiKonteks_;
    const records = ambilBantuanUntukDesa_(namaDesa, kecamatan);

    if(!records.length){
        body.innerHTML = `
            <div class="intervensi-empty">
                <div class="intervensi-empty-icon">📭</div>
                Belum ada data bantuan tercatat untuk desa ini.
                <div style="margin-top:6px; font-size:12px;">
                    Klik "➕ Tambah Bantuan" di bawah untuk mencatat yang pertama.
                </div>
            </div>
        `;
        return;
    }

    // kelompokkan per OPD, tapi isinya tetap record utuh (bukan agregat)
    const perOpd = {};
    records.forEach(r => {
        const opd = r.opd || "Lainnya";
        if(!perOpd[opd]) perOpd[opd] = [];
        perOpd[opd].push(r);
    });

    body.innerHTML = `<div class="intervensi-list">` + Object.keys(perOpd).map(opd => {
        const rows = perOpd[opd];
        const totalOpd = rows.reduce((sum, r) => sum + (parseFloat(r.jumlah_penerima) || 0), 0);

        return `
        <div class="intervensi-opd-card">
            <div class="intervensi-opd-title">
                <span>🏛 ${escHtml_(opd)}</span>
                <span class="intervensi-opd-badge">${totalOpd.toLocaleString('id-ID')} penerima</span>
            </div>
            ${rows.map(r => {
                const program = r.program || "(tanpa nama program)";
                const isEmpty = !r.program;
                const jml = parseFloat(r.jumlah_penerima) || 0;

                // record tanpa id gak bisa diedit/dihapus dengan aman --
                // backend butuh id buat nemuin barisnya. Ini kejadian
                // kalau sheet data_bantuan masih versi lama (belum punya
                // kolom id). Tombolnya di-disable + dikasih alasan,
                // BUKAN dihilangkan diam-diam.
                const bisaEdit = !!r.id;
                const alasan = bisaEdit ? "" : "Baris ini belum punya kolom id di sheet — reload halaman agar backend mengisinya otomatis.";

                return `
                    <div class="intervensi-program-row">
                        <div class="intervensi-program-info">
                            <div class="intervensi-program-name${isEmpty ? " is-empty" : ""}">${escHtml_(program)}</div>
                            ${r.tahun ? `<div class="intervensi-program-tahun">Tahun ${escHtml_(r.tahun)}</div>` : ""}
                        </div>
                        <div class="intervensi-program-count">
                            <div class="intervensi-count-number">${jml.toLocaleString('id-ID')}</div>
                            <div class="intervensi-count-label">penerima</div>
                        </div>
                        <div class="intervensi-row-actions">
                            <button class="intervensi-icon-btn" title="${bisaEdit ? "Edit data bantuan ini" : alasan}"
                                ${bisaEdit ? `onclick="bukaFormBantuan('edit','${escHtml_(r.id)}')"` : "disabled"}>✏</button>
                            <button class="intervensi-icon-btn danger" title="${bisaEdit ? "Hapus data bantuan ini" : alasan}"
                                ${bisaEdit ? `onclick="hapusDataBantuan('${escHtml_(r.id)}')"` : "disabled"}>🗑</button>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
        `;
    }).join("") + `</div>`;
}

// ===============================
// FORM TAMBAH / EDIT DATA BANTUAN
// ===============================
// Nulis langsung ke sheet "data_bantuan" lewat endpoint bantuan_create /
// bantuan_update (lihat appscript_bantuan_crud.js). Desa & kecamatan
// SENGAJA dikunci (readonly) ngikut fitur yang lagi dibuka -- kalau dua
// kolom ini bisa diketik bebas, gampang typo dan record-nya jadi
// "hilang" (gak ke-join lagi ke polygon manapun). Mau pindah desa?
// hapus lalu buat lagi dari popup desa yang benar.
function bukaFormBantuan(mode, recordId){
    if(!intervensiKonteks_) return;

    const { namaDesa, kecamatan } = intervensiKonteks_;
    const rec = mode === "edit"
        ? (bantuanData || []).find(b => String(b.id) === String(recordId))
        : null;

    if(mode === "edit" && !rec){
        alert("Data bantuan tidak ditemukan (mungkin sudah dihapus). Coba tutup dan buka lagi panelnya.");
        return;
    }

    // saran isian dari nilai yang SUDAH pernah dipakai di sheet, biar
    // penulisan nama OPD/program konsisten (datalist = tetap boleh
    // ketik bebas, cuma dibantu, bukan dibatasi)
    const opdUnik = Array.from(new Set((bantuanData || []).map(b => b.opd).filter(Boolean))).sort();
    const programUnik = Array.from(new Set((bantuanData || []).map(b => b.program).filter(Boolean))).sort();

    tutupFormBantuan();

    const overlay = document.createElement("div");
    overlay.id = "formBantuanOverlay";
    overlay.style.cssText = `position:fixed; inset:0; background:rgba(15,15,35,0.35); z-index:21001;`;
    overlay.onclick = tutupFormBantuan;
    document.body.appendChild(overlay);

    const wrapper = document.createElement("div");
    wrapper.id = "formBantuanPanel";
    wrapper.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:21002; background:#fff; border-radius:14px;
        box-shadow:0 12px 40px rgba(0,0,0,0.25);
        padding:20px 22px; width:420px; max-width:94vw; max-height:88vh;
        overflow-y:auto;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title">${mode === "edit" ? "✏ Edit Data Bantuan" : "➕ Tambah Data Bantuan"}</div>

            <label class="popup-label">Desa</label>
            <input class="popup-input popup-readonly" value="${escHtml_(namaDesa)}" readonly>

            <label class="popup-label">Kecamatan</label>
            <input class="popup-input popup-readonly" value="${escHtml_(kecamatan || "-")}" readonly>

            <label class="popup-label">OPD / Dinas *</label>
            <input class="popup-input" id="fbOpd" list="fbOpdList"
                   value="${escHtml_(rec ? rec.opd : "")}" placeholder="Contoh: Dinas Sosial">
            <datalist id="fbOpdList">
                ${opdUnik.map(o => `<option value="${escHtml_(o)}"></option>`).join("")}
            </datalist>

            <label class="popup-label">Program</label>
            <input class="popup-input" id="fbProgram" list="fbProgramList"
                   value="${escHtml_(rec ? rec.program : "")}" placeholder="Contoh: PKH">
            <datalist id="fbProgramList">
                ${programUnik.map(p => `<option value="${escHtml_(p)}"></option>`).join("")}
            </datalist>

            <label class="popup-label">Tahun</label>
            <input class="popup-input" id="fbTahun" type="number" min="1900" max="2999" step="1"
                   value="${escHtml_(rec ? rec.tahun : new Date().getFullYear())}">

            <label class="popup-label">Jumlah Penerima *</label>
            <input class="popup-input" id="fbJumlah" type="number" min="0" step="1"
                   value="${escHtml_(rec ? rec.jumlah_penerima : "")}" placeholder="0">

            <div id="fbError" style="display:none; color:#d32f2f; font-size:12px; margin-bottom:8px;"></div>

            <div class="popup-actions">
                <button class="popup-button" id="fbSimpan"
                        onclick="simpanDataBantuan('${mode}', '${escHtml_(recordId || "")}')">💾 Simpan</button>
                <button class="popup-button popup-button-secondary" onclick="tutupFormBantuan()">✕ Batal</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    const fokus = document.getElementById("fbOpd");
    if(fokus) fokus.focus();
}

function tutupFormBantuan(){
    const p = document.getElementById("formBantuanPanel");
    if(p) p.remove();
    const o = document.getElementById("formBantuanOverlay");
    if(o) o.remove();
}

function simpanDataBantuan(mode, recordId){
    const errBox = document.getElementById("fbError");
    const tampilError = msg => {
        if(!errBox) return alert(msg);
        errBox.textContent = msg;
        errBox.style.display = "block";
    };

    const opd = document.getElementById("fbOpd").value.trim();
    const program = document.getElementById("fbProgram").value.trim();
    const tahun = document.getElementById("fbTahun").value.trim();
    const jumlahRaw = document.getElementById("fbJumlah").value.trim();

    // validasi di depan dulu -- lebih cepat & jelas daripada nunggu
    // ditolak server, dan mencegah baris sampah masuk sheet
    if(!opd) return tampilError("Nama OPD/Dinas wajib diisi.");
    if(jumlahRaw === "" || isNaN(parseFloat(jumlahRaw)) || parseFloat(jumlahRaw) < 0){
        return tampilError("Jumlah penerima harus berupa angka (minimal 0).");
    }
    if(tahun && (isNaN(parseInt(tahun, 10)) || parseInt(tahun, 10) < 1900)){
        return tampilError("Tahun tidak valid.");
    }

    const { namaDesa, kecamatan } = intervensiKonteks_;

    const payload = {
        action: mode === "edit" ? "bantuan_update" : "bantuan_create",
        id: recordId || undefined,
        desa: namaDesa,
        kecamatan: kecamatan || "",
        opd,
        program,
        tahun,
        jumlah_penerima: parseFloat(jumlahRaw)
    };

    const btn = document.getElementById("fbSimpan");
    btn.disabled = true;
    btn.innerHTML = "⏳ Menyimpan...";

    fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(resp => {
            if(resp.status !== "ok"){
                throw new Error(resp.message || "Server menolak permintaan.");
            }

            // cache di-update LOKAL (bukan fetch ulang seluruh sheet) --
            // sama filosofi sama muatDataBantuan yang cuma sekali per sesi
            terapkanPerubahanBantuan_(mode, resp.data, recordId);

            btn.innerHTML = "✓ Tersimpan";
            setTimeout(() => {
                tutupFormBantuan();
                renderDetailIntervensiBody_();
                if(typeof refreshDashboardKabupaten === "function") refreshDashboardKabupaten();
            }, 400);
        })
        .catch(err => {
            btn.disabled = false;
            btn.innerHTML = "💾 Simpan";
            tampilError("Gagal menyimpan: " + err.message);
        });
}

function hapusDataBantuan(recordId){
    const rec = (bantuanData || []).find(b => String(b.id) === String(recordId));
    if(!rec) return;

    const label = `${rec.opd || "-"}${rec.program ? " – " + rec.program : ""}${rec.tahun ? " (" + rec.tahun + ")" : ""}`;
    if(!confirm(`Hapus data bantuan ini?\n\n${label}\n${(parseFloat(rec.jumlah_penerima) || 0).toLocaleString('id-ID')} penerima\n\nBaris akan dihapus permanen dari sheet data_bantuan.`)) return;

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ action: "bantuan_delete", id: recordId })
    })
        .then(res => res.json())
        .then(resp => {
            if(resp.status !== "ok") throw new Error(resp.message || "Server menolak permintaan.");
            terapkanPerubahanBantuan_("delete", null, recordId);
            renderDetailIntervensiBody_();
            if(typeof refreshDashboardKabupaten === "function") refreshDashboardKabupaten();
        })
        .catch(err => alert("Gagal menghapus: " + err.message));
}

// Sinkronisasi cache `bantuanData` setelah operasi tulis berhasil.
// Dipisah biar satu-satunya tempat yang "tahu" cara cache ini dimutasi.
function terapkanPerubahanBantuan_(mode, dataBaru, recordId){
    if(!Array.isArray(bantuanData)) bantuanData = [];

    if(mode === "create" && dataBaru){
        bantuanData.push(dataBaru);
        return;
    }

    const idx = bantuanData.findIndex(b => String(b.id) === String(recordId));
    if(idx === -1) return;

    if(mode === "delete") bantuanData.splice(idx, 1);
    else if(dataBaru) Object.assign(bantuanData[idx], dataBaru);
}

function tutupDetailIntervensi(){
    tutupFormBantuan();          // form anak ikut ditutup biar gak jadi yatim
    intervensiKonteks_ = null;
    const panel = document.getElementById("detailIntervensiPanel");
    if(panel) panel.remove();
    const overlay = document.getElementById("detailIntervensiOverlay");
    if(overlay) overlay.remove();
}

// ===============================
// SEARCH FITUR DI DALAM 1 LAYER (misal cari nama desa)
// ===============================
// Baca dari fitur yang SUDAH/akan di-load (lazy, reuse
// handleLayerToggle -- sama persis kayak nyalain checkbox-nya di
// tree, cuma dipicu dari tombol 🔍 duluan). Klik hasil pencarian
// berperilaku identik kayak klik polygon-nya langsung di peta: peta
// zoom ke situ, lalu popup Ringkasan-nya kebuka otomatis.
async function bukaSearchLayer(layerName){
    tutupSearchLayer();

    const wrapper = document.createElement("div");
    wrapper.id = "searchLayerPanel";
    wrapper.style.cssText = `
        position:fixed; top:70px; left:50%; transform:translateX(-50%);
        z-index:21000; background:#fff; border-radius:10px;
        box-shadow:0 4px 24px rgba(0,0,0,0.25);
        padding:14px 16px; width:320px; max-width:92vw;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title" style="margin-bottom:8px; font-size:15px;">🔍 Cari di "${layerName}"</div>
            <input class="popup-input" id="searchLayerInput" placeholder="Ketik nama..." autocomplete="off">
            <div id="searchLayerResults" style="max-height:240px; overflow-y:auto;"></div>
        </div>
    `;
    document.body.appendChild(wrapper);

    const resultsBox = document.getElementById("searchLayerResults");
    const input = document.getElementById("searchLayerInput");

    if(!shpLoadedLayers.has(layerName)){
        resultsBox.innerHTML = `<div class="popup-info">Memuat data layer...</div>`;
        await handleLayerToggle(layerName, true); // lazy-load, sama kayak nyalain checkbox
        renderLayerTree();
        initTreeCollapse();

        // panel bisa aja udah ditutup user selagi nunggu fetch
        if(!document.getElementById("searchLayerPanel")) return;
    }

    function tampilkanHasil(keyword){
        keyword = keyword.trim().toLowerCase();

        if(!keyword){
            resultsBox.innerHTML = `<div class="popup-info" style="font-size:12px; color:#888;">Ketik minimal 1 huruf...</div>`;
            return;
        }

        const fitur = treeLayerObjects[layerName] || [];
        const cocok = fitur.filter(l => {
            if(!l._data || !l._data.atribut) return false;
            const nama = judulFiturShp_(l._data).replace(/^📦\s*/, "").toLowerCase();
            return nama.includes(keyword);
        }).slice(0, 15);

        if(!cocok.length){
            resultsBox.innerHTML = `<div class="popup-info">Tidak ditemukan.</div>`;
            return;
        }

        resultsBox.innerHTML = cocok.map((l, i) => `
            <div class="search-result-item" data-idx="${i}">
                ${judulFiturShp_(l._data).replace(/^📦\s*/, "")}
            </div>
        `).join("");

        resultsBox.querySelectorAll(".search-result-item").forEach((el, i) => {
            el.addEventListener("click", () => pilihHasilSearch_(cocok[i]));
        });
    }

    input.addEventListener("input", () => tampilkanHasil(input.value));
    input.focus();
    tampilkanHasil("");
}

function pilihHasilSearch_(layerFitur){
    tutupSearchLayer();

    // perilaku IDENTIK kayak klik polygon-nya langsung: zoom ke situ,
    // lalu buka popup Ringkasan yang sama (attachEditMenu)
    const bounds = layerFitur.getBounds ? layerFitur.getBounds() : null;
    if(bounds && bounds.isValid && bounds.isValid()){
        map.fitBounds(bounds, { padding: [60, 60] });
    } else if(layerFitur.getLatLng){
        map.setView(layerFitur.getLatLng(), Math.max(map.getZoom(), 15));
    }

    // kasih waktu peta selesai pan/zoom dulu sebelum popup dibuka,
    // biar posisinya kebaca bener sama Leaflet
    setTimeout(() => {
        layerFitur.openPopup();
    }, 300);
}

function tutupSearchLayer(){
    const panel = document.getElementById("searchLayerPanel");
    if(panel) panel.remove();
}

// input file tersembunyi, dipicu dari tombol Import di FAB menu
const shpFileInput = document.createElement("input");
shpFileInput.type = "file";
shpFileInput.accept = ".zip,.json,.geojson";
shpFileInput.style.display = "none";
document.body.appendChild(shpFileInput);

shpFileInput.addEventListener("change", function(e){
    const file = e.target.files[0];
    shpFileInput.value = ""; // reset biar file yg sama bisa dipilih lagi
    if(file) handleShpFile(file);
});

async function handleShpFile(file){

    const namaFile = file.name.toLowerCase();
    let geojson;

    try{
        if(namaFile.endsWith(".zip")){

            await loadScriptSekali_(SHPJS_CDN);
            const buffer = await file.arrayBuffer();
            geojson = await shp(buffer);

            // kalau ZIP-nya isinya lebih dari 1 shapefile, shpjs
            // balikin array of FeatureCollection -> kita ambil yang
            // pertama aja (asumsi 1 layer per upload)
            if(Array.isArray(geojson)) geojson = geojson[0];

        } else if(namaFile.endsWith(".geojson") || namaFile.endsWith(".json")){

            const text = await file.text();
            geojson = JSON.parse(text);

            if(geojson.type === "Feature"){
                geojson = { type: "FeatureCollection", features: [geojson] };
            }

        } else {
            alert("Format file tidak didukung. Upload .zip (shapefile) atau .geojson/.json");
            return;
        }
    } catch(err){
        console.error(err);
        alert("Gagal membaca file: " + err.message);
        return;
    }

    if(!geojson || !geojson.features || !geojson.features.length){
        alert("File tidak berisi fitur apapun.");
        return;
    }

    // bulatkan koordinat ke 6 desimal (~11cm presisi -- jauh lebih dari
    // cukup buat peta kabupaten). Ini BUKAN simplifikasi bentuk (jumlah
    // titik tetap sama persis, gak ada titik yang dibuang) -- cuma
    // motong angka desimal berlebih (mis. dari SHP presisi mesin bisa
    // 15+ digit) yang gak kepake tapi bikin ukuran JSON geometri
    // bengkak. Efeknya lumayan mengurangi risiko kena batas 50.000
    // karakter/sel Google Sheets, walau untuk polygon yang MEMANG
    // sangat detail (ribuan titik) tetap bisa kepotong -- itu yang
    // ditangani otomatis oleh chunking di backend (lihat AI_CONTEXT.md).
    geojson.features.forEach(f => {
        if(f.geometry) f.geometry = bulatkanKoordinat_(f.geometry, 6);
    });

    bukaPreviewShp(geojson, file.name);
}

function bulatkanKoordinat_(geometry, desimal){
    const faktor = Math.pow(10, desimal);
    function bulatkan(node){
        if(typeof node === "number"){
            return Math.round(node * faktor) / faktor;
        }
        if(Array.isArray(node)){
            return node.map(bulatkan);
        }
        return node;
    }
    return { ...geometry, coordinates: bulatkan(geometry.coordinates) };
}

function bukaPreviewShp(geojson, fileName){

    tutupPreviewShp(); // bersihkan preview sebelumnya kalau ada

    // union semua key atribut dari SELURUH fitur (bukan cuma fitur
    // pertama), soalnya di data SHP kadang gak semua fitur punya
    // kolom yang sama persis
    const keySet = new Set();
    geojson.features.forEach(f => {
        Object.keys(f.properties || {}).forEach(k => keySet.add(k));
    });

    const previewLayer = L.geoJSON(geojson, {
        style: { color: "#ff6600", weight: 3, fillOpacity: 0.15 },
        pointToLayer: (f, latlng) =>
            L.circleMarker(latlng, { radius: 6, color: "#ff6600", weight: 2, fillOpacity: 0.6 })
    }).addTo(map);

    if(previewLayer.getBounds().isValid()){
        map.fitBounds(previewLayer.getBounds(), { padding: [40, 40] });
    }

    importState = {
        geojson,
        previewLayer,
        attributeKeys: Array.from(keySet)
    };

    renderShpFormPanel(fileName, geojson.features.length);
}

function tutupPreviewShp(){

    if(importState.previewLayer){
        map.removeLayer(importState.previewLayer);
    }
    importState = { geojson: null, previewLayer: null, attributeKeys: [] };

    const panel = document.getElementById("shpImportPanel");
    if(panel) panel.remove();
}

function renderShpFormPanel(fileName, jumlahFitur){

    const wrapper = document.createElement("div");
    wrapper.id = "shpImportPanel";
    wrapper.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:21000; background:#fff; border-radius:10px;
        box-shadow:0 4px 24px rgba(0,0,0,0.25);
        padding:16px 20px; width:380px; max-width:92vw; max-height:88vh;
        overflow-y:auto;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title">📥 Import SHP</div>
            <div class="popup-info">${fileName} — ${jumlahFitur} fitur terbaca</div>
            <br>

            <div class="shp-simplify-box">
                <label class="shp-simplify-label">
                    <input type="checkbox" id="shp_simplify_toggle">
                    <span>Sederhanakan bentuk polygon</span>
                </label>
                <div class="shp-simplify-desc">
                    Kurangi jumlah titik pada polygon yang sangat detail
                    (mengurangi ukuran data secara signifikan, bentuk di
                    peta tetap terlihat sama). <b>Cuma berlaku buat import
                    ini</b> — tiap upload SHP baru diminta pilih lagi,
                    gak otomatis nyala buat layer lain. Disarankan
                    dicentang kalau file SHP-nya hasil digitasi sangat
                    detail (ribuan titik per polygon) dan cuma dipakai
                    buat ditampilkan di peta, bukan buat analisis ukur
                    presisi tinggi.
                </div>
            </div>
            <br>

            <label class="popup-label">Nama Layer</label><br>
            <div class="layer-picker">
                <input class="popup-input layer-search" id="shp_search_layer"
                    placeholder="🔍 Ketik nama layer (baru atau yang sudah ada)...">
                <select class="popup-select layer-list" id="shp_layer_lokasi" size="6"></select>
            </div>
            <br><br>

            <label class="popup-label">Kategori</label><br>
            <div class="layer-picker">
                <input class="popup-input layer-search" id="shp_kategori"
                    placeholder="Ketik atau pilih kategori...">
                <select class="popup-select layer-list" id="shp_kategori_list" size="4"></select>
            </div>
            <br><br>

            <label class="popup-label">Tema</label><br>
            <div class="layer-picker">
                <input class="popup-input layer-search" id="shp_tema"
                    placeholder="Ketik atau pilih tema...">
                <select class="popup-select layer-list" id="shp_tema_list" size="4"></select>
            </div>
            <br><br>

            <label class="popup-label">OPD</label><br>
            <div class="layer-picker">
                <input class="popup-input layer-search" id="shp_owner"
                    placeholder="Ketik atau pilih OPD...">
                <select class="popup-select layer-list" id="shp_owner_list" size="4"></select>
            </div>
            <br><br>

            <button id="btnImportShp" class="popup-button" onclick="prosesImportShp()">
                ✓ Import
            </button>
            <br><br>
            <button class="popup-button popup-button-secondary" onclick="tutupPreviewShp()">
                ✕ Batal
            </button>
        </div>
    `;

    document.body.appendChild(wrapper);

    const ddl = document.getElementById("shp_layer_lokasi");
    const search = document.getElementById("shp_search_layer");

    // dropdown cuma nyaranin layer yang SUMBERNYA SHP (source_type
    // "shp"), biar gak nyaranin nama layer manual/digitasi yang
    // konsepnya beda dan gak boleh dipakai ulang buat SHP
    const shpLayers = masterLayer.filter(item => item.source_type === "shp");

    function filterShpDropdown(keyword){
        keyword = keyword.trim().toLowerCase();
        const hasil = keyword === ""
            ? shpLayers.slice(0, 8)
            : shpLayers.filter(item => item.layer.toLowerCase().includes(keyword));

        ddl.innerHTML = hasil.length
            ? hasil.map(item => `<option value="${item.layer}">${item.layer}</option>`).join("")
            : `<option value="">Tidak ada layer SHP ditemukan</option>`;
    }

    function isiOtomatisDariMaster(layerName){
        const master = masterLayer.find(item => item.layer === layerName);
        document.getElementById("shp_kategori").value = master ? master.kategori : "";
        document.getElementById("shp_tema").value = master ? master.tema : "";
        document.getElementById("shp_owner").value = master ? master.owner_opd : "";
    }

    search.addEventListener("focus", function(){
        ddl.classList.add("show");
        filterShpDropdown("");
    });

    search.addEventListener("input", function(){
        ddl.classList.add("show");
        filterShpDropdown(search.value);
        isiOtomatisDariMaster(search.value);
    });

    search.addEventListener("blur", function(){
        setTimeout(() => ddl.classList.remove("show"), 150);
    });

    // Klik opsi ditangkap lewat "mousedown" + preventDefault, BUKAN
    // event "change" pada <select>. Alasan: "change" cuma jamin
    // terpasang kalau focus sempat pindah dulu ke <select> lalu balik
    // -- itu race sama blur/setTimeout di atas yang nyembunyiin
    // dropdown, dan di beberapa kondisi klik-nya kelihatan "kepilih"
    // (opsinya ke-highlight) tapi search.value gak ke-set (event
    // change-nya gak sempat/gak konsisten kepanggil). preventDefault()
    // di mousedown mencegah <select> ngerebut focus dari input sama
    // sekali, jadi blur PUN gak pernah kejadian -- gak ada race,
    // search.value langsung diisi manual di sini.
    ddl.addEventListener("mousedown", function(e){
        if(e.target.tagName !== "OPTION") return;
        e.preventDefault();
        search.value = e.target.value;
        ddl.classList.remove("show");
        isiOtomatisDariMaster(e.target.value);
    });

    // ===== Kategori / Tema / OPD: suggestion dari master_layer, =====
    // ===== tapi tetap boleh ketik nilai baru (bukan dropdown terkunci) =====
    function nilaiUnik_(field){
        const set = new Set();
        masterLayer.forEach(item => {
            if(item[field]) set.add(item[field]);
        });
        return Array.from(set).sort();
    }

    function pasangAutocomplete_(searchId, listId, daftarNilai){
        const s = document.getElementById(searchId);
        const d = document.getElementById(listId);

        function filter(keyword){
            keyword = keyword.trim().toLowerCase();
            const hasil = keyword === ""
                ? daftarNilai
                : daftarNilai.filter(v => v.toLowerCase().includes(keyword));

            d.innerHTML = hasil.length
                ? hasil.map(v => `<option value="${v}">${v}</option>`).join("")
                : `<option value="">(belum ada, akan dibuat baru)</option>`;
        }

        s.addEventListener("focus", function(){
            d.classList.add("show");
            filter(s.value);
        });
        s.addEventListener("input", function(){
            d.classList.add("show");
            filter(s.value);
        });
        s.addEventListener("blur", function(){
            setTimeout(() => d.classList.remove("show"), 150);
        });
        // Sama seperti dropdown Nama Layer di atas: pakai "mousedown" +
        // preventDefault, bukan "change", biar gak kena race blur/hide.
        d.addEventListener("mousedown", function(e){
            if(e.target.tagName !== "OPTION") return;
            e.preventDefault();
            s.value = e.target.value;
            d.classList.remove("show");
        });
    }

    pasangAutocomplete_("shp_kategori", "shp_kategori_list", nilaiUnik_("kategori"));
    pasangAutocomplete_("shp_tema", "shp_tema_list", nilaiUnik_("tema"));
    pasangAutocomplete_("shp_owner", "shp_owner_list", nilaiUnik_("owner_opd"));
}

function prosesImportShp(){

    if(!importState.geojson){
        alert("Tidak ada data untuk diimport.");
        return;
    }

    const layerNama = document.getElementById("shp_search_layer").value.trim();
    const kategori = document.getElementById("shp_kategori").value.trim();
    const tema = document.getElementById("shp_tema").value.trim();
    const ownerOpd = document.getElementById("shp_owner").value.trim();
    const simplifyOn = document.getElementById("shp_simplify_toggle").checked;

    if(!layerNama || !kategori || !tema || !ownerOpd){
        alert("Nama Layer, Kategori, Tema, dan OPD wajib diisi.");
        return;
    }

    const existing = masterLayer.find(item => item.layer === layerNama);

    if(existing && existing.source_type !== "shp"){
        alert(
            `Nama layer "${layerNama}" sudah dipakai layer data manual/digitasi. ` +
            `Pakai nama lain khusus untuk data SHP ini.`
        );
        return;
    }

    if(existing && existing.source_type === "shp"){
        const ok = confirm(
            `Layer "${layerNama}" sudah pernah diimport sebelumnya.\n\n` +
            `Melanjutkan akan MENGGANTI SELURUH data lama layer ini dengan file yang baru diupload. Lanjutkan?`
        );
        if(!ok) return;
    }

    const btn = document.getElementById("btnImportShp");
    btn.disabled = true;
    btn.innerHTML = simplifyOn ? "⏳ Menyederhanakan bentuk..." : "⏳ Mengimport...";

    // simplifikasi (kalau dicentang) dikerjain di SINI, pas submit --
    // BUKAN dobel-nyimpen geometry yang udah disederhanakan ke
    // importState.geojson. Alasan: kalau user gak jadi centang / balik
    // ganti pikiran, data ASLI (importState.geojson) tetap utuh, gak
    // ke-mutate permanen cuma gara-gara sempat dicentang lalu batal.
    const kirimImport = (features) => {
        fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "import_shp",
                layer: layerNama,
                kategori,
                tema,
                owner_opd: ownerOpd,
                attributeKeys: importState.attributeKeys,
                features
            })
        })
        .then(res => res.json())
        .then(resp => {

            if(resp.status !== "ok"){
                alert("Gagal import: " + (resp.message || "unknown error"));
                btn.disabled = false;
                btn.innerHTML = "✓ Import";
                return;
            }

        // update cache master_layer lokal biar tree & form lain
        // langsung nyadar tanpa perlu reload penuh dari server
        if(existing){
            existing.kategori = kategori;
            existing.tema = tema;
            existing.owner_opd = ownerOpd;
            existing.sheet_name = resp.sheet_name;
            existing.source_type = "shp";
        } else {
            masterLayer.push({
                kategori, tema, layer: layerNama,
                owner_opd: ownerOpd,
                sheet_name: resp.sheet_name,
                source_type: "shp"
            });
        }

        // kalau ini re-upload/replace, buang dulu fitur lama layer
        // ini dari peta sebelum render yang baru
        if(treeLayerObjects[layerNama]){
            treeLayerObjects[layerNama].forEach(l => {
                drawnItems.removeLayer(l);
                Object.values(layerGroups).forEach(g => g.removeLayer(l));
            });
            treeLayerObjects[layerNama] = [];
        }
        shpLoadedLayers.delete(layerNama);
        shpVisibleLayers.delete(layerNama);

        tutupPreviewShp();

        const masterBaru = masterLayer.find(item => item.layer === layerNama);

        muatBulkLayer(resp.sheet_name, layerNama, masterBaru).then(() => {

            // makeVisible default true di muatBulkLayer() -> registerLayer()
            // beneran nampilin fiturnya ke peta. Tandai di shpVisibleLayers
            // juga (bukan cuma shpLoadedLayers) biar checkbox-nya di tree
            // ikut kecentang, konsisten sama apa yang kelihatan di peta.
            shpVisibleLayers.add(layerNama);

            window.layerTree = buildLayerTreeFull(lastData);
            renderLayerTree();
            initTreeCollapse();
            requestAnimationFrame(() => requestAnimationFrame(refreshTreeHeight));

            alert(`Berhasil import ${resp.count} fitur ke layer "${layerNama}".`);
        });
    })
    .catch(err => {
        console.error(err);
        alert("Gagal mengirim data ke server: " + err.message);
        btn.disabled = false;
        btn.innerHTML = "✓ Import";
    });
    }; // -- akhir kirimImport

    const featuresAsli = importState.geojson.features.map(f => ({
        attributes: f.properties || {},
        geometry: f.geometry
    }));

    if(!simplifyOn){
        kirimImport(featuresAsli);
        return;
    }

    // Checkbox dicentang -> load turf.js dulu (on-demand), baru
    // simplifikasi. Toleransi 0.00005 derajat (~5 meter di garis
    // khatulistiwa) dipilih supaya bentuk batas desa/wilayah masih
    // kelihatan sama persis secara visual di peta kabupaten, tapi
    // jumlah titiknya bisa berkurang drastis untuk polygon yang tadinya
    // didigitasi sangat detail (ribuan titik). highQuality:true dipakai
    // karena ini proses SEKALI pas import (bukan real-time), jadi wajar
    // korbanin sedikit waktu proses demi hasil simplifikasi yang lebih
    // rapi/gak "patah-patah".
    loadScriptSekali_(TURF_CDN).then(() => {
        const TOLERANSI_SIMPLIFY = 0.00005;

        const featuresSederhana = featuresAsli.map(f => {
            // cuma Polygon/MultiPolygon/LineString yang disederhanakan
            // -- titik (Point) gak punya "bentuk" buat disederhanakan
            if(!f.geometry || (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon" && f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString")){
                return f;
            }
            try{
                const hasil = turf.simplify(
                    { type: "Feature", properties: {}, geometry: f.geometry },
                    { tolerance: TOLERANSI_SIMPLIFY, highQuality: true, mutate: false }
                );
                return { attributes: f.attributes, geometry: hasil.geometry };
            } catch(e){
                // kalau ada geometry aneh yang bikin turf error, jangan
                // gagalin seluruh import -- pakai geometry aslinya aja
                // buat fitur itu, catat di console biar ketahuan
                console.warn("Gagal simplify 1 fitur, dipakai geometry asli:", e);
                return f;
            }
        });

        kirimImport(featuresSederhana);
    }).catch(err => {
        alert("Gagal memuat library simplifikasi (turf.js): " + err.message + "\n\nImport dibatalkan, coba lagi atau uncheck opsi simplifikasi.");
        btn.disabled = false;
        btn.innerHTML = "✓ Import";
    });
}

async function init(){
 await loadMasterLayer();
 await loadDataAwal();
}
init().then(() => {
    // layer default (Kemiskinan) dinyalakan DULU, gak di-await -- kalau
    // Dashboard Kabupaten minta layer yang sama, muatBulkLayer() cukup
    // nunggu load yang sudah jalan (single-flight), bukan fetch dobel.
    aktifkanLayerAwal_().catch(err => console.warn("Gagal mengaktifkan layer awal:", err));
    populateKabupatenDashboardSelector_();
    refreshDashboardKabupaten();
});
window.refreshLayerData = refreshLayerData;
// refresh tiap 5 detik
setInterval(() => {
    refreshLayerData().catch(err => {
        // udah dicoba retry di dalam fetchDenganRetry_ -- kalau
        // SAMPAI SINI masih gagal juga, gak usah bikin ribut ke user
        // (gak throw/alert), toh polling ini bakal jalan lagi
        // otomatis 5 detik kemudian.
        console.warn("Polling data gagal, akan dicoba lagi 5 detik lagi:", err);
    });
}, 5000);

// ==================================
// SIDEBAR KANAN: DASHBOARD KESELURUHAN KABUPATEN
// ==================================
// Persisten, TIDAK berubah per-desa (beda sama Popup Ringkasan yang
// tetap muncul lewat klik polygon seperti biasa -- dua-duanya jalan
// bareng, gak saling menggantikan). Isinya: rekap SE-KABUPATEN, bukan
// per fitur. Sengaja disederhanakan dulu ke 2 hal yang paling jelas
// kepake (total penduduk + total "miskin"/subset dari config donut
// layer yang dipilih, dan total bantuan per OPD lintas SEMUA desa) --
// user bilang ini "sementara", bisa nambah sesuai kebutuhan pimpinan
// belakangan, makanya dibikin selector layer biar gak hardcode ke 1
// nama layer tertentu.
(function initSidebarKabupaten(){
    const wrapper = document.createElement("div");
    wrapper.id = "sidebarKabupaten";
    // Sidebar dipatok dua sisi (top + bottom), BUKAN top + max-height
    // seperti sebelumnya. Alasannya: FAB button (#fabContainer) ada di
    // pojok kanan-bawah (right:25px; bottom:35px; tinggi 64px), dan
    // sidebar yang tingginya sampai `100vh - 100px` itu nutupin dia
    // sampai gak bisa diklik. Dengan `bottom:120px`, sidebar berhenti
    // 120px di atas dasar viewport -- aman di atas FAB (35 + 64 = 99px)
    // plus sedikit jarak nafas. Tingginya otomatis ikut tinggi layar,
    // isinya tetap discroll sendiri lewat overflow-y:auto.
    wrapper.style.cssText = `
        position:fixed; top:90px; right:16px; bottom:120px; width:260px;
        overflow-y:auto; background:#fff; border-radius:10px;
        box-shadow:0 5px 20px rgba(0,0,0,.25); z-index:998;
        font-family:Segoe UI,sans-serif; padding:14px;
    `;
    wrapper.innerHTML = `
        <div style="margin-bottom:14px;">
            <label style="font-size:11px; color:#888;">Cari nama desa:</label>
            <div style="display:flex; gap:6px; align-items:flex-start; margin-top:2px;">
                <div class="layer-picker" style="flex:1; margin-bottom:0;">
                    <input class="popup-input layer-search" id="searchDesaSidebar"
                        placeholder="Cari nama desa..." autocomplete="off">
                    <select class="popup-select layer-list" id="searchDesaSidebarList" size="6"></select>
                </div>
                <button type="button" id="searchDesaSidebarBtn" class="tree-style-btn"
                    title="Tampilkan desa ini di peta"
                    style="flex-shrink:0; width:36px; height:36px; background:#eef2ff; border-radius:8px;">
                    🔍
                </button>
            </div>
        </div>
        <div class="sidebar-section" id="basemapSection">
            <button type="button" class="sidebar-section-head" id="basemapSectionHead">
                <span>🗺️ Peta Dasar</span>
                <span class="sidebar-section-arrow">▸</span>
            </button>
            <div class="sidebar-section-body">
                <div class="basemap-grid" id="basemapGrid"></div>
                <div class="basemap-opacity">
                    <label for="basemapOpacity">
                        Transparansi peta dasar
                        <span id="basemapOpacityVal">100%</span>
                    </label>
                    <input type="range" id="basemapOpacity" min="10" max="100" step="5">
                </div>
            </div>
        </div>

        <div style="font-weight:700; font-size:14px; margin-bottom:8px;">📊 Dashboard Kabupaten</div>
        <label style="font-size:11px; color:#888;">Sumber data kemiskinan (pilih layer):</label>
        <select id="kabupatenDashboardLayer" class="popup-input" style="margin-bottom:8px;"></select>
        <div id="kabupatenDashboardBody">
            <div class="popup-info" style="font-size:12px;">Memuat...</div>
        </div>
    `;
    document.body.appendChild(wrapper);
    initSearchDesaSidebar_();

    // Picker basemap (menggantikan L.control.layers bawaan Leaflet,
    // lihat blok "BASEMAP / PETA DASAR" di atas).
    renderBasemapPicker_();

    // Section basemap bisa dilipat biar sidebar gak kepanjangan pas
    // dashboard-nya nanti nambah isi. Default: TERTUTUP, jadi yang
    // pertama kelihatan langsung statistik bantuan se-kabupaten.
    const bmHead = document.getElementById("basemapSectionHead");
    const bmSection = document.getElementById("basemapSection");
    if(bmHead && bmSection){
        bmHead.addEventListener("click", () => bmSection.classList.toggle("open"));
    }
})();

// Search nama desa di sidebar kanan -- cari HANYA di layer yang lagi
// dipilih di dropdown "Sumber data" dashboard (treeLayerObjects-nya
// sudah pasti ke-load penuh karena refreshDashboardKabupaten() maksa
// full-load layer itu). Ngetik = live suggestion (dropdown, klik cuma
// ngisi kotak input, BELUM navigasi). Baru pas tombol 🔍 diklik (atau
// Enter) peta pindah + popup kebuka -- perilaku identik klik polygon
// langsung, reuse pilihHasilSearch_() yang sama dipakai search per-layer.
function initSearchDesaSidebar_(){
    const input = document.getElementById("searchDesaSidebar");
    const ddl = document.getElementById("searchDesaSidebarList");
    const btn = document.getElementById("searchDesaSidebarBtn");
    if(!input || !ddl || !btn) return;

    function daftarFiturAktif_(){
        const layerName = localStorage.getItem("wgis_dashboard_layer");
        return (treeLayerObjects[layerName] || []).filter(l => l._data && l._data.atribut);
    }

    function namaFitur_(l){
        return judulFiturShp_(l._data).replace(/^📦\s*/, "");
    }

    function filterDesaDropdown_(keyword){
        keyword = keyword.trim().toLowerCase();
        const fitur = daftarFiturAktif_();
        const cocok = keyword
            ? fitur.filter(l => namaFitur_(l).toLowerCase().includes(keyword))
            : fitur;

        ddl.innerHTML = cocok.slice(0, 50).map((l, i) =>
            `<option value="${i}">${namaFitur_(l)}</option>`
        ).join("");

        ddl._cocok = cocok;
    }

    input.addEventListener("focus", function(){
        ddl.classList.add("show");
        filterDesaDropdown_(input.value);
    });

    input.addEventListener("input", function(){
        ddl.classList.add("show");
        filterDesaDropdown_(input.value);
    });

    input.addEventListener("blur", function(){
        setTimeout(() => ddl.classList.remove("show"), 150);
    });

    ddl.addEventListener("change", function(){
        const idx = parseInt(ddl.value, 10);
        const terpilih = (ddl._cocok || [])[idx];
        if(terpilih) input.value = namaFitur_(terpilih);
        ddl.classList.remove("show");
    });

    input.addEventListener("keydown", function(e){
        if(e.key === "Enter"){
            e.preventDefault();
            jalankanSearchDesaSidebar_();
        }
    });

    btn.addEventListener("click", jalankanSearchDesaSidebar_);

    function jalankanSearchDesaSidebar_(){
        const keyword = input.value.trim().toLowerCase();
        if(!keyword){
            alert("Ketik dulu nama desanya.");
            return;
        }

        const fitur = daftarFiturAktif_();
        // prioritas: cocok PERSIS (case-insensitive) dulu, baru fallback
        // ke yang cuma MENGANDUNG keyword
        let target = fitur.find(l => namaFitur_(l).toLowerCase() === keyword);
        if(!target) target = fitur.find(l => namaFitur_(l).toLowerCase().includes(keyword));

        if(!target){
            alert(`Desa "${input.value}" tidak ditemukan di layer ini.`);
            return;
        }

        pilihHasilSearch_(target);
    }
}

function populateKabupatenDashboardSelector_(){
    const sel = document.getElementById("kabupatenDashboardLayer");
    if(!sel) return;

    const shpLayers = masterLayer.filter(m => m.source_type === "shp");
    const dipilihSebelumnya = localStorage.getItem("wgis_dashboard_layer");

    sel.innerHTML = shpLayers.length
        ? shpLayers.map(m =>
            `<option value="${m.layer}" ${m.layer===dipilihSebelumnya ? "selected":""}>${m.layer}</option>`
          ).join("")
        : `<option value="">(belum ada layer SHP)</option>`;

    if(!dipilihSebelumnya && shpLayers.length){
        localStorage.setItem("wgis_dashboard_layer", shpLayers[0].layer);
        sel.value = shpLayers[0].layer;
    }

    sel.addEventListener("change", () => {
        localStorage.setItem("wgis_dashboard_layer", sel.value);
        refreshDashboardKabupaten();
    });
}

// Palet donut "Proporsi Bantuan per OPD". Dipilih yang cukup kontras
// satu sama lain (bukan gradient satu warna) karena potongannya =
// kategori, bukan urutan nilai. Kalau OPD-nya lebih banyak dari palet,
// warnanya berulang (index % panjang palet) -- legenda tetap kebaca
// karena namanya ditulis, bukan cuma warna.
const WARNA_OPD_ = [
    "#4338ca", "#0891b2", "#16a34a", "#f59e0b", "#dc2626",
    "#7c3aed", "#0ea5e9", "#65a30d", "#ea580c", "#db2777"
];

let kabupatenChartInstance = null;

async function refreshDashboardKabupaten(){
    const body = document.getElementById("kabupatenDashboardBody");
    if(!body) return;

    const layerName = localStorage.getItem("wgis_dashboard_layer");
    const master = masterLayer.find(m => m.layer === layerName);

    if(!master){
        body.innerHTML = `<div class="popup-info" style="font-size:12px;">Pilih layer sumber data dulu.</div>`;
        return;
    }

    const sudahAda = shpLoadedLayers.has(layerName);
    body.innerHTML = sudahAda
        ? `<div class="popup-info" style="font-size:12px;">Memuat rekap ${layerName}...</div>`
        : `<div class="popup-info" style="font-size:12px;">Memuat data ${layerName}...</div>${htmlProgressBar_(layerName)}`;

    // rekap kabupaten butuh SEMUA fitur layer ini ke-load (bukan cuma
    // yang lagi dicentang ON) -- ini SATU-satunya tempat yang sengaja
    // maksa full-load 1 layer, karena memang butuh total keseluruhan.
    // Tetap sekali per sesi (dicache shpLoadedLayers), bukan polling.
    //
    // Load SHP-nya dan load data_bantuan DIJALANKAN BARENGAN
    // (Promise.all), BUKAN gantian (await satu-satu seperti sebelumnya).
    // Alasan: dua-duanya sama-sama request jaringan yang independen satu
    // sama lain (gak saling butuh hasil satu sama lain), jadi kalau
    // dikerjain gantian, total waktu tunggu = waktu A + waktu B. Kalau
    // bareng, total waktu tunggu = MAX(waktu A, waktu B) -- bisa hemat
    // signifikan terutama di koneksi yang agak lambat (laptop/jaringan
    // baru, first load tanpa cache apa-apa).
    const tugasSHP = sudahAda
        ? Promise.resolve()
        // makeVisible=false -- Dashboard cuma butuh DATA-nya buat itung
        // statistik, bukan buat nampilin ke peta. Kalau layer ini
        // memang lagi dicentang user di tree, dia bakal tetap kelihatan
        // (lihat handleLayerToggle(): kalau sudah ke-cache di
        // shpLoadedLayers, dia skip muatBulkLayer dan langsung
        // toggleLayer(true)). Sebelum fix ini, Dashboard yang jalan
        // otomatis pas init() bikin layer sumber datanya nongol sendiri
        // di peta walau checkbox-nya belum pernah dicentang siapapun.
        : muatBulkLayer(master.sheet_name, layerName, master,
            (phase, current, total) => updateProgressBar_(layerName, phase, current, total),
            false);
    const tugasBantuan = muatDataBantuan();

    await Promise.all([tugasSHP, tugasBantuan]);

    const fitur = treeLayerObjects[layerName] || [];
    const donutCfg = getDonutConfig_(layerName);

    let totalMiskin = 0;
    let totalPenduduk = 0;
    let donutTersedia = false;

    if(donutCfg){
        fitur.forEach(l => {
            if(!l._data || !l._data.atribut) return;
            const total = parseFloat(l._data.atribut[donutCfg.total]);
            const subset = parseFloat(l._data.atribut[donutCfg.subset]);
            if(!isNaN(total) && !isNaN(subset)){
                totalPenduduk += total;
                totalMiskin += subset;
                donutTersedia = true;
            }
        });
    }

    // muatDataBantuan() TIDAK dipanggil lagi di sini -- sudah beres
    // sebagai bagian dari Promise.all di atas (dijalankan bareng SHP,
    // bukan gantian). muatDataBantuan() sendiri sudah self-caching
    // (lihat definisinya), jadi manggil lagi di sini pun sebenarnya
    // aman/gak nge-fetch ulang -- tapi dihapus biar gak ambigu urutan
    // baca kodenya.
    const perOpd = {};
    (bantuanData || []).forEach(r => {
        const opd = r.opd || "Lainnya";
        const jml = parseFloat(r.jumlah_penerima) || 0;
        perOpd[opd] = (perOpd[opd] || 0) + jml;
    });
    const opdLabels = Object.keys(perOpd);

    const statHtml = donutTersedia ? `
        <div class="ringkasan-stats" style="margin-bottom:6px;">
            <div class="ringkasan-card">
                <div class="ringkasan-card-value">${totalPenduduk.toLocaleString('id-ID')}</div>
                <div class="ringkasan-card-label">Total Penduduk</div>
            </div>
            <div class="ringkasan-card">
                <div class="ringkasan-card-value">${totalMiskin.toLocaleString('id-ID')}</div>
                <div class="ringkasan-card-label">${escHtml_(namaUkuranDashboard_(layerName, donutCfg.subset))}</div>
            </div>
        </div>
    ` : `<div class="popup-info" style="font-size:12px;">Atur dulu "Grafik Komposisi (Donut)" di panel 🎨 Style layer ini biar rekap kemiskinan bisa dihitung.</div>`;

    // Rekap bantuan ditampilkan sebagai DONUT PROPORSI, bukan bar total.
    // Pertanyaan yang mau dijawab panel ini: "dari seluruh bantuan yang
    // turun se-kabupaten, porsi tiap OPD berapa persen" -- jadi angka
    // yang menonjol adalah PERSENTASE (jumlah absolut tetap ada, tapi
    // jadi keterangan kecil di legenda, bukan sumbu utama).
    // OPD diurutkan dari porsi terbesar biar kebaca sekali lihat.
    const totalBantuan = opdLabels.reduce((a, k) => a + perOpd[k], 0);
    const opdUrut = opdLabels
        .filter(k => perOpd[k] > 0)
        .sort((a, b) => perOpd[b] - perOpd[a]);

    const adaBantuan = opdUrut.length > 0 && totalBantuan > 0;

    const persenOpd_ = k => (perOpd[k] / totalBantuan) * 100;

    const bantuanHtml = adaBantuan ? `
        <div style="font-weight:600; font-size:12px; margin:10px 0 2px;">Proporsi Bantuan per OPD (Se-Mabar)</div>
        <div style="font-size:10.5px; color:#9ca3af; margin-bottom:6px;">
            Total ${totalBantuan.toLocaleString('id-ID')} penerima dari ${opdUrut.length} OPD
        </div>
        <div class="donut-opd-wrap">
            <canvas id="kabupatenBantuanChart"></canvas>
        </div>
        <div class="donut-opd-legend">
            ${opdUrut.map((k, i) => `
                <div class="donut-opd-item">
                    <span class="donut-opd-dot" style="background:${WARNA_OPD_[i % WARNA_OPD_.length]}"></span>
                    <span class="donut-opd-nama" title="${k}">${k}</span>
                    <span class="donut-opd-persen">${persenOpd_(k).toFixed(1)}%</span>
                    <span class="donut-opd-jml">${perOpd[k].toLocaleString('id-ID')}</span>
                </div>
            `).join("")}
        </div>
    ` : `<div class="popup-info" style="font-size:12px;">Belum ada data bantuan tercatat.</div>`;

    body.innerHTML = statHtml + bantuanHtml;

    // chart lama di-destroy dulu biar instance Chart.js gak numpuk tiap
    // user ganti layer di dropdown (canvas-nya memang sudah ikut kebuang
    // pas innerHTML diganti, tapi instance JS-nya belum tentu)
    if(kabupatenChartInstance){
        kabupatenChartInstance.destroy();
        kabupatenChartInstance = null;
    }

    if(adaBantuan){
        try{ await loadScriptSekali_(CHARTJS_CDN); }catch(e){ return; }
        kabupatenChartInstance = new Chart(document.getElementById("kabupatenBantuanChart"), {
            type: "doughnut",
            data: {
                labels: opdUrut,
                datasets: [{
                    data: opdUrut.map(k => perOpd[k]),
                    backgroundColor: opdUrut.map((k, i) => WARNA_OPD_[i % WARNA_OPD_.length]),
                    borderColor: "#fff",
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: "62%",
                // legenda bawaan Chart.js dimatikan -- nama OPD itu
                // panjang-panjang, di sidebar 260px legendanya bakal
                // kepotong. Diganti legenda HTML sendiri di bawah chart
                // (.donut-opd-legend) yang bisa wrap & nampilin % + angka.
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const v = ctx.parsed || 0;
                                const p = totalBantuan ? (v / totalBantuan) * 100 : 0;
                                return ` ${p.toFixed(1)}% (${v.toLocaleString('id-ID')} penerima)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ==================================
// COLLAPSE/EXPAND PANEL "🗂 Layer" (klik judul panel)
// ==================================
// Judulnya ("🗂 Layer") didefinisikan di index.html sebagai
// `<div id="layerTree"><div class="tree-header">🗂 Layer</div>
// <div id="treeContent">...</div></div>` -- class .tree-header itu
// SAMA dipakai buat header kategori/tema di dalam tree, tapi karena
// div ini DIRECT CHILD dari #layerTree (bukan nested di #treeContent),
// bisa ditarget presisi lewat selector "#layerTree > .tree-header"
// tanpa nyenggol kategori/tema. Semua behaviour di bawah ini
// (arrow icon, sticky, animasi buka/tutup) di-suntik lewat JS/CSS
// doang -- index.html TIDAK perlu diubah sama sekali.
(function initLayerPanelCollapse(){
    const panelHeader = document.querySelector("#layerTree > .tree-header");
    const content = document.getElementById("treeContent");
    if(!panelHeader || !content) return;

    // suntik arrow icon di depan judul yang sudah ada, konsisten
    // sama arrow kategori/tema di dalam tree
    panelHeader.innerHTML =
        `<span class="tree-arrow tree-panel-arrow">▶</span>` + panelHeader.innerHTML;
    panelHeader.classList.add("open");

    content.style.overflow = "hidden";
    content.style.transition = "max-height .28s ease, opacity .2s ease";
    content.style.maxHeight = "none"; // dibiarkan bebas -- lihat catatan di bawah
    content.style.opacity = "1";

    let open = true;

    panelHeader.addEventListener("click", function(){
        open = !open;

        if(open){
            // BUKA: animasikan dari 0 -> tinggi asli konten saat ini,
            // abis animasinya kelar lepas lagi batasnya ("none") biar
            // konten yang berubah belakangan (layer baru ke-load,
            // refresh 5 detik, dst) gak ke-clip diam-diam
            content.style.maxHeight = content.scrollHeight + "px";
            content.style.opacity = "1";
            panelHeader.classList.add("open");

            content.addEventListener("transitionend", function handler(e){
                if(e.propertyName !== "max-height") return;
                if(open) content.style.maxHeight = "none";
                content.removeEventListener("transitionend", handler);
            });
        } else {
            // TUTUP: kunci dulu ke tinggi aktualnya (angka px, bukan
            // "none" -- CSS gak bisa animate dari "none"), paksa
            // reflow, baru turunin ke 0 biar transisinya kebaca mulus
            content.style.maxHeight = content.scrollHeight + "px";
            content.offsetHeight; // force reflow
            content.style.maxHeight = "0px";
            content.style.opacity = "0";
            panelHeader.classList.remove("open");
        }
    });
})();

// ==================================
// FLOATING BUTTON
// ==================================

const fabMain = document.getElementById("createFab");
const fabMenu = document.getElementById("fabMenu");
let fabOpen = false;

fabMain.addEventListener("click", function () {

    fabOpen = !fabOpen;

    if (fabOpen) {
        fabMenu.classList.add("show");
    } else {
        fabMenu.classList.remove("show");
    }
});

// ==================================
// FAB MENU
// ==================================

const fabDigitasi = document.getElementById("fabDigitasi");
const fabImport = document.getElementById("fabImport");

const digitasiMenu = document.getElementById("digitasiMenu");

fabDigitasi.addEventListener("click", function(){
    digitasiMenu.classList.toggle("show");
});

document.getElementById("btnPoint").addEventListener("click",function(){
    alert("Point");
});

document.getElementById("btnLine").addEventListener("click",function(){
    alert("Line");
});

document.getElementById("btnPolygon").addEventListener("click",function(){
    alert("Polygon");
});

fabImport.addEventListener("click", function(){
    fabMenu.classList.remove("show");
    fabOpen = false;
    shpFileInput.click();
});

// ==================================
// DIGITASI DARI FAB
// ==================================

const drawPoint = new L.Draw.Marker(map,{});
const drawLine = new L.Draw.Polyline(map,{});
const drawPolygon = new L.Draw.Polygon(map,{});

// Leaflet.Draw punya shortcut Escape bawaan (_cancelDrawing) yang
// langsung memanggil disable() tanpa konfirmasi apapun, begitu
// tombol Escape dilepas. Method ini kita timpa jadi no-op supaya
// Escape sepenuhnya ditangani lewat popup konfirmasi kita sendiri
// (lihat handler keydown di atas), bukan langsung membatalkan diam-diam.
[drawPoint, drawLine, drawPolygon].forEach(function(tool){
    tool._cancelDrawing = function(){};
});

document.getElementById("btnPoint")
.addEventListener("click", function(){
    fabOpen = false;
    fabMenu.classList.remove("show");
    digitasiMenu.classList.remove("show");
    showCreateHint();
    createState.drawing=true;
    activeDrawTool = drawPoint;
    drawPoint.enable();

    // paksa fokus ke map supaya Escape/Enter langsung terdengar
    // tanpa perlu klik mouse dulu di peta
    setTimeout(function(){
        map.getContainer().focus();
    }, 0);

});

document.getElementById("btnLine")
.addEventListener("click", function(){
    fabOpen = false;
    fabMenu.classList.remove("show");
    digitasiMenu.classList.remove("show");
    showCreateHint();
    createState.drawing=true;
    activeDrawTool = drawLine;
    drawLine.enable();

    setTimeout(function(){
        map.getContainer().focus();
    }, 0);

});

document.getElementById("btnPolygon")
.addEventListener("click", function(){
    fabOpen = false;
    fabMenu.classList.remove("show");
    digitasiMenu.classList.remove("show");
    showCreateHint();
    createState.drawing=true;
    activeDrawTool = drawPolygon;
    drawPolygon.enable();

    setTimeout(function(){
        map.getContainer().focus();
    }, 0);

});