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

function renderLayerTree(){
    const div = document.getElementById("treeContent");
    div.innerHTML = `
        <div class="tree-toolbar">
            <button type="button" class="tree-toolbar-btn" onclick="bukaAturUrutanLayer()">
                ⚙ Urutan Tampilan Layer
            </button>
        </div>
    `;
   const tree = window.layerTree;

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
                // layer SHP baru checked kalau memang sudah pernah
                // di-bulk-load di sesi ini (lazy-load).
                const isChecked = !isShp || shpLoadedLayers.has(layer);

                html += `
                    <div class="tree-layer" style="display:flex; align-items:center; justify-content:space-between;">
                       <label class="tree-layer-label">
                       
                         <input
                         type="checkbox"
                         data-layer="${layer}"
                         ${isChecked ? "checked" : ""}
                         onchange="handleLayerToggle('${layer}',this.checked)">
                         <span class="tree-layer-text">
                         ${isShp ? "📦" : "📂"} ${layer}</span>
                        
                        <span class="tree-count">
                         (${jumlah})
                        </span>
                        </label>
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
                    </div>
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
    try{
        const raw = localStorage.getItem("wgis_style_" + layerName);
        return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
}

function saveLayerStyleConfig_(layerName, config){
    localStorage.setItem("wgis_style_" + layerName, JSON.stringify(config));
}

// kolom atribut yang dipakai sebagai JUDUL popup, per layer (misal
// "NAMOBJ" buat layer desa). Kalau belum diatur / kolomnya kosong di
// fitur tertentu, fallback ke nama layer seperti sebelumnya.
function getLayerLabelField_(layerName){
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

    let min, max;
    if(config.mode === "gradient" && config.attribute){
        const nilai = features
            .map(l => parseFloat(l._data && l._data.atribut ? l._data.atribut[config.attribute] : NaN))
            .filter(v => !isNaN(v));
        if(nilai.length){
            min = Math.min(...nilai);
            max = Math.max(...nilai);
        }
    }
    layerStyleRuntime[layerName] = { min, max, config };

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

// panel legenda kecil, fixed di pojok kiri bawah peta. Nampilin
// gradient bar buat semua layer yang lagi AKTIF (di-load & di-tree
// dicentang) dan mode style-nya "gradient"
function renderLegendPanel(){
    let panel = document.getElementById("legendPanel");
    if(!panel){
        panel = document.createElement("div");
        panel.id = "legendPanel";
        panel.style.cssText = `
            position:fixed; left:12px; bottom:12px; z-index:9000;
            background:#fff; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.2);
            padding:8px 10px; font-size:12px; max-width:220px;
        `;
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
            return `
                <div style="margin-bottom:6px;">
                    <div style="font-weight:600; margin-bottom:2px;">${layerName}</div>
                    <div style="height:10px; border-radius:4px; background:linear-gradient(to right, ${rt.config.colorMin}, ${rt.config.colorMax});"></div>
                    <div style="display:flex; justify-content:space-between; color:#555;">
                        <span>${rt.min.toLocaleString('id-ID')}</span>
                        <span>${rt.max.toLocaleString('id-ID')}</span>
                    </div>
                </div>
            `;
        }).join("");

    if(!rows){
        panel.style.display = "none";
        return;
    }
    panel.style.display = "block";
    panel.innerHTML = `<div style="font-weight:700; margin-bottom:4px;">Legenda</div>${rows}`;
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
        z-index:10000; background:#fff; border-radius:10px;
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
    } else {
        config.color = document.getElementById("style_color").value;
    }

    saveLayerStyleConfig_(layerName, config);

    const labelFieldEl = document.getElementById("style_labelField");
    if(labelFieldEl){
        saveLayerLabelField_(layerName, labelFieldEl.value);
    }

    const subtitleFieldEl = document.getElementById("style_subtitleField");
    if(subtitleFieldEl){
        saveLayerSubtitleField_(layerName, subtitleFieldEl.value);
    }

    const donutTotalEl = document.getElementById("style_donutTotal");
    const donutSubsetEl = document.getElementById("style_donutSubset");
    if(donutTotalEl && donutSubsetEl){
        saveDonutConfig_(layerName, {
            total: donutTotalEl.value,
            subset: donutSubsetEl.value
        });
    }

    const summaryChecks = document.querySelectorAll(".style_summaryField");
    if(summaryChecks.length){
        const dipilih = Array.from(summaryChecks)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        saveSummaryFields_(layerName, dipilih);
    }

    const labelInputs = document.querySelectorAll(".style_fieldLabel");
    if(labelInputs.length){
        const labelMap = {};
        labelInputs.forEach(inp => {
            if(inp.value.trim()) labelMap[inp.dataset.key] = inp.value.trim();
        });
        saveFieldLabels_(layerName, labelMap);
    }

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
        z-index:10000; background:#fff; border-radius:10px;
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

function toggleLayer(layerName, visible){
    Object.keys(layerGroups).forEach(key=>{
        if(!key.endsWith("_" + layerName)) return;
        if(visible){
            map.addLayer(layerGroups[key]);
        }else{
            map.removeLayer(layerGroups[key]);
        }
    });
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
        await muatBulkLayer(master.sheet_name, layerName, master);
    }

    toggleLayer(layerName, visible);
    renderLegendPanel();
}

// ===============================
// BULK LOAD DATA SHP (dipanggil sekali per layer per sesi)
// ===============================
function muatBulkLayer(sheetName, layerName, master){

    return fetch(GAS_URL + "?action=bulk&sheet=" + encodeURIComponent(sheetName))
    .then(res => res.json())
    .then(resp => {

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

                window.layerTree = buildLayerTreeFull(lastData);
                renderLayerTree();
                initTreeCollapse();
                requestAnimationFrame(() => requestAnimationFrame(refreshTreeHeight));
            } else {
                alert("Gagal memuat data layer " + layerName + ": " + resp.message);
            }

            return;
        }

        resp.data.forEach(d => {
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

        shpLoadedLayers.add(layerName);
        shpFeatureCounts[layerName] = resp.data.length;

        applyLayerStyle(layerName);
    })
    .catch(err => {
        console.error(err);
        alert("Gagal memuat data layer " + layerName + ": " + err.message);
    });
}

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

    const res = await fetch(GAS_URL);
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
    // nama layer SHP mana aja yang lagi aktif, supaya abis refresh
    // data manual ini, layer SHP yang tadinya udah di-ON gak
    // mendadak hilang dari peta / harus di-toggle manual lagi.
    const previouslyLoadedShp = Array.from(shpLoadedLayers);
    shpLoadedLayers.clear();

    clearRenderedData();
    renderLayerData(newData);
    window.layerTree = buildLayerTreeFull(newData);
    renderLayerTree();

    for(const layerName of previouslyLoadedShp){
        const master = masterLayer.find(item => item.layer === layerName);
        if(master) await muatBulkLayer(master.sheet_name, layerName, master);
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
        z-index:10000; background:#fff; border-radius:12px;
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

    const wrapper = document.createElement("div");
    wrapper.id = "detailIntervensiPanel";
    wrapper.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        z-index:10000; background:#fff; border-radius:12px;
        box-shadow:0 4px 28px rgba(0,0,0,0.3);
        padding:20px 22px; width:480px; max-width:94vw; max-height:88vh;
        overflow-y:auto;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title">🧾 Detail Intervensi Bantuan</div>
            <div class="ringkasan-subtitle">${namaDesa}${kecamatan ? " — " + kecamatan : ""}</div>
            <div id="detailIntervensiBody" style="margin-top:12px;">
                <div class="popup-info">Memuat data...</div>
            </div>
            <div class="popup-actions">
                <button class="popup-button popup-button-secondary" onclick="tutupDetailIntervensi()">✕ Tutup</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    await muatDataBantuan();
    const records = ambilBantuanUntukDesa_(namaDesa, kecamatan);

    const body = document.getElementById("detailIntervensiBody");
    if(!body) return; // panel sudah keburu ditutup user

    if(!records.length){
        body.innerHTML = `<div class="popup-info">Belum ada data bantuan tercatat untuk desa ini.</div>`;
        return;
    }

    // kelompokkan: OPD -> Program -> {tahun[], totalPenerima}
    const perOpd = {};
    records.forEach(r => {
        const opd = r.opd || "Lainnya";
        const program = r.program || "(tanpa nama program)";
        const jml = parseFloat(r.jumlah_penerima) || 0;

        if(!perOpd[opd]) perOpd[opd] = {};
        if(!perOpd[opd][program]) perOpd[opd][program] = { tahun: [], totalPenerima: 0 };

        perOpd[opd][program].tahun.push(r.tahun);
        perOpd[opd][program].totalPenerima += jml;
    });

    body.innerHTML = Object.keys(perOpd).map(opd => `
        <div class="intervensi-opd-card">
            <div class="intervensi-opd-title">🏛 ${opd}</div>
            ${Object.keys(perOpd[opd]).map(program => {
                const info = perOpd[opd][program];
                const tahunUnik = Array.from(new Set(info.tahun.filter(t => t !== "" && t != null))).sort();
                return `
                    <div class="intervensi-program-row">
                        <div class="intervensi-program-name">${program} — ${info.totalPenerima.toLocaleString('id-ID')} penerima</div>
                        ${tahunUnik.length ? `<div class="intervensi-program-tahun">Tahun: ${tahunUnik.join(", ")}</div>` : ""}
                    </div>
                `;
            }).join("")}
        </div>
    `).join("");
}

function tutupDetailIntervensi(){
    const panel = document.getElementById("detailIntervensiPanel");
    if(panel) panel.remove();
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
        z-index:10000; background:#fff; border-radius:10px;
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
        z-index:10000; background:#fff; border-radius:10px;
        box-shadow:0 4px 24px rgba(0,0,0,0.25);
        padding:16px 20px; width:380px; max-width:92vw; max-height:88vh;
        overflow-y:auto;
    `;

    wrapper.innerHTML = `
        <div class="popup-form">
            <div class="popup-title">📥 Import SHP</div>
            <div class="popup-info">${fileName} — ${jumlahFitur} fitur terbaca</div>
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

    ddl.addEventListener("change", function(){
        search.value = ddl.value;
        ddl.classList.remove("show");
        isiOtomatisDariMaster(ddl.value);
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
        d.addEventListener("change", function(){
            s.value = d.value;
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
    btn.innerHTML = "⏳ Mengimport...";

    const features = importState.geojson.features.map(f => ({
        attributes: f.properties || {},
        geometry: f.geometry
    }));

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

        tutupPreviewShp();

        const masterBaru = masterLayer.find(item => item.layer === layerNama);

        muatBulkLayer(resp.sheet_name, layerNama, masterBaru).then(() => {

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
}

async function init(){
 await loadMasterLayer();
 await loadDataAwal();
}
init().then(() => {
    populateKabupatenDashboardSelector_();
    refreshDashboardKabupaten();
});
window.refreshLayerData = refreshLayerData;
// refresh tiap 5 detik
setInterval(refreshLayerData,5000);

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
    wrapper.style.cssText = `
        position:fixed; top:90px; right:16px; width:260px; max-height:calc(100vh - 100px);
        overflow-y:auto; background:#fff; border-radius:10px;
        box-shadow:0 5px 20px rgba(0,0,0,.25); z-index:998;
        font-family:Segoe UI,sans-serif; padding:14px;
    `;
    wrapper.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:8px;">📊 Dashboard Kabupaten</div>
        <label style="font-size:11px; color:#888;">Sumber data kemiskinan (pilih layer):</label>
        <select id="kabupatenDashboardLayer" class="popup-input" style="margin-bottom:8px;"></select>
        <div id="kabupatenDashboardBody">
            <div class="popup-info" style="font-size:12px;">Memuat...</div>
        </div>
    `;
    document.body.appendChild(wrapper);
})();

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

