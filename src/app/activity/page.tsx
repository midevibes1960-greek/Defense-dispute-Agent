import Link from "next/link";
import { listEvents, listSubmissions } from "@/lib/db";
import { Card, Badge } from "@/components/chrome";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const [events, submissions] = await Promise.all([listEvents(), listSubmissions()]);
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] font-black tracking-tight">Activity</h1>
      <p className="mb-4 mt-1 text-[13px] text-slate-500">Everything the agent and sellers did — persisted in your local database, newest first.</p>
      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <Card className="p-4">
          <div className="text-[13px] font-black">Audit trail ({events.length})</div>
          {events.length === 0 ? <p className="mt-2 text-[13px] text-slate-500">No activity yet. Create, sync, decide or submit something and it lands here.</p> : (
            <ol className="mt-2 flex flex-col">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-slate-50 py-2.5 text-[13px] last:border-0">
                  <Badge tone={e.actor === "paypal" ? "blue" : e.actor === "agent" ? "violet" : e.actor === "seller" ? "green" : "gray"} className="h-fit shrink-0 capitalize">{e.actor}</Badge>
                  <span className="min-w-0"><b>{e.action}</b> — <span className="text-slate-600">{e.detail}</span>
                    <span className="block text-[11px] text-slate-400">{new Date(e.at).toLocaleString()} · {e.dispute_id !== "system" ? <Link href={`/disputes/${e.dispute_id}`} className="underline">{e.dispute_id}</Link> : "system"}</span></span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="h-fit p-4">
          <div className="text-[13px] font-black">PayPal submissions ({submissions.length})</div>
          {submissions.length === 0 ? <p className="mt-2 text-[12px] text-slate-500">No submission attempts yet — including blocked ones, which are recorded honestly.</p> : (
            <ul className="mt-2 flex flex-col gap-1.5">{submissions.map((s) => (
              <li key={s.id} className="rounded-xl bg-slate-50 p-2.5 text-[12px] ring-1 ring-slate-100">
                <b className={s.ok ? "text-emerald-700" : "text-red-600"}>{s.ok ? "✓ sent" : "✗ not sent"} · {s.action}</b>
                <span className="block text-slate-600">{s.message}</span>
                <span className="text-[11px] text-slate-400">{new Date(s.at).toLocaleString()}{s.http_status ? ` · HTTP ${s.http_status}` : ""} · <Link href={`/disputes/${s.dispute_id}`} className="underline">{s.dispute_id}</Link></span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </main>
  );
}
