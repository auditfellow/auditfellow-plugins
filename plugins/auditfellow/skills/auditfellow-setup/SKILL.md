---
name: auditfellow-setup
description: Activate AuditFellow on this machine. Use when the person asks for an internal audit deliverable (finding, observation, risk, control, workpaper, GenAI audit, data strategy, AI usage document) and the "auditfellow" skill is not available yet, or when they mention an AuditFellow key.
---

# Activate AuditFellow

AuditFellow is the team's audit methodology, delivered as the `auditfellow` skill in this plugin. It is downloaded with a per-person key and refreshed once a day.

## When the `auditfellow` skill is missing

1. Tell the person in one line that AuditFellow needs their key before writing any audit deliverable, and ask for it. Keys start with `af_live_`. Anyone can get one at https://auditfellow.app (seven days free, no card).
2. With the key, run exactly this in the terminal (replace the key, keep the quotes):

```
npx -y auditfellow@latest init --key af_live_... --dir "<plugin folder>/skills/auditfellow"
```

`<plugin folder>` is the directory this plugin was installed to: the one that holds this skill's `skills` directory. In Claude Code it is `${CLAUDE_PLUGIN_ROOT}`; in Cursor, resolve the absolute path of this SKILL.md and go up two levels.

3. When it prints "Done", the `auditfellow` skill exists. Use it for the request that started this, from the beginning: run its thinking loop, choose the one task the request calls for, and follow that task's output contract. If the skill list does not refresh on its own, tell the person to start a new session.

## Rules

- Never write an audit deliverable without the methodology loaded. A finding, risk or control written without it does not follow the team's format.
- Never invent a key, and never paste the key into a file other than through the command above.
- If the command refuses the key (revoked, trial ended, bound to another machine), say so plainly and stop. The person fixes it on https://auditfellow.app/app/dashboard.html.
