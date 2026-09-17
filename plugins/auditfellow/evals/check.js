#!/usr/bin/env node
// Structural check of the eval suite: every case has a prompt and graders, every
// grader declares a type the runner knows, and dimensions.json and the cases on
// disk agree. Reads only; no key, no model, no network. Usage: node evals/check.js
const fs = require('fs');
const path = require('path');
const here = __dirname;
const errors = [];
const fail = (m) => errors.push(m);

const GRADER_TYPES = new Set(['regex', 'llm', 'tool_used']);

function frontmatter(text, where) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) { fail(`${where}: no frontmatter block`); return [null, text]; }
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return [fm, m[2].trim()];
}

const cases = {};
for (const d of fs.readdirSync(here, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name === 'results' || d.name === 'mocks') continue;
  const dir = path.join(here, d.name);
  const prompt = path.join(dir, 'prompt.md');
  if (!fs.existsSync(prompt) && !fs.existsSync(path.join(dir, 'case.yaml'))) {
    fail(`${d.name}/: neither prompt.md nor case.yaml`);
    continue;
  }
  if (!fs.existsSync(prompt)) { cases[d.name] = []; continue; } // case.yaml carries its own graders
  const [, body] = frontmatter(fs.readFileSync(prompt, 'utf8'), `${d.name}/prompt.md`);
  if (!body) fail(`${d.name}/prompt.md: empty prompt`);
  const gdir = path.join(dir, 'graders');
  const graders = fs.existsSync(gdir) ? fs.readdirSync(gdir).filter((f) => f.endsWith('.md')) : [];
  if (!graders.length) fail(`${d.name}/: no graders`);
  for (const f of graders) {
    const [fm, rubric] = frontmatter(fs.readFileSync(path.join(gdir, f), 'utf8'), `${d.name}/graders/${f}`);
    if (!fm) continue;
    if (!fm.type) fail(`${d.name}/graders/${f}: no type`);
    else if (!GRADER_TYPES.has(fm.type)) fail(`${d.name}/graders/${f}: unknown type "${fm.type}"`);
    if (fm.type === 'regex') {
      const pattern = (fm.pattern || '').replace(/^(['"])([\s\S]*)\1$/, '$2');
      if (!pattern) fail(`${d.name}/graders/${f}: regex grader with no pattern`);
      else try { new RegExp(pattern); } catch (e) { fail(`${d.name}/graders/${f}: bad pattern (${e.message})`); }
    }
    if (fm.type === 'tool_used' && !fm.tool) fail(`${d.name}/graders/${f}: tool_used grader with no tool`);
    if (fm.type === 'llm' && !rubric) fail(`${d.name}/graders/${f}: llm grader with no rubric`);
  }
  cases[d.name] = graders.map((f) => f.replace(/\.md$/, ''));
}
if (!Object.keys(cases).length) fail('no eval cases found');

// dimensions.json drives report.js: a case or grader it does not know is dropped from the benchmark.
const dims = JSON.parse(fs.readFileSync(path.join(here, 'dimensions.json'), 'utf8'));
const listedCases = new Set(Object.values(dims.deliverables).flat());
for (const c of listedCases) if (!(c in cases)) fail(`dimensions.json: case "${c}" has no directory`);
const listedGraders = new Set([...Object.values(dims.quality).flat(), ...dims.ignore]);
for (const g of listedGraders) if (!Object.values(cases).some((gs) => gs.includes(g))) fail(`dimensions.json: grader "${g}" is used by no case`);
for (const [c, gs] of Object.entries(cases)) for (const g of gs) if (!listedGraders.has(g)) fail(`${c}/graders/${g}.md: in no dimensions.json quality row and not ignored`);
for (const c of dims.multilingualCases) if (!listedCases.has(c)) fail(`dimensions.json: multilingual case "${c}" is in no deliverable row`);
for (const d of Object.keys({ ...dims.deliverables, ...dims.quality })) if (!dims.descriptions[d]) fail(`dimensions.json: no description for "${d}"`);

if (errors.length) { for (const e of errors) console.error(`  ${e}`); console.error(`\n${errors.length} problem(s) in the eval suite`); process.exit(1); }
console.log(`eval suite OK: ${Object.keys(cases).length} cases, ${Object.values(cases).flat().length} graders`);
