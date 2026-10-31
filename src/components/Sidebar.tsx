"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PlusCircle, History, Cable, ShieldHalf } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Case queue", icon: LayoutDashboard },
  { href: "/cases/new", label: "New case", icon: PlusCircle },
  { href: "/activity", label: "Activity", icon: History },
  { href: "/connect", label: "PayPal connection", icon: Cable },
];

function NavLinks({ vertical }: { vertical?: boolean }) {
  const path = usePathname();
  return (
    <nav className={vertical ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto"}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition", active ? "bg-white text-[#003087] shadow-sm" : "text-blue-100/80 hover:bg-white/10 hover:text-white")}>
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const [status, setStatus] = useState<{ configured: boolean; token_ok: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/paypal/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false, token_ok: false }));
  }, []);

  return (
    <>
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[#003087] px-3 py-4 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-white text-[#003087]"><ShieldHalf className="size-5" /></span>
          <span className="leading-tight">
            <span className="block text-[15px] font-black tracking-tight text-white">Dispute Defense</span>
            <span className="block text-[10px] font-semibold text-blue-200">Seller dispute workspace</span>
          </span>
        </Link>
        <div className="mt-6"><NavLinks vertical /></div>
        <div className="mt-auto rounded-2xl bg-white/10 p-3 text-[12px] leading-relaxed text-blue-100">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className={`size-2 rounded-full ${status?.token_ok ? "bg-emerald-400" : status?.configured ? "bg-amber-400" : "bg-red-400"}`} />
            {status === null ? "Checking PayPal…" : status.token_ok ? "PayPal connected" : status.configured ? "PayPal keys rejected" : "PayPal not connected"}
          </div>
          <p className="mt-1 opacity-80">{status?.token_ok ? "Sync pulls live disputes. Submissions go to PayPal only after your approval." : "Local cases still work. PayPal submissions stay disabled until keys are added."}</p>
          <Link href="/connect" className="mt-2 inline-block rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#003087]">{status?.token_ok ? "Connection details" : "Connect PayPal"}</Link>
        </div>
        <p className="mt-3 px-2 text-[10px] text-blue-200/70">Next.js · AG Grid · Direct Disputes API<br />Nothing submits without human approval.</p>
      </aside>

      {/* mobile top bar */}
      <div className="bg-[#003087] px-3 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-white text-[#003087]"><ShieldHalf className="size-4" /></span>
          <span className="text-[15px] font-black text-white">Dispute Defense</span>
          <span className={`ml-auto size-2 rounded-full ${status?.token_ok ? "bg-emerald-400" : "bg-red-400"}`} />
        </Link>
        <div className="mt-2.5"><NavLinks /></div>
      </div>
    </>
  );
}
