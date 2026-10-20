import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load the core straight out of the single HTML file.
const html = readFileSync(new URL('../echo-app.html', import.meta.url), 'utf8');
const core = html.match(/<script id="echo-core">([\s\S]*?)<\/script>/)[1];
const ctx = { setTimeout, Date, Promise, Math, Number, String, Object, URL, encodeURIComponent };
vm.createContext(ctx); vm.runInContext(core, ctx);
const { predict, execute, replay, entry, calc, echoMatches } = ctx.EchoCore;
const empty = { tasks: [], notes: [], size: 0 };
const J = (x) => JSON.parse(JSON.stringify(x)); // values cross the vm realm

test('every intent gets a predicted echo before anything runs', () => {
  const p = predict('remind me to call mom', empty);
  assert.equal(p.kind, 'task'); assert.equal(p.args.text, 'call mom'); assert.ok(p.path.length >= 2); assert.ok(p.effects.external); assert.equal(p.expect, 'task “call mom” is open');
  assert.equal(predict('', empty), null);
  const u = predict('make me a sandwich', empty);
  assert.equal(u.kind, 'unknown'); assert.equal(u.confidence, 0);
});

test('keyword predictions cover the action kinds', () => {
  const cases = { 'note the code is 1234': 'note', 'timer 5 min to stretch': 'timer', 'calculate 2+2*3': 'calc', 'open example.com': 'open', 'search echo location': 'search', 'copy hello': 'copy', 'uppercase hi there': 'transform', 'clear done tasks': 'clear-done', 'forget everything': 'forget-all' };
  for (const [i, k] of Object.entries(cases)) assert.equal(predict(i, empty).kind, k, i);
  assert.equal(predict('timer 5 min to stretch', empty).args.secs, 300);
  assert.equal(predict('forget everything', empty).danger, true);
});

test('state is replayed from confirmed echoes only (no persistent world map)', () => {
  const ledger = [];
  const add = (intent, decision = 'confirmed') => { const p = predict(intent, replay(ledger)); const e = entry(p, decision); ledger.push(e); return e; };
  add('remind me to call mom'); add('todo buy milk'); add('remind me to pay rent', 'rejected');
  add('note wifi is on the fridge');
  let st = replay(ledger);
  assert.deepEqual(J(st.tasks.map((t) => t.text)), ['call mom', 'buy milk']);
  add('done milk');
  st = replay(ledger);
  assert.equal(st.tasks.find((t) => t.text === 'buy milk').done, true);
  add('clear done tasks');
  assert.deepEqual(J(replay(ledger).tasks.map((t) => t.text)), ['call mom']);
  add('forget note wifi');
  assert.equal(replay(ledger).notes.length, 0);
  assert.equal(ledger.length, 7, 'append-only: rejected intents are kept too');
});

test('done with no matching task predicts nothing and has low confidence', () => {
  const p = predict('done walk the dog', empty);
  assert.ok(p.confidence < 0.25); assert.equal(p.expect, 'nothing changes');
});

test('execution returns what the echo predicted', () => {
  for (const i of ['calculate (19.99 * 3) - 5%2', 'uppercase the loop', 'count words in one two three', 'note x']) {
    const p = predict(i, empty); const r = execute(p, { state: empty });
    assert.ok(echoMatches(p.expect, r.result), `${i}: ${p.expect} vs ${r.result}`);
  }
  const opened = [];
  const r = execute(predict('open example.com', empty), { open: (u) => opened.push(u) });
  assert.deepEqual(J(opened), ['https://example.com']); assert.equal(r.result, 'a new tab opens');
});

test('timers wait for the real return', async () => {
  const p = predict('timer 1 s to blink', empty);
  const r = execute(p, { setTimeout: (fn) => setTimeout(fn, 5) });
  assert.match(r.result, /^timer set for/);
  const real = await r.later;
  assert.match(real, /^fired at .* · blink$/);
  assert.ok(echoMatches(p.expect, real));
});

test('calc is safe arithmetic, not eval', () => {
  assert.equal(calc('2+2*3'), 8); assert.equal(calc('(1+2)^2'), 9); assert.equal(calc('-3+10%4'), -1); assert.equal(calc('0.1+0.2'), 0.3);
  assert.throws(() => calc('alert(1)')); assert.throws(() => calc('2+'));
  assert.notEqual(predict('calculate process.exit()', empty).kind, 'calc');
});
