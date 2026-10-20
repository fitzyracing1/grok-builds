import { ATLAS, MOODS } from './atlas.js';
import * as A from './core.js';

const L = window.L;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);

const map = L.map('map', { zoomControl: false, worldCopyJump: true }).setView([20, 0], 3);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
const layer = L.layerGroup().addTo(map);
let chair = null, chairMarker = null, lastNear = [];

const pinIcon = (cls = '') => L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
const saved = () => JSON.parse(localStorage.getItem('armchair.saved') || '[]');
function setSaved(list) { localStorage.setItem('armchair.saved', JSON.stringify(list)); $('nsaved').textContent = list.length || ''; renderSaved(); }
const gkey = () => localStorage.getItem('armchair.gkey') || params.get('gmapsKey') || '';

function popup(p) {
  const g = A.googleLinks(p);
  const k = gkey();
  const isSaved = saved().some((s) => s.name === p.name && Math.abs(s.lat - p.lat) < 1e-4);
  const el = document.createElement('div');
  el.className = 'pop';
  el.innerHTML = `<h3>${esc(p.name)}</h3>${p.country ? `<div class="kicker">${esc(p.country)}</div>` : ''}${p.kind && p.kind !== 'wikipedia' ? `<div class="kicker">${esc(p.kind)}</div>` : ''}
    <p class="blurb">${esc(p.blurb || '')}</p>${chair ? `<p>${A.fmtKm(A.distanceKm(chair, p))} from the chair${p.score != null ? ` · score ${p.score.toFixed(3)}` : ''}</p>` : ''}
    ${k ? `<iframe loading="lazy" src="https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(k)}&center=${p.lat},${p.lon}&zoom=17&maptype=satellite"></iframe>` : ''}
    <div class="g"><a href="${g.maps}" target="_blank" rel="noopener">Google Maps</a><a href="${g.satellite}" target="_blank" rel="noopener">Satellite</a><a href="${g.streetView}" target="_blank" rel="noopener">Street View</a><a href="${g.directions}" target="_blank" rel="noopener">Directions</a><a href="${g.osm}" target="_blank" rel="noopener">OSM</a>
    <button data-save>${isSaved ? '★ Saved' : '☆ Save'}</button><button data-chair>Put chair here</button></div>`;
  el.querySelector('[data-save]').onclick = (e) => {
    const list = saved(); const i = list.findIndex((s) => s.name === p.name && Math.abs(s.lat - p.lat) < 1e-4);
    if (i >= 0) list.splice(i, 1); else list.unshift({ name: p.name, lat: p.lat, lon: p.lon, country: p.country || '', blurb: p.blurb || '', kind: p.kind || '' });
    setSaved(list); e.target.textContent = i >= 0 ? '☆ Save' : '★ Saved';
  };
  el.querySelector('[data-chair]').onclick = () => { map.closePopup(); setChair({ lat: p.lat, lon: p.lon, name: p.name }); tab('nearby'); searchNear(); };
  if (!p.blurb && (p.wiki || p.source === 'wikipedia')) enrich(p, el);
  return el;
}

async function enrich(p, el) {
  const [lang, title] = (p.wiki || `en:${p.name}`).includes(':') ? (p.wiki || `en:${p.name}`).split(/:(.+)/) : ['en', p.wiki];
  try {
    const r = await fetch(A.wikiSummaryUrl(title, lang)); if (!r.ok) return;
    const j = await r.json();
    p.blurb = j.extract;
    el.querySelector('.blurb').textContent = j.extract?.slice(0, 280) + (j.extract?.length > 280 ? '…' : '');
    if (j.thumbnail?.source) el.querySelector('.blurb').insertAdjacentHTML('afterend', `<img src="${esc(j.thumbnail.source)}" alt="">`);
  } catch {}
}

function show(places, { cls = '', fit = true, top = 0 } = {}) {
  layer.clearLayers();
  const ms = places.map((p, i) => L.marker([p.lat, p.lon], { icon: pinIcon(i < top ? 'top' : cls), title: p.name }).bindPopup(() => popup(p), { maxWidth: 300 }).addTo(layer));
  if (chair) ms.push(chairMarker);
  if (fit && places.length) map.flyToBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon]).concat(chair && cls !== 'far' ? [[chair.lat, chair.lon]] : [])).pad(0.15), { duration: 1.2, maxZoom: 15 });
  return ms;
}

