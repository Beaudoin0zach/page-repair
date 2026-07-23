/*
 * Store-listing invariants.
 *
 * The Chrome Web Store summary field (a.k.a. short description) is capped at
 * 132 characters and is reused verbatim as the manifest.json description. Both
 * are shipped artifacts, so both are asserted here against the real files —
 * never against a hand-counted number in a planning doc. If the summary grows
 * past 132 the listing is rejected at submit; if it drifts from the manifest
 * the two public surfaces disagree.
 *
 * Run: node test/store-listing.mjs   (or npm test)
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const CHROME_SUMMARY_MAX = 132;

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

// Extract the summary by its heading, not by line number: the first non-empty
// content line after the "## Summary" heading. Line numbers rot; headings don't.
function storeSummary() {
  const lines = readFileSync(new URL('../STORE_LISTING.md', import.meta.url), 'utf8').split('\n');
  const i = lines.findIndex((l) => /^##\s+Summary\b/i.test(l));
  assert.notEqual(i, -1, 'no "## Summary" heading in STORE_LISTING.md — did the section move?');
  const body = lines.slice(i + 1).find((l) => l.trim() !== '' && !l.startsWith('#'));
  assert.ok(body, 'found "## Summary" heading but no content line under it');
  return body.trim();
}

function manifestDescription() {
  const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  return m.description;
}

console.log('store listing');

test(`summary is within the ${CHROME_SUMMARY_MAX}-char Chrome limit`, () => {
  const s = storeSummary();
  assert.ok(
    s.length <= CHROME_SUMMARY_MAX,
    `summary is ${s.length} chars, over the ${CHROME_SUMMARY_MAX} limit:\n    "${s}"`
  );
});

test('manifest.json description matches the store summary exactly', () => {
  const summary = storeSummary();
  const desc = manifestDescription();
  assert.equal(
    desc,
    summary,
    `manifest.json description and STORE_LISTING.md summary have drifted:\n` +
      `    manifest: "${desc}"\n    listing:  "${summary}"`
  );
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`);
