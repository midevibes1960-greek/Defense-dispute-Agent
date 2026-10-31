import { NextResponse } from "next/server";
import { listCases, upsertCase, logEvent } from "@/lib/db";
import { evidenceForReason, REASON_LABELS } from "@/lib/cases";
import type { Dispute, DisputeReason } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const status = url.searchParams.get("status");
  let cases = await listCases();
  if (status === "needs_response") cases = cases.filter((c) => c.status === "WAITING_FOR_SELLER_RESPONSE");
  else if (status === "urgent") cases = cases.filter((c) => c.outcome === "open" && new Date(c.seller_response_due_date).getTime() - Date.now() < 24 * 3600_000);
  else if (status === "under_review") cases = cases.filter((c) => c.outcome === "under_review");
  else if (status === "resolved") cases = cases.filter((c) => ["won", "lost", "accepted"].includes(c.outcome));
  else if (status === "open") cases = cases.filter((c) => c.outcome === "open");
  if (q) cases = cases.filter((c) => JSON.stringify(c).toLowerCase().includes(q));
  return NextResponse.json({ disputes: cases, count: cases.length });
}

const REASONS = Object.keys(REASON_LABELS) as DisputeReason[];

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  const amount = Number(b.amount);
  const errors: string[] = [];
  if (!String(b.item_title ?? "").trim()) errors.push("Item / service title is required");
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Amount must be greater than 0");
  if (!REASONS.includes(b.reason)) errors.push("Choose a valid PayPal dispute reason");
  let dueDate: Date | null = null;
  if (b.seller_response_due_date) {
    const d = new Date(b.seller_response_due_date);
    if (Number.isNaN(d.getTime())) errors.push("seller_response_due_date is not a valid date");
    else dueDate = d;
  }
  let purchaseDate: Date | null = null;
  if (b.purchase_date) {
    const d = new Date(b.purchase_date);
    if (Number.isNaN(d.getTime())) errors.push("purchase_date is not a valid date");
    else purchaseDate = d;
  }
  const currency = String(b.currency ?? "USD").trim().toUpperCase() || "USD";
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("Currency must be a 3-letter code (e.g. USD)");
  if (errors.length) return NextResponse.json({ ok: false, error: errors.join(". ") }, { status: 422 });

  const DELIVERY_STATUSES = ["DELIVERED", "IN_TRANSIT", "EXCEPTION", "UNKNOWN"] as const;
  const deliveryStatus = (DELIVERY_STATUSES as readonly string[]).includes(String(b.delivery_status ?? "").toUpperCase())
    ? (String(b.delivery_status).toUpperCase() as (typeof DELIVERY_STATUSES)[number])
    : "UNKNOWN";

  const now = new Date().toISOString();
  const due = dueDate ? dueDate.toISOString() : new Date(Date.now() + 10 * 86400_000).toISOString();
  const reason = b.reason as DisputeReason;
  const dispute: Dispute = {
    dispute_id: `CASE-${Date.now().toString(36).toUpperCase()}`,
    reason, reason_label: REASON_LABELS[reason],
    status: "WAITING_FOR_SELLER_RESPONSE", lifecycle_stage: "INQUIRY",
    dispute_amount: +amount.toFixed(2), currency,
    create_time: now, update_time: now, seller_response_due_date: due,
    buyer_message: String(b.buyer_message ?? "").trim() || undefined,
    evidence_requested: evidenceForReason(reason),
    order: {
      order_id: String(b.order_id ?? "").trim() || `ORD-${Date.now().toString(36).toUpperCase()}`,
      item_title: String(b.item_title).trim(),
      amount: +amount.toFixed(2), currency,
      buyer_email: String(b.buyer_email ?? "").trim(), buyer_name: String(b.buyer_name ?? "").trim() || "Buyer",
      purchase_date: purchaseDate ? purchaseDate.toISOString() : now,
      tracking: b.tracking_number ? { carrier_name: String(b.carrier_name ?? "OTHER").toUpperCase(), tracking_number: String(b.tracking_number).trim(), delivery_status: deliveryStatus } : undefined,
      listing_text: String(b.listing_text ?? "").trim() || undefined,
      return_policy: String(b.return_policy ?? "").trim() || undefined,
      refund_id: String(b.refund_id ?? "").trim() || undefined,
    },
    source: "manual", outcome: "open",
  };
  await upsertCase(dispute);
  await logEvent(dispute.dispute_id, "seller", "case_created", `Manual case created for ${dispute.order.item_title} ($${dispute.dispute_amount})`);
  return NextResponse.json({ ok: true, dispute }, { status: 201 });
}
