import type { Decision, DecisionFactor, Dispute, EvidenceType } from "./types";

export function contestCost(): number {
  const raw = process.env.DISPUTE_FEE_USD;
  const parsed = raw !== undefined && raw !== "" ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
}

export const CONTEST_COST = contestCost(); // PayPal dispute fee estimate used for EV math (default; contestCost() reads DISPUTE_FEE_USD at call time)

function hoursLeft(d: Dispute) {
  return (new Date(d.seller_response_due_date).getTime() - Date.now()) / 3600_000;
}

export function buildChecklist(d: Dispute): Decision["evidence_checklist"] {
  const items: Decision["evidence_checklist"] = [];
  if (d.evidence_requested.includes("PROOF_OF_FULFILLMENT")) {
    const t = d.order.tracking;
    items.push({
      kind: "PROOF_OF_FULFILLMENT",
      label: "Proof of fulfillment — carrier + tracking",
      done: Boolean(t?.tracking_number && t?.carrier_name),
      detail: t?.tracking_number ? `${t.carrier_name} ${t.tracking_number} · ${t.delivery_status ?? "UNKNOWN"}` : "Missing — add carrier + tracking number below",
      required: true,
    });
  }
  if (d.evidence_requested.includes("PROOF_OF_REFUND")) {
    const refundRequired = d.reason === "CREDIT_NOT_PROCESSED";
    items.push({
      kind: "PROOF_OF_REFUND",
      label: "Proof of refund — refund ID",
      done: Boolean(d.order.refund_id),
      detail: refundRequired
        ? (d.order.refund_id ?? "No refund ID on file — add it if you already refunded")
        : (d.order.refund_id ? `${d.order.refund_id} (optional for this dispute reason)` : "Optional for this dispute reason — add refund ID only if you already refunded"),
      required: refundRequired,
    });
  }
  if (d.evidence_requested.includes("OTHER")) {
    items.push({ kind: "OTHER", label: "Seller note — what happened, in plain English", done: true, detail: "Drafted from order + tracking. Edit before submitting.", required: true });
    if (d.order.listing_text || d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") {
      items.push({ kind: "OTHER", label: "Listing text snapshot", done: Boolean(d.order.listing_text), detail: d.order.listing_text ? d.order.listing_text.slice(0, 110) + "…" : "Missing — paste the exact listing text", required: d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" });
    }
    if (d.order.return_policy) items.push({ kind: "OTHER", label: "Return / refund policy", done: true, detail: d.order.return_policy, required: false });
  }
  return items;
}

/** Explainable scorer. Every point is a visible factor — no black box, no fake "AI". */
export function decide(d: Dispute, model = "rules-v1", history?: { won: number; lost: number }): Decision {
  const factors: DecisionFactor[] = [];
  let p = 0.5;
  const add = (label: string, points: number, evidence: string) => { p += points / 100; factors.push({ label, impact: points, evidence }); };

  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED") {
    if (d.order.tracking?.delivery_status === "DELIVERED" && d.order.tracking.tracking_number) add("Delivered tracking on file", 32, `${d.order.tracking.carrier_name} ${d.order.tracking.tracking_number}`);
    else if (d.order.tracking?.delivery_status === "IN_TRANSIT") add("Still in transit", -15, "Carrier has not scanned delivery yet");
    else add("No delivery proof", -25, "No tracking number on the order");
  }
  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") {
    if (d.order.listing_text) add("Listing text available to rebut claim", 12, d.order.listing_text.slice(0, 80));
    else add("No listing text on file", -8, "Cannot show what was promised");
    if (d.order.tracking?.delivery_status === "DELIVERED") add("Delivery confirmed", 8, "Receipt is not in dispute");
    if (d.order.return_policy) add("Return policy documented", 5, d.order.return_policy.slice(0, 80));
  }
  if (d.reason === "UNAUTHORISED") {
    if (d.order.tracking?.delivery_status === "DELIVERED") add("Delivered to buyer's address", 18, `${d.order.tracking.carrier_name} ${d.order.tracking.tracking_number}`);
    else add("No delivery proof for unauthorized claim", -10, "Nothing ties the charge to a fulfilled order");
    if (d.lifecycle_stage !== "INQUIRY") add(`${d.lifecycle_stage} stage`, -8, "Chargeback-stage cases are harder to win");
  }
  if (d.reason === "CREDIT_NOT_PROCESSED") {
    if (d.order.refund_id) add("Refund already issued", 30, d.order.refund_id);
    else add("No refund ID found", -20, "PayPal will side with the buyer without one");
  }
  if (d.reason === "DUPLICATE_TRANSACTION") add("Duplicate claim — needs transaction pair proof", -5, "Attach both transaction IDs before contesting");

  const h = hoursLeft(d);
  if (h < 0) add("Deadline already passed", -20, "PayPal may auto-close in buyer's favour");
  else if (h < 24) add("Due within 24 hours", -4, "Respond today or risk auto-loss");

  if (history && history.won + history.lost >= 3) {
    const total = history.won + history.lost;
    const rate = history.won / total;
    const shift = Math.min(0.1, Math.max(-0.1, (rate - 0.5) * 0.2));
    const shiftPoints = Math.round(shift * 100);
    p += shift;
    factors.push({ label: `Your decided-case history (${history.won}W/${history.lost}L)`, impact: shiftPoints, evidence: `Historical win rate ${Math.round(rate * 100)}% across ${total} decided cases` });
  }

  p = Math.min(0.95, Math.max(0.03, p));
  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" && !d.order.listing_text && p > 0.45) {
    p = 0.45;
    factors.push({ label: "No listing text — win probability capped at 45%", impact: 0, evidence: "Listing text is needed to rebut a not-as-described claim" });
  }
  if (d.reason === "UNAUTHORISED" && p > 0.65) {
    p = 0.65;
    factors.push({ label: "Chargeback cap applied (max 65%)", impact: 0, evidence: "UNAUTHORISED disputes are capped at 65%" });
  }
  const fee = contestCost();
  const gross = +(p * d.dispute_amount).toFixed(2);
  const ev = +(gross - fee).toFixed(2);
  const checklist = buildChecklist(d);
  const requiredItems = checklist.filter((c) => c.required !== false);
  const completeness = requiredItems.length ? requiredItems.filter((c) => c.done).length / requiredItems.length : 1;
  const recommendation = ev > 0 && p > 0.35 && completeness > 0 ? "contest" : "accept";

  return {
    dispute_id: d.dispute_id,
    recommendation,
    win_probability: +p.toFixed(2),
    gross_expected: gross,
    expected_value: ev,
    contest_cost: fee,
    evidence_completeness: +completeness.toFixed(2),
    factors,
    reasoning: factors.map((f) => `${f.label} (${f.impact >= 0 ? "+" : ""}${f.impact} pts) — ${f.evidence}`),
    evidence_checklist: checklist,
    draft_note: draftNote(d),
    model,
    decided_at: new Date().toISOString(),
  };
}

