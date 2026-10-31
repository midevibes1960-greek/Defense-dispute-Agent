"use client";
import { useEffect, useState } from "react";

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

export function fmtRemaining(ms: number) {
  if (ms <= 0) return "Overdue";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m left`;
  return `${Math.floor(h / 24)}d ${h % 24}h left`;
}

export function Countdown({ iso, className = "" }: { iso: string; className?: string }) {
  const now = useNow(30_000);
  const ms = new Date(iso).getTime() - now;
  const urgent = ms < 24 * 3600_000;
  return <span className={`tabular-nums font-bold ${ms <= 0 ? "text-red-700" : urgent ? "text-red-600" : "text-slate-600"} ${className}`}>{fmtRemaining(ms)}</span>;
}