function list(el, places, { distance = true, onPick } = {}) {
  el.innerHTML = '';
  places.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(p.name)}</b><span class="d">${distance && chair ? A.fmtKm(p.distance ?? A.distanceKm(chair, p)) : esc(p.country || '')}</span>
      <span class="k">${esc(p.why || p.kind || p.tags?.slice(0, 3).join(' · ') || '')}</span><span class="s">${p.score != null ? `4/c² ${p.score.toFixed(3)}` : p.source ? esc(p.source) : ''}</span>`;
    li.onclick = () => (onPick ? onPick(p, i) : fly(p));
    el.append(li);
  });
}

function fly(p, zoom = 13) {
  map.flyTo([p.lat, p.lon], zoom, { duration: 1.6 });
  map.once('moveend', () => {
    let found = null; layer.eachLayer((m) => { if (m.getLatLng && m.getLatLng().lat === p.lat && m.getLatLng().lng === p.lon) found = m; });
    (found || L.popup({ maxWidth: 300 }).setLatLng([p.lat, p.lon]).setContent(popup(p)).openOn(map)) && found?.openPopup();
  });
}

function setChair(c) {
  chair = c;
  if (chairMarker) chairMarker.remove();
  chairMarker = L.marker([c.lat, c.lon], { icon: L.divIcon({ className: 'chair-icon', html: '🪑', iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 1000, title: 'The chair' }).addTo(map);
  chairMarker.bindTooltip(`The chair${c.name ? ` · ${esc(c.name)}` : ''}`);
}

// ---- tabs ----
function tab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === name));
}
document.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) tab(b.dataset.tab); };

// ---- Today ----
function today() {
  const p = A.placeOfDay(new Date());
  $('today').innerHTML = `<div class="hero-card"><div class="img" id="dayImg"></div><div class="body"><div class="kicker">Place of the day · ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</div>
    <h2>${esc(p.name)}</h2><div class="kicker" style="color:var(--muted)">${esc(p.country)}</div><p>${esc(p.blurb)}</p>
    <div class="row" style="margin-top:12px"><button class="btn" id="dayGo">Fly there</button><button class="btn ghost" id="dayChair">Put the chair here</button></div></div></div>
    <p class="muted" style="margin-top:14px">Nearby: share a location or search any city to see what sits around the chair. Far away: pick a mood or leap somewhere else. Ask: tell the guide a feeling.</p>`;
  $('dayGo').onclick = () => { show([p], { cls: 'far', fit: false }); fly(p, 9); };
  $('dayChair').onclick = () => { setChair({ lat: p.lat, lon: p.lon, name: p.name }); tab('nearby'); $('city').value = p.name; searchNear(); };
  fetch(A.wikiSummaryUrl(p.name.split(',')[0])).then((r) => r.ok && r.json()).then((j) => { if (j?.originalimage?.source || j?.thumbnail?.source) $('dayImg').style.backgroundImage = `url("${j.thumbnail?.source || j.originalimage.source}")`; }).catch(() => {});
  show([p], { cls: 'far', fit: false });
  map.setView([p.lat, p.lon], 5);
}

// ---- Nearby ----
async function getJson(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`); return r.json(); }

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(data) {
  let last;
  for (const url of OVERPASS) {
    try { return await getJson(url, { method: 'POST', body: new URLSearchParams({ data }), signal: AbortSignal.timeout(30000) }); } catch (e) { last = e; }
  }
  throw last;
}

