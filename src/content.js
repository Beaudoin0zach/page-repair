/*
 * Orchestrator. Runs ONLY when the user invokes repair (toolbar button or
 * Alt+Shift+R) — never automatically on page load.
 *
 * Flow:
 *   1. Audit the page (fast, local).
 *   2. Apply deterministic fixes immediately (headings, landmarks).
 *   3. Announce the first result right away — the user is not left waiting
 *      on the network for the fixes that don't need it.
 *   4. Send ambiguous unlabeled controls to the background worker for LLM
 *      labeling; apply those patches when they come back and announce again.
 *
 * All timings are collected and logged so latency can be measured in situ.
 */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'repair-page') {
    repairPage();
  }
});

async function repairPage() {
  const t0 = performance.now();
  const { issues, auditMs } = PageRepairAudit.run(document);

  const deterministic = issues.filter((i) => !i.needsLlm);
  const ambiguous = issues.filter((i) => i.needsLlm);

  // Phase 1: instant fixes.
  const phase1Patches = PageRepairApply.patchesFromIssues(deterministic);
  const phase1 = PageRepairApply.applyPatches(phase1Patches);

  const headingFixes = phase1Patches.filter((p) => p.attrs['aria-level']).length;
  const landmarkFixes = phase1Patches.filter((p) => p.attrs.role === 'main').length;

  let summary = `Page repair: fixed ${headingFixes} heading levels` +
    (landmarkFixes ? `, added main landmark` : '');
  if (ambiguous.length > 0) {
    summary += `. Labeling ${ambiguous.length} unnamed controls…`;
  }
  PageRepairApply.announce(summary);

  console.log('[page-repair] phase 1', {
    auditMs: Math.round(auditMs),
    applyMs: Math.round(phase1.applyMs),
    headingFixes,
    landmarkFixes,
    ambiguousControls: ambiguous.length,
  });

  // Phase 2: LLM labels for ambiguous controls.
  if (ambiguous.length === 0) return;

  const tLlm = performance.now();
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'label-controls',
      issues: ambiguous.map((i) => ({ selector: i.selector, context: i.context })),
      pageTitle: document.title,
      pageUrl: location.href,
    });
  } catch (e) {
    PageRepairApply.announce('Page repair: could not label controls (extension error).');
    console.error('[page-repair] background error', e);
    return;
  }
  const llmMs = performance.now() - tLlm;

  if (response?.error) {
    PageRepairApply.announce(`Page repair: could not label controls. ${response.error}`);
    console.warn('[page-repair] labeling failed:', response.error);
    return;
  }

  const labels = new Map();
  for (const item of response?.labels || []) {
    // Confidence gate: a wrong label is worse than no label. Low-confidence
    // guesses get a hedged prefix rather than being stated as fact.
    if (item.confidence === 'high') {
      labels.set(item.selector, item.label);
    } else if (item.confidence === 'medium') {
      labels.set(item.selector, `${item.label} (auto-labeled, unverified)`);
    }
    // 'low' → skip entirely.
  }

  const phase2Patches = PageRepairApply.patchesFromIssues(
    ambiguous.filter((i) => labels.has(i.selector)),
    labels
  );
  const phase2 = PageRepairApply.applyPatches(phase2Patches);

  PageRepairApply.announce(
    `Page repair complete: labeled ${phase2.applied} of ${ambiguous.length} controls.`
  );

  console.log('[page-repair] phase 2', {
    llmMs: Math.round(llmMs),
    labeled: phase2.applied,
    skippedLowConfidence: ambiguous.length - labels.size,
    totalMs: Math.round(performance.now() - t0),
  });
}
