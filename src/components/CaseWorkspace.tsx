"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, CheckCircle2, FileUp, Loader2, Lock, MessageSquare, Package, Scale, Send, Trash2, TriangleAlert, X } from "lucide-react";
import type { AuditEvent, Decision, Dispute, Submission } from "@/lib/types";
import { buildEvidences } from "@/lib/decision";
import { Card, Badge, SourceBadge, OutcomeBadge, WinGauge, Money } from "./chrome";
import { Countdown } from "./Countdown";

const input = "w-full rounded-xl bg-white px-3 py-2 text-[13px] ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-[#003087]";
const label = "block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1";

type ActionKind = "contest" | "accept" | "offer" | "message";

export function CaseWorkspace({ dispute: initial, decision: initialDecision, events, submissions, canSubmit, aiConfigured }: {
  dispute: Dispute; decision: Decision; events: AuditEvent[]; submissions: Submission[]; canSubmit: boolean; aiConfigured: boolean;
}) {
  const router = useRouter();
  const [dispute, setDispute] = useState(initial);
  const [decision, setDecision] = useState(initialDecision);
  const [note, setNote] = useState(initialDecision.draft_note);
  const [carrier, setCarrier] = useState(initial.order.tracking?.carrier_name ?? "");
  const [tracking, setTracking] = useState(initial.order.tracking?.tracking_number ?? "");
  const [delivery, setDelivery] = useState<string>(initial.order.tracking?.delivery_status ?? "UNKNOWN");
  const [listing, setListing] = useState(initial.order.listing_text ?? "");
  const [policy, setPolicy] = useState(initial.order.return_policy ?? "");
  const [refundId, setRefundId] = useState(initial.order.refund_id ?? "");
  const [offerAmount, setOfferAmount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<ActionKind | null>(null);
  const [outcome, setOutcome] = useState("won");

  const payloadPreview = useMemo(() => {
    const overlay: Dispute = { ...dispute, order: { ...dispute.order, listing_text: listing || undefined, return_policy: policy || undefined, refund_id: refundId || undefined, tracking: tracking ? { carrier_name: carrier || "OTHER", tracking_number: tracking, delivery_status: delivery as Dispute["order"]["tracking"] extends { delivery_status?: infer T } ? T : never } : undefined } };
    return buildEvidences(overlay, note);
  }, [dispute, listing, policy, refundId, tracking, carrier, delivery, note]);

  const missing = decision.evidence_checklist.filter((c) => !c.done);

  async function saveEvidence() {
    setBusy("save"); setResult(null);
    const r = await fetch(`/api/disputes/${dispute.dispute_id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrier_name: carrier, tracking_number: tracking, delivery_status: delivery, listing_text: listing, return_policy: policy, refund_id: refundId }),
    });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) { setResult({ ok: false, text: j.error ?? "Save failed" }); return; }
    setDispute(j.dispute); setDecision(j.decision); setNote((n) => (n === decision.draft_note ? j.decision.draft_note : n));
    setResult({ ok: true, text: "Evidence details saved. Decision recalculated from the new facts." });
    router.refresh();
  }

  async function runDecision() {
    setBusy("decide"); setResult(null);
    const r = await fetch(`/api/disputes/${dispute.dispute_id}/decide`, { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) { setResult({ ok: false, text: j.error ?? "Decision failed" }); return; }
    setDecision(j.decision); setNote(j.decision.draft_note);
    setResult({ ok: true, text: j.decision.ai_error ?? `Decision updated via ${j.decision.model}: ${j.decision.recommendation.toUpperCase()} @ ${Math.round(j.decision.win_probability * 100)}%.` });
    router.refresh();
  }

  async function doSubmit() {
    if (!pending) return;
    setBusy("submit");
    const form = new FormData();
    form.append("action", pending);
    form.append("note", note);
    if (pending === "offer") form.append("offer_amount", offerAmount);
    for (const f of files) form.append("files", f);
    const r = await fetch(`/api/disputes/${dispute.dispute_id}/submit`, { method: "POST", body: form });
    const j = await r.json();
    setBusy(null); setPending(null);
    setResult({ ok: r.ok && j.ok, text: j.message ?? j.error ?? `Request failed (${r.status})` });
    if (r.ok) { setFiles([]); router.refresh(); }
  }

  async function recordOutcome() {
    setBusy("outcome");
    const r = await fetch(`/api/disputes/${dispute.dispute_id}/outcome`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome }) });
    const j = await r.json();
    setBusy(null);
    setResult({ ok: r.ok, text: r.ok ? `Outcome recorded as ${outcome.toUpperCase()}. Metrics now reflect this.` : (j.error ?? "Failed") });
    if (r.ok) router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete the local copy of ${dispute.dispute_id}? This does not touch PayPal.`)) return;
    await fetch(`/api/disputes/${dispute.dispute_id}`, { method: "DELETE" });
    router.push("/"); router.refresh();
  }

  const actionMeta: Record<ActionKind, { title: string; desc: string }> = {
    contest: { title: "Submit evidence to PayPal", desc: `Sends provide-evidence for ${dispute.dispute_id} with the payload below${files.length ? ` and ${files.length} file(s)` : ""}. PayPal then moves the case to UNDER_REVIEW.` },
    accept: { title: "Accept the claim", desc: `Closes ${dispute.dispute_id} in the buyer's favour. PayPal refunds ${dispute.currency} ${dispute.dispute_amount} from the seller account. This cannot be undone.` },
    offer: { title: "Make a refund offer", desc: `Sends make-offer of ${dispute.currency} ${offerAmount || "0"} to settle ${dispute.dispute_id} without a full contest.` },
    message: { title: "Send buyer a message", desc: "Sends the note below to the buyer via send-message. Does not submit evidence." },
  };

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" /> Case queue</Link>

      {/* header */}
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-black tracking-tight text-slate-900">{dispute.order.item_title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
            <span className="font-mono">{dispute.dispute_id}</span> · {dispute.reason_label} · {dispute.lifecycle_stage} · order {dispute.order.order_id}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5"><SourceBadge source={dispute.source} /><OutcomeBadge outcome={dispute.outcome} /><Badge tone="gray">{dispute.status}</Badge></div>
        </div>
        <div className="ml-auto flex gap-3">
          <Card className="px-4 py-3 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount in dispute</div>
            <Money v={dispute.dispute_amount} currency={dispute.currency} className="text-[22px] font-black" />
          </Card>
          <Card className="px-4 py-3 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Respond by</div>
            <div className="text-[15px] font-black"><Countdown iso={dispute.seller_response_due_date} /></div>
            <div className="text-[11px] text-slate-400">{new Date(dispute.seller_response_due_date).toLocaleString()}</div>
          </Card>
        </div>
      </div>

      {result && <div className={`dd-in mt-3 rounded-2xl px-4 py-3 text-[13px] font-semibold ring-1 ${result.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>{result.text}</div>}
      {decision.ai_error && <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200">{decision.ai_error}</div>}

      <div className="mt-4 grid items-start gap-3 xl:grid-cols-[1fr_360px]">
        {/* main column */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* decision */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 p-4">
              <WinGauge p={decision.win_probability} />
              <div className="min-w-52 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[18px] font-black ${decision.recommendation === "contest" ? "text-emerald-700" : "text-red-700"}`}>{decision.recommendation === "contest" ? "Contest this dispute" : "Accept — contesting loses money"}</span>
                  <Badge tone={decision.model === "rules-v1" ? "gray" : "blue"}><Bot className="size-3" /> {decision.model === "rules-v1" ? "Rules engine (no AI key)" : `AI · ${decision.model}`}</Badge>
                </div>
                <div className="mt-2 grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
                  <span className="text-slate-500">Win odds × amount</span><b className="tabular-nums">{Math.round(decision.win_probability * 100)}% × <Money v={dispute.dispute_amount} currency={dispute.currency} /> = <Money v={decision.gross_expected} currency={dispute.currency} /></b>
                  <span className="text-slate-500">PayPal dispute fee (est.)</span><b className="tabular-nums">− <Money v={decision.contest_cost} currency={dispute.currency} /></b>
                  <span className="border-t border-slate-100 pt-1 font-bold text-slate-700">Expected value of contesting</span><b className={`border-t border-slate-100 pt-1 tabular-nums ${decision.expected_value > 0 ? "text-emerald-700" : "text-red-600"}`}><Money v={decision.expected_value} currency={dispute.currency} /></b>
                </div>
              </div>
              <button disabled={busy !== null} onClick={runDecision} className="flex items-center gap-1.5 rounded-full bg-[#003087] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
                {busy === "decide" ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />} {aiConfigured ? "Run AI decision" : "Recalculate"}
              </button>
            </div>
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Why — every factor, no black box</div>
              <ul className="mt-1.5 grid gap-1.5 md:grid-cols-2">
                {decision.factors.map((f) => (
                  <li key={f.label} className="flex gap-2 rounded-xl bg-white p-2.5 text-[12px] ring-1 ring-slate-100">
                    <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 font-black tabular-nums ${f.impact >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{f.impact >= 0 ? "+" : ""}{f.impact}</span>
                    <span><b className="block">{f.label}</b><span className="text-slate-500">{f.evidence}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* evidence builder */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex items-center gap-2 text-[15px] font-black"><Package className="size-4 text-[#003087]" /> Evidence builder</h2>
              <Badge tone={decision.evidence_completeness >= 1 ? "green" : "amber"}>{Math.round(decision.evidence_completeness * 100)}% complete</Badge>
              <span className="text-[12px] text-slate-400">PayPal asked for: {dispute.evidence_requested.join(", ") || "OTHER"}</span>
            </div>
            <div className="mt-3 grid gap-1.5">
              {decision.evidence_checklist.map((c) => (
                <div key={c.label} className="flex gap-2.5 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-black ${c.done ? "bg-emerald-600 text-white" : "bg-red-100 text-red-700"}`}>{c.done ? "✓" : "!"}</span>
                  <span className="text-[12px]"><b className="block text-[13px]">{c.label}</b><span className="text-slate-500">{c.detail}</span></span>
                  <Badge tone="gray" className="ml-auto h-fit">{c.kind}</Badge>
                </div>
              ))}
              {missing.length > 0 && <p className="flex items-center gap-1.5 text-[12px] font-semibold text-red-600"><TriangleAlert className="size-3.5" /> Contest submission is blocked until the missing items above are added.</p>}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div><label className={label}>Carrier</label><input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="FEDEX" className={input} /></div>
              <div><label className={label}>Tracking number</label><input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="122533485" className={input} /></div>
              <div><label className={label}>Delivery status</label><select value={delivery} onChange={(e) => setDelivery(e.target.value)} className={input}><option>UNKNOWN</option><option>DELIVERED</option><option>IN_TRANSIT</option><option>EXCEPTION</option></select></div>
              <div className="sm:col-span-2"><label className={label}>Listing text (exact)</label><textarea value={listing} onChange={(e) => setListing(e.target.value)} rows={2} className={input} /></div>
              <div><label className={label}>Refund ID</label><input value={refundId} onChange={(e) => setRefundId(e.target.value)} placeholder="REF-…" className={input} /></div>
              <div className="sm:col-span-3"><label className={label}>Return / refund policy</label><textarea value={policy} onChange={(e) => setPolicy(e.target.value)} rows={2} className={input} /></div>
            </div>
            <button disabled={busy !== null} onClick={saveEvidence} className="mt-3 flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save evidence details</button>

            <div className="mt-4">
              <label className={label}>Seller note that goes to PayPal ({note.length} chars)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={input} />
            </div>
            <div className="mt-3">
              <label className={label}>Attach documents (PDF / images, max 10MB each)</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[13px] font-semibold text-slate-600 hover:border-[#003087]">
                <FileUp className="size-4" /> {files.length ? `${files.length} file(s) selected` : "Choose delivery proof, invoices, screenshots…"}
                <input type="file" multiple accept=".pdf,image/*,.txt" className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
              </label>
              {files.length > 0 && <ul className="mt-1.5 flex flex-col gap-1">{files.map((f) => <li key={f.name} className="flex items-center gap-2 text-[12px] text-slate-600"><span className="truncate">{f.name}</span><span className="text-slate-400">{(f.size / 1024).toFixed(0)} KB</span><button onClick={() => setFiles(files.filter((x) => x !== f))} className="ml-auto text-red-600"><X className="size-3.5" /></button></li>)}</ul>}
            </div>
            <details className="mt-3 rounded-xl bg-slate-900 p-3 text-slate-100">
              <summary className="cursor-pointer text-[12px] font-bold">Exact payload that will be sent (provide-evidence)</summary>
              <pre className="nice-scroll mt-2 overflow-x-auto text-[11px] leading-relaxed">{JSON.stringify({ evidences: payloadPreview }, null, 2)}</pre>
            </details>
          </Card>

          {/* actions */}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[15px] font-black"><Send className="size-4 text-[#003087]" /> Respond on PayPal</h2>
            {!canSubmit && (
              <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900 ring-1 ring-amber-200"><Lock className="mt-0.5 size-4 shrink-0" /><span>{dispute.source !== "paypal" ? <>This is a {dispute.source} case — there is no PayPal dispute with this ID to act on. Buttons stay disabled so nothing fake can be &ldquo;submitted&rdquo;. Use <b>Record outcome</b> on the right to track what happened offline, or sync a real PayPal dispute.</> : <>PayPal keys are missing, so these actions are disabled. Add keys on the <Link href="/connect" className="font-bold underline">connection page</Link> and restart.</>}</span></p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <button disabled={!canSubmit || missing.length > 0} onClick={() => setPending("contest")} className="rounded-full bg-emerald-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">Approve & submit evidence</button>
              <button disabled={!canSubmit} onClick={() => setPending("accept")} className="rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Accept claim & refund</button>
              <span className="flex items-center gap-1.5">
                <input value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Offer $" className="w-24 rounded-full px-3 py-2.5 text-[13px] ring-1 ring-slate-300 outline-none focus:ring-[#003087]" />
                <button disabled={!canSubmit || !(Number(offerAmount) > 0)} onClick={() => setPending("offer")} className="rounded-full bg-white px-4 py-2.5 text-[13px] font-bold ring-1 ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40">Make offer</button>
              </span>
              <button disabled={!canSubmit} onClick={() => setPending("message")} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold ring-1 ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40"><MessageSquare className="size-4" /> Message buyer</button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Every action asks for confirmation first and is written to the audit trail with PayPal&rsquo;s real response.</p>
          </Card>
        </div>

        {/* right rail */}
        <div className="flex flex-col gap-3">
          <Card className="p-4">
            <div className="text-[13px] font-black">Order & buyer</div>
            <dl className="mt-2 text-[13px]">
              {[["Buyer", `${dispute.order.buyer_name}${dispute.order.buyer_email ? ` · ${dispute.order.buyer_email}` : ""}`], ["Purchased", new Date(dispute.order.purchase_date).toLocaleDateString()], ["Opened", new Date(dispute.create_time).toLocaleString()], ["Transaction", dispute.paypal?.seller_transaction_id ?? dispute.order.order_id], ["PayPal outcome code", dispute.paypal?.outcome_code ?? "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-50 py-1.5 last:border-0"><dt className="text-slate-400">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
              ))}
            </dl>
            {dispute.buyer_message && <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-900 ring-1 ring-amber-200"><b>Buyer says:</b> &ldquo;{dispute.buyer_message}&rdquo;</p>}
          </Card>

          <Card className="p-4">
            <div className="text-[13px] font-black">Record outcome</div>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">When PayPal (or you, offline) settles this, record it truthfully — recovered money and win rate only count real outcomes.</p>
            <div className="mt-2 flex gap-2">
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={input}><option value="won">Won — kept the money</option><option value="lost">Lost</option><option value="accepted">Accepted / refunded</option><option value="under_review">Under review</option><option value="open">Reopen</option></select>
              <button disabled={busy !== null} onClick={recordOutcome} className="shrink-0 rounded-full bg-slate-900 px-4 text-[13px] font-bold text-white disabled:opacity-50">{busy === "outcome" ? <Loader2 className="size-4 animate-spin" /> : "Save"}</button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-[13px] font-black">Submission history</div>
            {submissions.length === 0 ? <p className="mt-1.5 text-[12px] text-slate-500">Nothing submitted yet. Attempts — including blocked or failed ones — are recorded here.</p> : (
              <ul className="mt-2 flex flex-col gap-1.5">{submissions.map((s) => (
                <li key={s.id} className="rounded-xl bg-slate-50 p-2.5 text-[12px] ring-1 ring-slate-100">
                  <b className={s.ok ? "text-emerald-700" : "text-red-600"}>{s.ok ? "✓" : "✗"} {s.action}</b> <span className="text-slate-400">{new Date(s.at).toLocaleString()}{s.http_status ? ` · HTTP ${s.http_status}` : ""}{s.live ? "" : " · not sent"}</span>
                  <span className="block text-slate-600">{s.message}</span>
                </li>))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="text-[13px] font-black">Audit trail</div>
            {events.length === 0 ? <p className="mt-1.5 text-[12px] text-slate-500">No activity yet.</p> : (
              <ol className="mt-2 flex flex-col gap-1.5">{events.map((e) => (
                <li key={e.id} className="border-l-2 border-slate-200 pl-2.5 text-[12px]"><b className="capitalize">{e.actor}</b> · {e.action}<span className="block text-slate-500">{e.detail}</span><span className="text-[11px] text-slate-400">{new Date(e.at).toLocaleString()}</span></li>
              ))}</ol>
            )}
          </Card>

          <button onClick={remove} className="flex items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50"><Trash2 className="size-4" /> Delete local copy</button>
        </div>
      </div>

      {/* confirm modal */}
      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
          <Card className="dd-in w-full max-w-lg p-5">
            <h3 className="text-[17px] font-black">{actionMeta[pending].title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{actionMeta[pending].desc}</p>
            {pending === "contest" && <pre className="nice-scroll mt-3 max-h-44 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100">{JSON.stringify({ evidences: payloadPreview }, null, 2)}</pre>}
            {pending === "accept" && <p className="mt-3 rounded-xl bg-red-50 p-3 text-[13px] font-semibold text-red-700 ring-1 ring-red-200">This refunds the buyer in full and closes the case. It cannot be undone.</p>}
            <div className="mt-4 flex gap-2">
              <button disabled={busy !== null} onClick={doSubmit} className={`flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50 ${pending === "accept" ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"}`}>{busy === "submit" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Yes, send to PayPal</button>
              <button disabled={busy !== null} onClick={() => setPending(null)} className="rounded-full bg-white px-5 py-2.5 text-[13px] font-bold ring-1 ring-slate-300">Cancel</button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
