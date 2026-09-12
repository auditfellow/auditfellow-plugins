---
type: llm
weight: 2
---

PASS only if the answer is prose or a structured list (not a finding, risk or workpaper template) and covers at least five of these areas specifically for a bank-facing chatbot: prompt injection and jailbreak resistance; handling of customer personal and account data in inputs and outputs; grounding and accuracy controls against wrong financial answers; human escalation and the boundary of what the bot may do; change management of the model, the system prompt and the knowledge base; logging and traceability of conversations; access control to configuration; third-party model and vendor dependency; regulatory disclosure that the customer is talking to a bot; monitoring of drift and complaints.
FAIL if it produces a generic IT controls list that ignores the language-model nature, if it drops into a template, or if it covers fewer than five of the areas.
