/*
 * Patch applier. Design rules (all from screen reader user research — see
 * README):
 *   - ARIA-attribute patches only. Never rewrite HTML, never remove nodes,
 *     never touch event handlers. Site JavaScript keeps working.
 *   - Never move focus. Never scroll. Never speak except through one polite
 *     live region, and only immediately after the user invoked the repair.
 *   - Every patch records the attribute values it replaced, so the user can
 *     undo all repairs and get the original page back. If a re-render wipes
 *     a patch, re-invoking repair is the recovery path — we never fight the
 *     page for control of its own attributes.
 */

const PageRepairApply = (() => {
  // selector -> { attrs, originals } — originals hold the pre-patch value
  // of each attribute (null if it was absent) for undo.
  const registry = new Map();

  function applyOne(patch) {
    const el = document.querySelector(patch.selector);
    if (!el) return false;
    const existing = registry.get(patch.selector);
    const originals = existing ? existing.originals : {};
    for (const [name, value] of Object.entries(patch.attrs)) {
      if (!(name in originals)) originals[name] = el.getAttribute(name);
      if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }
    el.setAttribute('data-page-repair', '1');
    registry.set(patch.selector, {
      attrs: existing ? { ...existing.attrs, ...patch.attrs } : { ...patch.attrs },
      originals,
    });
    return true;
  }

  function applyPatches(patches) {
    const t0 = performance.now();
    const applied = [];
    for (const patch of patches) {
      if (applyOne(patch)) applied.push(patch);
    }
    return { applied, total: patches.length, applyMs: performance.now() - t0 };
  }

  // Restore every patched attribute to its original value (removing ones we
  // added). Returns how many elements were restored.
  function undoAll() {
    let restored = 0;
    for (const [selector, { attrs, originals }] of registry) {
      const el = document.querySelector(selector);
      if (!el) continue;
      for (const name of Object.keys(attrs)) {
        const original = originals[name];
        if (original === null || original === undefined) {
          el.removeAttribute(name);
        } else {
          el.setAttribute(name, original);
        }
      }
      el.removeAttribute('data-page-repair');
      restored++;
    }
    registry.clear();
    return restored;
  }

  // One polite live region for the post-repair summary. Screen readers
  // announce it without stealing focus or interrupting mid-utterance.
  let regionCreatedAt = 0;

  function ensureRegion() {
    let region = document.getElementById('page-repair-status');
    if (!region) {
      region = document.createElement('div');
      region.id = 'page-repair-status';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.style.cssText =
        'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
      (document.body || document.documentElement).appendChild(region);
      regionCreatedAt = performance.now();
    }
    return region;
  }

  function announce(message) {
    const region = ensureRegion();
    // Screen readers drop changes to a live region that entered the DOM in
    // the same breath — the region must be in the accessibility tree before
    // its content mutates. Give a just-created region ~300ms to register;
    // established regions only need clear-then-set so repeats re-fire.
    const age = performance.now() - regionCreatedAt;
    const delay = age < 300 ? Math.max(300 - age, 50) : 50;
    region.textContent = '';
    setTimeout(() => {
      region.textContent = message;
    }, delay);
  }

  function patchesFromIssues(issues, llmLabels = new Map()) {
    const patches = [];
    for (const issue of issues) {
      if (issue.kind === 'heading-structure') {
        for (const r of issue.repairs) {
          patches.push({
            selector: r.selector,
            attrs: { role: 'heading', 'aria-level': String(r.to) },
          });
        }
      } else if (issue.kind === 'missing-main') {
        patches.push({ selector: issue.selector, attrs: { role: 'main' } });
      } else if (issue.kind === 'unlabeled-control') {
        const item = llmLabels.get(issue.selector);
        if (item) {
          const attrs = { 'aria-label': item.label };
          // Provenance lives in aria-description, not the accessible name:
          // it announces after the name at lower priority, is suppressible
          // via verbosity settings, stays off braille displays, and doesn't
          // break voice-control users matching on the name.
          if (item.unverified) attrs['aria-description'] = 'Auto-labeled, unverified';
          patches.push({ selector: issue.selector, attrs });
        }
      }
    }
    return patches;
  }

  return { applyPatches, announce, ensureRegion, patchesFromIssues, undoAll };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageRepairApply;
}
