import { NextResponse } from "next/server";
import { getCase, upsertCase, saveDecision, logEvent } from "@/lib/db";
import { decide } from "@/lib/decision";
import { fetchDispute, paypalConfigured, PaypalError } from "@/lib/paypal";

// Agent auto-enrichment: pull the freshest facts for a PayPal dispute
// (tracking / refund / buyer / due date) straight from PayPal, store them,
// and re-run the decision so the checklist reflects reality. Honest no-op
// (409) for manual/sample cases or when PayPal is not connected.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const disputeId = decodeURIComponent(id);
  const existing = await getCase(disputeId);
  if (!existing) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });

  if (existing.source !== "paypal" || !paypalConfigured()) {
    const reason = existing.source !== "paypal"
      ? `This is a ${existing.source} case, not a PayPal-synced dispute, so there is nothing to pull from PayPal. Add the evidence manually in the workspace instead.`
      : "PayPal is not connected (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing). Enrichment was NOT run — no data was pulled.";
    const current = existing.last_decision ?? decide(existing);
    const missing = current.evidence_checklist.filter((c) => !c.done).map((c) => c.label);
    await logEvent(disputeId, "agent", "enrich_skipped", reason);
    return NextResponse.json({ ok: false, error: reason, found: [], missing }, { status: 409 });
  }

  try {
    const enriched = await fetchDispute(disputeId, existing);
    await upsertCase(enriched);
    const decision = decide(enriched);
    await saveDecision(disputeId, decision);

    const found: string[] = [];
    const bt = existing.order.tracking;
    const at = enriched.order.tracking;
    if (at?.tracking_number && (bt?.tracking_number !== at.tracking_number || bt?.carrier_name !== at.carrier_name || bt?.delivery_status !== at.delivery_status)) {
      found.push(`Tracking ${at.carrier_name} ${at.tracking_number} · ${at.delivery_status ?? "UNKNOWN"} pulled from PayPal evidence`);
    }
    if (enriched.order.refund_id && enriched.order.refund_id !== existing.order.refund_id) {
      found.push(`Refund ID ${enriched.order.refund_id} pulled from PayPal evidence`);
    }
    if (enriched.order.buyer_email && enriched.order.buyer_email !== existing.order.buyer_email) {
      found.push(`Buyer email ${enriched.order.buyer_email} pulled from PayPal`);
    }
    if (enriched.buyer_message && enriched.buyer_message !== existing.buyer_message) {
      found.push("Buyer message pulled from PayPal");
    }
    if (enriched.seller_response_due_date && enriched.seller_response_due_date !== existing.seller_response_due_date) {
      found.push(`Due date ${enriched.seller_response_due_date} pulled from PayPal`);
    }

    const missing = decision.evidence_checklist.filter((c) => !c.done).map((c) => c.label);
    const summary = found.length
      ? `Enriched from PayPal: ${found.join("; ")}${missing.length ? ` · still missing: ${missing.join("; ")}` : " · evidence checklist complete"}`
      : `Enriched from PayPal: no new evidence found${missing.length ? ` · still missing: ${missing.join("; ")}` : " · evidence checklist complete"}`;
    await logEvent(disputeId, "agent", "enriched", summary);

    const saved = await getCase(disputeId);
    return NextResponse.json({ ok: true, dispute: saved ?? enriched, decision, found, missing });
  } catch (e) {
    const pe = e instanceof PaypalError ? e : null;
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message, paypal_debug_id: pe?.debugId }, { status: 502 });
  }
}
