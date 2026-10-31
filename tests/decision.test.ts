import test from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, contestCost, decide } from "../src/lib/decision.ts";
import { computeMetrics } from "../src/lib/cases.ts";
import type { Dispute } from "../src/lib/types.ts";

type DisputeOverrides = Omit<Partial<Dispute>, "order"> & {
  order?: Partial<Dispute["order"]>;
};

function futureDate(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

function makeDispute(overrides: DisputeOverrides = {}): Dispute {
  const base: Dispute = {
    dispute_id: "TEST-1",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    reason_label: "Item not received",
    status: "WAITING_FOR_SELLER_RESPONSE",
    lifecycle_stage: "INQUIRY",
    dispute_amount: 100,
    currency: "USD",
    create_time: new Date().toISOString(),
    update_time: new Date().toISOString(),
    seller_response_due_date: futureDate(7 * 24),
    evidence_requested: ["PROOF_OF_FULFILLMENT", "OTHER"],
    order: {
      order_id: "ORD-1",
      item_title: "Test item",
      amount: 100,
      currency: "USD",
      buyer_email: "buyer@example.com",
      buyer_name: "Test Buyer",
      purchase_date: "2026-01-01T00:00:00.000Z",
    },
    source: "manual",
    outcome: "open",
  };
  return {
    ...base,
    ...overrides,
    order: { ...base.order, ...(overrides.order ?? {}) },
  };
}

test("INR delivered -> contest & p approx 0.82", () => {
  delete process.env.DISPUTE_FEE_USD;
  const dispute = makeDispute({
    order: {
      tracking: {
        carrier_name: "UPS",
        tracking_number: "1Z999AA10123456784",
        delivery_status: "DELIVERED",
        delivered_date: "2026-01-05T00:00:00.000Z",
      },
    },
  });
  const decision = decide(dispute);
  assert.ok(Math.abs(decision.win_probability - 0.82) < 1e-9, `p=${decision.win_probability}`);
  assert.equal(decision.recommendation, "contest");
});

test("INR no tracking -> accept-leaning p", () => {
  const dispute = makeDispute({ order: { tracking: undefined } });
  const decision = decide(dispute);
  assert.ok(Math.abs(decision.win_probability - 0.25) < 1e-9, `p=${decision.win_probability}`);
  assert.equal(decision.recommendation, "accept");
});

test("NAD without listing capped at <= 0.45", () => {
  const dispute = makeDispute({
    reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    reason_label: "Not as described",
    evidence_requested: ["OTHER"],
    order: {
      listing_text: undefined,
      return_policy: "30-day returns",
      tracking: {
        carrier_name: "UPS",
        tracking_number: "1Z999AA10123456784",
        delivery_status: "DELIVERED",
      },
    },
  });
  const decision = decide(dispute);
  assert.ok(decision.win_probability <= 0.45, `p=${decision.win_probability}`);
  assert.equal(decision.win_probability, 0.45);
  assert.ok(decision.factors.some((f) => f.label.includes("capped at 45%")));
});

test("UNAUTHORISED cap <= 0.65", () => {
  const dispute = makeDispute({
    reason: "UNAUTHORISED",
    reason_label: "Unauthorized payment",
    lifecycle_stage: "INQUIRY",
    evidence_requested: ["PROOF_OF_FULFILLMENT", "OTHER"],
    order: {
      tracking: {
        carrier_name: "UPS",
        tracking_number: "1Z999AA10123456784",
        delivery_status: "DELIVERED",
      },
    },
  });
  const decision = decide(dispute);
  assert.ok(decision.win_probability <= 0.65, `p=${decision.win_probability}`);
  assert.equal(decision.win_probability, 0.65);
  assert.ok(
    decision.factors.some((f) => f.label === "Chargeback cap applied (max 65%)" && f.impact === 0),
  );
});

test("CREDIT with refund_id strong contest", () => {
  const dispute = makeDispute({
    reason: "CREDIT_NOT_PROCESSED",
    reason_label: "Refund not processed",
    evidence_requested: ["PROOF_OF_REFUND", "OTHER"],
    order: { refund_id: "RF-12345" },
  });
  const decision = decide(dispute);
  assert.ok(Math.abs(decision.win_probability - 0.8) < 1e-9, `p=${decision.win_probability}`);
  assert.equal(decision.recommendation, "contest");
});

test("checklist PROOF_OF_REFUND optional for NAD but required for CREDIT", () => {
  const nad = makeDispute({
    reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    reason_label: "Not as described",
    evidence_requested: ["PROOF_OF_REFUND", "OTHER"],
    order: { refund_id: undefined, listing_text: "Listing text" },
  });
  const nadRefund = buildChecklist(nad).find((c) => c.kind === "PROOF_OF_REFUND");
  assert.ok(nadRefund);
  assert.equal(nadRefund.required, false);
  assert.match(nadRefund.detail ?? "", /optional/i);

  const credit = makeDispute({
    reason: "CREDIT_NOT_PROCESSED",
    reason_label: "Refund not processed",
    evidence_requested: ["PROOF_OF_REFUND", "OTHER"],
    order: { refund_id: undefined },
  });
  const creditRefund = buildChecklist(credit).find((c) => c.kind === "PROOF_OF_REFUND");
  assert.ok(creditRefund);
  assert.equal(creditRefund.required, true);
});

test("completeness ignores optional items", () => {
  const dispute = makeDispute({
    reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    reason_label: "Not as described",
    evidence_requested: ["PROOF_OF_REFUND", "OTHER"],
    order: {
      refund_id: undefined,
      listing_text: "Exact listing text for the item",
      return_policy: "30-day returns",
    },
  });
  const decision = decide(dispute);
  // Required: seller note (done) + listing snapshot (done). Optional refund is missing.
  assert.equal(decision.evidence_completeness, 1);
});

test("EV math with default fee (DISPUTE_FEE_USD unset)", () => {
  delete process.env.DISPUTE_FEE_USD;
  assert.equal(contestCost(), 12);
  const dispute = makeDispute({
    dispute_amount: 100,
    order: {
      tracking: {
        carrier_name: "UPS",
        tracking_number: "1Z999AA10123456784",
        delivery_status: "DELIVERED",
        delivered_date: "2026-01-05T00:00:00.000Z",
      },
    },
  });
  const decision = decide(dispute);
  assert.equal(decision.contest_cost, 12);
  assert.equal(decision.gross_expected, 82);
  assert.equal(decision.expected_value, 70);
});

test("computeMetrics at_risk includes overdue and win_rate null when undecided", () => {
  const overdue = makeDispute({
    dispute_id: "OVERDUE",
    outcome: "open",
    seller_response_due_date: futureDate(-1),
  });
  const dueSoon = makeDispute({
    dispute_id: "DUE-SOON",
    outcome: "open",
    seller_response_due_date: futureDate(12),
  });
  const dueLater = makeDispute({
    dispute_id: "DUE-LATER",
    outcome: "open",
    seller_response_due_date: futureDate(48),
  });
  const metrics = computeMetrics([overdue, dueSoon, dueLater]);
  assert.equal(metrics.at_risk_24h, 2);
  assert.equal(metrics.win_rate, null);
});
