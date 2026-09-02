# 🛒 DecisionCart

> **AI-Powered Decisions. Transparent Rankings. Confident Purchases.**

DecisionCart is an **agentic commerce decision platform** that turns a natural-language shopping request into a structured, personalized, and explainable product decision — followed by a secure purchase flow.

Built for the **Razorpay Buildathon — Track 01**.

---

# 🚀 The Problem

Online shopping gives users **too many choices and too little clarity**.

Buyers must search, compare specifications, understand technical attributes, evaluate trade-offs, and decide which product actually fits their needs.

Most platforms answer:

> **“Here are some products.”**

DecisionCart answers:

> **“Which product is best for me — and why?”**

---

# 💡 The Solution

For a query like:

> **“Laptop under ₹60,000 for coding”**

DecisionCart:

1. 🧠 Understands the request
2. 🗂️ Detects the product category
3. 💰 Extracts budget and constraints
4. ⚖️ Identifies priorities
5. 🔎 Searches the relevant catalog
6. 🤖 Executes an agent workflow
7. 📊 Runs a deterministic decision engine
8. 🏆 Ranks the best products
9. 🔍 Explains strengths and trade-offs
10. 💳 Enables secure Razorpay payment

The result is not just a recommendation.

## It is a transparent decision.

---

# 🤖 Agentic Architecture

```text
User Query
    ↓
🧠 Query Understanding
    ↓
🗂️ Category Resolution
    ↓
🔎 Catalog Search
    ↓
⚖️ Decision Engine
    ↓
📊 Product Comparison
    ↓
💡 Insights & Trade-offs
    ↓
🏆 Best Match
    ↓
💳 Purchase Flow
```

DecisionCart includes an **Agent Trace UI** showing:

- Workflow steps
- Execution status
- Timing
- Input/output summaries
- Errors
- Overall completion status

---

# 🧠 AI + Deterministic Decision Intelligence

DecisionCart separates:

### AI understanding

from

### Deterministic decision-making

The parser understands what the user wants.

The decision engine performs the actual scoring and ranking.

> **AI proposes. The decision engine validates.**

This makes recommendations more:

- Reliable
- Explainable
- Auditable
- Consistent

---

# 🌍 Category-Agnostic Architecture

DecisionCart is designed to support multiple commerce categories dynamically.

## Current Demo Categories

### 📱 Smartphones

- Camera Quality
- Battery Life
- Display Size
- RAM
- Storage
- 5G Support

### 💻 Laptops

- Processor Performance
- RAM
- Battery Life
- Display Size
- Portability
- Storage

The architecture can later expand to:

- TVs
- Cameras
- Appliances
- Tablets
- Shoes
- Other product categories

without rebuilding the core decision engine.

---

# 📊 Transparent Decision Engine

Products are ranked based on **what matters to the user**.

DecisionCart exposes:

- Decision weights
- Product performance
- Normalized values
- Score contributions
- Strengths
- Trade-offs
- Final decision score

Different priorities produce different rankings.

A user prioritizing **camera quality** should not necessarily receive the same recommendation as someone prioritizing **battery life or performance**.

---

# ⚖️ Trade-Off Analysis

There is rarely one universally perfect product.

DecisionCart explicitly shows:

- 📷 Best camera
- 🔋 Best battery
- ⚡ Best performance
- 💾 Best storage
- 🖥️ Best display

This helps users understand:

## 🏆 Best Overall Choice

versus

## 🎯 Best Choice for a Specific Priority

---

# 🔄 What-If Analysis

DecisionCart can demonstrate how the winner changes when priorities change.

For example:

> **What if Battery Life becomes the most important factor?**

The system can identify which product becomes the strongest match.

This turns shopping into **interactive decision-making**.

---

# 💳 Trustworthy Purchase Flow

DecisionCart uses an explicit purchase lifecycle:

```text
DECIDED
   ↓
CONFIRMING
   ↓
APPROVED
   ↓
ORDER_CREATED
   ↓
PAID
   ↓
DONE
```

### Security Principles

- 🔒 Explicit human confirmation
- 🔒 Server-side order creation
- 🔒 Client prices are never trusted
- 🔒 Server-side catalog lookup
- 🔒 Razorpay payment verification
- 🔒 HMAC signature validation
- 🔒 Duplicate order prevention
- 🔒 Controlled state transitions

---

# 🔁 Payment Cancellation Recovery

If a user closes the Razorpay Checkout window:

- The purchase is not falsely marked as paid
- The user is not trapped in an infinite loading state
- The existing valid order can be retried
- Duplicate orders are avoided
- The user can return to the decision flow

This creates a more resilient real-world commerce experience.

---

# ✨ Key Features

| Feature | Description |
|---|---|
| 🧠 Natural Language Search | Describe shopping needs naturally |
| 🤖 Agent Workflow | Multi-step decision orchestration |
| 🔎 Catalog Search | Finds category-specific products |
| ⚖️ Decision Engine | Personalized deterministic ranking |
| 📊 Decision Matrix | Transparent comparison |
| 🏆 Best Match | Highlights the strongest recommendation |
| 🔍 Explainable Scores | Shows why products ranked where they did |
| ⚖️ Trade-Off Analysis | Shows strengths and compromises |
| 🔄 What-If Analysis | Shows changing winners |
| 🧭 Agent Trace | Visualizes workflow execution |
| 💬 Preference Refinement | Supports evolving preferences |
| 💳 Razorpay Integration | Secure payment workflow |
| 🔐 Purchase State Machine | Controlled purchase lifecycle |
| 🌍 Category-Agnostic Design | Built to expand beyond demo categories |

