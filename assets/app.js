const SUPABASE_URL="https://sveznszhmcwuitfsalst.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_fNsUvbKBp-zfIhokHqfPtg_OeHGPiVK";
const PROJECT_ID="hudut";
const EDIT_PASSWORD="aliaydın";

const STAGES_DEFAULT={
 "5":{name:"5. Etap",length:16000,absStartKm:"378+000"},
 "6":{name:"6. Etap",length:16700,absStartKm:"395+000"},
 "7":{name:"7. Etap",length:16000,absStartKm:"412+000"},
 "8":{name:"8. Etap",length:16000,absStartKm:"428+000"}
};
const WORKS=["Kazı İmalatı","Alttemel İmalatı","Temel İmalatı","MBD İmalatı","Profil İmalatı","Jiletli Tel İmalatı","Sathi Kaplama"];
const COLORS={"Kazı İmalatı":"#ffc928","Alttemel İmalatı":"#4aa3ff","Temel İmalatı":"#6bd32c","Profil İmalatı":"#9b72ff","Jiletli Tel İmalatı":"#ff2a36","MBD İmalatı":"#ff7417","Sathi Kaplama":"#22c55e"};
const DEFAULT_TOTALS={"Kazı İmalatı":[16000,"m³"],"Alttemel İmalatı":[16000,"m"],"Temel İmalatı":[16000,"m"],"MBD İmalatı":[3000,"adet"],"Profil İmalatı":[3300,"adet"],"Jiletli Tel İmalatı":[32000,"adet"],"Sathi Kaplama":[16000,"m"]};

let supabaseClient=null, cloudReady=false;
let currentStage="production";
let editUnlocked=false;
let stageInfo=JSON.parse(JSON.stringify(STAGES_DEFAULT));
let map, routeLayer, photoLayer, selectedKmPointLayer;
let productionPage=1;
const PRODUCTION_PAGE_SIZE=10;

