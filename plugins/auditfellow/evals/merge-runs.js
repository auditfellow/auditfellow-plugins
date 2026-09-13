#!/usr/bin/env node
// Merges several result files of the same model into one: runs are appended per case and arm,
// errored runs dropped, aggregates recomputed. Usage: node evals/merge-runs.js out.json in1.json in2.json ...
const fs = require('fs'); const path = require('path');
const [out, ...ins] = process.argv.slice(2);
const docs = ins.map((f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const cases = {};
for (const d of docs) for (const c of d.cases) { const m = cases[c.name] = cases[c.name] || { ...c, arms: { with: [], without: [] } }; for (const arm of ['with', 'without']) m.arms[arm].push(...(c.arms[arm] || []).filter((r) => !r.error)); }
const outCases = Object.values(cases).map((c) => { const w = c.arms.with; const wo = c.arms.without; c.runsPerCase = Math.max(w.length, wo.length);
  c.aggregates = { score: mean(w.map((r) => r.score)), passRate: mean(w.map((r) => (r.passed ? 1 : 0))), scoreWithout: mean(wo.map((r) => r.score)), passRateWithout: mean(wo.map((r) => (r.passed ? 1 : 0))), delta: mean(w.map((r) => r.score)) - mean(wo.map((r) => r.score)) }; return c; });
const all = outCases.flatMap((c) => [...c.arms.with, ...c.arms.without]);
const doc = { ...docs[0], mergedFrom: ins.map((f) => path.basename(f)), costUsd: docs.reduce((s, d) => s + (d.costUsd || 0), 0), partial: false, cases: outCases,
  aggregates: { casesTotal: outCases.length, overallScore: mean(outCases.map((c) => c.aggregates.score)), overallScoreWithout: mean(outCases.map((c) => c.aggregates.scoreWithout)), meanDelta: mean(outCases.map((c) => c.aggregates.delta)) } };
fs.writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(`merged ${ins.length} files, ${outCases.length} cases, ${all.length} runs, cost ${doc.costUsd.toFixed(2)} USD, with ${doc.aggregates.overallScore.toFixed(2)} without ${doc.aggregates.overallScoreWithout.toFixed(2)} -> ${out}`);
