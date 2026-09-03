// ============================================================
// DecisionCart — Supabase Purchase Repository Tests
// Tests for domain/database mapping, timestamp conversion,
// repository selection, invalid transition rejection, and
// missing purchase behavior.
//
// All tests mock the Supabase client — no real credentials needed.
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Mock Supabase Client ---

// Store for simulating database tables
let purchasesDb: Map<string, Record<string, unknown>> = new Map();
let eventsDb: Record<string, unknown>[] = [];
let paymentsDb: Record<string, unknown>[] = [];

// Default nullable fields for purchases
const PURCHASE_DEFAULTS = {
  merchant_offer_id: null,
  razorpay_order_id: null,
  razorpay_payment_id: null,
  approved_at: null,
  expires_at: null,
};

// Build a mock Supabase client that simulates .from().select().eq().single()
function buildMockClient() {
  const mockFrom = (table: string) => {
    const builder: Record<string, unknown> = {
      _table: table,
      _filters: [] as { field: string; op: string; value: unknown }[],
      _orderBy: null as { field: string; ascending: boolean } | null,
      _limit: null as number | null,
      _select: "*",
      _data: null as Record<string, unknown> | null,
      _operation: null as string | null,
      _single: false,

      select(fields?: string) {
        builder._select = fields ?? "*";
        return builder;
      },

      eq(field: string, value: unknown) {
        (builder._filters as { field: string; op: string; value: unknown }[]).push({ field, op: "eq", value });
        return builder;
      },

      neq() {
        // Used by clear() — treat as "all rows" for delete
        return builder;
      },

      single() {
        builder._single = true;
        return builder;
      },

      order(field: string, opts: { ascending: boolean }) {
        builder._orderBy = { field, ascending: opts.ascending };
        return builder;
      },

      limit(n: number) {
        builder._limit = n;
        return builder;
      },

      insert(data: Record<string, unknown>) {
        builder._operation = "insert";
        builder._data = data;
        return builder;
      },

      update(data: Record<string, unknown>) {
        builder._operation = "update";
        builder._data = data;
        return builder;
      },

      delete() {
        builder._operation = "delete";
        return builder;
      },
    };

    // Make builder thenable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (builder as any).then = function (
      resolve: (result: { data: unknown; error: unknown }) => void
    ) {
      const result = executeQuery(builder);
      resolve(result);
    };

    return builder;
  };

  return { from: mockFrom };
}

