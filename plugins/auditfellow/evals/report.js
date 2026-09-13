#!/usr/bin/env node
// Builds benchmark.json from eval results: deliverable rows from case scores,
// quality rows from grader pass rates, per model, with and without the plugin.
// Usage: node evals/report.js <model label>=<results file>[,<results file>...] ... [--out file]
// Later files override earlier ones for the same case.
const fs = require('fs');
const path = require('path');
const here = __dirname;
const dims = JSON.parse(fs.readFileSync(path.join(here, 'dimensions.json'), 'utf8'));
const args = process.argv.slice(2);
let out = path.join(here, 'results', 'benchmark.json');
const models = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { out = args[++i]; continue; }
  const [label, files] = args[i].split('=');
  models.push({ label, files: files.split(',') });
}
if (!models.length) { console.error('no models given'); process.exit(1); }

const graderDim = {};
for (const [d, gs] of Object.entries(dims.quality)) for (const g of gs) graderDim[g] = d;
const caseRow = {};
for (const [d, cs] of Object.entries(dims.deliverables)) for (const c of cs) caseRow[c] = d;

const pct = (a) => (a[1] ? Math.round((100 * a[0]) / a[1]) : null);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

const result = { generatedAt: new Date().toISOString(), models: [], rows: [], overall: {}, notes: [] };
for (const m of models) {
  const cases = {};
  let cost = 0;
  let judge = null; let claudeVersion = null; let packLine = null;
  for (const f of m.files) {
    const j = JSON.parse(fs.readFileSync(path.resolve(here, 'results', f), 'utf8'));
    cost += j.costUsd || 0;
    claudeVersion = j.claudeVersion || claudeVersion;
    for (const c of j.cases) cases[c.name] = c; // later file wins
  }
  const missing = Object.keys(caseRow).filter((c) => !cases[c]);
  if (missing.length) result.notes.push(`${m.label}: no result for ${missing.join(', ')}`);
  // deliverable rows
  const rows = {};
  for (const [row, cs] of Object.entries(dims.deliverables)) {
    const w = []; const wo = [];
    for (const c of cs) { const a = cases[c] && cases[c].aggregates; if (!a) continue; w.push(a.score); wo.push(a.scoreWithout); }
    rows[row] = { alone: wo.length ? Math.round(100 * mean(wo)) : null, with: w.length ? Math.round(100 * mean(w)) : null, n: w.length };
  }
  // quality rows: grader pass rates over every run
  const acc = {};
  for (const c of Object.values(cases)) {
    const ml = dims.multilingualCases.includes(c.name);
    for (const arm of ['with', 'without']) {
      for (const run of c.arms[arm] || []) {
        for (const g of run.graders || []) {
          const ds = [];
          if (graderDim[g.name]) ds.push(graderDim[g.name]);
          if (ml && g.name === 'substance') ds.push('Multilingual');
          if (!ds.length && !(dims.ignore || []).includes(g.name)) result.notes.push(`unmapped grader ${g.name} in ${c.name}`);
          for (const d of ds) {
            acc[d] = acc[d] || { with: [0, 0], without: [0, 0] };
            acc[d][arm][0] += g.passed ? 1 : 0; acc[d][arm][1] += 1;
          }
        }
      }
    }
  }
  for (const d of Object.keys(dims.quality)) {
    const a = acc[d] || { with: [0, 0], without: [0, 0] };
    rows[d] = { alone: pct(a.without), with: pct(a.with), n: a.with[1] };
  }
  const all = Object.values(cases).map((c) => c.aggregates).filter(Boolean);
  result.overall[m.label] = { alone: Math.round(100 * mean(all.map((a) => a.scoreWithout))), with: Math.round(100 * mean(all.map((a) => a.score))), cases: all.length };
  const vendor = /^gemini/i.test(m.label) ? 'Gemini' : /^(gpt|o\d|openai)/i.test(m.label) ? 'OpenAI' : 'Claude';
  result.models.push({ label: m.label, vendor, files: m.files, costUsd: Math.round(cost * 100) / 100, cases: all.length, claudeVersion });
  for (const [name, s] of Object.entries(rows)) {
    let r = result.rows.find((x) => x.name === name);
    if (!r) { r = { group: dims.deliverables[name] ? 'deliverables' : 'quality', name, description: dims.descriptions[name] || '', scores: {} }; result.rows.push(r); }
    r.scores[m.label] = s;
  }
}
result.notes = [...new Set(result.notes)];
fs.writeFileSync(out, JSON.stringify(result, null, 2));
// console table
const labels = result.models.map((m) => m.label);
console.log('| Row | ' + labels.map((l) => `${l} alone | ${l} with`).join(' | ') + ' |');
for (const r of result.rows) console.log(`| ${r.name} | ` + labels.map((l) => { const s = r.scores[l] || {}; return `${s.alone ?? '-'} | ${s.with ?? '-'}`; }).join(' | ') + ' |');
console.log('| Overall | ' + labels.map((l) => `${result.overall[l].alone} | ${result.overall[l].with}`).join(' | ') + ' |');
if (result.notes.length) console.log('\nnotes:\n' + result.notes.join('\n'));
console.log('\nwritten ' + out);
