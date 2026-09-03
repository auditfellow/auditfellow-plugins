#!/usr/bin/env node
// SessionStart hook. Refreshes the methodology skill inside this plugin from
// the AuditFellow pack when the key on this machine is valid, at most once a
// day. Prints one line of context for the session; never blocks it.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'auditfellow');
const STATE = path.join(os.homedir(), '.auditfellow', 'license.json');
const STAMP = path.join(ROOT, '.synced-at');

function say(s) { process.stdout.write(s + '\n'); }

try {
  let state = null; try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  if (!state || !state.key) {
    say('AuditFellow: no key on this machine yet. When the person asks for an audit deliverable, ask for their AuditFellow key (af_live_...) and run: npx -y auditfellow@latest init --key <key> --dir "' + SKILL + '". Keys: https://auditfellow.app (seven days free).');
    process.exit(0);
  }
  const fresh = fs.existsSync(STAMP) && (Date.now() - fs.statSync(STAMP).mtimeMs) < 24 * 3600e3 && fs.existsSync(path.join(SKILL, 'SKILL.md'));
  if (!fresh) {
    execFileSync('npx', ['-y', 'auditfellow@latest', 'update', '--dir', SKILL], { stdio: 'ignore', timeout: 50000 });
    fs.writeFileSync(STAMP, new Date().toISOString());
  }
  say('AuditFellow: methodology loaded (skill "auditfellow"). Use it for any internal audit deliverable or question.');
} catch (e) {
  say('AuditFellow: could not refresh the methodology (' + (e.message || e) + '). The last good copy stays in use if there is one.');
}
