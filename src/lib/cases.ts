import { listCases } from "./db";
import type { Metrics } from "./types";

export function computeMetrics(cases: Awaited<ReturnType<typeof listCases>>): Metrics {
  const now = Date.now();
  const openCases = cases.filter((c) => c.outcome === "open" || c.outcome === "under_review");
  const won = cases.filter((c) => c.outcome === "won");
  const lost = cases.filter((c) => c.outcome === "lost");
  const accepted = cases.filter((c) => c.outcome === "accepted");
  const decided = won.length + lost.length;
  return {
    total: cases.length,
    open: openCases.length,
    needs_response: cases.filter((c) => c.status === "WAITING_FOR_SELLER_RESPONSE").length,
    at_risk_24h: cases.filter((c) => c.outcome === "open" && new Date(c.seller_response_due_date).getTime() - now < 24 * 3600_000 && new Date(c.seller_response_due_date).getTime() > now).length,
    under_review: cases.filter((c) => c.outcome === "under_review" || c.status === "UNDER_REVIEW").length,
    resolved: cases.filter((c) => c.status === "RESOLVED" || ["won","lost","accepted"].includes(c.outcome)).length,
    contested: cases.filter((c) => c.outcome === "under_review" || c.outcome === "won" || c.outcome === "lost").length,
    won: won.length, lost: lost.length, accepted: accepted.length,
    win_rate: decided ? +(won.length / decided).toFixed(2) : null,
    amount_at_risk: +openCases.reduce((a, c) => a + c.dispute_amount, 0).toFixed(2),
    recovered: +won.reduce((a, c) => a + c.dispute_amount, 0).toFixed(2),
    accepted_amount: +accepted.reduce((a, c) => a + c.dispute_amount, 0).toFixed(2),
    currency: "USD",
  };
}

export const REASON_LABELS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorized payment",
  CREDIT_NOT_PROCESSED: "Refund not processed",
  DUPLICATE_TRANSACTION: "Duplicate transaction",
};

export function evidenceForReason(reason: string): ("PROOF_OF_FULFILLMENT" | "PROOF_OF_REFUND" | "OTHER")[] {
  switch (reason) {
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED": return ["PROOF_OF_FULFILLMENT", "OTHER"];
    case "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED": return ["OTHER"];
    case "UNAUTHORISED": return ["PROOF_OF_FULFILLMENT", "OTHER"];
    case "CREDIT_NOT_PROCESSED": return ["PROOF_OF_REFUND", "OTHER"];
    default: return ["OTHER"];
  }
}
