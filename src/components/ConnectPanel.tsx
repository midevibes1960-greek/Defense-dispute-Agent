"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Card, Badge } from "./chrome";

interface Status { configured: boolean; env: string; token_ok: boolean; dispute_count?: number; error?: string; webhook_id_set: boolean; ai_configured: boolean; ai_model: string | null; local_cases: number; paypal_cases: number }

function Row({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-50 py-2.5 text-[13px] last:border-0">
      {ok === null ? <span className="size-4 rounded-full bg-slate-200" /> : ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <XCircle className="size-4 shrink-0 text-red-500" />}
      <span className="font-semibold text-slate-600">{label}</span><span className="ml-auto text-right font-bold">{value}</span>
    </div>
  );
}

export function ConnectPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setBusy("test");
    try { setStatus(await (await fetch("/api/paypal/status")).json()); } catch { setStatus(null); }
    setBusy(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/paypal/status").then((r) => r.json()).then((j) => { if (!cancelled) setStatus(j); }).catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, []);

  const [webhookUrl, setWebhookUrl] = useState("/api/webhooks/paypal");

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setWebhookUrl(`${window.location.origin}/api/webhooks/paypal`); }, []);

  async function sync() {
    setBusy("sync"); setMsg(null);
    try {
      const r = await fetch("/api/paypal/sync", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setMsg({ ok: r.ok && !!j.ok, text: j.message ?? j.error ?? `Failed (${r.status})` });
      if (r.ok) router.refresh();
    } catch { setMsg({ ok: false, text: "Network error — is the server running?" }); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-black">Connection status — tested live, not assumed</h2>
          {status && <Badge tone={status.token_ok ? "green" : status.configured ? "amber" : "red"}>{status.token_ok ? "Connected" : status.configured ? "Keys present but rejected" : "Not connected"}</Badge>}
          <button onClick={load} disabled={busy !== null} className="ml-auto flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold ring-1 ring-slate-300 disabled:opacity-50">{busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Test again</button>
        </div>
        {status === null ? <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-500"><Loader2 className="size-4 animate-spin" /> Contacting PayPal…</p> : (
          <div className="mt-1">
            <Row ok={status.configured} label="Credentials (PAYPAL_CLIENT_ID / SECRET)" value={status.configured ? "Set" : "Missing"} />
            <Row ok={status.token_ok} label={`OAuth token + dispute read (${status.env})`} value={status.token_ok ? `OK · ${status.dispute_count ?? 0} disputes visible` : (status.error ?? "Failed")} />
            <Row ok={status.webhook_id_set} label="Webhook signature verification" value={status.webhook_id_set ? "PAYPAL_WEBHOOK_ID set" : "Off — set PAYPAL_WEBHOOK_ID to enforce"} />
            <Row ok={status.ai_configured} label="AI model (optional)" value={status.ai_configured ? status.ai_model ?? "configured" : "Not set — explainable rules engine is used and labelled as such"} />
            <Row ok={status.local_cases > 0 ? true : null} label="Cases in local database" value={`${status.local_cases} total · ${status.paypal_cases} from PayPal`} />
          </div>
        )}
        {status?.token_ok && (
          <button onClick={sync} disabled={busy !== null} className="mt-3 flex items-center gap-1.5 rounded-full bg-[#003087] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{busy === "sync" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync disputes now</button>
        )}
        {msg && <div className={`mt-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>{msg.text}</div>}
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-black">Connect in 2 minutes (sandbox)</h2>
        <ol className="mt-2 flex flex-col gap-2 text-[13px] leading-relaxed text-slate-600">
          <li><b className="text-slate-800">1.</b> Open <a className="font-bold text-[#003087] underline" href="https://developer.paypal.com/dashboard" target="_blank" rel="noreferrer">developer.paypal.com/dashboard</a> → Apps & Credentials → Sandbox → create an app. Copy Client ID + Secret.</li>
          <li><b className="text-slate-800">2.</b> Create <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">dispute-defense/.env.local</code> (copy from <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">.env.example</code>) and set:
            <pre className="mt-1.5 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[12px] text-slate-100">PAYPAL_CLIENT_ID=your-sandbox-client-id{"\n"}PAYPAL_CLIENT_SECRET=your-sandbox-secret{"\n"}PAYPAL_ENV=sandbox{"\n"}# optional AI:{"\n"}AI_API_KEY=...{"\n"}AI_MODEL=gpt-4o-mini</pre>
          </li>
          <li><b className="text-slate-800">3.</b> Restart the server (<code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">npm run dev</code>), come back here, hit <b>Test again</b>, then <b>Sync disputes now</b>. Keys are read server-side only and never shown in the browser.</li>
          <li><b className="text-slate-800">4. Webhooks (optional, for automatic detection):</b> in the same PayPal app, add a webhook pointing at:
            <span className="mt-1 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 font-mono text-[12px]">{webhookUrl}<button onClick={() => navigator.clipboard?.writeText(webhookUrl)} className="ml-auto flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-sans text-[11px] font-bold ring-1 ring-slate-300"><Copy className="size-3" /> Copy</button></span>
            Subscribe to <code className="rounded bg-slate-100 px-1 text-[12px]">CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED</code>, then set <code className="rounded bg-slate-100 px-1 text-[12px]">PAYPAL_WEBHOOK_ID</code> so signatures are verified.
          </li>
        </ol>
      </Card>
    </div>
  );
}
