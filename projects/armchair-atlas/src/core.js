// Armchair core: distances, the 4/c² chair ranking, the classic (legacy) merge,
// the guide, and the open-data adapters (Nominatim, Overpass, Wikipedia). Pure where possible.
import { ATLAS, MOODS } from './atlas.js';

export const R_EARTH_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Name match in [0, 1]: 1 exact, 0.75 prefix, 0.5 substring, else share of query words found. */
export function nameMatch(name, q) {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const s = (q || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!s) return 0;
  if (n === s) return 1;
  if (n.startsWith(s)) return 0.75;
  if (n.includes(s)) return 0.5;
  const words = s.split(/\s+/).filter((w) => w.length > 2);
  return words.length ? (0.4 * words.filter((w) => n.includes(w)).length) / words.length : 0;
}

/** Chair rank: score = 4 / c² + name match, c = distance from the chair in km (floored at MIN_C so a pin on the chair stays finite). */
export const MIN_C = 0.05; // 50 m
export function chairScore(place, chair, q = '') {
  const c = Math.max(MIN_C, distanceKm(chair, place));
  return 4 / (c * c) + nameMatch(place.name, q);
}

export function rankChair(places, chair, q = '', { only = false } = {}) {
  const pool = only && q.trim() ? places.filter((p) => matchesWant(p, q)) : places;
  return dedupe(pool)
    .map((p) => ({ ...p, distance: distanceKm(chair, p), score: chairScore(p, chair, q) }))
    .sort((a, b) => b.score - a.score || a.distance - b.distance);
}

/** Does a place answer "looking for…"? Name match or its kind (castle, beach, museum…). */
export function matchesWant(p, q) {
  const s = q.trim().toLowerCase();
  return nameMatch(p.name, q) > 0 || (p.kind || '').toLowerCase().includes(s) || s.includes((p.kind || '~').toLowerCase());
}

/** Classic (saved old version): Wikipedia results first, then map results, first-found wins on duplicates. */
export function rankClassic(places, chair) {
  const order = { wikipedia: 0, osm: 1, atlas: 2 };
  const sorted = [...places].sort((a, b) => (order[a.source] ?? 3) - (order[b.source] ?? 3));
  return dedupe(sorted).map((p) => ({ ...p, distance: distanceKm(chair, p), score: null }));
}

/** Same name (case-insensitive) within 300 m is one place; keep the first, merge missing fields. */
export function dedupe(places) {
  const out = [];
  for (const p of places) {
    const twin = out.find((o) => o.name.toLowerCase() === p.name.toLowerCase() && distanceKm(o, p) < 0.3);
    if (twin) { for (const k of ['wiki', 'kind', 'blurb']) if (!twin[k] && p[k]) twin[k] = p[k]; twin.sources = [...new Set([...(twin.sources || [twin.source]), p.source])]; }
    else out.push({ ...p });
  }
  return out;
}

export function placeOfDay(date = new Date()) {
  const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 864e5;
  // fixed so Sep 18, 2026 (the day Armchair was first built) opens on San Pedro de Atacama
  const anchor = Date.UTC(2026, 8, 18) / 864e5;
  const i = (((d - anchor) % ATLAS.length) + ATLAS.length) % ATLAS.length;
  return ATLAS[i];
}

export function byMood(mood) {
  const tags = MOODS[mood] || [];
  return ATLAS.map((p) => ({ p, hits: p.tags.filter((t) => tags.includes(t)).length })).filter((x) => x.hits).sort((a, b) => b.hits - a.hits).map((x) => x.p);
}

export function somewhereElse(rand = Math.random, not) {
  const pool = ATLAS.filter((p) => p !== not);
  return pool[Math.floor(rand() * pool.length)];
}

const SYNONYMS = {
  hot: ['warm', 'hot', 'desert', 'humid', 'tropical', 'sun', 'sunny', 'heat'],
  cold: ['cold', 'ice', 'icy', 'snow', 'arctic', 'freezing', 'frozen', 'winter', 'glacier', 'aurora', 'northern lights'],
  quiet: ['quiet', 'silence', 'silent', 'calm', 'peace', 'peaceful', 'still', 'alone', 'solitude', 'empty', 'lonely'],
  'old stone': ['old', 'ancient', 'stone', 'ruins', 'history', 'historic', 'medieval', 'temple', 'castle'],
  sea: ['sea', 'ocean', 'harbor', 'harbour', 'coast', 'beach', 'island', 'boat', 'waves'],
  edge: ['edge', 'remote', 'far', 'end', 'nowhere', 'lost', 'isolated'],
  stars: ['stars', 'night', 'sky', 'meteor', 'milky way'],
  dusk: ['dusk', 'sunset', 'evening', 'golden'],
  dawn: ['dawn', 'sunrise', 'morning'],
  mountains: ['mountain', 'mountains', 'peak', 'alps', 'high', 'altitude', 'hike'],
  strange: ['strange', 'weird', 'alien', 'otherworldly', 'surreal', 'moon', 'mars'],
  busy: ['busy', 'market', 'bazaar', 'crowd', 'lively', 'maze', 'medina'],
  water: ['lake', 'river', 'water', 'waterfall', 'canal', 'lagoon', 'fjord'],
  wind: ['wind', 'windy', 'storm', 'wild', 'rain'],
};

