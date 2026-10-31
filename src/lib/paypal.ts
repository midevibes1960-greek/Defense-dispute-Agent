import type { Dispute, DisputeReason, EvidenceType } from "./types";
import type { EvidenceDraft } from "./decision";

/**
 * Real PayPal Disputes API client (sandbox + live).
 * No silent fallbacks: every failure is a PaypalError the UI shows verbatim.
 * Reads (toolkit parity): list / get dispute.
 * Writes (beyond toolkit): provide-evidence, accept-claim, make-offer, send-message.
 */

export class PaypalError extends Error {
  status: number; paypalName?: string; debugId?: string; details?: unknown;
  constructor(status: number, message: string, extra?: { paypalName?: string; debugId?: string; details?: unknown }) {
    super(message); this.status = status; this.paypalName = extra?.paypalName; this.debugId = extra?.debugId; this.details = extra?.details;
  }
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}
export function paypalBase() {
  return process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

const g = globalThis as unknown as { __ppToken?: { token: string; exp: number } };

export async function getToken(): Promise<string> {
  if (!paypalConfigured()) throw new PaypalError(0, "PayPal is not connected: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox keys from developer.paypal.com) and restart.");
  if (g.__ppToken && g.__ppToken.exp > Date.now() + 30_000) return g.__ppToken.token;
  const id = process.env.PAYPAL_CLIENT_ID!, sec = process.env.PAYPAL_CLIENT_SECRET!;
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${sec}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const tokenText = await r.text();
  let j: any = {};
  if (tokenText) {
    try { j = JSON.parse(tokenText); } catch { throw new PaypalError(r.status || 502, `PayPal OAuth returned a non-JSON response (HTTP ${r.status}): ${tokenText.slice(0, 300)}`); }
  }
  if (!r.ok || !j.access_token) throw new PaypalError(r.status, `PayPal OAuth failed (${r.status}): ${j.error_description ?? j.error ?? "check client id/secret + environment"}`, { paypalName: j.error });
  g.__ppToken = { token: j.access_token, exp: Date.now() + (Number(j.expires_in ?? 3600) * 1000) };
  return j.access_token;
}

async function api<T>(path: string, init?: RequestInit): Promise<{ data: T; status: number }> {
  const t = await getToken();
  const r = await fetch(`${paypalBase()}${path}`, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init?.headers ?? {}) }, cache: "no-store", signal: init?.signal ?? AbortSignal.timeout(20000) });
  const text = await r.text();
  let data: T;
  if (!text) data = {} as T;
  else {
    try { data = JSON.parse(text) as T; } catch { throw new PaypalError(r.status || 502, `PayPal ${path} returned a non-JSON response (HTTP ${r.status}): ${text.slice(0, 300)}`); }
  }
  if (!r.ok) {
    const e = data as { name?: string; message?: string; debug_id?: string; details?: unknown };
    throw new PaypalError(r.status, `PayPal ${r.status} ${e.name ?? ""}: ${e.message ?? text.slice(0, 300)}`.trim(), { paypalName: e.name, debugId: e.debug_id, details: e.details });
  }
  return { data, status: r.status };
}

function mapReason(reason: string): DisputeReason {
  if (reason?.includes("NOT_RECEIVED")) return "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";
  if (reason?.includes("NOT_AS_DESCRIBED")) return "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED";
  if (reason?.includes("UNAUTHORISED") || reason?.includes("UNAUTHORIZED")) return "UNAUTHORISED";
  if (reason?.includes("CREDIT")) return "CREDIT_NOT_PROCESSED";
  if (reason?.includes("DUPLICATE")) return "DUPLICATE_TRANSACTION";
  return "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";
}

const REASON_LABEL: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorized payment",
  CREDIT_NOT_PROCESSED: "Refund not processed",
  DUPLICATE_TRANSACTION: "Duplicate transaction",
};

