# DecisionCart — Evaluation Strategy

## Overview

Evaluation in DecisionCart happens at multiple levels: product quality, technical reliability, and user trust. This document defines what we measure, how we measure it, and what success looks like.

---

## Evaluation Dimensions

### 1. Intent Parsing Accuracy

**Question**: Does the AI correctly interpret what the user wants?

**Metrics**:
- Category detection accuracy: % of requests where category is correct
- Budget extraction accuracy: % of requests where budget matches user's stated budget
- Priority extraction accuracy: % of requests where priorities are correctly ordered
- Constraint detection accuracy: % of hard constraints correctly identified

**How to measure**:
- Manual evaluation with a test set of 50+ natural language inputs
- Each input evaluated as: correct / partially correct / incorrect
- Target: ≥ 90% fully correct, 0% catastrophic failures

**Test cases should cover**:
- Explicit specifications ("I want a phone under 25k with good camera")
- Implicit constraints ("I need something lightweight for travel")
- Ambiguous requests ("Give me something nice")
- Multi-category confusion ("Best device for photography")
- Edge cases ("Cheapest possible", "No budget limit")

---

### 2. Decision Engine Correctness

**Question**: Does the scoring engine produce fair, deterministic, explainable rankings?

**Metrics**:
- Determinism: Same inputs always produce same outputs (100% target)
- Normalization correctness: Values correctly scaled to 0–1
- Weight application: User priorities correctly reflected in scores
- Missing data handling: Products with missing data treated fairly
- Ranking stability: Small input changes produce proportionally small ranking changes

**How to measure**:
- Unit tests for every scoring function
- Integration tests with known inputs and expected outputs
- Property-based testing: verify mathematical invariants (scores sum correctly, normalization bounds)

---

### 3. Data Honesty

**Question**: Does the system avoid inventing data?

**Metrics**:
- Fabricated data incidents: 0 (target: absolute zero)
- Missing data transparency: % of missing attributes explicitly reported to user
- Catalog fidelity: All product data matches the catalog source

**How to measure**:
- Code review: No AI inference results used in scoring
- Audit: Every product display traces back to catalog data
- User study: Ask users if they noticed any "made up" information

---

### 4. Payment Security

**Question**: Is the payment flow secure and trustworthy?

**Metrics**:
- Signature verification: 100% of payments verified server-side
- Approval boundary: 0 payments initiated without explicit user consent
- Audit completeness: 100% of payment events logged
- Amount integrity: 0 discrepancies between displayed and charged amounts

**How to measure**:
- Security checklist (see [payment-security.md](./payment-security.md))
- Manual testing with Razorpay test mode
- Audit log review

---

### 5. User Experience

**Question**: Is the system usable, trustworthy, and helpful?

**Metrics**:
- Task completion rate: % of users who complete a purchase flow
- Time to decision: Average time from first message to purchase confirmation
- Preference change handling: % of mid-conversation changes handled correctly
- User satisfaction: Qualitative feedback (post-demo survey)
- Trust indicators: Users report feeling "informed" and "in control"

**How to measure**:
- Demo session observations
- Post-demo feedback forms
- Think-aloud protocol during user testing

---

### 6. Technical Reliability

**Question**: Does the system work consistently?

**Metrics**:
- API uptime: % of requests that succeed
- Response time: Average latency for AI parsing, scoring, and API responses
- Error rate: % of requests that result in errors
- Recovery rate: % of errors that are gracefully handled

**How to measure**:
- Load testing during development
- Error logging and monitoring
- Manual testing across scenarios

---

## Demo-Day Success Criteria

For the Razorpay Buildathon demo, the system must:

| Criterion | Minimum | Target |
|---|---|---|
| Intent parsing accuracy | 80% | 95% |
| Deterministic scoring | 100% | 100% |
| Data fabrication incidents | 0 | 0 |
| Payment flow completion | Works in test mode | Smooth and explainable |
| Audit trail completeness | 100% | 100% |
| Category flexibility | Works for smartphones | Works for 2+ categories |
| User can change mind | Basic support | Seamless re-ranking |
| Explanation quality | Shows scores | Shows reasoning + trade-offs |

---

## Evaluation Timeline

| Phase | Focus | When |
|---|---|---|
| Unit testing | Scoring, normalization, weight calculation | During engine development |
| Integration testing | End-to-end flow: intent → matrix → score → explain | During API development |
| Manual testing | Real scenarios with real language | Before each milestone |
| Security audit | Payment flow, API keys, audit trail | Before demo |
| User testing | Demo with 3-5 people, gather feedback | Day before demo |
| Final review | Check all criteria above | Demo day morning |

---

## Failure Correlation

Evaluation failures should be logged in [failure-log.md](./failure-log.md) with the appropriate category. This creates a feedback loop:

1. Evaluation finds an issue → logged as failure
2. Failure is investigated → root cause identified
3. Fix is implemented → re-evaluated
4. Failure is resolved → logged as resolved
