---
type: llm
weight: 2
---

PASS only if the Risk Description is one sentence that carries both the consequence and the probability with an explicit causal link (for example: unauthorized master-file changes going undetected because no periodic review exists, leading to incorrect or fraudulent payroll payments), the Risk Title is a short noun phrase naming the exposure rather than the missing control restated, and Risk Type is exactly one of Financial, Technology, Operational or Process, Fraud, Regulatory or Compliance, Third Party, Reputational.
FAIL if the description merely restates the control gap ("there is no review"), if Impact, Likelihood or Rating carry a value although the request gave no scale, if the type is a list, or if an owner is named that the request never gave.