export function draftNote(d: Dispute): string {
  const t = d.order.tracking;
  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" && t?.tracking_number) {
    return `Order ${d.order.order_id} (${d.order.item_title}, $${d.dispute_amount}) shipped via ${t.carrier_name} ${t.tracking_number}${t.delivered_date ? ` and delivered ${t.delivered_date.slice(0, 10)}` : t.delivery_status ? ` — carrier status: ${t.delivery_status}` : ""}. Buyer opened this case on ${d.create_time.slice(0, 10)} claiming non-receipt. Carrier delivery evidence is attached for review.`;
  }
  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") {
    return `Buyer reports: "${d.buyer_message ?? "item not as described"}" for ${d.order.item_title} ($${d.dispute_amount}). Our listing states: ${d.order.listing_text ?? "[add listing text]"}. Returns policy: ${d.order.return_policy ?? "[add policy]"}. Listing snapshot attached — request review against what was advertised.`;
  }
  if (d.reason === "CREDIT_NOT_PROCESSED" && d.order.refund_id) {
    return `Refund ${d.order.refund_id} was already issued for order ${d.order.order_id} (${d.order.item_title}, $${d.dispute_amount}). Buyer opened a credit-not-processed case on ${d.create_time.slice(0, 10)}. Refund proof attached.`;
  }
  return `Regarding case ${d.dispute_id} for ${d.order.item_title} ($${d.dispute_amount}, order ${d.order.order_id}): buyer states "${d.buyer_message ?? d.reason_label}". Supporting evidence is attached for review.`;
}

export interface EvidenceDraft {
  evidence_type: EvidenceType;
  notes?: string;
  evidence_info?: {
    tracking_info?: { carrier_name: string; tracking_number: string }[];
    refund_ids?: string[];
  };
}

/** Build the exact PayPal evidences[] payload from the case. Nothing invented. */
export function buildEvidences(d: Dispute, note: string): EvidenceDraft[] {
  const out: EvidenceDraft[] = [];
  if (d.evidence_requested.includes("PROOF_OF_FULFILLMENT") && d.order.tracking?.tracking_number) {
    out.push({ evidence_type: "PROOF_OF_FULFILLMENT", evidence_info: { tracking_info: [{ carrier_name: d.order.tracking.carrier_name || "OTHER", tracking_number: d.order.tracking.tracking_number }] } });
  }
  if (d.evidence_requested.includes("PROOF_OF_REFUND") && d.order.refund_id) {
    out.push({ evidence_type: "PROOF_OF_REFUND", evidence_info: { refund_ids: [d.order.refund_id] } });
  }
  out.push({ evidence_type: "OTHER", notes: note });
  return out;
}
