import { NextResponse } from "next/server";
import { getCase, upsertCase, logEvent, seenWebhook, markWebhook } from "@/lib/db";
import { toDispute, verifyWebhook, paypalConfigured } from "@/lib/paypal";

// PayPal webhook receiver: CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED.
// Verifies the signature when PAYPAL_WEBHOOK_ID is set, dedupes by event id,
// and upserts the dispute into the local store so the queue updates itself.
export async function POST(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const eventId = String(body.id ?? "");
  const eventType = String(body.event_type ?? "UNKNOWN");
  if (eventId && (await seenWebhook(eventId))) return NextResponse.json({ ok: true, deduped: true });

  let verified = false;
  let verifyReason = "PayPal not connected — signature not verified";
  if (paypalConfigured()) {
    try { const v = await verifyWebhook(req.headers, raw); verified = v.verified; verifyReason = v.reason; }
    catch (e) { verifyReason = e instanceof Error ? e.message : "verification failed"; }
  }
  if (process.env.PAYPAL_WEBHOOK_ID && !verified) {
    return NextResponse.json({ ok: false, error: `Webhook signature verification failed: ${verifyReason}` }, { status: 400 });
  }

  const resource = (body.resource ?? {}) as Record<string, unknown>;
  const disputeId = String(resource.dispute_id ?? "unknown");
  if (resource.dispute_id) {
    const existing = await getCase(disputeId);
    await upsertCase(toDispute(resource, existing));
  }
  if (eventId) await markWebhook(eventId);
  await logEvent(disputeId, "paypal", "webhook", `${eventType} received · signature ${verified ? "verified" : `unverified (${verifyReason})`}`);
  return NextResponse.json({ ok: true, dispute_id: disputeId, event_type: eventType, verified });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "Point a PayPal webhook (developer.paypal.com → Webhooks) at this URL for CUSTOMER.DISPUTE.* events. Set PAYPAL_WEBHOOK_ID to enforce signature verification." });
}
