# AGENTS.md — DecisionCart Contribution Guide

## Project Overview

DecisionCart is an AI-powered purchase decision agent for the Razorpay Buildathon (Track 01: AI Growth & Agentic Commerce). It helps users discover, compare, and purchase products through conversational AI with deterministic scoring.

---

## Architecture Rules

### The AI ↔ Deterministic Boundary
This is the most important rule in the project:

- **AI (LLM)** handles: natural language understanding, explanation generation, proposing structured parameters.
- **Deterministic code** handles: scoring, ranking, payment, audit logging, validation.
- **The AI never directly executes business logic.** It proposes, the backend validates and executes.

### Category-Agnostic Design
- No hard-coded product categories in business logic.
- All comparison logic is driven by `categoryConfig` objects.
- Adding a new category = adding a config + catalog data. Zero code changes.
- The decision engine must never reference specific attribute names like "camera" or "RAM."

### Evidence Principle
- Never invent product data.
- Missing data = "unknown", not 0, not average, not guessed.
- The AI can interpret language but must not fabricate catalog attributes.

---

## Code Standards

### Language & Runtime
- TypeScript for all backend and shared logic.
- React/Next.js for frontend (when we build it).
- Node.js runtime.

### File Organization
```
src/
  ai/           # AI service (LLM calls, parsing)
  engine/       # Decision engine (deterministic scoring)
  catalog/      # Catalog service and data
  payment/      # Razorpay integration
  audit/        # Audit trail logging
  session/      # Session management
  api/          # API route handlers
  types/        # Shared TypeScript types
docs/           # Documentation (this folder)
```

### Naming Conventions
- Files: `kebab-case.ts` (e.g., `decision-engine.ts`)
- Types: `PascalCase` (e.g., `CategoryConfig`)
- Functions: `camelCase` (e.g., `calculateScore`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_PRODUCTS`)
- Interface names: Descriptive, noun-based (e.g., `Product`, `ScoreExplanation`)

### Testing
- Unit tests for all deterministic logic.
- Integration tests for API routes.
- No mocking of the decision engine (it must be tested with real math).
- Target: high coverage on `engine/`, `payment/`, `audit/`.

---

## Security Rules

1. **Never commit API keys or secrets.** Use `.env.example` as the template.
2. **Never expose server-side secrets to the client.**
3. **Payment is server-side only.** Client never initiates or verifies payments.
4. **Audit logs are append-only.** No function may delete or modify past entries.
5. **All monetary actions require explicit user approval.**

---

## Git Workflow

- **Main branch**: `main` — always deployable.
- **Feature branches**: `feat/description` for new features.
- **Fix branches**: `fix/description` for bug fixes.
- **Commit messages**: Present tense, descriptive. Example: "Add deterministic scoring engine."
- **No force pushes** to `main`.
- **All changes reviewed** before merge (even in hackathon — prevents demo-day disasters).

## Coding Agent Rules

If you are an AI coding agent working on this project, follow these rules strictly:

1. **Inspect existing architecture before making changes.** Read `docs/architecture.md`, `docs/decision-engine.md`, and relevant source files before modifying any code. Understand the AI ↔ deterministic boundary.
2. **Avoid unnecessary dependencies.** Do not install packages that are not already in the project or explicitly planned. Prefer built-in language features and minimal libraries.
3. **Test before committing.** Run typechecking and relevant tests before every commit. Never commit code that breaks the build.
4. **Never expose secrets.** Do not hard-code API keys, tokens, or credentials. Use environment variables and `.env` files (which are gitignored).
5. **Avoid breaking existing functionality.** Do not modify interfaces, APIs, or behavior that other parts of the system depend on without explicit discussion.
6. **Make small, logical commits.** Each commit should represent one coherent change. Do not bundle unrelated changes.
7. **Push only working changes.** Only push code that builds, passes tests, and does not break existing features. If a push is requested, verify the build first.

---

## Documentation Rules

- Every new module gets a brief doc in `docs/` or inline JSDoc.
- Architecture decisions are recorded in `docs/architecture.md`.
- Failures are logged in `docs/failure-log.md`.
- Payment-related changes must update `docs/payment-security.md`.

---

## What NOT to Do

- ❌ Do not install dependencies without team discussion.
- ❌ Do not add new AI inference points without updating the architecture doc.
- ❌ Do not hard-code category-specific logic in the decision engine.
- ❌ Do not fabricate missing product data.
- ❌ Do not auto-approve payments or skip the confirmation step.
- ❌ Do not store Razorpay secrets in code or client-side storage.
- ❌ Do not commit `.env` files.
- ❌ Do not run `git push` without explicit team approval.
