# DecisionCart — Failure Log

## Purpose

The Failure Log is a structured record of all failures, errors, and unexpected behaviors encountered during development and operation. It serves as:

1. **A debugging tool**: Quickly identify recurring issues.
2. **A knowledge base**: Document why things failed and how they were resolved.
3. **A quality gate**: Track failure rates and ensure they decrease over time.
4. **An audit supplement**: Correlate with the payment audit trail.

---

## Failure Categories

| Category | Description | Example |
|---|---|---|
| `AI_PARSE` | AI failed to parse user intent correctly | Ambiguous category detection |
| `CATALOG_EMPTY` | No products matched the user's criteria | Budget too low for category |
| `CATALOG_MISSING_DATA` | Product exists but lacks required attributes | Phone without battery info |
| `SCORING_ERROR` | Decision engine calculation failure | Division by zero in normalization |
| `PAYMENT_ORDER` | Failed to create Razorpay order | Invalid amount, API error |
| `PAYMENT_VERIFY` | Payment verification failed | Signature mismatch |
| `PAYMENT_CALLBACK` | Payment callback error | Timeout, network error |
| `SESSION_ERROR` | Session management failure | Session expired mid-flow |
| `API_ERROR` | General API layer error | Request timeout, malformed input |
| `UI_ERROR` | Frontend rendering or interaction error | Component crash, state inconsistency |

---

## Failure Entry Format

```markdown
### [F-XXX] Title

- **Date**: YYYY-MM-DD
- **Category**: [AI_PARSE | CATALOG_EMPTY | ...]
- **Severity**: [low | medium | high | critical]
- **Status**: [open | investigating | resolved | wontfix]
- **Description**: What happened.
- **Steps to Reproduce**: How to trigger the failure.
- **Expected Behavior**: What should have happened.
- **Actual Behavior**: What actually happened.
- **Root Cause**: (filled in during investigation)
- **Resolution**: (filled in when resolved)
- **Related Files**: Files involved.
- **Impact**: Who/what was affected.
```

---

## Severity Levels

| Level | Definition | Response Time |
|---|---|---|
| `low` | Minor inconvenience, workaround exists | Fix when convenient |
| `medium` | Degrades user experience, no workaround | Fix within current sprint |
| `high` | Blocks core functionality | Fix immediately |
| `critical` | Data loss, security issue, payment failure | Fix immediately, halt other work |

---

## Active Failures

*No failures logged yet. This file will be updated as failures are encountered and resolved.*

---

## Resolved Failures

*No resolved failures yet.*

---

## Process

1. **When a failure occurs**: Add a new entry with all available information.
2. **During investigation**: Update the root cause and related files.
3. **When resolved**: Fill in the resolution, update status to `resolved`.
4. **In retrospective**: Review open failures to prioritize fixes.
5. **Before demo**: Ensure all critical/high failures are resolved.
