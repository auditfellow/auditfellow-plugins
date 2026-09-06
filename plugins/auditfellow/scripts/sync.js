#!/usr/bin/env node
// SessionStart hook. Refreshes the methodology skill inside this plugin from
// the AuditFellow pack when the key on this machine is valid, at most once a
// day. Returns one line of context for the session; never blocks it.
// Claude Code runs this file directly (plain text on stdout);
// Cursor runs sync-cursor.js, which wraps the same line as JSON.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'auditfellow');
const STATE = path.join(os.homedir(), '.auditfellow', 'license.json');
const STAMP = path.join(ROOT, '.synced-at');

function sync() {
  try {
    let state = null; try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
    if (!state || !state.key) {
      return 'AuditFellow: no key on this machine yet. When the person asks for an audit deliverable, ask for their AuditFellow key (af_live_...) and run: npx -y auditfellow@latest init --key <key> --dir "' + SKILL + '". Keys: https://auditfellow.app (free trial, no card).';
    }
    const fresh = fs.existsSync(STAMP) && (Date.now() - fs.statSync(STAMP).mtimeMs) < 24 * 3600e3 && fs.existsSync(path.join(SKILL, 'SKILL.md'));
    if (!fresh) {
      execFileSync('npx', ['-y', 'auditfellow@latest', 'update', '--dir', SKILL], { stdio: 'ignore', timeout: 50000 });
      fs.writeFileSync(STAMP, new Date().toISOString());
    }
    let notice = ''; try { notice = (JSON.parse(fs.readFileSync(STATE, 'utf8')).notice || '').trim(); } catch {}
    return 'AuditFellow: methodology loaded (skill "auditfellow"). Use it for any internal audit deliverable or question.' + (notice ? ' Tell the person first, once: ' + notice : '');
  } catch (e) {
    return 'AuditFellow: could not refresh the methodology (' + (e.message || e) + '). The last good copy stays in use if there is one.';
  }
}

module.exports = { sync, SKILL };
if (require.main === module) process.stdout.write(sync() + '\n');
