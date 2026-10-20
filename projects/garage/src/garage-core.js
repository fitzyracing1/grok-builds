// Garage core: classify, filter and sort GitHub repos. Pure; runs in browser and Node.
export const SHELVES = ['Work', 'Projects', 'Skills', 'Archives', 'Barrage', 'All'];

export function slim(r) {
  return {
    name: r.name, full_name: r.full_name, html_url: r.html_url, description: r.description || '',
    language: r.language || '', topics: r.topics || [], stars: r.stargazers_count ?? r.stars ?? 0,
    forks: r.forks_count ?? r.forks ?? 0, fork: !!r.fork, archived: !!r.archived, homepage: r.homepage || '',
    created_at: r.created_at, updated_at: r.updated_at, pushed_at: r.pushed_at || r.updated_at,
    default_branch: r.default_branch || 'main', size: r.size ?? 0, license: r.license?.spdx_id || r.license || '',
  };
}

export function shelfOf(r) {
  const name = r.name.toLowerCase();
  const desc = (r.description || '').toLowerCase();
  if (/-barrage$/.test(name) || /barrage plain-language clone/.test(desc)) return 'Barrage';
  if (/^skills?(-|$)/.test(name) || /^(grok|claude) skill\b/.test(desc) || (r.topics || []).includes('skill')) return 'Skills';
  if (r.fork || r.archived || /(^|-)(log|logs|archive|archives|snapshot)(-|$)/.test(name) || /\b(conversation|chat) archive|combined snapshot|\bmy clone\b/.test(desc)) return 'Archives';
  return 'Projects';
}

export function classify(repos) { return repos.map((r) => ({ ...r, shelf: shelfOf(r) })); }

export function inShelf(r, shelf) {
  if (shelf === 'All') return true;
  if (shelf === 'Work') return r.shelf !== 'Barrage';
  return r.shelf === shelf;
}

export function counts(repos) {
  const c = Object.fromEntries(SHELVES.map((s) => [s, 0]));
  for (const r of repos) for (const s of SHELVES) if (inShelf(r, s)) c[s]++;
  return c;
}

export function languages(repos) {
  const m = new Map();
  for (const r of repos) if (r.language) m.set(r.language, (m.get(r.language) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const SORTS = {
  updated: (a, b) => (b.pushed_at || b.updated_at || '').localeCompare(a.pushed_at || a.updated_at || ''),
  created: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
  stars: (a, b) => b.stars - a.stars || SORTS.updated(a, b),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
};

/** query: free text; terms match name, description, language, topics. `lang:x` and `topic:y` narrow. */
export function filter(repos, { q = '', shelf = 'Work', language = '', described = false, sort = 'updated' } = {}) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = repos.filter((r) => {
    if (!inShelf(r, shelf)) return false;
    if (language && r.language !== language) return false;
    if (described && !r.description.trim()) return false;
    const hay = `${r.name} ${r.description} ${r.language} ${r.topics.join(' ')}`.toLowerCase();
    return terms.every((t) => {
      if (t.startsWith('lang:')) return r.language.toLowerCase() === t.slice(5);
      if (t.startsWith('topic:')) return r.topics.includes(t.slice(6));
      return hay.includes(t);
    });
  });
  return out.sort(SORTS[sort] || SORTS.updated);
}

/** "On the bench": latest projects that actually describe themselves. */
export function bench(repos, n = 6) {
  return repos.filter((r) => r.shelf === 'Projects' && r.description.trim().length >= 12).sort(SORTS.updated).slice(0, n);
}

export async function fetchAllRepos(user, fetchImpl = globalThis.fetch, { token } = {}) {
  const all = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetchImpl(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&type=owner&sort=pushed&page=${page}`, {
      headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const remaining = res.headers?.get?.('x-ratelimit-remaining');
      throw new Error(res.status === 403 && remaining === '0' ? 'GitHub API rate limit reached' : `GitHub API answered ${res.status}`);
    }
    const batch = await res.json();
    all.push(...batch.map(slim));
    if (batch.length < 100) break;
  }
  return all.filter((r) => !r.private);
}

export function ago(iso, now = Date.now()) {
  const d = (now - Date.parse(iso)) / 864e5;
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  if (d < 30) return `${Math.floor(d)} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${(d / 365).toFixed(1)} yr ago`;
}
