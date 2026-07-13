/*
 * Unit tests for the audit and apply engines under linkedom.
 *
 * The single most important invariant lives here: every selector the audit
 * emits must re-find exactly the element it was computed from —
 *   document.querySelector(selectorFor(el)) === el
 * The whole architecture (apply, LLM label round-trip, undo) rides on it.
 *
 * Run: node test/unit.mjs   (or npm test)
 */

import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseHTML } from 'linkedom';

const require = createRequire(import.meta.url);
const audit = require('../src/audit.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    console.error(`  FAIL - ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

function doc(html) {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
}

// ---------------------------------------------------------------- selectors

console.log('selectorFor round-trip');

test('element under an id ancestor', () => {
  const d = doc('<section id="wrap"><div></div><div><button></button></div></section>');
  const el = d.querySelector('button');
  const sel = audit.selectorFor(el);
  assert.equal(d.querySelector(sel), el, `selector "${sel}" did not re-find the element`);
});

test('deeply nested element with no ids anywhere', () => {
  const d = doc(
    '<div><div><div><div><div><div><div><button>x</button></div></div></div></div></div></div></div>'
  );
  const el = d.querySelector('button');
  const sel = audit.selectorFor(el);
  assert.equal(d.querySelector(sel), el, `selector "${sel}" did not re-find the element`);
});

test('identical repeated cards resolve to distinct elements', () => {
  const card = '<div class="card"><div><div><div><div><div><button></button></div></div></div></div></div></div>';
  const d = doc(card + card + card);
  const buttons = [...d.querySelectorAll('button')];
  const selectors = buttons.map((b) => audit.selectorFor(b));
  assert.equal(new Set(selectors).size, buttons.length, 'selectors collide across identical cards');
  buttons.forEach((b, i) => {
    assert.equal(d.querySelector(selectors[i]), b, `selector "${selectors[i]}" hit the wrong card`);
  });
});

test('round-trip holds for every control and heading in the fixtures', () => {
  const fixtures = ['synthetic-broken', 'hackernews', 'craigslist', 'wikipedia']
    .map((n) => new URL(`../fixtures/${n}.html`, import.meta.url).pathname)
    .filter(existsSync);
  assert.ok(fixtures.length > 0, 'no fixtures found');
  for (const path of fixtures) {
    const { document: d } = parseHTML(readFileSync(path, 'utf8'));
    const els = d.querySelectorAll(
      'button, a[href], input, select, textarea, h1, h2, h3, h4, h5, h6'
    );
    for (const el of els) {
      const sel = audit.selectorFor(el);
      assert.equal(d.querySelector(sel), el, `${path}: "${sel}" did not re-find its element`);
    }
  }
});

// ----------------------------------------------------------------- headings

console.log('heading repair');

function repairsFor(html) {
  const issues = audit.run(doc(html)).issues;
  const h = issues.find((i) => i.kind === 'heading-structure');
  return h ? h.repairs.map((r) => `${r.from}->${r.to}`) : [];
}

test('sibling run stays a sibling run (h1,h3,h3 -> 1,2,2)', () => {
  assert.deepEqual(repairsFor('<h1>a</h1><h3>b</h3><h3>c</h3>'), ['3->2', '3->2']);
});

test('returning to a seen level rejoins its repaired level (h1,h3,h5,h3)', () => {
  assert.deepEqual(repairsFor('<h1>a</h1><h3>b</h3><h5>c</h5><h3>d</h3>'), [
    '3->2',
    '5->3',
    '3->2',
  ]);
});

test('new shallower level after a deep branch (h1,h3,h3,h2,h3 -> 1,2,2,2,3)', () => {
  assert.deepEqual(repairsFor('<h1>a</h1><h3>b</h3><h3>c</h3><h2>d</h2><h3>e</h3>'), [
    '3->2',
    '3->2',
  ]);
});

test('first heading is never promoted to h1', () => {
  assert.deepEqual(repairsFor('<h2>banner</h2><h1>title</h1><h2>section</h2>'), []);
  assert.deepEqual(repairsFor('<h2>a</h2><h4>b</h4>'), ['4->3']);
});

test('clean outline produces no repairs', () => {
  assert.deepEqual(repairsFor('<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>'), []);
});

test('re-audit after repair is idempotent (aria-level wins over tag)', () => {
  const d = doc('<h1>a</h1><h3>b</h3><h3>c</h3>');
  const first = audit.run(d).issues.find((i) => i.kind === 'heading-structure');
  for (const r of first.repairs) {
    const el = d.querySelector(r.selector);
    el.setAttribute('role', 'heading');
    el.setAttribute('aria-level', String(r.to));
  }
  const second = audit.run(d).issues.find((i) => i.kind === 'heading-structure');
  assert.equal(second, undefined, 're-audit found phantom repairs on an already-fixed page');
});

// ------------------------------------------------------------------ accname

console.log('accessible name');

function flagged(html, selector) {
  const d = doc(html);
  const el = d.querySelector(selector);
  const issues = audit.run(d).issues.filter((i) => i.kind === 'unlabeled-control');
  return issues.some((i) => d.querySelector(i.selector) === el);
}

test('textarea with label[for] is not flagged', () => {
  assert.equal(flagged('<label for="m">Your message</label><textarea id="m"></textarea>', 'textarea'), false);
});

test('select inside a wrapping label is not flagged', () => {
  assert.equal(flagged('<label>Country <select><option>US</option></select></label>', 'select'), false);
});

test('input with only a placeholder is not flagged (placeholder is the fallback name)', () => {
  assert.equal(flagged('<input type="text" placeholder="Search">', 'input'), false);
});

test('bare icon button is flagged', () => {
  assert.equal(flagged('<button class="icon-search"></button>', 'button'), true);
});

// -------------------------------------------------------------------- apply

console.log('apply + undo');

test('patches apply, record originals, and undo restores the page', () => {
  const d = doc(
    '<section id="wrap"><h4 aria-level="4">deep</h4><div><button aria-label="Old">x</button></div></section>'
  );
  globalThis.document = d;
  // Fresh require so the module binds to this document.
  delete require.cache[require.resolve('../src/apply.js')];
  const apply = require('../src/apply.js');

  const h = d.querySelector('h4');
  const b = d.querySelector('button');
  const patches = [
    { selector: audit.selectorFor(h), attrs: { role: 'heading', 'aria-level': '2' } },
    { selector: audit.selectorFor(b), attrs: { 'aria-label': 'Search', 'aria-description': 'Auto-labeled, unverified' } },
    { selector: '#does-not-exist', attrs: { role: 'main' } },
  ];
  const result = apply.applyPatches(patches);
  assert.equal(result.applied.length, 2, 'applied count must reflect real applications');
  assert.equal(result.total, 3);
  assert.equal(h.getAttribute('aria-level'), '2');
  assert.equal(b.getAttribute('aria-label'), 'Search');
  assert.equal(b.getAttribute('aria-description'), 'Auto-labeled, unverified');
  assert.equal(b.getAttribute('data-page-repair'), '1');

  const restored = apply.undoAll();
  assert.equal(restored, 2);
  assert.equal(h.getAttribute('aria-level'), '4', 'pre-existing value must be restored');
  assert.equal(h.getAttribute('role'), null, 'added attribute must be removed');
  assert.equal(b.getAttribute('aria-label'), 'Old', 'pre-existing label must be restored');
  assert.equal(b.getAttribute('aria-description'), null);
  assert.equal(b.getAttribute('data-page-repair'), null);
  delete globalThis.document;
});

test('patchesFromIssues keeps provenance out of the accessible name', () => {
  globalThis.document = doc('<div></div>');
  delete require.cache[require.resolve('../src/apply.js')];
  const apply = require('../src/apply.js');
  const labels = new Map([
    ['#a', { label: 'Search' }],
    ['#b', { label: 'Upvote story', unverified: true }],
  ]);
  const issues = [
    { kind: 'unlabeled-control', selector: '#a' },
    { kind: 'unlabeled-control', selector: '#b' },
    { kind: 'unlabeled-control', selector: '#c' }, // no label -> no patch
  ];
  const patches = apply.patchesFromIssues(issues, labels);
  assert.equal(patches.length, 2);
  assert.deepEqual(patches[0].attrs, { 'aria-label': 'Search' });
  assert.deepEqual(patches[1].attrs, {
    'aria-label': 'Upvote story',
    'aria-description': 'Auto-labeled, unverified',
  });
  delete globalThis.document;
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`);