/** The guide: tell it a climate, a kind of silence, a feeling. Returns ranked atlas places with reasons. */
export function askGuide(text, limit = 5) {
  const s = ` ${(text || '').toLowerCase()} `;
  const wanted = new Set();
  for (const [tag, words] of Object.entries(SYNONYMS)) if (words.some((w) => s.includes(w))) { wanted.add(tag); words.forEach((w) => wanted.add(w)); }
  for (const p of ATLAS) for (const t of p.tags) if (s.includes(` ${t} `) || s.includes(`${t} `)) wanted.add(t);
  const direct = ATLAS.filter((p) => nameMatch(p.name, text) >= 0.5 || s.includes(p.country.toLowerCase()));
  const scored = ATLAS.map((p) => {
    const hits = p.tags.filter((t) => wanted.has(t));
    const avoid = (/\bnot (hot|warm)\b|\bno (heat|sun)\b/.test(s) && p.tags.some((t) => ['hot', 'warm', 'desert', 'humid'].includes(t))) || (/\bnot cold\b|\bwarm\b/.test(s) && /\bnot cold\b/.test(s) && p.tags.includes('cold'));
    return { place: p, score: hits.length + (direct.includes(p) ? 5 : 0) - (avoid ? 3 : 0), hits };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  return scored.slice(0, limit).map((x) => ({ ...x.place, why: x.hits.length ? `matches ${x.hits.slice(0, 4).join(', ')}` : 'named in your question' }));
}

export function googleLinks(p) {
  const ll = `${p.lat},${p.lon}`;
  return {
    maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=&center=${ll}`.replace('&query_place_id=', ''),
    satellite: `https://www.google.com/maps/@?api=1&map_action=map&center=${ll}&zoom=16&basemap=satellite`,
    streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    osm: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=15/${p.lat}/${p.lon}`,
  };
}

// ---- open data adapters (no keys) ----
export function nominatimUrl(q) {
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
}
export function parseNominatim(json) {
  const r = Array.isArray(json) && json[0];
  return r ? { name: r.name || r.display_name.split(',')[0], label: r.display_name, lat: +r.lat, lon: +r.lon } : null;
}

export function overpassQuery({ lat, lon }, radiusM = 6000, limit = 3000) {
  const a = `(around:${radiusM},${lat},${lon})`;
  return `[out:json][timeout:25];(
  nwr["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"]["name"]${a};
  nwr["historic"~"^(castle|monument|ruins|archaeological_site|fort|church|manor|city_gate|lighthouse|palace|tower)$"]["name"]${a};
  nwr["natural"~"^(peak|beach|waterfall|cave_entrance|bay|cliff|volcano|spring)$"]["name"]${a};
  nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]${a};
);out center qt ${limit};`;
}
export function parseOverpass(json) {
  return (json?.elements || []).map((e) => {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || !t.name) return null;
    const kind = t.tourism || t.historic || t.natural || t.leisure || t.amenity || 'place';
    return { name: t['name:en'] || t.name, lat, lon, kind: kind.replace(/_/g, ' '), source: 'osm', wiki: t.wikipedia || '' };
  }).filter(Boolean);
}

export function wikiGeoUrl({ lat, lon }, radiusM = 10000, limit = 50, lang = 'en') {
  return `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=${Math.min(10000, radiusM)}&gslimit=${limit}&format=json&origin=*`;
}
export function parseWikiGeo(json, lang = 'en') {
  return (json?.query?.geosearch || []).map((g) => ({ name: g.title, lat: g.lat, lon: g.lon, kind: 'wikipedia', source: 'wikipedia', wiki: `${lang}:${g.title}` }));
}
export function wikiSummaryUrl(title, lang = 'en') {
  return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

export function fmtKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
