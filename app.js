const STORAGE_KEY = 'miColombiaV02';
const GEOJSON_URL = 'https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/Colombia.geo.json';
let DATA = [];
let visited = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
let geoFeatures = [];
const $ = s => document.querySelector(s);
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const alias = {bogota:'bogotadc',santafedebogotadc:'bogotadc',archipielagodesanandresprovidenciaysantacatalina:'sanandresyprovidencia',sanandres:'sanandresyprovidencia',guajira:'laguajira',valle:'valledelcauca'};
const canonical = s => alias[norm(s)] || norm(s);
const fmt = n => new Intl.NumberFormat('es-CO').format(n);
const pct = x => (x*100).toLocaleString('es-CO',{maximumFractionDigits:1})+'%';

async function init(){
  DATA = await fetch('data/departamentos.json').then(r=>r.json());
  DATA.forEach(d=>d.key=norm(d.name));
  bindControls();
  render();
  await drawMap();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
}
function bindControls(){
  $('#search').addEventListener('input',renderList);
  $('#filter').addEventListener('change',renderList);
  $('#sort').addEventListener('change',renderList);
  $('#clear').addEventListener('click',()=>{if(confirm('¿Reiniciar todos los departamentos marcados?')){visited.clear();save();render();}});
  $('#exportBtn').addEventListener('click',exportProgress);
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify([...visited]));}
function toggle(key,value){key=canonical(key);value===undefined?(visited.has(key)?visited.delete(key):visited.add(key)):value?visited.add(key):visited.delete(key);save();render();}
function render(){
  const chosen=DATA.filter(d=>visited.has(d.key));
  const totalArea=DATA.reduce((s,d)=>s+d.area,0), totalPop=DATA.reduce((s,d)=>s+d.pop,0);
  const area=chosen.reduce((s,d)=>s+d.area,0)/totalArea, pop=chosen.reduce((s,d)=>s+d.pop,0)/totalPop, count=chosen.length/DATA.length;
  $('#count').textContent=`${chosen.length} de ${DATA.length}`;
  $('#remaining').textContent=chosen.length===DATA.length?'¡Completaste Colombia!':`${DATA.length-chosen.length} por conocer`;
  $('#countPct').textContent=pct(count); $('#countBar').style.width=`${count*100}%`;
  $('#areaPct').textContent=pct(area); $('#areaBar').style.width=`${area*100}%`;
  $('#popPct').textContent=pct(pop); $('#popBar').style.width=`${pop*100}%`;
  renderList(); renderRegions();
  d3.selectAll('.dept').attr('class',d=>`dept ${visited.has(d.__key)?'visited':'unvisited'}`);
}
function renderList(){
  const q=norm($('#search').value), f=$('#filter').value, sort=$('#sort').value;
  let rows=DATA.filter(d=>(!q||norm(d.name+d.capital+d.region).includes(q))&&(f==='all'||(f==='visited')===visited.has(d.key)));
  rows.sort((a,b)=>sort==='region'?a.region.localeCompare(b.region,'es')||a.name.localeCompare(b.name,'es'):sort==='area-desc'?b.area-a.area:sort==='pop-desc'?b.pop-a.pop:sort==='pending-first'?Number(visited.has(a.key))-Number(visited.has(b.key))||a.name.localeCompare(b.name,'es'):a.name.localeCompare(b.name,'es'));
  const list=$('#list'); list.innerHTML='';
  rows.forEach(d=>{const el=document.createElement('label');el.className=`item ${visited.has(d.key)?'is-visited':''}`;el.innerHTML=`<input type="checkbox" ${visited.has(d.key)?'checked':''}><div><div class="name">${d.name}</div><div class="meta">${d.region} · Capital: ${d.capital}<br>${fmt(d.area)} km² · ${fmt(d.pop)} habitantes</div><div class="links"><a href="${d.wiki}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedia</a><a href="${d.trip}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Tripadvisor</a></div></div>`;el.querySelector('input').addEventListener('change',e=>toggle(d.key,e.target.checked));list.appendChild(el);});
}
function renderRegions(){
  const root=$('#regions');root.innerHTML='';
  [...new Set(DATA.map(d=>d.region))].sort((a,b)=>a.localeCompare(b,'es')).forEach(region=>{const items=DATA.filter(d=>d.region===region), n=items.filter(d=>visited.has(d.key)).length, ratio=n/items.length;root.insertAdjacentHTML('beforeend',`<div class="region-row"><div><div class="region-name">${region}</div><div class="region-meta">${n} de ${items.length}</div></div><div class="region-track"><div class="region-fill" style="width:${ratio*100}%"></div></div><div class="region-pct">${pct(ratio)}</div></div>`);});
}
async function drawMap(){
  const geo=await d3.json(GEOJSON_URL);geo.features.forEach(f=>{const p=f.properties||{},raw=p.NOMBRE_DPT||p.DPTO_CNMBR||p.NOMBRE||p.name||p.NAME_1||Object.values(p).find(v=>typeof v==='string');f.__key=canonical(raw)});geoFeatures=geo.features;
  const box=$('#mapBox'),svg=d3.select('#map'),tip=$('#tip'),byKey=new Map(DATA.map(d=>[d.key,d]));
  function draw(){svg.selectAll('*').remove();const w=box.clientWidth,h=box.clientHeight,proj=d3.geoMercator().fitExtent([[20,20],[w-20,h-20]],geo),path=d3.geoPath(proj);svg.selectAll('path').data(geo.features).join('path').attr('d',path).attr('class',d=>`dept ${visited.has(d.__key)?'visited':'unvisited'}`).on('click',(e,d)=>toggle(d.__key)).on('mousemove',(e,d)=>{const x=byKey.get(d.__key);if(!x)return;tip.style.display='block';tip.style.left=Math.min(e.offsetX+12,w-230)+'px';tip.style.top=Math.min(e.offsetY+12,h-100)+'px';tip.innerHTML=`<b>${x.name}</b><br>${x.capital} · ${x.region}<br>${fmt(x.area)} km² · ${fmt(x.pop)} hab.`}).on('mouseleave',()=>tip.style.display='none');}
  draw();new ResizeObserver(draw).observe(box);
}
function exportProgress(){const payload={app:'Mi Colombia',version:'0.2',exportedAt:new Date().toISOString(),visited:[...visited]};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mi-colombia-progreso.json';a.click();URL.revokeObjectURL(url);}
init().catch(err=>{console.error(err);document.body.insertAdjacentHTML('beforeend','<p style="padding:20px">No se pudo cargar la aplicación. Revisa tu conexión e inténtalo de nuevo.</p>');});
