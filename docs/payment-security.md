# DecisionCart — Payment & Security

## Overview

Payment in DecisionCart follows a strict **explicit approval boundary**. The system is designed so that money never moves without the user's informed, explicit, and recent consent. Razorpay is used in **Test Mode** during the hackathon.

---

## Payment Security Principles

### 1. Explicit Approval Boundary
- The AI never initiates payment. It can only *prepare* a purchase summary.
- The user must explicitly click "Confirm Purchase" (or equivalent).
- A confirmation dialog shows: product, price, seller, payment method.
- The approval must be recent (within the same session).

### 2. Server-Side Only
- Payment is initiated from the server, never from the client.
- API keys are stored server-side only (environment variables).
- The client never sees Razorpay API keys or secret tokens.
- Payment verification happens server-side.

### 3. Bounded Actions
- Every payment has a maximum bound (the product price from the catalog).
- The system cannot charge more than the displayed price.
- Currency is fixed per transaction (INR for Indian merchants).

### 4. No Silent Payments
- Every payment attempt is logged before execution.
- The user sees a loading/processing state during payment.
- Success or failure is communicated clearly.

---

## Razorpay Integration Flow

```
User confirms purchase
        │
        ▼
Backend: Create Razorpay Order
  - amount: product price (from catalog)
  - currency: INR
  - receipt: session-scoped unique ID
        │
        ▼
Backend: Return order_id to client
        │
        ▼
Client: Open Razorpay Checkout
  - User enters payment details (test mode)
  - Razorpay handles PCI compliance
        │
        ▼
Client: Receive payment_id + order_id
        │
        ▼
Backend: Verify payment server-side
  - Razorpay signature verification
  - Amount verification
  - Order status check
        │
        ▼
  ┌─── Success ───┐     ┌─── Failure ───┐
  │  Log audit    │     │  Log failure  │
  │  Confirm to   │     │  Report to    │
  │  user         │     │  user         │
  └───────────────┘     └───────────────┘
```

---

## Signature Verification

Every payment callback from Razorpay includes a signature. The backend must:

1. Extract ` razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` from the callback.
2. Compute an HMAC-SHA256 hash of `order_id|payment_id` using the Razorpay key secret.
3. Compare the computed hash with the received signature.
4. **Reject the payment** if signatures don't match.

This prevents:
- Forged payment confirmations
- Tampered payment amounts
- Replay attacks

---

## Environment Variables

The following secrets are required (never exposed to the client):

| Variable | Purpose | Example |
|---|---|---|
| `RAZORPAY_KEY_ID` | Razorpay API key (public-facing, safe in client if needed) | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay secret (server-side only) | `...` |
| `SESSION_SECRET` | Server session encryption key | Random 32+ char string |

See `.env.example` for the full template.

---

## Audit Trail

Every payment-related event is logged with:

```typescript
interface AuditEntry {
  timestamp: string;          // ISO 8601
  sessionId: string;          // User session ID
  event: string;              // e.g., "order_created", "payment_verified", "payment_failed"
  productId: string;          // Product being purchased
  amount: number;             // Amount in paise (smallest unit)
  currency: string;           // "INR"
  razorpayOrderId?: string;   // Razorpay order ID
  razorpayPaymentId?: string; // Razorpay payment ID
  status: "success" | "failure" | "pending";
  details?: string;           // Additional context (error messages, etc.)
  userConfirmed: boolean;     // Whether user explicitly approved
}
```

### Audit Log Properties

- **Append-only**: Entries cannot be modified or deleted.
- **Timestamped**: Every entry has an ISO 8601 timestamp.
- **Session-scoped**: Entries are linked to user sessions.
- **Complete**: Every payment event creates an entry — success, failure, and pending.

---

## What the AI Can and Cannot Do with Payments

| AI Can | AI Cannot |
|---|---|
| Prepare a purchase summary | Initiate a payment |
| Present the summary to the user | Modify payment amounts |
| Explain what will be charged | Access Razorpay credentials |
| Recommend a product for purchase | Auto-approve a purchase |
| Report payment outcomes to the user | Retry failed payments without user instruction |

---

## Test Mode Behavior

During the hackathon:

- Razorpay operates in **Test Mode** (`rzp_test_...` keys).
- No real money is involved.
- Test card numbers and UPI IDs are used.
- All security practices still apply — test with production discipline.

---

## Security Checklist

- [ ] API keys stored in environment variables, not in code
- [ ] `.env` files gitignored
- [ ] Payment initiated server-side only
- [ ] Signature verification on every callback
- [ ] Amount verified server-side (not trusted from client)
- [ ] Audit log is append-only
- [ ] No sensitive data in client-side storage
- [ ] Session management is server-side
