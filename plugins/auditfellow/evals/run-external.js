#!/usr/bin/env node
// Runs the eval cases against a non-Claude model (Gemini or OpenAI) with and without the
// materialized methodology (skills/auditfellow/SKILL.md as the system prompt), grades them
// with the same graders (regex + llm judge on Claude Haiku via `claude -p`), and writes a
// results file in the shape claude plugin eval produces, so report.js can merge it.
// Usage: node evals/run-external.js --provider gemini|openai --model <id> --label "Gemini 3.8 Flash"
//        [--runs 2] [--case <substring>] [--tag <tag>] [--judge claude-haiku-4-5] [--concurrency 3]
//        [--arm with|without|both] --out evals/results/<file>.json
const fs = require('fs');
const path = require('path');
const { execFile, execSync } = require('child_process');
function claudeBin() { if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN; try { return execSync('which claude', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {} const npx = path.join(process.env.HOME, '.npm', '_npx'); for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const b = path.join(npx, d, 'node_modules', '.bin', 'claude'); if (fs.existsSync(b)) return b; } throw new Error('claude binary not found; set CLAUDE_BIN'); }
const CLAUDE = claudeBin();
const here = __dirname;
const args = {}; const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const provider = args.provider; const model = args.model; const label = args.label || model;
const runs = Number(args.runs || 2); const judgeModel = args.judge || 'claude-haiku-4-5';
const conc = Number(args.concurrency || 3); const arms = args.arm === 'with' || args.arm === 'without' ? [args.arm] : ['with', 'without'];
const out = args.out || path.join(here, 'results', `ext-${model}.json`);
if (!provider || !model) { console.error('need --provider and --model'); process.exit(1); }

const PRICE = { // USD per 1M tokens: [input, output, cached input]
  'gemini-3.8-flash': [0.75, 3.75, 0.075], 'gemini-3.7-flash': [0.75, 3.75, 0.075], 'gemini-3.5-flash': [1.5, 9, 0.15],
  'gemini-3.1-pro-preview': [2, 12, 0.2], 'gemini-2.5-pro': [1.25, 10, 0.125], 'gemini-2.5-flash': [0.3, 2.5, 0.03],
  'gpt-5.6-terra': [2, 12, 0.2], 'gpt-5.6-luna': [0.2, 1.2, 0.02], 'gpt-5.6-sol': [4, 20, 0.4], 'gpt-5.4': [2.5, 15, 0.25], 'gpt-5.4-mini': [0.75, 4.5, 0.075], 'gpt-5.5': [5, 30, 0.5], 'gpt-5': [1.25, 10, 0.125], 'gpt-5-mini': [0.25, 2, 0.025],
};
const MAX_COST = Number(args['max-cost'] || 0); let spent = 0; let stopped = false;
const envFile = fs.readFileSync(path.join(process.env.HOME, 'audit-harness/web/.env'), 'utf8');
const envGet = (k) => { const m = envFile.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : process.env[k]; };
const SKILL = fs.readFileSync(path.join(here, '..', 'skills', 'auditfellow', 'SKILL.md'), 'utf8');
const SYSTEM_WITH = 'The AuditFellow methodology of this organization follows. It is the skill an internal auditor loaded before asking; apply it to the request exactly as it says. You have no file tools in this session: everything you need is in the text below.\n\n' + SKILL;

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); if (!m) return [{}, text];
  const fm = {}; for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i < 0) continue; const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    else if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1); else if (/^\d+$/.test(v)) v = Number(v);
    fm[k] = v; }
  return [fm, m[2].trim()];
}
function loadCases() {
  const cases = [];
  for (const d of fs.readdirSync(here)) {
    const p = path.join(here, d, 'prompt.md'); if (!fs.existsSync(p)) continue;
    const [fm, prompt] = frontmatter(fs.readFileSync(p, 'utf8'));
    if (args.case && !d.includes(args.case)) continue;
    if (args.tag && !(fm.tags || []).includes(args.tag)) continue;
    const graders = fs.readdirSync(path.join(here, d, 'graders')).filter((f) => f.endsWith('.md')).map((f) => { const [g, body] = frontmatter(fs.readFileSync(path.join(here, d, 'graders', f), 'utf8')); return { name: f.replace(/\.md$/, ''), ...g, rubric: body }; });
    cases.push({ name: d, prompt, tags: fm.tags || [], graders });
  }
  return cases;
}

