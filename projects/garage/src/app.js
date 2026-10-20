import { SHELVES, classify, counts, languages, filter, bench, fetchAllRepos, ago } from './garage-core.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const USER = params.get('user') || 'fitzyracing1';
const CACHE_KEY = `garage.${USER}`;
const CACHE_MS = 60 * 60 * 1000;
const COLORS = { Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c', 'C++': '#f34b7d', C: '#555', Go: '#00ADD8', Shell: '#89e051', Swift: '#F05138', Scala: '#c22d40', 'Jupyter Notebook': '#DA5B0B', Java: '#b07219', Rust: '#dea584' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let repos = [];
const state = { q: '', shelf: 'Work', language: '', described: false, sort: 'updated' };

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(state)) if (h.has(k)) state[k] = k === 'described' ? h.get(k) === '1' : h.get(k);
}
function writeHash() {
  const h = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v && !(k === 'shelf' && v === 'Work') && !(k === 'sort' && v === 'updated')) h.set(k, v === true ? '1' : v);
  history.replaceState(null, '', h.toString() ? `#${h}` : location.pathname + location.search);
}

async function load() {
  $('userLink').textContent = USER; $('userLink').href = `https://github.com/${USER}`;
  document.title = `Garage · every public repo of ${USER}`;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && Date.now() - c.at < CACHE_MS && !params.has('refresh')) return done(c.repos, `cached ${ago(new Date(c.at).toISOString())}`);
  } catch {}
  $('status').textContent = `Fetching public repos of ${USER} from GitHub…`;
  try {
    const live = await fetchAllRepos(USER);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), repos: live })); } catch {}
    done(live, 'live from the GitHub API');
  } catch (e) {
    try {
      const snap = await (await fetch('data/snapshot.json')).json();
      if (snap.user.toLowerCase() !== USER.toLowerCase()) throw new Error('no snapshot for this user');
      done(snap.repos, `snapshot from ${snap.taken_at.slice(0, 10)} (live fetch failed: ${e.message})`);
    } catch (e2) {
      $('status').textContent = `Could not load repos: ${e.message}`;
    }
  }
}

function done(list, source) {
  repos = classify(list);
  $('source').textContent = `Source: ${source}.`;
  const c = counts(repos);
  const stars = repos.reduce((a, r) => a + r.stars, 0);
  const langs = languages(repos);
  $('stats').innerHTML = [[repos.length, 'public repos'], [langs.length, 'languages'], [stars, 'stars'], [ago(repos.map((r) => r.pushed_at).sort().pop()), 'last push']]
    .map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
  $('lang').innerHTML = '<option value="">All languages</option>' + langs.map(([l, n]) => `<option value="${esc(l)}">${esc(l)} (${n})</option>`).join('');
  $('shelves').innerHTML = SHELVES.map((s) => `<button class="shelf" role="tab" data-s="${s}">${s}<span>${c[s]}</span></button>`).join('');
  $('shelves').onclick = (e) => { const b = e.target.closest('.shelf'); if (b) { state.shelf = b.dataset.s; render(); } };
  $('bench').innerHTML = bench(repos, 4).map(card).join('');
  syncControls(); render();
  const open = new URLSearchParams(location.hash.slice(1)).get('repo');
  if (open) detail(open);
}

function card(r) {
  return `<article class="card" data-name="${esc(r.name)}" tabindex="0">
    <h3>${esc(r.name)}</h3>
    <p class="${r.description ? '' : 'none'}">${esc(r.description || 'No description')}</p>
    <div class="meta">${r.language ? `<span class="lang" style="--c:${COLORS[r.language] || '#888'}">${esc(r.language)}</span>` : ''}
      ${r.stars ? `<span>★ ${r.stars}</span>` : ''}<span>${ago(r.pushed_at)}</span>${r.fork ? '<span class="badge">fork</span>' : ''}<span class="badge">${r.shelf}</span></div>
  </article>`;
}

function syncControls() {
  $('q').value = state.q; $('lang').value = state.language; $('described').checked = state.described; $('sort').value = state.sort;
}

function render() {
  for (const b of document.querySelectorAll('.shelf')) b.classList.toggle('on', b.dataset.s === state.shelf);
  const list = filter(repos, state);
  $('grid').innerHTML = list.length ? list.map(card).join('') : '<div class="empty">Nothing on this shelf matches.</div>';
  $('status').textContent = `${list.length} of ${repos.length} repos · shelf ${state.shelf}${state.language ? ` · ${state.language}` : ''}${state.described ? ' · described only' : ''}`;
  writeHash();
}

function detail(name) {
  const r = repos.find((x) => x.name === name);
  if (!r) return;
  $('detail').innerHTML = `<h2>${esc(r.name)}</h2><p>${esc(r.description || 'No description.')}</p>
    <div class="topics">${r.topics.map((t) => `<span class="topic" data-t="${esc(t)}">${esc(t)}</span>`).join('')}</div>
    <dl><dt>Shelf</dt><dd>${r.shelf}</dd><dt>Language</dt><dd>${esc(r.language || '—')}</dd>
    <dt>Stars</dt><dd>★ ${r.stars}</dd><dt>Forks</dt><dd>${r.forks}</dd>
    <dt>Created</dt><dd>${r.created_at?.slice(0, 10)} (${ago(r.created_at)})</dd>
    <dt>Updated</dt><dd>${r.pushed_at?.slice(0, 10)} (${ago(r.pushed_at)})</dd>
    <dt>Branch</dt><dd>${esc(r.default_branch)}</dd>${r.license ? `<dt>License</dt><dd>${esc(r.license)}</dd>` : ''}
    ${r.homepage ? `<dt>Homepage</dt><dd><a href="${esc(r.homepage)}" rel="noopener">${esc(r.homepage)}</a></dd>` : ''}${r.fork ? '<dt>Fork</dt><dd>yes</dd>' : ''}</dl>
    <a class="go" href="${esc(r.html_url)}" rel="noopener">Open on GitHub →</a>`;
  $('drawer').hidden = false;
  const h = new URLSearchParams(location.hash.slice(1)); h.set('repo', name); history.replaceState(null, '', `#${h}`);
}

document.addEventListener('click', (e) => {
  const c = e.target.closest('.card'); if (c) return detail(c.dataset.name);
  const t = e.target.closest('.topic'); if (t) { state.q = `topic:${t.dataset.t}`; state.shelf = 'All'; $('drawer').hidden = true; syncControls(); render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('drawer').hidden = true; if (e.key === 'Enter' && e.target.classList?.contains('card')) detail(e.target.dataset.name); if (e.key === '/' && document.activeElement !== $('q')) { e.preventDefault(); $('q').focus(); } });
$('close').onclick = () => { $('drawer').hidden = true; writeHash(); };
let t; $('q').oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = $('q').value; render(); }, 120); };
$('lang').onchange = () => { state.language = $('lang').value; render(); };
$('described').onchange = () => { state.described = $('described').checked; render(); };
$('sort').onchange = () => { state.sort = $('sort').value; render(); };
readHash();
load();
