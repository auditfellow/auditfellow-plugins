# AuditFellow plugins for Claude Code and Cursor

Your internal audit team's methodology, loaded as a skill before the model writes. Findings, risks, controls, workpapers, GenAI audits, data strategy and AI usage documents come back in your team's format, checked, with N/A wherever your organization never supplied a value.

## Install

Inside Claude Code:

```
/plugin marketplace add dlascano911/auditfellow-plugins
/plugin install auditfellow@auditfellow-plugins
```

The first time you ask for an audit deliverable, the plugin asks for your AuditFellow key (`af_live_...`). Get one at https://auditfellow.app (seven days free, no card). The key is checked once a day and the methodology refreshes with it. Nothing you write or receive is sent to AuditFellow.

## Update

```
/plugin update auditfellow
```

## Cursor

Search for **AuditFellow** in the Cursor marketplace (cursor.com/marketplace) and press Install, or add this repository as a plugin source. The same setup skill asks for your key the first time you request an audit deliverable.

## Prefer the terminal?

`npx auditfellow init` installs the same skill at user level for Claude Code, and a rule for Cursor with `--target cursor`.