let geminiCache = null;
async function callModel(system, prompt) {
  const t0 = Date.now();
  if (provider === 'gemini') {
    const key = envGet('GEMINI_API_KEY');
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8192 } };
    if (system) {
      // Explicit context cache for the methodology: paid once, then read at the cached rate.
      if (!geminiCache) geminiCache = (async () => { try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/cachedContents', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ model: `models/${model}`, systemInstruction: { parts: [{ text: system }] }, ttl: '5400s', displayName: 'auditfellow-eval' }) });
        const j = await r.json(); if (!r.ok || !j.name) { console.log('  (cache not created: ' + JSON.stringify(j).slice(0, 160) + ')'); return null; }
        console.log('  (methodology cached as ' + j.name + ')'); return j.name; } catch (e) { console.log('  (cache error ' + e.message + ')'); return null; } })();
      const name = await geminiCache;
      if (name) body.cachedContent = name; else body.systemInstruction = { parts: [{ text: system }] };
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(`gemini ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    const text = ((j.candidates || [])[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const u = j.usageMetadata || {}; const cached = u.cachedContentTokenCount || 0; const inp = (u.promptTokenCount || 0) - cached; const outp = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
    const pr = PRICE[model] || [0, 0, 0]; const cost = (inp * pr[0] + outp * pr[1] + cached * pr[2]) / 1e6;
    return { text, usage: { input: inp, output: outp, cached }, costUsd: cost, durationSeconds: (Date.now() - t0) / 1000 };
  }
  if (provider === 'openai') {
    const key = envGet('OPENAI_API_KEY'); if (!key) throw new Error('OPENAI_API_KEY not set');
    const messages = []; if (system) messages.push({ role: 'system', content: system }); messages.push({ role: 'user', content: prompt });
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages }) });
    const j = await r.json(); if (!r.ok) throw new Error(`openai ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    const text = j.choices?.[0]?.message?.content || ''; const u = j.usage || {}; const cached = u.prompt_tokens_details?.cached_tokens || 0;
    const pr = PRICE[model] || [0, 0, 0]; const inp = (u.prompt_tokens || 0) - cached; const outp = u.completion_tokens || 0;
    return { text, usage: { input: inp, output: outp, cached }, costUsd: (inp * pr[0] + outp * pr[1] + cached * pr[2]) / 1e6, durationSeconds: (Date.now() - t0) / 1000 };
  }
  throw new Error('unknown provider');
}

function judgeOnce(rubric, answer) {
  return new Promise((resolve) => {
    const prompt = `You grade one answer against one rubric. Apply the rubric literally.\n\nRUBRIC:\n${rubric}\n\nANSWER TO GRADE:\n<<<\n${answer}\n>>>\n\nReply with exactly one word: PASS or FAIL.`;
    const child = execFile(CLAUDE, ['-p', '--model', judgeModel, '--output-format', 'text', '--tools', '', '--no-session-persistence'], { maxBuffer: 1 << 24, env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } }, (err, stdout, stderr) => {
      const s = String(stdout || '').trim(); const v = /\bPASS\b/i.test(s) && !/\bFAIL\b/i.test(s) ? 'PASS' : /\bFAIL\b/i.test(s) ? 'FAIL' : 'UNKNOWN';
      resolve({ vote: v, raw: err ? String(stderr || err.message).slice(0, 200) : s.slice(0, 200) });
    });
    child.stdin.end(prompt);
  });
}
async function judge(rubric, answer) {
  const votes = await Promise.all([0, 1, 2].map(() => judgeOnce(rubric, answer)));
  const pass = votes.filter((v) => v.vote === 'PASS').length; const fail = votes.filter((v) => v.vote === 'FAIL').length;
  return { passed: pass > fail, explanation: 'judge votes: ' + votes.map((v) => v.vote).join(' ') + (votes.some((v) => v.vote === 'UNKNOWN') ? ' | ' + votes.map((v) => v.raw).join(' / ') : '') };
}
async function grade(c, text) {
  const graders = [];
  for (const g of c.graders) {
    if (g.type === 'tool_used') { graders.push({ name: g.name, passed: null, scored: false, explanation: 'no tools in this runner' }); continue; }
    const weight = Number(g.weight || 1);
    if (g.type === 'regex') {
      let re; try { re = new RegExp(g.pattern, String(g.flags || '')); } catch (e) { re = new RegExp(g.pattern); }
      const found = re.test(text); const want = g.match === 'not_contains' ? !found : found;
      graders.push({ name: g.name, passed: want, scored: true, weight, explanation: found ? 'pattern found' + (want ? '' : ' (expected absent)') : 'pattern not found' + (want ? ' (expected absent)' : ' in last_message') });
    } else if (g.type === 'llm') {
      const r = await judge(g.rubric, text); graders.push({ name: g.name, passed: r.passed, scored: true, weight, explanation: r.explanation });
    }
  }
  const scored = graders.filter((g) => g.scored); const tw = scored.reduce((s, g) => s + g.weight, 0);
  const score = tw ? scored.reduce((s, g) => s + (g.passed ? g.weight : 0), 0) / tw : 0;
  return { score, passed: score === 1, graders };
}

