import { NextResponse } from "next/server";
import { getCase, listEvents, listSubmissions, updateCase, deleteCase, logEvent } from "@/lib/db";
import { decide } from "@/lib/decision";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dispute = await getCase(decodeURIComponent(id));
  if (!dispute) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  return NextResponse.json({
    dispute,
    decision: dispute.last_decision ?? decide(dispute),
    events: await listEvents(dispute.dispute_id),
    submissions: await listSubmissions(dispute.dispute_id),
  });
}

const DELIVERY = ["DELIVERED", "IN_TRANSIT", "EXCEPTION", "UNKNOWN"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const disputeId = decodeURIComponent(id);
  const existing = await getCase(disputeId);
  if (!existing) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const order = { ...existing.order };
  if (typeof b.item_title === "string" && b.item_title.trim()) order.item_title = b.item_title.trim();
  if (typeof b.buyer_name === "string") order.buyer_name = b.buyer_name;
  if (typeof b.buyer_email === "string") order.buyer_email = b.buyer_email;
  if (typeof b.listing_text === "string") order.listing_text = b.listing_text.trim() || undefined;
  if (typeof b.return_policy === "string") order.return_policy = b.return_policy.trim() || undefined;
  if (typeof b.refund_id === "string") order.refund_id = b.refund_id.trim() || undefined;
  if (typeof b.tracking_number === "string") {
    order.tracking = b.tracking_number.trim()
      ? { carrier_name: String(b.carrier_name ?? order.tracking?.carrier_name ?? "OTHER").toUpperCase(), tracking_number: b.tracking_number.trim(), delivery_status: DELIVERY.includes(b.delivery_status) ? b.delivery_status : (order.tracking?.delivery_status ?? "UNKNOWN") }
      : undefined;
  } else if (typeof b.carrier_name === "string" && order.tracking) {
    order.tracking = { ...order.tracking, carrier_name: b.carrier_name.toUpperCase(), delivery_status: DELIVERY.includes(b.delivery_status) ? b.delivery_status : order.tracking.delivery_status };
  }
  const updated = await updateCase(disputeId, {
    order,
    buyer_message: typeof b.buyer_message === "string" ? b.buyer_message : existing.buyer_message,
    seller_response_due_date: b.seller_response_due_date ? new Date(b.seller_response_due_date).toISOString() : existing.seller_response_due_date,
    last_decision: undefined,
  });
  await logEvent(disputeId, "seller", "evidence_edited", "Seller updated order / evidence details");
  return NextResponse.json({ ok: true, dispute: updated, decision: updated ? decide(updated) : null });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const disputeId = decodeURIComponent(id);
  const existing = await getCase(disputeId);
  if (!existing) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  await deleteCase(disputeId);
  await logEvent(disputeId, "seller", "case_deleted", `Removed local copy of ${disputeId} (${existing.source})`);
  return NextResponse.json({ ok: true });
}
