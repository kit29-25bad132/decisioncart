# DecisionCart — Product Documentation

## Problem Statement

Purchase decisions today are fragmented, overwhelming, and anxiety-inducing. A customer looking to buy a product — whether a smartphone, a laptop, a kitchen appliance, or running shoes — faces:

- **Information overload**: Dozens of specs, reviews, and opinions scattered across sites.
- **Incomparable data**: Different sellers present attributes differently; no unified comparison.
- **Hidden trade-offs**: Users don't know what they're sacrificing when they pick cheaper or newer.
- **No personalized guidance**: Recommendation engines push popular items, not the right item for *this* user.
- **Decision fatigue**: Many users abandon carts or make regretted purchases because the cognitive load is too high.
- **No bridge to purchase**: Even if a user researches extensively, there's no seamless path from "I've decided" to "I've bought."

There is no tool that takes a user from natural language intent → structured understanding → evidence-backed comparison → confident, explainable purchase — in a single conversational flow.

---

## Product Thesis

**DecisionCart is a category-agnostic, preference-aware purchase decision agent.**

It allows a customer to describe what they want in natural language and then:

1. Understands the request semantically.
2. Identifies the product category, budget, constraints, and priorities.
3. Retrieves comparable products from a controlled merchant catalog.
4. Builds a dynamic, personalized Decision Matrix.
5. Calculates deterministic Decision Scores based on the user's own priorities.
6. Explains trade-offs and uncertainty honestly.
7. Allows conversational preference changes with live re-ranking.
8. Prepares a bounded purchase flow with explicit user approval.
9. Processes payment securely via Razorpay with server-side verification.
10. Maintains a complete audit trail.

The core thesis: **Users don't need more data — they need better decisions.** DecisionCart replaces browsing with reasoning.

---

## Challenge / Track Alignment

**Track 01: AI Growth & Agentic Commerce** — Razorpay Buildathon

DecisionCart directly addresses this track by:

| Track Requirement | DecisionCart Response |
|---|---|
| AI-driven growth | AI interprets natural language intent, proposes structured parameters, and drives the entire decision flow |
| Agentic commerce | The system acts as an autonomous agent: it plans, retrieves, compares, scores, explains, and executes — all within user-approved boundaries |
| Payment integration | Razorpay Test Mode integration with server-side verification, explicit approval, and audit trail |
| Purchase confidence | Deterministic scoring with full explainability ensures the user understands *why* before they buy |

---

## User Journey

### 1. Intent Expression
The user describes what they want in free-form natural language.

> *"I need a good phone under 25,000 rupees. I care most about camera quality and battery life. I don't care about brand."*

### 2. Intent Parsing & Confirmation
The agent parses the request and confirms its understanding with the user:

> *"I understand you're looking for:*
> - *Category: Smartphone*
> - *Budget: ≤ ₹25,000*
> - *Priorities: Camera quality > Battery life*
> - *No brand preference*
> - *Hard constraints: None specified*
>
> *Is this correct? Would you like to add anything?"*

### 3. Catalog Retrieval
The system queries the controlled merchant catalog for products matching the category and hard constraints (budget, availability).

### 4. Decision Matrix Construction
A dynamic matrix is built with category-specific comparison parameters. Each product's attributes are normalized to a common scale.

### 5. Scoring & Ranking
Deterministic scoring calculates a personalized Decision Score for each product based on the user's stated priorities.

### 6. Explanation & Trade-offs
The agent presents the top results with clear explanations:

> *"Product A scores highest because it leads in camera quality, which is your top priority. However, Product B has better battery life at a slightly lower camera score. Product C is ₹3,000 cheaper but trades off both camera and battery."*

### 7. Conversational Refinement
The user can change preferences at any time:

> *"Actually, I do care about brand. Only Samsung or Google."*

The matrix re-ranks instantly with updated scores.

### 8. Purchase Preparation
When the user is ready:

> *"I'd like to buy Product A."*

The agent prepares a bounded purchase flow:

> *"Ready to purchase:*
> - *Product: [Name]*
> - *Price: ₹22,999*
> - *Seller: [Merchant]*
> - *Payment via: Razorpay (Test Mode)*
>
> *Confirm purchase? [Yes / No]"*

### 9. Payment Execution
Only after explicit approval:
- Payment is initiated server-side via Razorpay.
- Server-side verification confirms payment status.
- Transaction is logged in the audit trail.

### 10. Post-Purchase
The user receives confirmation and the full decision audit trail — what they asked for, what was compared, why this product was recommended, and the payment record.

---

## Key Product Principles

1. **Category-agnostic by design.** Smartphones are only the initial demo category. The architecture, decision engine, and UI work for any product category.
2. **Evidence over invention.** The AI interprets language and proposes structure, but never invents missing data. Unknown attributes are marked as unknown.
3. **Deterministic over magical.** Important actions (scoring, payment, ranking) are executed by deterministic backend code, not opaque AI inference.
4. **User sovereignty.** The AI never silently spends money. Every payment is explainable, bounded, and explicitly approved.
5. **Conversational, not prescriptive.** Users can change their mind at any point. The system adapts without losing context.
