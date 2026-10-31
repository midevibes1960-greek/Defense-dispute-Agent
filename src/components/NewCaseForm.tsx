"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "./chrome";

const REASONS = [
  { v: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", label: "Item not received", hint: "Evidence PayPal wants: PROOF_OF_FULFILLMENT (carrier + tracking)" },
  { v: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", label: "Not as described", hint: "Evidence PayPal wants: OTHER (listing text, policy, photos)" },
  { v: "UNAUTHORISED", label: "Unauthorized payment", hint: "Evidence PayPal wants: PROOF_OF_FULFILLMENT + OTHER" },
  { v: "CREDIT_NOT_PROCESSED", label: "Refund not processed", hint: "Evidence PayPal wants: PROOF_OF_REFUND (refund ID)" },
  { v: "DUPLICATE_TRANSACTION", label: "Duplicate transaction", hint: "Evidence PayPal wants: OTHER (both transaction IDs)" },
];

const input = "w-full rounded-xl bg-white px-3 py-2.5 text-[13px] ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-[#003087]";
const label = "block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1";

export function NewCaseForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(REASONS[0].v);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const body = Object.fromEntries(fd.entries());
      const r = await fetch("/api/disputes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setError(j.error ?? `Failed (${r.status})`); return; }
      router.push(`/disputes/${j.dispute.dispute_id}`);
      router.refresh();
    } catch { setError("Network error — is the server running?"); }
    finally { setBusy(false); }
  }

  const hint = REASONS.find((r) => r.v === reason)?.hint;

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={label}>Item / service sold *</label><input name="item_title" required placeholder="e.g. Sony WH-1000XM5 Wireless Headphones" className={input} /></div>
        <div><label className={label}>Dispute amount (USD) *</label><input name="amount" type="number" min="0.01" step="0.01" required placeholder="240.00" className={input} /></div>
        <div><label className={label}>Your order ID</label><input name="order_id" placeholder="ORD-88121" className={input} /></div>
        <div className="sm:col-span-2">
          <label className={label}>PayPal dispute reason *</label>
          <select name="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={input}>{REASONS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</select>
          <p className="mt-1 text-[12px] text-slate-500">{hint}</p>
        </div>
        <div><label className={label}>Buyer name</label><input name="buyer_name" placeholder="Maya R." className={input} /></div>
        <div><label className={label}>Buyer email</label><input name="buyer_email" type="email" placeholder="buyer@example.com" className={input} /></div>
        <div className="sm:col-span-2"><label className={label}>What the buyer said</label><textarea name="buyer_message" rows={2} placeholder="Paste the buyer's message…" className={input} /></div>
        <div><label className={label}>Respond-by deadline</label><input name="seller_response_due_date" type="datetime-local" className={input} /></div>
        <div><label className={label}>Purchase date</label><input name="purchase_date" type="date" className={input} /></div>
        <div className="sm:col-span-2 border-t border-slate-100 pt-3 text-[13px] font-black text-slate-700">Evidence you already have (optional — editable later)</div>
        <div><label className={label}>Carrier</label><input name="carrier_name" placeholder="FEDEX" className={input} /></div>
        <div><label className={label}>Tracking number</label><input name="tracking_number" placeholder="122533485" className={input} /></div>
        <div>
          <label className={label}>Delivery status</label>
          <select name="delivery_status" className={input}><option>UNKNOWN</option><option>DELIVERED</option><option>IN_TRANSIT</option><option>EXCEPTION</option></select>
        </div>
        <div><label className={label}>Refund ID (if already refunded)</label><input name="refund_id" placeholder="REF-…" className={input} /></div>
        <div className="sm:col-span-2"><label className={label}>Listing text (exact wording)</label><textarea name="listing_text" rows={2} className={input} /></div>
        <div className="sm:col-span-2"><label className={label}>Return / refund policy</label><textarea name="return_policy" rows={2} className={input} /></div>
        {error && <div className="sm:col-span-2 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700 ring-1 ring-red-200">{error}</div>}
        <div className="sm:col-span-2 flex gap-2">
          <button disabled={busy} className="flex items-center gap-1.5 rounded-full bg-[#003087] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : null} Create case & open workspace</button>
          <span className="self-center text-[12px] text-slate-400">Saved to your local database immediately. Nothing is sent to PayPal from this form.</span>
        </div>
      </form>
    </Card>
  );
}