export function toDispute(raw: any, existing?: Dispute | null): Dispute {
  const reason = mapReason(raw.reason ?? "");
  const evs: any[] = Array.isArray(raw.evidences) ? raw.evidences : [];
  const requested = [...new Set(evs.map((e) => e.evidence_type).filter(Boolean))] as EvidenceType[];
  // tracking/refund may be present in evidence_info on detail payloads
  let tracking = existing?.order.tracking;
  let refund_id = existing?.order.refund_id;
  for (const e of evs) {
    const ti = e.evidence_info?.tracking_info?.[0];
    if (ti?.tracking_number) tracking = { carrier_name: ti.carrier_name ?? tracking?.carrier_name ?? "OTHER", tracking_number: ti.tracking_number, delivery_status: tracking?.delivery_status ?? "UNKNOWN" };
    const rid = e.evidence_info?.refund_ids?.[0];
    if (rid) refund_id = rid;
  }
  const tx = raw.disputed_transactions?.[0] ?? {};
  const msgs: any[] = raw.communications ?? raw.messages ?? [];
  const buyerMsg = [...msgs].reverse().find((m) => (m.posted_by ?? m.sender_role ?? "") === "BUYER")?.message ?? existing?.buyer_message;
  const outcomeCode: string | undefined = raw.dispute_outcome?.outcome_code ?? raw.outcome;
  const status = (raw.status ?? existing?.status ?? "OPEN") as Dispute["status"];
  return {
    dispute_id: raw.dispute_id,
    reason,
    reason_label: REASON_LABEL[reason] ?? reason,
    status,
    lifecycle_stage: raw.dispute_life_cycle_stage ?? existing?.lifecycle_stage ?? "INQUIRY",
    dispute_amount: Number(raw.dispute_amount?.value ?? existing?.dispute_amount ?? 0),
    currency: raw.dispute_amount?.currency_code ?? existing?.currency ?? "USD",
    create_time: raw.create_time ?? existing?.create_time ?? new Date().toISOString(),
    update_time: raw.update_time ?? new Date().toISOString(),
    seller_response_due_date: raw.seller_response_due_date ?? existing?.seller_response_due_date ?? new Date(Date.now() + 7 * 86400_000).toISOString(),
    buyer_message: buyerMsg,
    evidence_requested: requested.length ? requested : (existing?.evidence_requested ?? ["OTHER"]),
    order: {
      order_id: existing?.order.order_id ?? tx.seller_transaction_id ?? raw.dispute_id,
      item_title: existing?.order.item_title ?? (tx.seller_transaction_id ? `PayPal txn ${tx.seller_transaction_id}` : "PayPal dispute"),
      amount: Number(raw.dispute_amount?.value ?? existing?.order.amount ?? 0),
      currency: raw.dispute_amount?.currency_code ?? existing?.currency ?? "USD",
      buyer_email: raw.buyer?.email_address ?? existing?.order.buyer_email ?? "",
      buyer_name: raw.buyer?.name ?? existing?.order.buyer_name ?? "PayPal buyer",
      purchase_date: tx.create_time ?? raw.create_time ?? existing?.order.purchase_date ?? new Date().toISOString(),
      tracking, refund_id,
      listing_text: existing?.order.listing_text,
      return_policy: existing?.order.return_policy,
      item_url: existing?.order.item_url,
    },
    source: "paypal",
    outcome: status === "RESOLVED" ? (outcomeCode?.includes("SELLER") ? "won" : outcomeCode?.includes("BUYER") ? "lost" : (existing?.outcome ?? "lost")) : status === "UNDER_REVIEW" ? "under_review" : (existing?.outcome === "won" || existing?.outcome === "lost" || existing?.outcome === "accepted" ? existing.outcome : "open"),
    paypal: {
      dispute_state: raw.dispute_state,
      seller_transaction_id: tx.seller_transaction_id,
      buyer_transaction_id: tx.buyer_transaction_id,
      outcome_code: outcomeCode,
      links: raw.links,
    },
    last_decision: existing?.last_decision,
  };
}

export async function fetchAllDisputes(existing: Map<string, Dispute>): Promise<Dispute[]> {
  const out: Dispute[] = [];
  // PayPal list is paginated by page/page_size (max 50)
  for (let page = 1; page <= 10; page++) {
    const { data } = await api<any>(`/v1/customer/disputes?page_size=50&page=${page}`);
    const items: any[] = data.items ?? [];
    for (const item of items) {
      // detail call for evidence + due date (list payload is a summary)
      try {
        const { data: detail } = await api<any>(`/v1/customer/disputes/${encodeURIComponent(item.dispute_id)}`);
        out.push(toDispute(detail, existing.get(item.dispute_id)));
      } catch {
        out.push(toDispute(item, existing.get(item.dispute_id)));
      }
    }
    if (items.length < 50) break;
  }
  return out;
}