function $(id){return document.getElementById(id)}
function fmt(n){return Number(n||0).toLocaleString("tr-TR")}
function pct(a,b){return b?Math.min(100,Math.round(Number(a||0)/Number(b||1)*100)):0}
function todayIso(){return new Date().toISOString().slice(0,10)}
function dateLabel(iso){return new Date(iso+"T12:00:00").toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric"})}
function formatDateTime(ts){if(!ts)return"Henüz yok";return new Date(ts).toLocaleString("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
function showToast(msg){if(!window.toast)return;toast.textContent=msg;toast.classList.add("active");setTimeout(()=>toast.classList.remove("active"),2200)}
function showCloudError(msg){
  console.error(msg);
  if(window.cloudErrorBox){
    cloudErrorBox.style.display="block";
    cloudErrorBox.textContent="Bulut kayıt hatası:\n"+msg;
  }
}
function clearCloudError(){
  if(window.cloudErrorBox){
    cloudErrorBox.style.display="none";
    cloudErrorBox.textContent="";
  }
}
function kmToNumber(km){const s=String(km||"").trim().replace(",",".");if(s.includes("+")){const[a,b]=s.split("+");return Number(a)*1000+Number(b)}return Number(s)||0}
function normalizeKm(km){const n=kmToNumber(km);if(!n)return String(km||"").replace(/\s/g,"");const a=Math.floor(n/1000),b=Math.round(n%1000).toString().padStart(3,"0");return `${a}+${b}`}
function relativeToAbsoluteKm(km,stageId=($("photoStage")?.value||currentStage)){const s=stageInfo[stageId]||STAGES_DEFAULT[stageId];const absStart=kmToNumber(s?.absStartKm||"0+000");const abs=absStart+kmToNumber(km);return `${Math.floor(abs/1000)}+${String(Math.round(abs%1000)).padStart(3,"0")}`}
function extractKmFromName(name){const m=String(name||"").match(/(\d{1,3})\s*\+\s*(\d{1,3})/);return m?`${Number(m[1])}+${String(Number(m[2])).padStart(3,"0")}`:""}
function getStage(id=currentStage){return stageInfo[id]||STAGES_DEFAULT[id]}

async function initSupabase(){
  if(window.supabase){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    cloudReady=true;
    try{
      const {error}=await supabaseClient.from("settings").select("id").limit(1);
      if(error){
        cloudReady=false;
        showCloudError(error.message || JSON.stringify(error));
      }
    }catch(e){
      cloudReady=false;
      showCloudError(e.message || String(e));
    }
  }
  updateCloudStatus();
}
function updateCloudStatus(){
  if(!window.cloudStatus)return;
  cloudStatus.textContent=cloudReady?"☁️ Bulut bağlı":"☁️ Bulut bağlantı yok";
  cloudStatus.classList.toggle("unlocked",cloudReady);
}
async function sbSelect(table, filters={}){
  let q=supabaseClient.from(table).select("*").eq("project_id",PROJECT_ID);
  Object.entries(filters).forEach(([k,v])=>q=q.eq(k,v));
  const {data,error}=await q;
  if(error){
    showCloudError(table+" tablosu okunamadı: "+(error.message || JSON.stringify(error)));
    throw error;
  }
  return data||[];
}
async function sbUpsert(table,row){
  clearCloudError();
  const payload={...row,project_id:PROJECT_ID,updated_at:new Date().toISOString()};
  const {error}=await supabaseClient.from(table).upsert(payload,{onConflict:"id"});
  if(error){
    showCloudError(table+" tablosuna kayıt yapılamadı: "+(error.message || JSON.stringify(error)));
    throw error;
  }
}
async function sbDelete(table,id){
  const {error}=await supabaseClient.from(table).delete().eq("project_id",PROJECT_ID).eq("id",id);
  if(error){console.error(error);throw error}
}
async function sbClear(table){
  const rows=await sbSelect(table);
  for(const r of rows) await sbDelete(table,r.id);
}

async function getSetting(id){
  const rows=await sbSelect("settings",{id});
  const r=rows[0];
  return r?{id:r.id,value:r.value_json??r.value_text}:undefined;
}
async function setSetting(id,value){
  await sbUpsert("settings",{id,value_json:typeof value==="object"?value:null,value_text:typeof value==="object"?null:String(value)});
}
async function loadStageInfo(){
  const s=await getSetting("stage_info");
  stageInfo=s?.value||JSON.parse(JSON.stringify(STAGES_DEFAULT));
  // ensure defaults remain
  Object.keys(STAGES_DEFAULT).forEach(k=>stageInfo[k]={...STAGES_DEFAULT[k],...(stageInfo[k]||{})});
}
async function saveStageInfo(){await setSetting("stage_info",stageInfo)}

async function getProgress(stageId=currentStage){
  const rows=await sbSelect("progress",{stage_id:stageId});
  return rows.map(r=>({id:r.id,stageId:r.stage_id,workType:r.work_type,total:Number(r.total||0),done:Number(r.done||0),unit:r.unit}));
}
async function saveProgressRow(row){
  await sbUpsert("progress",{id:row.id,stage_id:row.stageId,work_type:row.workType,total:row.total,done:row.done,unit:row.unit});
}
async function getPhotos(stageId=currentStage){
  const rows=await sbSelect("photos",{stage_id:stageId});
  return rows.map(r=>({id:r.id,stageId:r.stage_id,km:r.km,workType:r.work_type,note:r.note||"",pointId:r.point_id||"",pointName:r.point_name||"",pointLat:r.point_lat,pointLng:r.point_lng,imageUrl:r.image_url||"",createdAt:new Date(r.created_at||Date.now()).getTime()})).sort((a,b)=>b.createdAt-a.createdAt);
}
async function savePhotoRow(row){
  let imageUrl=row.imageUrl||"";
  if(row.blob){
    const path=`${PROJECT_ID}/${row.stageId}/${row.id}.jpg`;
    const {error:uploadError}=await supabaseClient.storage.from("site-photos").upload(path,row.blob,{upsert:true,contentType:"image/jpeg"});
    if(uploadError){console.error(uploadError);throw uploadError}
    const {data}=supabaseClient.storage.from("site-photos").getPublicUrl(path);
    imageUrl=data.publicUrl;
  }
  await sbUpsert("photos",{id:row.id,stage_id:row.stageId,km:row.km,work_type:row.workType,note:row.note||"",point_id:row.pointId||"",point_name:row.pointName||"",point_lat:row.pointLat,point_lng:row.pointLng,image_url:imageUrl,created_at:new Date(row.createdAt||Date.now()).toISOString()});
}
async function getStagePhotoCount(stageId=currentStage){return (await getPhotos(stageId)).length}

async function getProduction(){
  const rows=await sbSelect("production");
  return rows.map(r=>({id:r.id,date:r.date,count:Number(r.count||0),note:r.note||"",createdAt:new Date(r.created_at||Date.now()).getTime()})).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
async function saveProductionRow(row){await sbUpsert("production",{id:row.id,date:row.date,count:row.count,note:row.note||"",created_at:new Date(row.createdAt||Date.now()).toISOString()})}
async function deleteProductionRow(id){await sbDelete("production",id)}
async function clearProductionRows(){await sbClear("production")}

async function compressImage(file,maxW=1600,q=.82){
  const bmp=await createImageBitmap(file);
  const scale=Math.min(1,maxW/bmp.width);
  const w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale);
  const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(bmp,0,0,w,h);
  return new Promise(r=>c.toBlob(b=>r(b),"image/jpeg",q));
}

function refreshGlobalEditUi(){
  if(window.globalEditBtn){globalEditBtn.classList.toggle("unlocked",editUnlocked);globalEditBtn.textContent=editUnlocked?"✏️":"🔑"}
  if(window.topEditIndicator){topEditIndicator.classList.toggle("unlocked",editUnlocked);topEditIndicator.textContent=editUnlocked?"✏️ Düzenleme açık":"🔒 Görüntüleme modu"}
  if(window.globalEditState)globalEditState.textContent=editUnlocked?"Düzenleme kilidi açık.":"Düzenleme kilitli.";
  if(window.stageInfoForm)stageInfoForm.classList.toggle("locked",!editUnlocked);
  if(window.saveAllProgressBtn?.parentElement)saveAllProgressBtn.parentElement.classList.toggle("locked",!editUnlocked);
}
function updateEditAuthUi(){refreshGlobalEditUi(); if(window.editStatus){editStatus.className=editUnlocked?"unlockBadge":"lockBadge";editStatus.textContent=editUnlocked?"Miktar güncelleme açık":"Miktar güncelleme kilitli"}}
function updateProdAuthUi(){refreshGlobalEditUi(); if(window.prodEditStatus){prodEditStatus.className=editUnlocked?"unlockBadge":"lockBadge";prodEditStatus.textContent=editUnlocked?"Üretim girişi açık":"Üretim girişi kilitli"}}

function initMap(){
  map=L.map("map",{preferCanvas:true}).setView([38,44.2],11);
  const city=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"});
  const satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Tiles &copy; Esri"});
  const topo=L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"&copy; OpenTopoMap"});
  city.addTo(map); L.control.layers({"Şehir Haritası":city,"Uydu Görüntüsü":satellite,"Topo / Arazi":topo},{},{collapsed:false,position:"topright"}).addTo(map);
  photoLayer=L.layerGroup().addTo(map);
}
function initTabs(){
  stageTabs.innerHTML="";photoStage.innerHTML="";
  const prodBtn=document.createElement("button");prodBtn.textContent="🏭 MBD ÜRETİM";prodBtn.className=currentStage==="production"?"productionTab active":"productionTab";prodBtn.onclick=()=>{currentStage="production";render()};stageTabs.appendChild(prodBtn);
  Object.entries(stageInfo).forEach(([id,s])=>{const b=document.createElement("button");b.textContent="▱ "+s.name.toUpperCase();b.className=id===currentStage?"active":"";b.onclick=()=>{currentStage=id;photoStage.value=id;render()};stageTabs.appendChild(b);const o=document.createElement("option");o.value=id;o.textContent=s.name;photoStage.appendChild(o)});
  if(currentStage!=="production")photoStage.value=currentStage;
  workType.innerHTML=WORKS.map(w=>`<option>${w}</option>`).join("");
}
function featureColor(f){return f.properties?.color||"#ff101f"}
function featureWeight(f){return Math.max(2,Math.min(7,Number(f.properties?.width||3)))}
function renderRoute(){
  if(routeLayer)routeLayer.remove(); if(selectedKmPointLayer)selectedKmPointLayer.remove(); photoLayer.clearLayers();
  const gj=window.HUDUT_ROUTES?.[currentStage]; let lines=0,points=0,km=0;
  if(!gj){mapStatus.textContent="Güzergâh yok";return}
  routeLayer=L.geoJSON(gj,{style:f=>({color:featureColor(f),weight:featureWeight(f),opacity:.95}),pointToLayer:(f,ll)=>{points++;const isKm=!!f.properties?.isKm;if(isKm)km++;const col=featureColor(f);const m=L.circleMarker(ll,{radius:isKm?4:3,color:col,fillColor:col,fillOpacity:.95,weight:1});if(isKm)m.bindTooltip(f.properties.name,{permanent:showKmLabels.checked,direction:"right",offset:[6,0],className:"km-label"});return m},onEachFeature:(f,l)=>{if(f.geometry.type==="LineString")lines++;l.bindPopup(`<strong>${getStage().name}</strong><br>${f.properties?.name||""}`)}}).addTo(map);
  try{map.fitBounds(routeLayer.getBounds(),{padding:[25,25]})}catch(e){}
  mapStatus.textContent=`Renkli güzergâh: ${lines} hat / ${points} nokta / ${km} km`;
  renderPhotoMarkers();
}
function getKmPointFeatures(stageId=currentStage){
  const gj=window.HUDUT_ROUTES?.[stageId]; if(!gj)return[];
  return gj.features.map((f,i)=>({f,i})).filter(x=>x.f.geometry?.type==="Point"&&x.f.properties?.isKm).map(x=>{const c=x.f.geometry.coordinates,name=x.f.properties.name||"";return{id:String(x.i),name,km:extractKmFromName(name),latlng:L.latLng(c[1],c[0]),color:x.f.properties.color||"#ff101f"}});
}
function updateKmPointSelect(){
  const inputKm=normalizeKm(km.value), inputAbsKm=relativeToAbsoluteKm(km.value,photoStage.value);
  const matches=getKmPointFeatures(photoStage.value).filter(p=>p.km===inputKm||p.km===inputAbsKm);
  kmPointSelect.innerHTML="";
  if(!km.value.trim()){kmPointSelect.innerHTML=`<option value="">Önce km gir</option>`;highlightSelectedPoint(null);return}
  if(!matches.length){kmPointSelect.innerHTML=`<option value="">KMZ'de aynı km noktası bulunamadı, yaklaşık konum kullanılacak</option>`;highlightSelectedPoint(null);return}
  matches.forEach((p,idx)=>{const opt=document.createElement("option");opt.value=p.id;opt.textContent=matches.length>1?`${p.name} — seçenek ${idx+1}`:p.name;kmPointSelect.appendChild(opt)});
  highlightSelectedPoint(kmPointSelect.value);
}
function highlightSelectedPoint(pointId){if(selectedKmPointLayer)selectedKmPointLayer.remove();if(!pointId)return;const p=getKmPointFeatures(photoStage.value).find(x=>x.id===pointId);if(!p)return;selectedKmPointLayer=L.circleMarker(p.latlng,{radius:15,color:"#fff",fillColor:"#ff101f",fillOpacity:.45,weight:4}).addTo(map).bindTooltip("Fotoğraf buraya bağlanacak",{permanent:true,direction:"top",className:"kmMarkerLabel"});map.panTo(p.latlng)}
function getRoutePoints(){let pts=[];if(routeLayer)routeLayer.eachLayer(l=>{if(l.getLatLngs)pts=pts.concat(l.getLatLngs().flat(Infinity).filter(x=>x&&typeof x.lat==="number"))});return pts}
function approximatePointForKm(kmVal){const s=getStage();let t=kmToNumber(kmVal)/Math.max(1,Number(s.length||1));t=Math.max(0,Math.min(1,t));const pts=getRoutePoints();return pts.length?pts[Math.min(pts.length-1,Math.round(t*(pts.length-1)))]:map.getCenter()}
function pointForPhoto(p){if(p.pointLat&&p.pointLng)return L.latLng(p.pointLat,p.pointLng);const match=getKmPointFeatures(p.stageId||currentStage).find(x=>x.km===normalizeKm(p.km)||x.km===relativeToAbsoluteKm(p.km,p.stageId||currentStage));return match?match.latlng:approximatePointForKm(p.km)}
async function renderPhotoMarkers(){
  if(!showPhotos.checked)return;
  const photos=await getPhotos(); const groups=new Map();
  photos.forEach(p=>{const ll=pointForPhoto(p);const key=p.pointId?`point-${p.pointId}`:`${p.km}-${ll.lat.toFixed(6)}-${ll.lng.toFixed(6)}`;if(!groups.has(key))groups.set(key,{latlng:ll,km:p.km,photos:[]});groups.get(key).photos.push(p)});
  groups.forEach(group=>{const first=group.photos[0],col=COLORS[first.workType]||"#ff101f",count=group.photos.length;const imgs=group.photos.map(p=>`<img class="popupImg" data-url="${p.imageUrl}" data-text="${p.km} — ${p.workType}" src="${p.imageUrl}" title="${p.workType} - ${p.note||""}">`).join("");const workList=group.photos.map(p=>`<div style="margin:4px 0;border-bottom:1px solid #333;padding-bottom:4px"><strong style="color:${COLORS[p.workType]||"#ff101f"}">●</strong> ${p.workType}<br><small>${p.note||""}</small></div>`).join("");L.circleMarker(group.latlng,{radius:count>1?14:10,color:col,fillColor:col,fillOpacity:.95,weight:2}).addTo(photoLayer).bindPopup(`<div class="popupGallery"><strong>${group.km}</strong><span class="popupCount">${count} fotoğraf</span>${workList}<div class="popupGalleryGrid">${imgs}</div></div>`)});
}
function lengthToKmText(length){const n=Number(length||0);return `${Math.floor(n/1000)}+${String(n%1000).padStart(3,"0")}`}
function updateStageInfoForm(){if(currentStage==="production")return;const s=getStage();if(window.editLength)editLength.value=s.length||0;const locked=!editUnlocked;if(window.stageInfoForm)stageInfoForm.classList.toggle("locked",locked);if(window.editLength)editLength.disabled=locked;if(window.saveStageInfoBtn)saveStageInfoBtn.disabled=locked;if(window.stageInfoEditStatus){stageInfoEditStatus.className=editUnlocked?"unlockBadge":"lockBadge";stageInfoEditStatus.textContent=editUnlocked?"Genel bilgi düzenleme açık":"Genel bilgi düzenleme kilitli"}}

async function renderWorks(){
  updateEditAuthUi();
  const progress=await getProgress();
  const updateRow=await getSetting(`stage_update_${currentStage}`);
  const photoCount=await getStagePhotoCount(currentStage);
  worksTable.innerHTML=""; let sum=0;
  WORKS.forEach(w=>{const row=progress.find(x=>x.workType===w);const[defTotal,defUnit]=DEFAULT_TOTALS[w];const stageLength=getStage()?.length||defTotal;const dynamicTotal=["Alttemel İmalatı","Temel İmalatı","Sathi Kaplama"].includes(w)?stageLength:defTotal;const total=row?.total??dynamicTotal;const done=row?.done??0;const unit=row?.unit??defUnit;const p=pct(done,total);sum+=p;const col=COLORS[w];const inputDisabled=editUnlocked?"":"disabled",inputClass=editUnlocked?"":"lockedInput";worksTable.innerHTML+=`<tr><td><strong style="color:${col}">●</strong> ${w}</td><td><input class="${inputClass}" type="number" value="${total}" data-total="${w}" ${inputDisabled}> ${unit}</td><td><input class="${inputClass}" type="number" value="${done}" data-work="${w}" ${inputDisabled}> ${unit}</td><td>${fmt(Math.max(0,total-done))} ${unit}</td><td><span class="progressMini"><span style="width:${p}%;background:${col}"></span></span><strong style="color:${col}">%${p}</strong></td></tr>`});
  if(window.saveAllProgressBtn)saveAllProgressBtn.disabled=!editUnlocked;
  const s=getStage();stageTitle.textContent=s.name.toUpperCase();mapStageName.textContent=s.name.toUpperCase();
  stageMeta.innerHTML=`<div class="stat"><small>Toplam Uzunluk</small><strong>${fmt(s.length)} m</strong></div><div class="stat"><small>Genel İlerleme</small><strong>%${Math.round(sum/WORKS.length)}</strong></div><div class="stat"><small>Fotoğraf Sayısı</small><strong>${fmt(photoCount)} adet</strong></div><div class="stat"><small>Son Güncelleme</small><strong>${formatDateTime(updateRow?.value)}</strong></div>`;
}
function openPreview(url,text){previewImage.src=url;previewText.innerHTML=text;previewModal.classList.add("active")}
function closePreviewFn(){previewModal.classList.remove("active");previewImage.src=""}
async function renderGallery(){
  const q=(photoSearch.value||"").toLowerCase();const photos=(await getPhotos()).filter(p=>p.km.toLowerCase().includes(q)||p.workType.toLowerCase().includes(q)||(p.note||"").toLowerCase().includes(q));
  if(!photos.length){photoList.innerHTML=`<p class="hint">Bu etap için henüz fotoğraf kaydı yok.</p>`;return}
  photoList.innerHTML="";photos.forEach(p=>{const col=COLORS[p.workType]||"#ff101f";const card=document.createElement("article");card.className="photoCard";card.innerHTML=`<img src="${p.imageUrl}"><div class="body"><span class="badge">${p.km}</span><p><strong style="color:${col}">●</strong> ${p.workType}</p><p>${p.note||"Açıklama yok"}</p><p>${new Date(p.createdAt).toLocaleString("tr-TR")}</p></div>`;card.querySelector("img").onclick=()=>openPreview(p.imageUrl,`<strong>${p.km}</strong> — ${p.workType}<br>${p.note||""}`);photoList.appendChild(card)});
}
function weekStart(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x}
async function renderProduction(){
  updateProdAuthUi(); if(!prodDate.value)prodDate.value=todayIso();
  const rows=await getProduction(), sortedDesc=[...rows].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const total=rows.reduce((s,r)=>s+Number(r.count||0),0), today=todayIso(), todayCount=rows.filter(r=>r.date===today).reduce((s,r)=>s+Number(r.count||0),0);
  const now=new Date(), ws=weekStart(now), month=String(now.getMonth()+1).padStart(2,"0"),year=String(now.getFullYear());
  const weekCount=rows.filter(r=>new Date(r.date+"T12:00:00")>=ws).reduce((s,r)=>s+Number(r.count||0),0);
  const monthCount=rows.filter(r=>String(r.date).startsWith(`${year}-${month}`)).reduce((s,r)=>s+Number(r.count||0),0);
  productionStats.innerHTML=`<div class="stat"><small>Bugün Üretilen</small><strong>${fmt(todayCount)} adet</strong></div><div class="stat"><small>Bu Hafta</small><strong>${fmt(weekCount)} adet</strong></div><div class="stat"><small>Bu Ay</small><strong>${fmt(monthCount)} adet</strong></div><div class="stat"><small>Toplam Üretilen</small><strong>${fmt(total)} adet</strong></div>`;
  const last=sortedDesc.slice(0,10).reverse(), max=Math.max(1,...last.map(r=>Number(r.count||0)));
  productionChart.innerHTML=last.length?last.map(r=>`<div class="barRow"><span>${dateLabel(r.date)}</span><div class="barTrack"><div class="barFill" style="width:${Math.round(Number(r.count||0)/max*100)}%"></div></div><strong>${fmt(r.count)}</strong></div>`).join(""):`<p class="hint">Henüz üretim kaydı yok.</p>`;
  let cumulative=0,cumMap={};rows.forEach(r=>{cumulative+=Number(r.count||0);cumMap[r.id]=cumulative});
  const totalPages=Math.max(1,Math.ceil(sortedDesc.length/PRODUCTION_PAGE_SIZE)); if(productionPage>totalPages)productionPage=totalPages;if(productionPage<1)productionPage=1;
  const pageRows=sortedDesc.slice((productionPage-1)*PRODUCTION_PAGE_SIZE,(productionPage-1)*PRODUCTION_PAGE_SIZE+PRODUCTION_PAGE_SIZE);
  productionTable.innerHTML=pageRows.length?pageRows.map(r=>`<tr><td>${dateLabel(r.date)}</td><td><strong>${fmt(r.count)} adet</strong></td><td>${fmt(cumMap[r.id])} adet</td><td>${r.note||""}</td><td class="actionsCell"><button class="smallBtn" data-edit-prod="${r.id}" ${editUnlocked?"":"disabled"}>Düzenle</button><button class="smallBtn danger" data-del-prod="${r.id}" ${editUnlocked?"":"disabled"}>Sil</button></td></tr>`).join(""):`<tr><td colspan="5">Henüz üretim kaydı yok.</td></tr>`;
  productionPageInfo.textContent=sortedDesc.length?`${fmt(sortedDesc.length)} kayıt | Sayfa ${productionPage} / ${totalPages}`:`Kayıt yok`;productionPrevPage.disabled=productionPage<=1;productionNextPage.disabled=productionPage>=totalPages;
  productionTable.querySelectorAll("[data-edit-prod]").forEach(btn=>btn.onclick=async()=>{if(!editUnlocked){alert("Üretim kaydı düzenlemek için şifre girmen gerekiyor.");return}const r=rows.find(x=>x.id===btn.dataset.editProd);if(!r)return;prodDate.value=r.date;prodCount.value=r.count;prodNote.value=r.note||"";productionForm.dataset.editing=r.id});
  productionTable.querySelectorAll("[data-del-prod]").forEach(btn=>btn.onclick=async()=>{if(!editUnlocked){alert("Silmek için şifre girmen gerekiyor.");return}if(!confirm("Bu üretim kaydı silinsin mi?"))return;await deleteProductionRow(btn.dataset.delProd);renderProduction()});
  const note=await getSetting("production_note"); productionGeneralNote.value=note?.value||"";
}
async function render(){
  initTabs();
  if(currentStage==="production"){document.body.classList.add("production-mode");await renderProduction();return}
  document.body.classList.remove("production-mode");
  await renderWorks();updateStageInfoForm();renderRoute();await renderGallery();updateKmPointSelect();
}

// Events
photoStage.onchange=()=>{currentStage=photoStage.value;render()}
km.oninput=updateKmPointSelect; kmPointSelect.onchange=()=>highlightSelectedPoint(kmPointSelect.value);
photoSearch.oninput=renderGallery; showKmLabels.onchange=render; showPhotos.onchange=render;
productionPrevPage.onclick=()=>{productionPage=Math.max(1,productionPage-1);renderProduction()}
productionNextPage.onclick=()=>{productionPage++;renderProduction()}

if(window.globalEditBtn){globalEditBtn.onclick=()=>{globalEditModal.classList.add("active");refreshGlobalEditUi();setTimeout(()=>globalEditPassword.focus(),50)}}
if(window.globalCloseBtn)globalCloseBtn.onclick=()=>globalEditModal.classList.remove("active");
if(window.globalEditModal)globalEditModal.onclick=e=>{if(e.target===globalEditModal)globalEditModal.classList.remove("active")}
if(window.globalUnlockBtn)globalUnlockBtn.onclick=()=>{if(globalEditPassword.value===EDIT_PASSWORD){editUnlocked=true;globalEditPassword.value="";globalEditModal.classList.remove("active");render();showToast("✅ Düzenleme kilidi açıldı.")}else{globalEditState.textContent="Şifre yanlış."}}
if(window.globalLockBtn)globalLockBtn.onclick=()=>{editUnlocked=false;globalEditPassword.value="";globalEditModal.classList.remove("active");render();showToast("🔒 Düzenleme kilitlendi.")}
if(window.globalEditPassword)globalEditPassword.addEventListener("keydown",e=>{if(e.key==="Enter")globalUnlockBtn.click()});
unlockBtn.onclick=()=>{if(editPassword.value===EDIT_PASSWORD){editUnlocked=true;editPassword.value="";render()}else alert("Şifre yanlış.")}
lockBtn.onclick=()=>{editUnlocked=false;editPassword.value="";render()}
prodUnlockBtn.onclick=()=>{if(prodPassword.value===EDIT_PASSWORD){editUnlocked=true;prodPassword.value="";render()}else alert("Şifre yanlış.")}
prodLockBtn.onclick=()=>{editUnlocked=false;prodPassword.value="";render()}

stageInfoForm.onsubmit=async e=>{
  e.preventDefault();
  if(!editUnlocked){alert("Genel bilgileri düzenlemek için şifreyle kilidi açmalısın.");return}
  if(currentStage==="production")return;
  try{
    const length=Number(editLength.value||0);
    stageInfo[currentStage]={...getStage(),length};
    await saveStageInfo();
    await setSetting(`stage_update_${currentStage}`,Date.now());
    showToast("✅ Genel bilgiler kaydedildi.");
    await render();
  }catch(err){
    alert("Kayıt başarısız: "+(err.message || err));
  }
}
if(window.saveAllProgressBtn)saveAllProgressBtn.onclick=async()=>{
  if(!editUnlocked){alert("Miktar güncellemek için önce şifreyle kilidi açmalısın.");return}
  try{
    for(const w of WORKS){
      const[,unit]=DEFAULT_TOTALS[w];
      const total=Number(worksTable.querySelector(`input[data-total="${w}"]`)?.value||0);
      const done=Number(worksTable.querySelector(`input[data-work="${w}"]`)?.value||0);
      await saveProgressRow({id:currentStage+"-"+w,stageId:currentStage,workType:w,total,done,unit});
    }
    await setSetting(`stage_update_${currentStage}`,Date.now());
    showToast("✅ Değişiklikler kaydedildi.");
    await render();
  }catch(err){
    alert("Kayıt başarısız: "+(err.message || err));
  }
}
resetBtn.onclick=async()=>{if(!editUnlocked){alert("Verileri sıfırlamak için önce şifreyle kilidi açmalısın.");return}alert("Bulut sürümde toplu sıfırlama kapalıdır. Gerekirse tek tek düzenleyin.")}
photoForm.onsubmit=async e=>{e.preventDefault();savePhotoBtn.disabled=true;savePhotoBtn.textContent="Kaydediliyor...";try{const blob=await compressImage(photo.files[0]);const chosen=getKmPointFeatures(photoStage.value).find(x=>x.id===kmPointSelect.value);await savePhotoRow({id:Date.now()+"-"+Math.random().toString(16).slice(2),stageId:photoStage.value,km:normalizeKm(km.value.trim()),workType:workType.value,note:note.value.trim(),blob,pointId:chosen?.id||"",pointName:chosen?.name||"",pointLat:chosen?.latlng.lat||null,pointLng:chosen?.latlng.lng||null,createdAt:Date.now()});currentStage=photoStage.value;e.target.reset();await render();location.hash="#photoSection";showToast("✅ Fotoğraf yüklendi.")}catch(err){alert(err.message)}finally{savePhotoBtn.disabled=false;savePhotoBtn.textContent="Fotoğrafı Kaydet"}}
productionForm.onsubmit=async e=>{e.preventDefault();if(!editUnlocked){alert("Üretim girişi için önce şifreyle kilidi açmalısın.");return}const id=productionForm.dataset.editing||prodDate.value+"-"+Date.now();await saveProductionRow({id,date:prodDate.value,count:Number(prodCount.value||0),note:prodNote.value.trim(),createdAt:Date.now()});delete productionForm.dataset.editing;productionForm.reset();prodDate.value=todayIso();productionPage=1;showToast("✅ Üretim kaydedildi.");renderProduction()}
saveProductionNote.onclick=async()=>{if(!editUnlocked){alert("Notu kaydetmek için önce şifreyle kilidi açmalısın.");return}await setSetting("production_note",productionGeneralNote.value);showToast("✅ Not kaydedildi.")}
clearProductionBtn.onclick=async()=>{if(!editUnlocked){alert("Üretim kayıtlarını silmek için önce şifreyle kilidi açmalısın.");return}if(confirm("Tüm MBD üretim kayıtları silinsin mi?")){await clearProductionRows();renderProduction()}}
exportBtn.onclick=async()=>{const data={stage:currentStage==="production"?"production":getStage(),progress:currentStage==="production"?[]:await getProgress(),photos:currentStage==="production"?[]:await getPhotos(),production:await getProduction()};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=`hudut_verileri.json`;a.click()}
document.addEventListener("click",e=>{if(e.target.classList.contains("popupImg"))openPreview(e.target.dataset.url,e.target.dataset.text||"Harita fotoğrafı")});
closePreview.onclick=closePreviewFn;previewModal.onclick=e=>{if(e.target===previewModal)closePreviewFn()};
todayText.textContent=new Date().toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric",weekday:"long"});

(async()=>{try{await initSupabase();if(!cloudReady){updateCloudStatus();return}await loadStageInfo();initMap();render()}catch(e){showCloudError(e.message || String(e));alert("Bulut bağlantısı/kurulum hatası: "+(e.message || e))}})();