async function refreshDashboardKabupaten(){
    const body = document.getElementById("kabupatenDashboardBody");
    if(!body) return;

    const layerName = localStorage.getItem("wgis_dashboard_layer");
    const master = masterLayer.find(m => m.layer === layerName);

    if(!master){
        body.innerHTML = `<div class="popup-info" style="font-size:12px;">Pilih layer sumber data dulu.</div>`;
        return;
    }

    body.innerHTML = `<div class="popup-info" style="font-size:12px;">Memuat data ${layerName}...</div>`;

    // rekap kabupaten butuh SEMUA fitur layer ini ke-load (bukan cuma
    // yang lagi dicentang ON) -- ini SATU-satunya tempat yang sengaja
    // maksa full-load 1 layer, karena memang butuh total keseluruhan.
    // Tetap sekali per sesi (dicache shpLoadedLayers), bukan polling.
    if(!shpLoadedLayers.has(layerName)){
        await muatBulkLayer(master.sheet_name, layerName, master);
    }

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

    await muatDataBantuan();
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
                <div class="ringkasan-card-label">${labelKolom_(layerName, donutCfg.subset)} (Se-Mabar)</div>
            </div>
        </div>
    ` : `<div class="popup-info" style="font-size:12px;">Atur dulu "Grafik Komposisi (Donut)" di panel 🎨 Style layer ini biar rekap kemiskinan bisa dihitung.</div>`;

    const bantuanHtml = opdLabels.length ? `
        <div style="font-weight:600; font-size:12px; margin:8px 0 4px;">Bantuan per OPD (Se-Mabar)</div>
        <canvas id="kabupatenBantuanChart" height="160"></canvas>
    ` : `<div class="popup-info" style="font-size:12px;">Belum ada data bantuan tercatat.</div>`;

    body.innerHTML = statHtml + bantuanHtml;

    if(opdLabels.length){
        try{ await loadScriptSekali_(CHARTJS_CDN); }catch(e){ return; }
        new Chart(document.getElementById("kabupatenBantuanChart"), {
            type: "bar",
            data: {
                labels: opdLabels,
                datasets: [{ data: opdLabels.map(l => perOpd[l]), backgroundColor: "#1976d2", borderRadius: 4 }]
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