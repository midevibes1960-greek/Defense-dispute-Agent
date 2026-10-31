import { NextResponse } from "next/server";
import { getCase, updateCase, logEvent, recordSubmission } from "@/lib/db";
import { buildEvidences, decide } from "@/lib/decision";
import { acceptClaim, makeOffer, provideEvidence, sendMessage, paypalConfigured, PaypalError } from "@/lib/paypal";

type Action = "contest" | "accept" | "offer" | "message";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const disputeId = decodeURIComponent(id);
  const dispute = await getCase(disputeId);
  if (!dispute) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });

  let action: Action = "contest";
  let note = "";
  let offerAmount = 0;
  const files: { name: string; type: string; buffer: Buffer }[] = [];

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    action = (String(form.get("action") ?? "contest") as Action);
    note = String(form.get("note") ?? "");
    offerAmount = Number(form.get("offer_amount") ?? 0);
    for (const f of form.getAll("files")) {
      if (f instanceof File && f.size > 0) {
        if (f.size > 10 * 1024 * 1024) return NextResponse.json({ ok: false, error: `File ${f.name} is over PayPal's 10MB limit` }, { status: 422 });
        files.push({ name: f.name, type: f.type, buffer: Buffer.from(await f.arrayBuffer()) });
      }
    }
  } else {
    const b = await req.json().catch(() => ({}));
    action = (["contest", "accept", "offer", "message"].includes(b.action) ? b.action : "contest") as Action;
    note = String(b.note ?? "");
    offerAmount = Number(b.offer_amount ?? 0);
  }

  const decision = dispute.last_decision ?? decide(dispute);
  if (!note.trim()) note = decision.draft_note;

  // Validate before touching PayPal — never submit an empty evidence pack.
  if (action === "contest") {
    const missing = decision.evidence_checklist.filter((c) => !c.done).map((c) => c.label);
    if (missing.length && decision.evidence_completeness < 1 && dispute.evidence_requested.some((k) => k !== "OTHER")) {
      return NextResponse.json({ ok: false, code: "EVIDENCE_INCOMPLETE", error: `Evidence incomplete — add: ${missing.join("; ")}`, missing }, { status: 422 });
    }
  }
  if (action === "offer" && !(offerAmount > 0)) return NextResponse.json({ ok: false, error: "Offer amount must be greater than 0" }, { status: 422 });
  if (action === "message" && !note.trim()) return NextResponse.json({ ok: false, error: "Message cannot be empty" }, { status: 422 });

  // Honesty gate: only real PayPal cases can be submitted to PayPal. No simulated success.
  if (dispute.source !== "paypal" || !paypalConfigured()) {
    const reason = dispute.source !== "paypal"
      ? `This is a ${dispute.source} case, not a PayPal-synced dispute, so there is nothing to submit to PayPal. Connect PayPal and sync, or record the outcome manually below.`
      : "PayPal is not connected (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing). Submission was NOT sent.";
    await recordSubmission({ dispute_id: disputeId, at: new Date().toISOString(), action, ok: false, live: false, message: reason });
    await logEvent(disputeId, "system", "submission_blocked", reason);
    return NextResponse.json({ ok: false, code: "NOT_SUBMITTED", error: reason }, { status: 409 });
  }

  try {
    const result = action === "contest"
      ? await provideEvidence(disputeId, buildEvidences(dispute, note), files)
      : action === "accept"
        ? await acceptClaim(disputeId, note)
        : action === "offer"
          ? await makeOffer(disputeId, offerAmount, dispute.currency, note)
          : await sendMessage(disputeId, note);

    const message = action === "contest" ? `Evidence submitted to PayPal (provide-evidence, HTTP ${result.status}, ${files.length} file${files.length === 1 ? "" : "s"} attached).`
      : action === "accept" ? `Claim accepted on PayPal (accept-claim, HTTP ${result.status}). Buyer will be refunded $${dispute.dispute_amount}.`
      : action === "offer" ? `Offer of $${offerAmount.toFixed(2)} sent via make-offer (HTTP ${result.status}).`
      : `Message sent to buyer via send-message (HTTP ${result.status}).`;

    if (action === "contest") await updateCase(disputeId, { status: "UNDER_REVIEW", outcome: "under_review" });
    if (action === "accept") await updateCase(disputeId, { status: "RESOLVED", outcome: "accepted" });
    await recordSubmission({ dispute_id: disputeId, at: new Date().toISOString(), action, ok: true, live: true, http_status: result.status, message });
    await logEvent(disputeId, "seller", `approved_${action}`, `Seller approved ${action} in the workspace`);
    await logEvent(disputeId, "agent", `paypal_${action}`, message);
    return NextResponse.json({ ok: true, live: true, http_status: result.status, message });
  } catch (e) {
    const pe = e instanceof PaypalError ? e : null;
    const message = e instanceof Error ? e.message : String(e);
    await recordSubmission({ dispute_id: disputeId, at: new Date().toISOString(), action, ok: false, live: true, http_status: pe?.status, message, paypal_debug_id: pe?.debugId });
    await logEvent(disputeId, "agent", "paypal_error", message);
    return NextResponse.json({ ok: false, live: true, error: message, paypal_debug_id: pe?.debugId }, { status: pe && pe.status >= 400 ? pe.status : 502 });
  }
}
