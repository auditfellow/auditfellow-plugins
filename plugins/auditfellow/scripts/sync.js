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
      return 'AuditFellow: use the auditfellow MCP tools (call auditfellow_start first) for any internal audit deliverable or question. If the server is not connected yet, tell the person to type /mcp, pick auditfellow and sign in with their AuditFellow account (https://auditfellow.app, free trial, no card). A key pasted in the chat also works: npx -y auditfellow@latest init --key <key> --dir "' + SKILL + '".';
    }
    const fresh = fs.existsSync(STAMP) && (Date.now() - fs.statSync(STAMP).mtimeMs) < 24 * 3600e3 && fs.existsSync(path.join(SKILL, 'SKILL.md'));
    if (!fresh) {
      execFileSync('npx', ['-y', 'auditfellow@latest', 'update', '--dir', SKILL], { stdio: 'ignore', timeout: 50000 });
      fs.writeFileSync(STAMP, new Date().toISOString());
    }
    let notice = '', changed = '';
    try { const st = JSON.parse(fs.readFileSync(STATE, 'utf8')); notice = (st.notice || '').trim(); if (st.packChangedAt && (Date.now() - Date.parse(st.packChangedAt)) < 36 * 3600e3) changed = String(st.packVersion || '').slice(0, 10); } catch {}
    return 'AuditFellow: methodology loaded (skill "auditfellow"). Use it for any internal audit deliverable or question.' + (changed ? ' The methodology was updated on ' + changed + '; tell the person once, in one line, before the first deliverable.' : '') + (notice ? ' Tell the person first, once: ' + notice : '');
  } catch (e) {
    return 'AuditFellow: could not refresh the methodology (' + (e.message || e) + '). The last good copy stays in use if there is one.';
  }
}

module.exports = { sync, SKILL };
if (require.main === module) process.stdout.write(sync() + '\n');
