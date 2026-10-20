import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shelfOf, classify, counts, filter, bench, languages, fetchAllRepos, slim, ago, SHELVES } from '../src/garage-core.js';

const R = (name, o = {}) => slim({ name, description: '', language: null, topics: [], stargazers_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', pushed_at: '2026-01-02T00:00:00Z', ...o });

test('shelves', () => {
  assert.equal(shelfOf(R('kivy-barrage', { description: 'Barrage plain-language clone of fitzyracing1/kivy' })), 'Barrage');
  assert.equal(shelfOf(R('barrage', { description: 'Barrage — a plain-language format' })), 'Projects');
  assert.equal(shelfOf(R('skill-corn-stand', { description: 'Grok skill: Corn Stand' })), 'Skills');
  assert.equal(shelfOf(R('react', { fork: true })), 'Archives');
  assert.equal(shelfOf(R('opti-run-log')), 'Archives');
  assert.equal(shelfOf(R('fitzy-code-chat', { description: 'RAG chat over all repos' })), 'Projects');
  assert.equal(shelfOf(R('uiltiol', { description: 'A tiny text toy' })), 'Projects');
});

const sample = classify([
  R('alpha', { description: 'first thing', language: 'Python', stargazers_count: 3, pushed_at: '2026-05-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', topics: ['cli'] }),
  R('beta', { language: 'JavaScript', pushed_at: '2026-06-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z' }),
  R('gamma-barrage', { description: 'Barrage plain-language clone of x/gamma' }),
  R('skill-x', { description: 'Grok skill: x' }),
  R('forked', { fork: true, language: 'Python' }),
]);

test('counts: Work excludes Barrage', () => {
  const c = counts(sample);
  assert.deepEqual(Object.keys(c), SHELVES);
  assert.equal(c.All, 5); assert.equal(c.Work, 4); assert.equal(c.Barrage, 1); assert.equal(c.Projects, 2); assert.equal(c.Skills, 1); assert.equal(c.Archives, 1);
});

test('search, filter and sort', () => {
  assert.deepEqual(filter(sample, { q: 'first' }).map((r) => r.name), ['alpha']);
  assert.deepEqual(filter(sample, { q: 'topic:cli' }).map((r) => r.name), ['alpha']);
  assert.deepEqual(filter(sample, { q: 'lang:python', shelf: 'All', sort: 'name' }).map((r) => r.name), ['alpha', 'forked']);
  assert.deepEqual(filter(sample, { language: 'Python', shelf: 'Projects' }).map((r) => r.name), ['alpha']);
  assert.deepEqual(filter(sample, { described: true, shelf: 'All', sort: 'name' }).map((r) => r.name), ['alpha', 'gamma-barrage', 'skill-x']);
  assert.deepEqual(filter(sample, { shelf: 'Projects' }).map((r) => r.name), ['beta', 'alpha']);
  assert.deepEqual(filter(sample, { shelf: 'Projects', sort: 'created' }).map((r) => r.name), ['beta', 'alpha']);
  assert.equal(filter(sample, { shelf: 'All', sort: 'stars' })[0].name, 'alpha');
  assert.deepEqual(bench(sample).map((r) => r.name), []);
  assert.deepEqual(languages(sample), [['Python', 2], ['JavaScript', 1]]);
});

test('fetchAllRepos pages until a short page', async () => {
  const calls = [];
  const fake = async (url) => { calls.push(url); const page = +new URL(url).searchParams.get('page'); const n = page === 1 ? 100 : 7; return { ok: true, json: async () => Array.from({ length: n }, (_, i) => ({ name: `r${page}-${i}`, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })) }; };
  const all = await fetchAllRepos('fitzyracing1', fake);
  assert.equal(all.length, 107); assert.equal(calls.length, 2);
  assert.match(calls[0], /users\/fitzyracing1\/repos\?per_page=100/);
  await assert.rejects(fetchAllRepos('x', async () => ({ ok: false, status: 403, headers: { get: () => '0' } })), /rate limit/);
});

test('bundled snapshot is valid and public-only', () => {
  const snap = JSON.parse(readFileSync(new URL('../data/snapshot.json', import.meta.url)));
  assert.equal(snap.user, 'fitzyracing1');
  assert.ok(snap.repos.length > 100);
  const c = classify(snap.repos);
  assert.ok(counts(c).Work > 0 && bench(c).length === 6);
});

test('ago', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  assert.equal(ago('2026-10-16T12:00:00Z', now), 'today');
  assert.equal(ago('2026-10-07T00:00:00Z', now), '10 days ago');
});
