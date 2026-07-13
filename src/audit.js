/*
 * Audit engine — read-only. Finds the three problem classes this prototype
 * targets (all from WebAIM's top-ten list):
 *   1. Controls with no accessible name (buttons, links, inputs)
 *   2. Broken heading structure (level skips)
 *   3. Missing landmarks (main)
 *
 * Every issue carries either a deterministic fix (computable from the DOM
 * alone) or `needsLlm: true` with enough surrounding context for a model to
 * propose a label. Runs in the content script and, for testing, under Node
 * via linkedom — so it only touches standard DOM APIs on the passed document.
 */

const PageRepairAudit = (() => {
  // Rough accessible-name computation. Not a full accname implementation —
  // it only needs to answer "would a screen reader have anything to say?"
  function accessibleName(el, doc) {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (text) return text;
    }

    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (tag === 'INPUT') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (['submit', 'button', 'reset'].includes(type) && el.getAttribute('value')) {
          return el.getAttribute('value').trim();
        }
      }
      // <label for>/wrapping <label> name any form control, not just <input>.
      if (el.id) {
        const label = doc.querySelector(`label[for="${CSS_escape(el.id)}"]`);
        if (label && label.textContent.trim()) return label.textContent.trim();
      }
      const wrapping = el.closest('label');
      if (wrapping && wrapping.textContent.trim()) return wrapping.textContent.trim();
      // Browsers fall back to placeholder as the accessible name — a control
      // with one is not unnamed, and an LLM aria-label would override it.
      const placeholder = el.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) return placeholder.trim();
    }

    const text = (el.textContent || '').trim();
    if (text) return text;

    for (const img of el.querySelectorAll('img[alt], svg[aria-label]')) {
      const alt = img.getAttribute('alt') || img.getAttribute('aria-label');
      if (alt && alt.trim()) return alt.trim();
    }

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    return '';
  }

  // CSS.escape isn't available under linkedom; minimal fallback.
  function CSS_escape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return s.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  // Unique selector for re-finding the element. Anchors at the nearest
  // id-bearing ancestor (or <body>) and disambiguates every level with
  // :nth-of-type, so the resulting child-combinator chain matches exactly
  // the audited element — patches must never land on a lookalike.

  // Real pages reuse ids (invalid but common — craigslist does it), and
  // querySelector resolves a duplicated #id to the FIRST match. Only anchor
  // on an id if this node is that first match.
  function idAnchors(node) {
    try {
      return node.ownerDocument.querySelector(`#${CSS_escape(node.id)}`) === node;
    } catch {
      return false;
    }
  }

  function selectorFor(el) {
    if (el.id && idAnchors(el)) return `#${CSS_escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.id && idAnchors(node)) {
        parts.unshift(`#${CSS_escape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase();
      if (part === 'body' || part === 'html') {
        parts.unshift(part);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  // Context the LLM (or a human reviewer) can use to guess what a control does.
  function contextFor(el) {
    const ctx = {
      tag: el.tagName.toLowerCase(),
      classes: (el.getAttribute('class') || '').slice(0, 120),
      href: el.getAttribute('href') || undefined,
      type: el.getAttribute('type') || undefined,
      name: el.getAttribute('name') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      dataAttrs: {},
      innerHtml: (el.innerHTML || '').slice(0, 300),
      nearbyText: '',
    };
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith('data-') && ctx.dataAttrs && Object.keys(ctx.dataAttrs).length < 5) {
        ctx.dataAttrs[attr.name] = String(attr.value).slice(0, 60);
      }
    }
    const parent = el.parentElement;
    if (parent) {
      ctx.nearbyText = (parent.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    }
    return ctx;
  }

  function isVisible(el) {
    // Content-script path: use layout. Node/linkedom path: assume visible.
    if (typeof el.getClientRects === 'function') {
      try {
        if (el.getClientRects().length === 0 && !el.closest('details')) return false;
      } catch {
        /* linkedom throws on layout APIs — treat as visible */
      }
    }
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  }

  function auditControls(doc) {
    const issues = [];
    const controls = doc.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), [role="button"], [role="link"], select, textarea'
    );
    for (const el of controls) {
      if (!isVisible(el)) continue;
      if (accessibleName(el, doc)) continue;

      // Deterministic label sources first: title, img alt handled in accname;
      // anything left is genuinely ambiguous → LLM.
      issues.push({
        kind: 'unlabeled-control',
        selector: selectorFor(el),
        context: contextFor(el),
        needsLlm: true,
      });
    }
    return issues;
  }

  function auditHeadings(doc) {
    const issues = [];
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
      .filter(isVisible)
      .map((el) => ({
        el,
        selector: selectorFor(el),
        // Effective level: aria-level wins over the tag so a page's own
        // overrides — and our previous repair — are respected. This makes
        // re-invocation idempotent instead of re-announcing phantom fixes.
        level:
          Number(el.getAttribute('aria-level')) ||
          (el.tagName[0] === 'H' && el.tagName.length === 2 ? Number(el.tagName[1]) : 2),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      }));

    if (headings.length === 0) return issues;

    // Repair plan: clamp downward jumps of more than one level, keeping
    // same-level sibling runs at the same repaired level (h1,h3,h3 must
    // become 1,2,2 — not 1,2,3). The first heading is never promoted: we
    // can't know it's the page title, and crowning a cookie banner or
    // sidebar heading as h1 corrupts the outline worse than a missing h1.
    // Uses aria-level so the visual style is untouched.
    let prevOrig = 0;
    let prevTarget = 0;
    const assigned = new Map(); // original level -> repaired level in the current branch
    const repairs = [];
    for (const h of headings) {
      let target;
      if (prevOrig === 0) {
        target = h.level;
      } else if (h.level === prevOrig) {
        target = prevTarget;
      } else if (h.level > prevOrig) {
        target = Math.min(h.level, prevTarget + 1);
      } else {
        // Moving back up: rejoin the level this depth mapped to before,
        // and forget deeper mappings — they belonged to the closed branch.
        target = assigned.has(h.level) ? assigned.get(h.level) : Math.min(h.level, prevTarget);
        for (const k of [...assigned.keys()]) {
          if (k > h.level) assigned.delete(k);
        }
      }
      assigned.set(h.level, target);
      if (target !== h.level) {
        repairs.push({ selector: h.selector, from: h.level, to: target, text: h.text });
      }
      prevOrig = h.level;
      prevTarget = target;
    }
    if (repairs.length > 0) {
      issues.push({ kind: 'heading-structure', repairs, needsLlm: false });
    }
    return issues;
  }

  function auditLandmarks(doc) {
    const issues = [];
    if (!doc.querySelector('main, [role="main"]')) {
      // Heuristic: largest text-bearing block-level candidate.
      const candidates = doc.querySelectorAll('article, #content, #main, .content, .main, [class*="content"]');
      let best = null;
      let bestLen = 0;
      for (const c of candidates) {
        const len = (c.textContent || '').length;
        if (len > bestLen) {
          best = c;
          bestLen = len;
        }
      }
      if (best && bestLen > 500) {
        issues.push({
          kind: 'missing-main',
          selector: selectorFor(best),
          needsLlm: false,
        });
      }
    }
    return issues;
  }

  function run(doc) {
    const t0 = now();
    const issues = [
      ...auditControls(doc),
      ...auditHeadings(doc),
      ...auditLandmarks(doc),
    ];
    return { issues, auditMs: now() - t0 };
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  return { run, selectorFor };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageRepairAudit;
}
