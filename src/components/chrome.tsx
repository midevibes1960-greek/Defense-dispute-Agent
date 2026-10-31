import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { CaseOutcome, CaseSource } from "@/lib/types";

export function Badge({ children, tone = "gray", className }: { children: ReactNode; tone?: "gray" | "green" | "red" | "blue" | "amber" | "violet"; className?: string }) {
  const tones: Record<string, string> = {
    gray: "bg-slate-100 text-slate-600 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-blue-50 text-[#003087] ring-blue-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", tones[tone], className)}>{children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-white ring-1 ring-slate-200/90 shadow-[0_1px_2px_rgb(15_23_42/0.04)]", className)}>{children}</div>;
}

export function SourceBadge({ source }: { source: CaseSource }) {
  if (source === "paypal") return <Badge tone="green">PayPal synced</Badge>;
  if (source === "sample") return <Badge tone="violet">Sample data</Badge>;
  return <Badge tone="blue">Manual case</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: CaseOutcome }) {
  const map: Record<CaseOutcome, { label: string; tone: "gray" | "green" | "red" | "blue" | "amber" }> = {
    open: { label: "Needs response", tone: "amber" },
    under_review: { label: "Under review", tone: "blue" },
    won: { label: "Won", tone: "green" },
    lost: { label: "Lost", tone: "red" },
    accepted: { label: "Accepted / refunded", tone: "gray" },
  };
  const m = map[outcome];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function WinGauge({ p, size = 92 }: { p: number; size?: number }) {
  const pct = Math.round(p * 100);
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const color = p >= 0.7 ? "#059669" : p >= 0.45 ? "#d97706" : "#dc2626";
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={9} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <span className="absolute text-center leading-none">
        <span className="block text-[20px] font-black tabular-nums" style={{ color }}>{pct}%</span>
        <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">win odds</span>
      </span>
    </span>
  );
}

export function Money({ v, currency = "USD", className }: { v: number; currency?: string; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v)}</span>;
}
