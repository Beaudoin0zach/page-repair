/*
 * Patch applier. Design rules (all from screen reader user research — see
 * README):
 *   - ARIA-attribute patches only. Never rewrite HTML, never remove nodes,
 *     never touch event handlers. Site JavaScript keeps working.
 *   - Never move focus. Never scroll. Never speak except through one polite
 *     live region, and only immediately after the user invoked the repair.
 *   - Patches must survive SPA re-renders: a MutationObserver re-applies any
 *     patch whose target gets replaced or whose attribute gets clobbered.
 */

const PageRepairApply = (() => {
  // selector -> { attrs: {name: value} }
  const registry = new Map();
  let observer = null;

  function setAttrs(el, attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }
    el.setAttribute('data-page-repair', '1');
  }

  function applyOne(patch) {
    const el = document.querySelector(patch.selector);
    if (!el) return false;
    setAttrs(el, patch.attrs);
    registry.set(patch.selector, patch);
    return true;
  }

  function applyPatches(patches) {
    const t0 = performance.now();
    let applied = 0;
    for (const patch of patches) {
      if (applyOne(patch)) applied++;
    }
    ensureObserver();
    return { applied, total: patches.length, applyMs: performance.now() - t0 };
  }

  // Re-apply patches when the site re-renders. Debounced so a burst of
  // mutations costs one sweep.
  function ensureObserver() {
    if (observer || registry.size === 0) return;
    let pending = false;
    observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        reapplyAll();
      }, 250);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-level', 'role'],
    });
  }

  function reapplyAll() {
    let reapplied = 0;
    for (const patch of registry.values()) {
      const el = document.querySelector(patch.selector);
      if (!el) continue;
      for (const [name, value] of Object.entries(patch.attrs)) {
        if (el.getAttribute(name) !== value) {
          el.setAttribute(name, value);
          reapplied++;
        }
      }
    }
    return reapplied;
  }

  // One polite live region for the post-repair summary. Screen readers
  // announce it without stealing focus or interrupting mid-utterance.
  function announce(message) {
    let region = document.getElementById('page-repair-status');
    if (!region) {
      region = document.createElement('div');
      region.id = 'page-repair-status';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.style.cssText =
        'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
      document.body.appendChild(region);
    }
    // Clear then set so repeat announcements fire.
    region.textContent = '';
    setTimeout(() => {
      region.textContent = message;
    }, 50);
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
        const label = llmLabels.get(issue.selector);
        if (label) {
          patches.push({ selector: issue.selector, attrs: { 'aria-label': label } });
        }
      }
    }
    return patches;
  }

  return { applyPatches, announce, patchesFromIssues, reapplyAll };
})();