function executeQuery(builder: Record<string, unknown>) {
  const table = builder._table as string;
  const operation = builder._operation as string | null;
  const data = builder._data as Record<string, unknown> | null;
  const filters = (builder._filters ?? []) as { field: string; op: string; value: unknown }[];
  const orderBy = builder._orderBy as { field: string; ascending: boolean } | null;
  const limit = builder._limit as number | null;
  const isSingle = builder._single as boolean;

  if (operation === "insert") {
    if (table === "purchases") {
      const row = { ...PURCHASE_DEFAULTS, ...(data ?? {}) } as Record<string, unknown>;
      purchasesDb.set(row.id as string, row);
      return { data: isSingle ? row : [row], error: null };
    } else if (table === "purchase_events") {
      const row = { id: `evt-${eventsDb.length + 1}`, ...data };
      eventsDb.push(row);
      return { data: isSingle ? row : [row], error: null };
    } else if (table === "payments") {
      const row = { id: `pay-${paymentsDb.length + 1}`, ...data };
      paymentsDb.push(row);
      return { data: isSingle ? row : [row], error: null };
    }
  }

  if (operation === "update") {
    if (table === "purchases") {
      const filter = filters.find((f) => f.field === "id");
      if (!filter) {
        return { data: null, error: { message: "No filter" } };
      }
      const existing = purchasesDb.get(filter.value as string);
      if (!existing) {
        return { data: null, error: { code: "PGRST116", message: "Row not found" } };
      }
      Object.assign(existing, data);
      return { data: isSingle ? existing : [existing], error: null };
    }

    if (table === "payments") {
      const filter = filters.find((f) => f.field === "purchase_id" || f.field === "id");
      if (!filter) {
        return { data: null, error: { message: "No filter" } };
      }
      const existing = paymentsDb.find((p) =>
        filter.field === "purchase_id"
          ? p.purchase_id === filter.value
          : p.id === filter.value
      );
      if (existing) {
        Object.assign(existing, data);
        return { data: existing, error: null };
      }
      return { data: null, error: { code: "PGRST116", message: "Row not found" } };
    }

    return { data: null, error: { message: "Unknown table" } };
  }

  if (operation === "delete") {
    if (table === "purchases") {
      purchasesDb.clear();
    } else if (table === "purchase_events") {
      eventsDb = [];
    } else if (table === "payments") {
      paymentsDb = [];
    }
    return { data: null, error: null };
  }

  // SELECT operation
  if (table === "purchases") {
    let rows = Array.from(purchasesDb.values());
    for (const f of filters) {
      if (f.op === "eq") {
        rows = rows.filter((r) => r[f.field] === f.value);
      }
    }
    if (orderBy) {
      rows.sort((a, b) => {
        const av = String(a[orderBy.field] ?? "");
        const bv = String(b[orderBy.field] ?? "");
        return orderBy.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (isSingle && rows.length === 0) {
      return { data: null, error: { code: "PGRST116", message: "Row not found" } };
    }
    return { data: isSingle ? rows[0] : rows, error: null };
  }

  if (table === "purchase_events") {
    let rows = [...eventsDb];
    for (const f of filters) {
      if (f.op === "eq") {
        rows = rows.filter((r) => r[f.field] === f.value);
      }
    }
    if (orderBy) {
      rows.sort((a, b) => {
        const av = String(a[orderBy.field] ?? "");
        const bv = String(b[orderBy.field] ?? "");
        return orderBy.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (limit !== null) {
      rows = rows.slice(0, limit);
    }
    return { data: rows, error: null };
  }

  if (table === "payments") {
    let rows = [...paymentsDb];
    for (const f of filters) {
      if (f.op === "eq") {
        rows = rows.filter((r) => r[f.field] === f.value);
      }
    }
    if (isSingle && rows.length === 0) {
      return { data: null, error: { code: "PGRST116", message: "Row not found" } };
    }
    if (isSingle) {
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  return { data: [], error: null };
}

// --- Mock the server-only import and Supabase client ---
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => buildMockClient(),
}));

// Import AFTER mocks
import {
  SupabasePurchaseRepository,
  upsertPaymentRecord,
  updatePaymentRecord,
} from "./supabase-purchase-repository";
import type { PurchaseRepository } from "./purchase-repository";

// --- Tests ---

describe("SupabasePurchaseRepository", () => {
  let repo: PurchaseRepository;

  beforeEach(() => {
    purchasesDb = new Map();
    eventsDb = [];
    paymentsDb = [];
    repo = new SupabasePurchaseRepository();
  });

  // --- 1. Domain/Database Mapping ---

  describe("mapping", () => {
    it("maps database snake_case to domain camelCase on create", async () => {
      const record = await repo.createPurchase("test-1", "phone-001");

      expect(record.purchaseId).toBe("test-1");
      expect(record.productId).toBe("phone-001");
      expect(record.state).toBe("DECIDED");
      expect(record.createdAt).toBeTypeOf("number");
      expect(record.updatedAt).toBeTypeOf("number");
      expect(record.approvedAt).toBeNull();
      expect(record.expiresAt).toBeNull();
      expect(record.razorpayOrderId).toBeNull();
      expect(record.razorpayPaymentId).toBeNull();
    });

    it("maps database row to PurchaseRecord on get", async () => {
      await repo.createPurchase("test-2", "phone-002");
      const record = await repo.getPurchase("test-2");

      expect(record).not.toBeNull();
      expect(record!.purchaseId).toBe("test-2");
      expect(record!.productId).toBe("phone-002");
    });

    it("maps approval fields correctly", async () => {
      await repo.createPurchase("test-3", "phone-003");
      await repo.transitionPurchaseState("test-3", "CONFIRMING");
      const approved = await repo.approvePurchase("test-3", 1000000);

      expect(approved.state).toBe("APPROVED");
      expect(approved.approvedAt).toBe(1000000);
      expect(approved.expiresAt).toBe(1000000 + 10 * 60 * 1000);
    });

    it("maps Razorpay fields correctly", async () => {
      await repo.createPurchase("test-4", "phone-004");
      await repo.transitionPurchaseState("test-4", "CONFIRMING");
      await repo.approvePurchase("test-4");
      const orderCreated = await repo.setRazorpayOrder("test-4", "order_abc");

      expect(orderCreated.razorpayOrderId).toBe("order_abc");
      expect(orderCreated.state).toBe("ORDER_CREATED");

      const paid = await repo.setRazorpayPayment("test-4", "pay_xyz");
      expect(paid.razorpayPaymentId).toBe("pay_xyz");
      expect(paid.state).toBe("PAID");
    });
  });

  // --- 2. Timestamp Conversion ---

  describe("timestamp conversion", () => {
    it("converts timestamptz string to epoch milliseconds", async () => {
      const record = await repo.createPurchase("ts-1", "phone-001");

      expect(typeof record.createdAt).toBe("number");
      expect(record.createdAt).toBeGreaterThan(0);
      expect(record.updatedAt).toBeGreaterThan(0);
    });

    it("converts epoch milliseconds back to timestamptz for approval", async () => {
      await repo.createPurchase("ts-2", "phone-002");
      await repo.transitionPurchaseState("ts-2", "CONFIRMING");

      const fixedNow = 1700000000000;
      const approved = await repo.approvePurchase("ts-2", fixedNow);

      expect(approved.approvedAt).toBe(fixedNow);
      expect(approved.expiresAt).toBe(fixedNow + 10 * 60 * 1000);
    });
  });

  // --- 3. Missing Purchase Behavior ---

  describe("missing purchase", () => {
    it("returns null for non-existent purchase", async () => {
      const result = await repo.getPurchase("nonexistent");
      expect(result).toBeNull();
    });

    it("throws on transition for non-existent purchase", async () => {
      await expect(
        repo.transitionPurchaseState("nonexistent", "CONFIRMING")
      ).rejects.toThrow("not found");
    });

    it("throws on approve for non-existent purchase", async () => {
      await expect(repo.approvePurchase("nonexistent")).rejects.toThrow(
        "not found"
      );
    });

    it("throws on setRazorpayOrder for non-existent purchase", async () => {
      await expect(
        repo.setRazorpayOrder("nonexistent", "order_123")
      ).rejects.toThrow("not found");
    });

    it("returns null for unknown Razorpay order ID", async () => {
      const result = await repo.getPurchaseByRazorpayOrderId("unknown");
      expect(result).toBeNull();
    });
  });

  // --- 4. Invalid Transition Rejection ---

  describe("invalid transitions", () => {
    it("rejects DECIDED → PAID", async () => {
      await repo.createPurchase("inv-1", "phone-001");
      await expect(
        repo.transitionPurchaseState("inv-1", "PAID")
      ).rejects.toThrow("Invalid purchase state transition");
    });

    it("rejects CONFIRMING → ORDER_CREATED", async () => {
      await repo.createPurchase("inv-2", "phone-001");
      await repo.transitionPurchaseState("inv-2", "CONFIRMING");
      await expect(
        repo.transitionPurchaseState("inv-2", "ORDER_CREATED")
      ).rejects.toThrow("Invalid purchase state transition");
    });

    it("rejects APPROVED → PAID (skipping ORDER_CREATED)", async () => {
      await repo.createPurchase("inv-3", "phone-001");
      await repo.transitionPurchaseState("inv-3", "CONFIRMING");
      await repo.approvePurchase("inv-3");
      await expect(
        repo.transitionPurchaseState("inv-3", "PAID")
      ).rejects.toThrow("Invalid purchase state transition");
    });
  });

  // --- 5. Repository Selection ---

  describe("repository selection", () => {
    it("SupabasePurchaseRepository satisfies PurchaseRepository interface", () => {
      const supabaseRepo = new SupabasePurchaseRepository();
      expect(typeof supabaseRepo.createPurchase).toBe("function");
      expect(typeof supabaseRepo.getPurchase).toBe("function");
      expect(typeof supabaseRepo.getPurchaseByRazorpayOrderId).toBe("function");
      expect(typeof supabaseRepo.transitionPurchaseState).toBe("function");
      expect(typeof supabaseRepo.approvePurchase).toBe("function");
      expect(typeof supabaseRepo.setRazorpayOrder).toBe("function");
      expect(typeof supabaseRepo.setRazorpayPayment).toBe("function");
      expect(typeof supabaseRepo.completePurchase).toBe("function");
      expect(typeof supabaseRepo.cancelPurchase).toBe("function");
      expect(typeof supabaseRepo.expirePurchase).toBe("function");
      expect(typeof supabaseRepo.failPurchase).toBe("function");
      expect(typeof supabaseRepo.createAuditEvent).toBe("function");
      expect(typeof supabaseRepo.listAuditEvents).toBe("function");
      expect(typeof supabaseRepo.listAllPurchases).toBe("function");
      expect(typeof supabaseRepo.clear).toBe("function");
    });
  });

  // --- 6. Audit Events ---

  describe("audit events", () => {
    it("creates and retrieves audit events", async () => {
      await repo.createPurchase("evt-1", "phone-001");
      await repo.createAuditEvent(
        "evt-1",
        "PURCHASE_CREATED",
        null,
        "DECIDED",
        { productId: "phone-001" }
      );
      await repo.createAuditEvent(
        "evt-1",
        "PURCHASE_CONFIRMED",
        "DECIDED",
        "CONFIRMING"
      );

      const events = await repo.listAuditEvents("evt-1");
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("PURCHASE_CREATED");
      expect(events[1].eventType).toBe("PURCHASE_CONFIRMED");
    });

    it("returns empty array for purchase with no events", async () => {
      const events = await repo.listAuditEvents("no-events");
      expect(events).toEqual([]);
    });
  });

  // --- 7. Full Lifecycle ---

  describe("full lifecycle", () => {
    it("completes DECIDED → DONE through all states", async () => {
      await repo.createPurchase("lc-1", "phone-001");
      await repo.transitionPurchaseState("lc-1", "CONFIRMING");
      await repo.approvePurchase("lc-1");
      await repo.setRazorpayOrder("lc-1", "order_lc1");
      await repo.setRazorpayPayment("lc-1", "pay_lc1");
      await repo.completePurchase("lc-1");

      const final = await repo.getPurchase("lc-1");
      expect(final!.state).toBe("DONE");
      expect(final!.razorpayOrderId).toBe("order_lc1");
      expect(final!.razorpayPaymentId).toBe("pay_lc1");
    });

    it("handles cancel from CONFIRMING", async () => {
      await repo.createPurchase("lc-2", "phone-002");
      await repo.transitionPurchaseState("lc-2", "CONFIRMING");
      await repo.cancelPurchase("lc-2");

      const final = await repo.getPurchase("lc-2");
      expect(final!.state).toBe("CANCELLED");
    });

    it("handles fail from ORDER_CREATED", async () => {
      await repo.createPurchase("lc-3", "phone-003");
      await repo.transitionPurchaseState("lc-3", "CONFIRMING");
      await repo.approvePurchase("lc-3");
      await repo.setRazorpayOrder("lc-3", "order_lc3");
      await repo.failPurchase("lc-3");

      const final = await repo.getPurchase("lc-3");
      expect(final!.state).toBe("FAILED");
    });
  });

  // --- 8. Payment Records ---

  describe("payment records", () => {
    it("upsertPaymentRecord creates a new payment", async () => {
      await repo.createPurchase("pay-1", "phone-001");

      await upsertPaymentRecord({
        purchaseId: "pay-1",
        razorpayOrderId: "order_pay1",
        status: "created",
        amount: 2999900,
        currency: "INR",
      });

      expect(paymentsDb).toHaveLength(1);
      expect(paymentsDb[0].purchase_id).toBe("pay-1");
      expect(paymentsDb[0].razorpay_order_id).toBe("order_pay1");
      expect(paymentsDb[0].status).toBe("created");
    });

    it("upsertPaymentRecord updates existing payment", async () => {
      await repo.createPurchase("pay-2", "phone-002");

      await upsertPaymentRecord({
        purchaseId: "pay-2",
        razorpayOrderId: "order_pay2",
        status: "created",
      });

      await upsertPaymentRecord({
        purchaseId: "pay-2",
        razorpayOrderId: "order_pay2",
        status: "updated",
      });

      expect(paymentsDb).toHaveLength(1);
      expect(paymentsDb[0].status).toBe("updated");
    });

    it("updatePaymentRecord updates payment with verified ID", async () => {
      await repo.createPurchase("pay-3", "phone-003");

      await upsertPaymentRecord({
        purchaseId: "pay-3",
        razorpayOrderId: "order_pay3",
        status: "created",
      });

      await updatePaymentRecord({
        purchaseId: "pay-3",
        razorpayPaymentId: "pay_verified_3",
        status: "verified",
      });

      expect(paymentsDb[0].razorpay_payment_id).toBe("pay_verified_3");
      expect(paymentsDb[0].status).toBe("verified");
    });
  });

  // --- 9. Clear ---

  describe("clear", () => {
    it("removes all data", async () => {
      await repo.createPurchase("clr-1", "phone-001");
      await repo.createAuditEvent("clr-1", "PURCHASE_CREATED", null, "DECIDED");

      await repo.clear();

      const purchase = await repo.getPurchase("clr-1");
      expect(purchase).toBeNull();

      const events = await repo.listAuditEvents("clr-1");
      expect(events).toEqual([]);
    });
  });
});
