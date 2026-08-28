# DecisionCart

**AI-powered decision intelligence and agentic commerce platform.**

DecisionCart helps users discover, compare, understand trade-offs, and confidently purchase products — all through a conversational interface powered by AI with deterministic scoring.

---

## 🏆 Razorpay Buildathon

**Track 01: AI Growth & Agentic Commerce**

DecisionCart is a category-agnostic, preference-aware purchase decision agent that takes users from natural language intent → structured understanding → evidence-backed comparison → confident, explainable purchase.

---

## 🧠 How It Works

1. **You describe what you want** in natural language.
2. **The AI understands your intent** — category, budget, constraints, priorities.
3. **The system retrieves products** from a controlled merchant catalog.
4. **A Decision Matrix is built** with normalized, comparable attributes.
5. **Deterministic scoring** ranks products based on *your* priorities.
6. **Trade-offs are explained** — no hidden sacrifices.
7. **You refine freely** — change your mind, and the rankings update live.
8. **You approve the purchase** — explicitly, with full visibility.
9. **Payment is processed securely** via Razorpay with server-side verification.
10. **An audit trail records everything** — what was compared, why, and what was bought.

---

## 🔑 Key Principles

| Principle | What It Means |
|---|---|
| **Category-agnostic** | Not smartphone-only. Works for any product category. |
| **Evidence over invention** | Never fabricates missing data. Unknown = unknown. |
| **Deterministic scoring** | Same inputs → same outputs. Fully reproducible and auditable. |
| **User sovereignty** | The AI never silently spends money. Every payment is explicitly approved. |
| **Transparent reasoning** | Every recommendation comes with an explanation of *why*. |

---

## 📁 Project Structure

```
DecisionCart/
├── docs/
│   ├── architecture.md      # System architecture and component design
│   ├── product.md           # Problem statement, thesis, user journey
│   ├── agent.md             # AI agent responsibilities and boundaries
│   ├── decision-engine.md   # Deterministic scoring engine design
│   ├── payment-security.md  # Razorpay integration and security principles
│   ├── failure-log.md       # Failure tracking and resolution process
│   └── evaluation.md        # Evaluation strategy and success criteria
├── AGENTS.md                # Contribution guide and project rules
├── .env.example             # Environment variable template
└── README.md                # This file
```

---

## 🚀 Getting Started

> **Note:** This is Phase 1 — project foundation and documentation only.
> Application code will be added in subsequent phases.

### Prerequisites

- Node.js 18+
- npm or yarn
- Razorpay test account ([sign up](https://dashboard.razorpay.com/signup))

### Setup

```bash
# Clone the repository
git clone https://github.com/kit29-25bad132/decisioncart.git
cd decisioncart

# Copy environment variables
cp .env.example .env

# Edit .env with your API keys
# NEVER commit .env to version control
```

---

## 🛡️ Security

- API keys and secrets are never exposed to the client.
- Payment is initiated and verified server-side only.
- Every payment requires explicit user approval.
- A complete audit trail is maintained for all transactions.

See [docs/payment-security.md](docs/payment-security.md) for details.

---

## 📊 Documentation

| Document | Purpose |
|---|---|
| [Architecture](docs/architecture.md) | System design, component responsibilities, data flow |
| [Product](docs/product.md) | Problem statement, thesis, user journey, track alignment |
| [Agent](docs/agent.md) | AI agent responsibilities, boundaries, conversation design |
| [Decision Engine](docs/decision-engine.md) | Scoring algorithm, category config, evidence rules |
| [Payment & Security](docs/payment-security.md) | Razorpay integration, security principles, audit trail |
| [Failure Log](docs/failure-log.md) | Failure tracking process and templates |
| [Evaluation](docs/evaluation.md) | Metrics, testing strategy, demo-day success criteria |

---

## 📝 License

This project was created for the Razorpay Buildathon. All rights reserved.

---

## 🤖 Built With

- **AI**: LLM for natural language understanding (provider TBD)
- **Frontend**: Next.js (planned)
- **Payments**: Razorpay (Test Mode)
- **Scoring**: Pure TypeScript (deterministic, auditable)