---

# 🏗️ Architecture

```text
┌─────────────────────────────┐
│ USER                        │
│ Natural Language Request    │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ QUERY UNDERSTANDING         │
│ AI / Smart Parser           │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ AGENT ORCHESTRATOR          │
│ Coordinates workflow steps  │
└──────────────┬──────────────┘
               ↓
     ┌─────────┼─────────┐
     ↓         ↓         ↓
┌─────────┐ ┌────────┐ ┌────────────┐
│ Catalog │ │Decision│ │Comparison  │
│ Search  │ │Engine  │ │& Insights  │
└─────────┘ └────────┘ └────────────┘
     └─────────┼─────────┘
               ↓
┌─────────────────────────────┐
│ TRANSPARENT DECISION UI     │
│ Rankings • Scores • Reasons │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ PURCHASE STATE MACHINE      │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ RAZORPAY PAYMENT            │
│ Server-Side Verification    │
└─────────────────────────────┘
```

---

# 🛠️ Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend

- Next.js API Routes
- TypeScript

## Intelligence

- AI-powered query understanding
- Deterministic fallback parser
- Agent orchestrator
- Tool-based workflow execution

## Decision System

- Category configuration
- Product normalization
- Weighted scoring
- Transparent explanations
- Product comparison

## Payments

- Razorpay Orders API
- Razorpay Checkout
- HMAC signature verification

## Testing

- Vitest

---

# 📁 Project Structure

```text
src/
├── agent/
│   ├── orchestrator.ts
│   └── tools/
├── app/
│   ├── api/
│   │   ├── agent/
│   │   ├── decision/
│   │   ├── payment/
│   │   └── purchase/
│   └── workspace/
├── catalog/
│   ├── categories.ts
│   ├── registry.ts
│   ├── static-provider.ts
│   └── product-normalizer.ts
├── components/
│   └── workspace/
├── engine/
│   ├── decision-engine.ts
│   ├── purchase-state-machine.ts
│   └── compare-helpers.ts
└── lib/
    └── ai/
```

---

# ▶️ Run Locally

## 1. Clone

```bash
git clone <repository-url>
cd decisioncart
```

## 2. Install

```bash
npm install
```

## 3. Configure Environment Variables

Create `.env.local`:

```env
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

## 4. Start

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# 🧪 Quality Checks

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

---

# 🎬 Recommended Demo Flow

### 1️⃣ Natural Language Query

```text
Laptop under ₹60,000 for coding
```

### 2️⃣ Show Query Understanding

Demonstrate:

- Category detection
- Budget extraction
- Priority identification
- Confidence

### 3️⃣ Show the Agent Trace

Demonstrate:

- Catalog search
- Decision engine execution
- Product comparison
- Insight generation

### 4️⃣ Explain the Winner

Show:

- Best Match
- Ranked Products
- Score Breakdown
- Strengths
- Trade-offs

### 5️⃣ Compare Alternatives

Show:

- Compare Top Choices
- Decision Matrix
- Trade-Off Analysis

### 6️⃣ Change Priorities

Demonstrate **What-If Analysis**.

### 7️⃣ Proceed to Purchase

Demonstrate:

- Explicit confirmation
- Secure order creation
- Razorpay Checkout

### 8️⃣ Demonstrate Resilience

Close Razorpay Checkout and show:

- Payment cancelled state
- Retry payment
- Return to decision

---

# 🎯 What Makes DecisionCart Different?

Most shopping platforms optimize for:

> **Finding products.**

DecisionCart optimizes for:

> **Making the right decision.**

```text
Search Engine
    ↓
"Here are some products"
```

vs.

```text
DecisionCart
    ↓
"Here is the best choice for YOU.
Here is WHY.
Here are the TRADE-OFFS.
Here is what changes if your priorities change."
```

---

# 🔮 Future Vision

DecisionCart is designed to evolve into a full **Agentic Commerce Platform**.

Potential future capabilities:

- Real-time merchant integrations
- Marketplace data
- Review and evidence analysis
- Multi-source product verification
- Persistent preference memory
- Streaming agent execution
- Dynamic tool selection
- Price tracking
- Inventory awareness
- Autonomous product research
- Webhook-based payment reconciliation
- More product categories

---

# 🏆 Built for Razorpay Buildathon

DecisionCart combines:

- 🤖 Agentic AI
- 🧠 Personalized decision intelligence
- 🔍 Explainable recommendations
- ⚖️ Transparent trade-offs
- 🔐 Secure purchase workflows
- 💳 Razorpay payments

## Our Goal

> **Reduce decision fatigue and help users purchase with confidence.**

---

# 👨‍💻 Built By

## Rishi V

---

<div align="center">

# 🛒 DecisionCart

### **Think Less. Decide Better. Buy Confidently.**

</div>