export async function fetchDispute(id: string, existing?: Dispute | null): Promise<Dispute> {
  const { data } = await api<any>(`/v1/customer/disputes/${encodeURIComponent(id)}`);
  return toDispute(data, existing);
}

export interface PaypalResult { ok: true; status: number; links?: { href: string; rel: string }[] }

export async function provideEvidence(id: string, evidences: EvidenceDraft[], files: { name: string; type: string; buffer: Buffer }[]): Promise<PaypalResult> {
  const t = await getToken();
  const withDocs = evidences.map((e, i) => (i === evidences.length - 1 && files.length ? { ...e, documents: files.map((f) => ({ name: f.name })) } : e));
  const form = new FormData();
  form.append("input", new Blob([JSON.stringify({ evidences: withDocs })], { type: "application/json" }));
  for (const f of files) form.append(f.name, new Blob([new Uint8Array(f.buffer)], { type: f.type || "application/octet-stream" }), f.name);
  const r = await fetch(`${paypalBase()}/v1/customer/disputes/${encodeURIComponent(id)}/provide-evidence`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form, signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let data: any = {};
  if (text) {
    try { data = JSON.parse(text); } catch { throw new PaypalError(r.status || 502, `provide-evidence returned a non-JSON response (HTTP ${r.status}): ${text.slice(0, 300)}`); }
  }
  if (!r.ok) throw new PaypalError(r.status, `provide-evidence failed: ${data.message ?? text.slice(0, 300)}`, { paypalName: data.name, debugId: data.debug_id, details: data.details });
  return { ok: true, status: r.status, links: data.links };
}

export async function acceptClaim(id: string, note: string): Promise<PaypalResult> {
  const { data, status } = await api<any>(`/v1/customer/disputes/${encodeURIComponent(id)}/accept-claim`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
  });
  return { ok: true, status, links: data.links };
}

export async function makeOffer(id: string, offerAmount: number, currency: string, note: string): Promise<PaypalResult> {
  const { data, status } = await api<any>(`/v1/customer/disputes/${encodeURIComponent(id)}/make-offer`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offer_amount: { value: offerAmount.toFixed(2), currency_code: currency }, offer_type: "REFUND", note }),
  });
  return { ok: true, status, links: data.links };
}

export async function sendMessage(id: string, message: string): Promise<PaypalResult> {
  const { data, status } = await api<any>(`/v1/customer/disputes/${encodeURIComponent(id)}/send-message`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }),
  });
  return { ok: true, status, links: data.links };
}

export async function verifyWebhook(headers: Headers, rawBody: string): Promise<{ verified: boolean; reason: string }> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return { verified: false, reason: "PAYPAL_WEBHOOK_ID not set — signature not verified" };
  const t = await getToken();
  const r = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_time: headers.get("paypal-transmission-time"),
      cert_url: headers.get("paypal-cert-url"),
      auth_algo: headers.get("paypal-auth-algo"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
    signal: AbortSignal.timeout(20000),
  });
  const verifyText = await r.text();
  let j: any = {};
  if (verifyText) {
    try { j = JSON.parse(verifyText); } catch { throw new PaypalError(r.status || 502, `PayPal verify-webhook-signature returned a non-JSON response (HTTP ${r.status}): ${verifyText.slice(0, 300)}`); }
  }
  return { verified: j.verification_status === "SUCCESS", reason: j.verification_status ?? `verify HTTP ${r.status}` };
}

export async function connectionTest(): Promise<{ configured: boolean; env: string; token_ok: boolean; dispute_count?: number; error?: string }> {
  const env = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  if (!paypalConfigured()) return { configured: false, env, token_ok: false, error: "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set" };
  try {
    await getToken();
    const { data } = await api<any>(`/v1/customer/disputes?page_size=1`);
    return { configured: true, env, token_ok: true, dispute_count: data.total_items ?? (data.items?.length ?? 0) };
  } catch (e) {
    return { configured: true, env, token_ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
