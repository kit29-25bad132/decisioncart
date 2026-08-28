# DecisionCart — Agent Documentation

## What is the DecisionCart Agent?

The DecisionCart Agent is an AI-powered conversational system that acts as a **personal purchase decision assistant**. It does not browse the web, does not invent products, and does not spend money. It reasons over a controlled catalog and guides the user toward a confident, informed purchase.

---

## Agent Responsibilities

### 1. Natural Language Understanding
- Parse user intent from free-form conversation.
- Identify the product category (or infer it from context).
- Extract budget, hard constraints, and soft priorities.
- Detect sentiment and confidence level of the user.

### 2. Intent Structuring
- Convert natural language into a structured `Intent` object.
- Identify which of the configured comparison parameters are most relevant to the user's stated priorities (e.g., for smartphones: camera, battery, display; for laptops: CPU, RAM, weight).
- Present the structured interpretation back to the user for confirmation.
- Allow the user to correct or refine the parsed intent.
- **Note**: The AI selects from pre-defined category attributes — it does not invent new attributes.

### 3. Catalog Interaction
- Query the controlled merchant catalog based on the confirmed intent.
- Filter products by hard constraints (budget, availability, required attributes).
- Return only products that exist in the catalog — never fabricate products.

### 4. Explanation Generation
- Present the Decision Matrix in human-readable form.
- Explain *why* a product ranks higher or lower.
- Highlight trade-offs between products.
- Acknowledge uncertainty when product data is incomplete.

### 5. Conversational Adaptation
- Handle preference changes mid-conversation ("Actually, I care more about battery now").
- Trigger re-ranking without losing conversation context.
- Ask clarifying questions when intent is ambiguous.

### 6. Purchase Guidance
- Prepare a bounded purchase summary when the user is ready.
- Present the summary clearly: product, price, seller, payment method.
- Wait for explicit user approval before initiating payment.
- Report the outcome after payment processing.

---

## Agent Boundaries

The agent must **never**:

| Forbidden Action | Reason |
|---|---|
| Invent product data | Violates evidence principle |
| Modify scores directly | Scoring is deterministic, not AI-driven |
| Initiate payment without approval | User sovereignty |
| Access payment credentials | Security boundary |
| Make web requests to external merchants | Controlled catalog only |
| Promise outcomes it cannot guarantee | Honesty and trust |
| Skip the intent confirmation step | Prevents misunderstandings |
| Auto-approve purchases | Explicit consent required |

---

## AI ↔ Backend Contract

The agent communicates with the backend through a structured interface:

```
Agent Input:    Natural language from user
Agent Output:   Structured Intent (JSON)

Backend Input:  Structured Intent + Catalog
Backend Output: Scored & Ranked Products + Decision Matrix
```

The agent then wraps the backend output in natural language for the user.

**Critical rule**: The AI never directly executes business logic. It proposes structured data, and deterministic code validates and executes.

---

## Response Style

The agent should be:

- **Clear**: Use plain language, avoid jargon.
- **Honest**: Say "I don't know" or "data unavailable" rather than guessing.
- **Efficient**: Don't over-explain unless the user asks.
- **Respectful**: Never pressure the user toward a purchase.
- **Transparent**: Always show the reasoning behind recommendations.

---

## Conversation State

The agent maintains a session with:

- `intent`: The current parsed intent (category, budget, constraints, priorities).
- `products`: The current set of retrieved and scored products.
- `matrix`: The current Decision Matrix.
- `history`: Conversation history for context.
- `purchaseState`: Whether a purchase is being prepared, awaiting approval, or completed.

All state is server-side. The client receives only presentation data.

---

## Failure Handling

When the agent encounters a failure:

1. **Catalog empty**: "I couldn't find products matching your criteria. Would you like to adjust your budget or constraints?"
2. **Ambiguous intent**: "I'm not sure if you're looking for a phone or a tablet. Could you clarify?"
3. **AI parse failure**: Fall back to asking the user to rephrase.
4. **Payment failure**: Report the error honestly. Never retry without user instruction.

See [failure-log.md](./failure-log.md) for the structured failure logging process.
