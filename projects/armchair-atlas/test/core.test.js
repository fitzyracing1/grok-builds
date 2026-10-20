import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/core.js';
import { ATLAS, MOODS } from '../src/atlas.js';

const chair = { lat: 38.7223, lon: -9.1393 }; // Lisbon

test('haversine distance', () => {
  assert.ok(Math.abs(A.distanceKm({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 }) - 343.5) < 1.5);
  assert.equal(A.distanceKm(chair, chair), 0);
});

test('chair score is 4/c² plus name match', () => {
  const at1km = { name: 'Thing', lat: chair.lat + 1 / 111.195, lon: chair.lon };
  assert.ok(Math.abs(A.chairScore(at1km, chair) - 4) < 0.01);
  const at2km = { name: 'Thing', lat: chair.lat + 2 / 111.195, lon: chair.lon };
  assert.ok(Math.abs(A.chairScore(at2km, chair) - 1) < 0.01, 'inverse square: twice as far, a quarter of the weight');
  assert.equal(A.chairScore({ name: 'x', ...chair }, chair), 4 / (A.MIN_C ** 2), 'floored at MIN_C');
  assert.ok(Math.abs(A.chairScore({ ...at2km, name: 'Castle of São Jorge' }, chair, 'castle') - 1.75) < 0.01, 'prefix match adds 0.75');
});

test('rankChair: nearer pins weigh more; name match can lift a farther pin', () => {
  const near = { name: 'Garden', lat: chair.lat + 0.005, lon: chair.lon, source: 'osm' };
  const far = { name: 'Castle', lat: chair.lat + 0.03, lon: chair.lon, source: 'wikipedia' };
  assert.deepEqual(A.rankChair([far, near], chair).map((p) => p.name), ['Garden', 'Castle']);
  const veryNear = { name: 'Bench', lat: chair.lat + 0.02, lon: chair.lon, source: 'osm' };
  assert.deepEqual(A.rankChair([veryNear, far], chair, 'castle').map((p) => p.name), ['Castle', 'Bench']);
});

test('looking for… keeps only matching places, then ranks by 4/c² + match', () => {
  const ps = [
    { name: 'Garden', lat: chair.lat + 0.001, lon: chair.lon, kind: 'park', source: 'osm' },
    { name: 'São Jorge Castle', lat: chair.lat + 0.02, lon: chair.lon, kind: 'castle', source: 'osm' },
    { name: 'Moorish Walls', lat: chair.lat + 0.01, lon: chair.lon, kind: 'castle', source: 'osm' },
  ];
  assert.deepEqual(A.rankChair(ps, chair, 'castle', { only: true }).map((p) => p.name), ['Moorish Walls', 'São Jorge Castle']);
  assert.equal(A.rankChair(ps, chair, 'castle').length, 3);
});

test('classic: Wikipedia first, then the map, first found wins', () => {
  const w = { name: 'Belém Tower', lat: 38.6916, lon: -9.216, source: 'wikipedia' };
  const o = { name: 'Belém Tower', lat: 38.6917, lon: -9.2161, source: 'osm', kind: 'castle' };
  const o2 = { name: 'Park', lat: 38.72, lon: -9.14, source: 'osm' };
  const r = A.rankClassic([o2, o, w], chair);
  assert.deepEqual(r.map((p) => [p.name, p.source]), [['Belém Tower', 'wikipedia'], ['Park', 'osm']]);
  assert.equal(r[0].kind, 'castle', 'merged field from the duplicate');
});

test('place of the day is San Pedro de Atacama on Sep 18, 2026 and cycles the atlas', () => {
  assert.equal(A.placeOfDay(new Date('2026-09-18T10:00:00Z')).name, 'San Pedro de Atacama');
  const seen = new Set(); for (let i = 0; i < ATLAS.length; i++) seen.add(A.placeOfDay(new Date(Date.UTC(2026, 8, 18 + i))).name);
  assert.equal(seen.size, ATLAS.length);
});

test('atlas data is sane', () => {
  for (const p of ATLAS) { assert.ok(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180, p.name); assert.ok(p.blurb.length > 20 && p.tags.length >= 3, p.name); }
  for (const m of Object.keys(MOODS)) assert.ok(A.byMood(m).length >= 3, m);
});

test('the guide flies to real places', () => {
  const cold = A.askGuide('somewhere cold and silent at the edge of the world').map((p) => p.name);
  assert.ok(cold.includes('Point Nemo') || cold.some((n) => /Svalbard|Ittoqqortoormiit/.test(n)));
  assert.ok(A.askGuide('a harbor at dusk').some((p) => /Valletta|Zanzibar/.test(p.name)));
  assert.ok(A.askGuide('a medina maze').some((p) => /Fes|Chefchaouen/.test(p.name)));
  assert.equal(A.askGuide('Cape Horn')[0].name, 'Cape Horn');
  assert.deepEqual(A.askGuide('zzzz'), []);
});

test('somewhere else never repeats the current place', () => {
  const p = ATLAS[0];
  for (let i = 0; i < 50; i++) assert.notEqual(A.somewhereElse(Math.random, p), p);
});

test('open data adapters', () => {
  assert.match(A.nominatimUrl('São Paulo'), /q=S%C3%A3o%20Paulo/);
  assert.deepEqual(A.parseNominatim([{ name: 'Lisboa', display_name: 'Lisboa, Portugal', lat: '38.7', lon: '-9.1' }]), { name: 'Lisboa', label: 'Lisboa, Portugal', lat: 38.7, lon: -9.1 });
  assert.equal(A.parseNominatim([]), null);
  assert.match(A.overpassQuery(chair, 5000), /around:5000,38.7223,-9.1393/);
  assert.match(A.overpassQuery(chair, 5000, 100), /out center qt 100;/);
  const osm = A.parseOverpass({ elements: [{ type: 'way', center: { lat: 1, lon: 2 }, tags: { name: 'Fort', historic: 'fort', wikipedia: 'en:Fort' } }, { type: 'node', lat: 1, lon: 2, tags: {} }] });
  assert.deepEqual(osm, [{ name: 'Fort', lat: 1, lon: 2, kind: 'fort', source: 'osm', wiki: 'en:Fort' }]);
  assert.equal(A.parseWikiGeo({ query: { geosearch: [{ title: 'X', lat: 1, lon: 2 }] } })[0].source, 'wikipedia');
  assert.match(A.wikiGeoUrl(chair, 50000), /gsradius=10000/, 'Wikipedia caps radius at 10 km');
  const g = A.googleLinks({ name: 'Cape Horn', lat: -55.98, lon: -67.27 });
  assert.match(g.streetView, /map_action=pano&viewpoint=-55.98,-67.27/);
  assert.match(g.directions, /destination=-55.98,-67.27/);
  assert.equal(A.fmtKm(0.42), '420 m'); assert.equal(A.fmtKm(12.34), '12.3 km'); assert.equal(A.fmtKm(12345), '12,345 km');
});