async function searchNear() {
  if (!chair) { $('nearStatus').textContent = 'Search a city or use 📍 Me first.'; return; }
  const radius = +$('radius').value;
  $('nearStatus').textContent = `Looking around the chair (${A.fmtKm(radius / 1000)})…`;
  const [osm, wiki] = await Promise.allSettled([
    overpass(A.overpassQuery(chair, radius)).then(A.parseOverpass),
    getJson(A.wikiGeoUrl(chair, radius)).then((j) => A.parseWikiGeo(j)),
  ]);
  const places = [...(wiki.value || []), ...(osm.value || [])].filter((p) => A.distanceKm(chair, p) * 1000 <= radius * 1.05);
  const failed = [osm.status === 'rejected' && 'map (Overpass)', wiki.status === 'rejected' && 'Wikipedia'].filter(Boolean);
  const mode = document.querySelector('input[name=rank]:checked').value;
  const want = $('want').value.trim();
  lastNear = mode === 'classic' ? A.rankClassic(places, chair) : A.rankChair(places, chair, want, { only: true });
  if (mode === 'classic' && want) lastNear = lastNear.filter((p) => A.matchesWant(p, want));
  const shown = lastNear.slice(0, 60);
  $('nearStatus').textContent = `${lastNear.length} places around ${chair.name || 'the chair'} · ranked ${mode === 'classic' ? 'classic (Wikipedia first, then the map)' : 'by 4/c² from the chair + name match'}${failed.length ? ` · ${failed.join(' and ')} did not answer` : ''}`;
  list($('nearList'), shown, { onPick: (p) => fly(p, 16) });
  show(shown, { top: mode === 'chair' ? 3 : 0 });
}

$('nearForm').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('city').value.trim();
  if (q) {
    $('nearStatus').textContent = `Finding ${q}…`;
    try {
      const hit = A.parseNominatim(await getJson(A.nominatimUrl(q), { headers: { 'accept-language': 'en' } }));
      if (!hit) { $('nearStatus').textContent = `Nothing found for “${q}”.`; return; }
      setChair(hit);
    } catch (err) { $('nearStatus').textContent = `Search failed: ${err.message}`; return; }
  }
  searchNear();
};
$('locate').onclick = () => {
  if (!navigator.geolocation) return ($('nearStatus').textContent = 'This browser cannot share a location.');
  $('nearStatus').textContent = 'Asking for your location…';
  navigator.geolocation.getCurrentPosition((pos) => { setChair({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'your location' }); $('city').value = ''; searchNear(); },
    (err) => ($('nearStatus').textContent = `Location unavailable: ${err.message}`), { enableHighAccuracy: false, timeout: 10000 });
};
document.querySelectorAll('input[name=rank]').forEach((r) => (r.onchange = () => chair && searchNear()));
$('radius').onchange = () => chair && searchNear();

// ---- Far away ----
$('moods').innerHTML = Object.keys(MOODS).map((m) => `<button class="chip" data-m="${esc(m)}">${esc(m)}</button>`).join('');
$('moods').onclick = (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
  const ps = A.byMood(b.dataset.m);
  list($('farList'), ps, { distance: false }); show(ps, { cls: 'far' });
};
let lastLeap;
$('leap').onclick = () => { const p = (lastLeap = A.somewhereElse(Math.random, lastLeap)); list($('farList'), [p], { distance: false }); show([p], { cls: 'far', fit: false }); fly(p, 8); };
$('atlasAll').onclick = () => { const ps = [...ATLAS].sort((a, b) => a.name.localeCompare(b.name)); list($('farList'), ps, { distance: false }); show(ps, { cls: 'far' }); };

// ---- Ask ----
$('askForm').onsubmit = (e) => {
  e.preventDefault();
  const ps = A.askGuide($('askText').value);
  if (!ps.length) { $('askList').innerHTML = '<li><span class="k">The guide has nothing for that yet. Try a climate (cold, warm), a sound (quiet, busy) or a feeling (edge of the world).</span></li>'; return; }
  list($('askList'), ps, { distance: false }); show(ps, { cls: 'far' });
  setTimeout(() => fly(ps[0], 7), 1300);
};

// ---- Saved ----
function renderSaved() { const s = saved(); list($('savedList'), s, { distance: false }); }

// ---- Google key ----
$('settings').onclick = () => { $('gkey').value = localStorage.getItem('armchair.gkey') || ''; $('gdialog').showModal(); };
$('gdialog').addEventListener('close', () => { const v = $('gdialog').returnValue; if (v === 'save') localStorage.setItem('armchair.gkey', $('gkey').value.trim()); if (v === 'clear') localStorage.removeItem('armchair.gkey'); });

setSaved(saved());
today();
if (params.get('q')) { tab('nearby'); $('city').value = params.get('q'); if (params.get('want')) $('want').value = params.get('want'); $('nearForm').requestSubmit(); }
if (params.get('ask')) { tab('ask'); $('askText').value = params.get('ask'); $('askForm').requestSubmit(); }
