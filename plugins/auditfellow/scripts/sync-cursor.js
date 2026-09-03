#!/usr/bin/env node
// Cursor sessionStart hook: same sync as Claude Code, answered as JSON.
const { sync } = require('./sync.js');
process.stdout.write(JSON.stringify({ additional_context: sync() }) + '\n');
