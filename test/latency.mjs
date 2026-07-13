/*
 * Empirical latency harness. Answers the question the ASSETS 2025 paper
 * left open: what does page repair cost at interactive timescales when you
 * prune the model's input to just the broken elements?
 *
 * Their baseline (full-page regeneration): 220K tokens, 1-5 min, $0.50-2.20
 * per page. This measures ours: audit time (pure DOM walk) + one structured
 * API call carrying only the unlabeled controls' local context.
 *
 * Usage:
 *   node test/latency.mjs                # audit-only (no model call)
 *   node test/latency.mjs --llm          # + model call (requires ANTHROPIC_API_KEY)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PageRepairAudit = require('../src/audit.js');

const FIXTURES_DIR = new URL('../fixtures/', import.meta.url).pathname;
const useLlm = process.argv.includes('--llm');

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          label: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['selector', 'label', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['labels'],
  additionalProperties: false,
};

function buildPrompt(batch, title) {
  return [
    `You are labeling unnamed interactive controls on a web page so a screen reader user can understand them.`,
    `Page title: ${title}`,
    ``,
    `For each control below, infer a short action-oriented label (2-5 words) from its HTML context.`,
    `Rate confidence honestly: "high" = unambiguous, "medium" = reasonable inference, "low" = guessing (will not be applied). A wrong label is worse for the user than no label.`,
    ``,
    `Controls:`,
    JSON.stringify(batch, null, 1),
  ].join('\n');
}

async function labelWithSdk(prompt) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();
  const t0 = performance.now();
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    output_config: { format: { type: 'json_schema', schema: LABEL_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  const ms = performance.now() - t0;
  const text = response.content.find((b) => b.type === 'text')?.text || '{}';
  return { labels: JSON.parse(text).labels || [], ms, usage: response.usage, backend: 'sdk' };
}

const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.html'));
console.log(`Fixtures: ${files.join(', ')}\n`);

for (const file of files) {
  const html = readFileSync(FIXTURES_DIR + file, 'utf8');
  const { document } = parseHTML(html);

  const t0 = performance.now();
  const { issues } = PageRepairAudit.run(document);
  const auditMs = performance.now() - t0;

  const unlabeled = issues.filter((i) => i.kind === 'unlabeled-control');
  const headingIssue = issues.find((i) => i.kind === 'heading-structure');
  const mainIssue = issues.find((i) => i.kind === 'missing-main');

  console.log(`=== ${file} (${(html.length / 1024).toFixed(0)} KB) ===`);
  console.log(`  audit: ${auditMs.toFixed(1)} ms`);
  console.log(`  unlabeled controls: ${unlabeled.length}`);
  console.log(`  heading repairs (deterministic): ${headingIssue?.repairs.length || 0}`);
  console.log(`  missing main landmark: ${mainIssue ? 'yes (deterministic fix)' : 'no'}`);
  if (headingIssue) {
    for (const r of headingIssue.repairs.slice(0, 5)) {
      console.log(`    h${r.from} -> h${r.to}: "${r.text}"`);
    }
    if (headingIssue.repairs.length > 5) console.log(`    ... +${headingIssue.repairs.length - 5} more`);
  }

  if (useLlm && unlabeled.length > 0) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('  --llm requires ANTHROPIC_API_KEY; skipping model call');
      console.log('');
      continue;
    }
    const batch = unlabeled.slice(0, 40).map((i) => ({ selector: i.selector, context: i.context }));
    const prompt = buildPrompt(batch, document.title || file);
    console.log(`  prompt size: ${(prompt.length / 4).toFixed(0)} tokens (approx)`);
    try {
      const result = await labelWithSdk(prompt);
      console.log(`  LLM labeling (${result.backend}): ${(result.ms / 1000).toFixed(1)} s for ${batch.length} controls`);
      if (result.usage) console.log(`  usage: ${JSON.stringify(result.usage)}`);
      const byConf = { high: 0, medium: 0, low: 0 };
      for (const l of result.labels) byConf[l.confidence] = (byConf[l.confidence] || 0) + 1;
      console.log(`  labels returned: ${result.labels.length} (high: ${byConf.high}, medium: ${byConf.medium}, low/skipped: ${byConf.low})`);
      for (const l of result.labels.slice(0, 8)) {
        console.log(`    [${l.confidence}] ${l.selector} -> "${l.label}"`);
      }
    } catch (e) {
      console.log(`  LLM labeling failed: ${String(e.message || e).slice(0, 200)}`);
    }
  }
  console.log('');
}
