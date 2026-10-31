"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Download, Inbox, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";
import type { Dispute, Metrics } from "@/lib/types";
import { Card, Badge, Money } from "./chrome";
import { CaseGrid, exportRows, type CaseRow } from "./CaseGrid";
import { Countdown, useNow } from "./Countdown";

const FILTERS = [
  { key: "all", label: "All cases" },
  { key: "needs_response", label: "Needs response" },
  { key: "urgent", label: "Due < 24h / overdue" },
  { key: "under_review", label: "Under review" },
  { key: "resolved", label: "Resolved" },
] as const;

export function DashboardClient({ cases, metrics, configured, initialRows }: {
  cases: Dispute[]; metrics: Metrics; configured: boolean; initialRows: CaseRow[];
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => initialRows.map((r) => ({ ...r, _ms: new Date(r.seller_response_due_date).getTime() - now })), [initialRows, now]);

  const visible = useMemo(() => {
    let out = rows;
    if (filter === "needs_response") out = out.filter((r) => r.status === "WAITING_FOR_SELLER_RESPONSE");
    else if (filter === "urgent") out = out.filter((r) => r.outcome === "open" && r._ms < 24 * 3600_000);
    else if (filter === "under_review") out = out.filter((r) => r.outcome === "under_review");
    else if (filter === "resolved") out = out.filter((r) => ["won", "lost", "accepted"].includes(r.outcome));
    return out;
  }, [rows, filter]);

  const sampleCount = cases.filter((c) => c.source === "sample").length;
  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cases) if (c.outcome === "open" || c.outcome === "under_review") m.set(c.reason_label, (m.get(c.reason_label) ?? 0) + c.dispute_amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cases]);
  const maxReason = Math.max(1, ...byReason.map(([, v]) => v));
  const urgent = useMemo(() => [...rows].filter((r) => r.outcome === "open").sort((a, b) => a._ms - b._ms).slice(0, 3), [rows]);

  async function act(kind: "sync" | "samples" | "clear") {
    setBusy(kind); setNotice(null);
    try {
      const r = kind === "sync" ? await fetch("/api/paypal/sync", { method: "POST" })
        : kind === "samples" ? await fetch("/api/samples", { method: "POST" })
        : await fetch("/api/samples", { method: "DELETE" });
      const j = await r.json();
      setNotice({ ok: r.ok && j.ok !== false, text: j.message ?? j.error ?? (r.ok ? "Done" : `Failed (${r.status})`) });
      if (r.ok) router.refresh();
    } catch { setNotice({ ok: false, text: "Network error — is the server running?" }); }
    setBusy(null);
  }

  const overdueCount = rows.filter((r) => r.outcome === "open" && r._ms < 0).length;

  function exportCsv() {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? visible.filter((r) => [r.dispute_id, r.order.item_title, r.order.buyer_name, r.order.buyer_email, r.reason_label].some((v) => (v ?? "").toLowerCase().includes(q)))
      : visible;
    exportRows(filtered);
  }

  const kpis = [
    { label: "Money at risk", value: <Money v={metrics.amount_at_risk} />, sub: `${metrics.open} open case${metrics.open === 1 ? "" : "s"}` },
    { label: "Needs your response", value: String(metrics.needs_response), sub: overdueCount > 0 ? `${overdueCount} overdue · ${metrics.at_risk_24h} due within 24h` : `${metrics.at_risk_24h} due within 24h`, danger: metrics.at_risk_24h > 0 || overdueCount > 0 },
    { label: "Under PayPal review", value: String(metrics.under_review), sub: "evidence submitted" },
    { label: "Recovered (won)", value: <Money v={metrics.recovered} />, sub: `${metrics.won} won · ${metrics.lost} lost` },
    { label: "Win rate", value: metrics.win_rate === null ? "—" : `${Math.round(metrics.win_rate * 100)}%`, sub: metrics.win_rate === null ? "no decided cases yet" : `of ${metrics.won + metrics.lost} decided` },
  ];

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-slate-900">Case queue</h1>
          <p className="text-[13px] text-slate-500">{metrics.total} cases · every number below comes from your stored cases — nothing is estimated or pre-filled.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold ring-1 ring-slate-300 hover:ring-slate-900"><Download className="size-4" /> Export CSV</button>
          {sampleCount === 0 && <button disabled={busy !== null} onClick={() => act("samples")} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">{busy === "samples" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Load sample cases</button>}
          <button disabled={busy !== null} onClick={() => act("sync")} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">{busy === "sync" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync PayPal</button>
          <Link href="/cases/new" className="flex items-center gap-1.5 rounded-full bg-[#003087] px-4 py-2 text-[13px] font-bold text-white shadow hover:bg-[#0050a0]"><Plus className="size-4" /> New case</Link>
        </div>
      </div>

      {!configured && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          <span><b>PayPal is not connected.</b> You are working with local cases only, and PayPal submissions are disabled — the app will never pretend a submission went through.</span>
          <Link href="/connect" className="ml-auto flex items-center gap-1 font-bold underline">Connect in 2 minutes <ArrowRight className="size-3.5" /></Link>
        </div>
      )}
      {sampleCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-violet-50 px-4 py-3 text-[13px] text-violet-900 ring-1 ring-violet-200">
          <Sparkles className="size-4 shrink-0" />
          <span><b>{sampleCount} sample cases</b> are shown for exploration. They count in the totals above like real cases, so remove them before trusting the numbers with real disputes.</span>
          <button disabled={busy !== null} onClick={() => act("clear")} className="ml-auto flex items-center gap-1 font-bold underline disabled:opacity-50"><Trash2 className="size-3.5" /> Remove samples</button>
        </div>
      )}
      {notice && <div className={`mt-3 rounded-2xl px-4 py-3 text-[13px] font-semibold ring-1 ${notice.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>{notice.text}</div>}

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k.label}</div>
            <div className={`mt-1 text-[26px] font-black leading-none ${k.danger ? "text-red-600" : "text-slate-900"}`}>{k.value}</div>
            <div className="mt-1 text-[12px] text-slate-500">{k.sub}</div>
          </Card>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* queue card */}
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${filter === f.key ? "bg-[#003087] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{f.label}</button>
                ))}
              </div>
              <label className="ml-auto flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 ring-1 ring-slate-200 focus-within:ring-[#003087]">
                <Search className="size-3.5 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, buyer, case ID…" className="w-48 bg-transparent text-[12px] font-medium outline-none placeholder:text-slate-400" />
              </label>
            </div>
            {cases.length === 0 ? (
              <div className="grid place-items-center px-4 py-14 text-center">
                <Inbox className="size-9 text-slate-300" />
                <h2 className="mt-2 text-[16px] font-black">No cases yet — this is a real empty workspace</h2>
                <p className="mt-1 max-w-md text-[13px] text-slate-500">Add a dispute you actually have, load clearly-labelled samples to explore, or connect PayPal and sync real sandbox disputes.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link href="/cases/new" className="flex items-center gap-1.5 rounded-full bg-[#003087] px-4 py-2 text-[13px] font-bold text-white"><Plus className="size-4" /> Add a real case</Link>
                  <button disabled={busy !== null} onClick={() => act("samples")} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold ring-1 ring-slate-300 disabled:opacity-50">{busy === "samples" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Load sample cases</button>
                  <button disabled={busy !== null} onClick={() => act("sync")} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold ring-1 ring-slate-300 disabled:opacity-50"><RefreshCw className="size-4" /> Sync PayPal</button>
                </div>
              </div>
            ) : (
              <CaseGrid rows={visible} query={query} />
            )}
            <p className="px-1 pt-2 text-[11px] text-slate-400">Grid: AG Grid — sortable, filterable, paginated. Click any row to open the defense workspace.</p>
          </Card>
        </div>

        {/* right rail */}
        <div className="flex flex-col gap-3">
          <Card className="p-4">
            <div className="text-[13px] font-black">Due next</div>
            {urgent.length === 0 ? <p className="mt-1.5 text-[12px] text-slate-500">No open deadlines. New PayPal disputes appear here after sync or webhook.</p> : (
              <div className="mt-2 flex flex-col gap-1.5">
                {urgent.map((r) => (
                  <Link key={r.dispute_id} href={`/disputes/${r.dispute_id}`} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100 hover:ring-[#003087]">
                    <span className="flex items-center justify-between gap-2"><b className="truncate text-[12px]">{r.order.item_title}</b><Money v={r.dispute_amount} className="text-[12px] font-bold" /></span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">{r.reason_label} · <Countdown iso={r.seller_response_due_date} /></span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-[13px] font-black">Where the money is stuck</div>
            {byReason.length === 0 ? <p className="mt-1.5 text-[12px] text-slate-500">No open amounts yet.</p> : (
              <div className="mt-2 flex flex-col gap-2">
                {byReason.map(([label, v]) => (
                  <div key={label}>
                    <div className="flex justify-between text-[12px]"><span className="font-semibold text-slate-600">{label}</span><Money v={v} className="font-bold" /></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0070d1]" style={{ width: `${(v / maxReason) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 border-t border-slate-100 pt-2.5 text-[12px] text-slate-500">
              Outcomes so far: <Badge tone="green">{metrics.won} won</Badge> <Badge tone="red">{metrics.lost} lost</Badge> <Badge tone="gray">{metrics.accepted} accepted</Badge>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[13px] font-black">How a case gets defended</div>
            <ol className="mt-2 flex flex-col gap-2 text-[12px] leading-relaxed text-slate-600">
              <li><b className="text-slate-800">1 · Detect</b> — webhook or Sync pulls the dispute with its reason + due date.</li>
              <li><b className="text-slate-800">2 · Decide</b> — win odds from real evidence factors; EV = odds × amount − fee.</li>
              <li><b className="text-slate-800">3 · Defend</b> — you approve; evidence goes to PayPal via <code>provide-evidence</code>. Full audit trail.</li>
            </ol>
          </Card>
        </div>
      </div>
    </main>
  );
}