async function pool(items, n, fn) { const q = [...items]; const res = []; await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const it = q.shift(); res.push(await fn(it)); } })); return res; }

(async () => {
  const cases = loadCases(); const startedAt = new Date().toISOString(); const t0 = Date.now();
  console.log(`${label} (${provider}/${model}): ${cases.length} cases, ${runs} runs, arms ${arms.join('+')}`);
  const jobs = []; for (const c of cases) for (const arm of arms) for (let i = 0; i < runs; i++) jobs.push({ c, arm, i });
  const results = {};
  await pool(jobs, conc, async ({ c, arm, i }) => {
    let run;
    if (stopped || (MAX_COST && spent >= MAX_COST)) { if (!stopped) console.log(`  budget of ${MAX_COST} USD reached, remaining runs skipped`); stopped = true; results[c.name] = results[c.name] || { with: [], without: [] }; return; }
    try { const r = await callModel(arm === 'with' ? SYSTEM_WITH : '', c.prompt); const g = await grade(c, r.text); run = { ...g, costUsd: r.costUsd, durationSeconds: r.durationSeconds, usage: r.usage, turns: 1, lastMessage: r.text }; spent += r.costUsd; }
    catch (e) { run = { score: 0, passed: false, error: String(e.message).slice(0, 300), graders: [], costUsd: 0, durationSeconds: 0, turns: 0 }; }
    results[c.name] = results[c.name] || { with: [], without: [] }; results[c.name][arm][i] = run;
    console.log(`  ${c.name} ${arm} #${i + 1}: ${run.error ? 'ERROR ' + run.error : run.score.toFixed(2)}`);
  });
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const outCases = cases.map((c) => { const a = results[c.name]; const w = a.with.filter(Boolean); const wo = a.without.filter(Boolean);
    return { name: c.name, tags: c.tags, runsPerCase: runs, graders: c.graders.map((g) => ({ name: g.name, type: g.type })), arms: { with: w, without: wo },
      aggregates: { score: mean(w.map((r) => r.score)), passRate: mean(w.map((r) => (r.passed ? 1 : 0))), scoreWithout: mean(wo.map((r) => r.score)), passRateWithout: mean(wo.map((r) => (r.passed ? 1 : 0))), delta: mean(w.map((r) => r.score)) - mean(wo.map((r) => r.score)) } }; });
  const allRuns = outCases.flatMap((c) => [...c.arms.with, ...c.arms.without]);
  const doc = { schemaVersion: 'external-1', provider, model, label, judgeModel, startedAt, durationSeconds: (Date.now() - t0) / 1000, costUsd: allRuns.reduce((s, r) => s + (r.costUsd || 0), 0), partial: stopped, cases: outCases,
    aggregates: { casesTotal: outCases.length, overallScore: mean(outCases.map((c) => c.aggregates.score)), overallScoreWithout: mean(outCases.map((c) => c.aggregates.scoreWithout)), meanDelta: mean(outCases.map((c) => c.aggregates.delta)) } };
  fs.writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`\noverall with ${doc.aggregates.overallScore.toFixed(2)} without ${doc.aggregates.overallScoreWithout.toFixed(2)} | model cost ${doc.costUsd.toFixed(2)} USD | ${Math.round(doc.durationSeconds)} s\nwritten ${out}`);
})();
