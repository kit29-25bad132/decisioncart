# DecisionCart — Architecture

## Overview

DecisionCart is built as a full-stack web application with a clear separation between:

- **AI Layer**: Natural language understanding, intent parsing, explanation generation
- **Decision Engine**: Deterministic scoring, matrix construction, ranking (no AI inference)
- **Data Layer**: Controlled merchant catalog, user session state, audit logs
- **Payment Layer**: Razorpay integration with server-side verification

The architecture is **category-agnostic**: no component contains category-specific logic.

---

## System Components

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Chat UI    │  │ Decision     │  │ Purchase      │  │
│  │  (Conversa- │  │ Matrix View  │  │ Confirmation  │  │
│  │   tional)   │  │              │  │               │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼────────────────┼──────────────────┼───────────┘
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                    API Layer (Next.js API Routes)        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ /api/chat    │  │ /api/matrix  │  │ /api/purchase│  │
│  │ (AI parse +  │  │ (Score +     │  │ (Razorpay    │  │
│  │  explain)    │  │  rank)       │  │  + verify)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│                   Core Services                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ AI Service   │  │ Decision     │  │ Payment      │  │
│  │ (LLM calls,  │  │ Engine       │  │ Service      │  │
│  │  structured  │  │ (Determinis- │  │ (Razorpay    │  │
│  │  output)     │  │  tic scoring)│  │  server-side)│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Catalog      │  │ Session      │  │ Audit        │  │
│  │ Service      │  │ Manager      │  │ Logger       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## AI ↔ Deterministic Boundary

This is the most critical architectural principle in DecisionCart:

| AI Handles (LLM) | Deterministic Code Handles |
|---|---|
| Natural language understanding | Intent validation and normalization |
| Proposing which configured attributes matter to the user | Scoring and ranking |
| Generating natural-language explanations from structured data | Matrix construction |
| Interpreting preference changes in natural language | Payment execution |
| Suggesting which attributes the user should care about | Catalog querying |
| | Server-side payment verification |
| | Audit trail writing |

**Note on attributes**: The available comparison attributes for each category are defined in `categoryConfig` (see [decision-engine.md](./decision-engine.md)). The AI does not invent new attributes — it suggests which *configured* attributes are most relevant to the user's stated needs.

**Rule**: The AI proposes, the backend validates and executes. The AI can never directly modify scores, trigger payments, or alter the audit log.

---

## Data Flow

```
User Input (natural language)
       │
       ▼
  AI Service ──► Structured Intent
       │              │
       │              ▼
       │       Intent Validator (deterministic)
       │              │
       │              ▼
       │       Catalog Service ──► Matching Products
       │              │
       │              ▼
       │       Decision Engine ──► Scored & Ranked Products
       │              │
       │              ▼
       │       AI Service ──► Explanation + Trade-offs
       │              │
       ▼              ▼
  Response to User (matrix + explanation)
       │
       ▼
  [If purchase requested]
       │
       ▼
  Payment Service ──► Razorpay Order
       │
       ▼
  Server-side Verification
       │
       ▼
  Audit Log Entry
```

---

## Tech Stack (Planned)

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js (React) | Full-stack, API routes, SSR |
| AI | LLM API (provider TBD) | Natural language understanding |
| Decision Engine | Pure TypeScript/JS | Deterministic, testable, auditable |
| Database | SQLite (dev) → PostgreSQL (prod) | Simple start, scalable later |
| Payments | Razorpay (Test Mode) | Buildathon requirement |
| State | Server-side sessions | Security, no client-side payment state |

---

## Category-Agnostic Design

The system does not hard-code any product category. Instead:

1. **Catalog schema** uses a flexible attribute model: each product has a base set of fields (name, price, category, image, availability) plus a dynamic `attributes` map.
2. **Comparison parameters** are determined per-category by a `categoryConfig` that defines which attributes exist, their types, units, and comparison directions (higher-is-better, lower-is-better, binary).
3. **The decision engine** reads the `categoryConfig` dynamically — it never references specific attribute names like "camera" or "RAM."
4. **New categories** are added by defining a new `categoryConfig` entry and populating the catalog — zero code changes required.

---

## Security Principles

- API keys and secrets are never exposed to the client.
- Payment is initiated and verified server-side only.
- User sessions are managed server-side.
- The AI layer has no direct access to payment or audit systems.
- All monetary actions require explicit user confirmation.

See [payment-security.md](./payment-security.md) for detailed security documentation.
