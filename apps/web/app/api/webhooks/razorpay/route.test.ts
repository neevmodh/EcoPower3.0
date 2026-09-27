// Regression coverage for a real bug found in review: the route used to
// (1) discard applyPaymentDecision's error and mark the event processed
// anyway, and (2) record the idempotency row *before* processing, so any
// failure — even a transient one — made that exact delivery permanently
// unretriable (the next retry's insert hits 23505 and short-circuits
// before ever trying again). Both are fixed; these tests pin the fix.
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-webhook-secret";

vi.mock("@/lib/payments/applyDecision", () => ({
  applyPaymentDecision: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: vi.fn(),
}));

import { applyPaymentDecision } from "@/lib/payments/applyDecision";
import { serviceClient } from "@/lib/supabase/service";
import { POST } from "./route";

type Resp = { data?: unknown; error?: { code?: string; message: string } | null };

// Each `.from(table)` call consumes the next scripted response in order —
// simple and exact, since the route's call sequence per scenario is fixed
// and known from reading the code, not incidental.
// A real Promise instance (not a plain object with its own `then`) so
// awaiting the builder directly — the route's final `.update().eq()` call
// never adds a `.single()` — resolves it exactly like the real supabase-js
// query builder, which is itself thenable this same way.
function makeBuilder(response: Resp) {
  return Object.assign(Promise.resolve(response), {
    insert: () => makeBuilder(response),
    select: () => makeBuilder(response),
    update: () => makeBuilder(response),
    eq: () => makeBuilder(response),
    single: () => Promise.resolve(response),
  });
}

function mockSupabase(responses: Resp[]) {
  let i = 0;
  const fromCalls: string[] = [];
  const client = {
    from(table: string) {
      fromCalls.push(table);
      return makeBuilder(responses[i++] ?? { data: null, error: null });
    },
  };
  return { client, fromCalls };
}

function signedRequest(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
  return new Request("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": "evt_test_1",
    },
    body: raw,
  });
}

const CAPTURED_PAYLOAD = {
  event: "payment.captured",
  payload: {
    payment: {
      entity: { id: "pay_1", order_id: "order_1", method: "upi", amount: 50000 },
    },
  },
};

beforeEach(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  vi.mocked(applyPaymentDecision).mockReset();
});

describe("POST /api/webhooks/razorpay", () => {
  it("fresh event, apply succeeds: marks processed and returns 200", async () => {
    const { client, fromCalls } = mockSupabase([
      { data: { id: "we_1" }, error: null }, // insert webhook_events
      { data: { id: "po_1", invoice_id: "inv_1" }, error: null }, // select payment_orders
      { data: null, error: null }, // update webhook_events processed_at
    ]);
    vi.mocked(serviceClient).mockReturnValue(client as never);
    vi.mocked(applyPaymentDecision).mockResolvedValue({ error: null, skipped: false });

    const res = await POST(signedRequest(CAPTURED_PAYLOAD));

    expect(res.status).toBe(200);
    expect(fromCalls).toEqual(["webhook_events", "payment_orders", "webhook_events"]);
  });

  it("fresh event, apply fails: 500, and does NOT mark processed", async () => {
    const { client, fromCalls } = mockSupabase([
      { data: { id: "we_1" }, error: null }, // insert webhook_events
      { data: { id: "po_1", invoice_id: "inv_1" }, error: null }, // select payment_orders
    ]);
    vi.mocked(serviceClient).mockReturnValue(client as never);
    vi.mocked(applyPaymentDecision).mockResolvedValue({
      error: { message: "invoice update failed" } as never,
      skipped: false,
    });

    const res = await POST(signedRequest(CAPTURED_PAYLOAD));

    expect(res.status).toBe(500);
    // Exactly the insert + the order lookup — no third call to mark
    // processed_at, which is the whole point of the fix.
    expect(fromCalls).toEqual(["webhook_events", "payment_orders"]);
  });

  it("duplicate of an already-processed event: short-circuits, never reprocesses", async () => {
    const { client, fromCalls } = mockSupabase([
      { data: null, error: { code: "23505", message: "duplicate key" } }, // insert conflict
      { data: { processed_at: "2026-01-01T00:00:00Z" }, error: null }, // lookup: already processed
    ]);
    vi.mocked(serviceClient).mockReturnValue(client as never);

    const res = await POST(signedRequest(CAPTURED_PAYLOAD));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ received: true, duplicate: true });
    expect(fromCalls).toEqual(["webhook_events", "webhook_events"]);
    expect(applyPaymentDecision).not.toHaveBeenCalled();
  });

  it("retry of a previously-failed delivery (processed_at still null): reprocesses instead of treating it as a duplicate", async () => {
    const { client, fromCalls } = mockSupabase([
      { data: null, error: { code: "23505", message: "duplicate key" } }, // insert conflict (prior attempt's row)
      { data: { processed_at: null }, error: null }, // lookup: never actually finished
      { data: { id: "po_1", invoice_id: "inv_1" }, error: null }, // select payment_orders
      { data: null, error: null }, // update webhook_events processed_at
    ]);
    vi.mocked(serviceClient).mockReturnValue(client as never);
    vi.mocked(applyPaymentDecision).mockResolvedValue({ error: null, skipped: false });

    const res = await POST(signedRequest(CAPTURED_PAYLOAD));

    expect(res.status).toBe(200);
    expect(applyPaymentDecision).toHaveBeenCalledTimes(1);
    expect(fromCalls).toEqual([
      "webhook_events",
      "webhook_events",
      "payment_orders",
      "webhook_events",
    ]);
  });
});
