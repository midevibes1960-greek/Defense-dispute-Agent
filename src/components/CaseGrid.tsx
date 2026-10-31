"use client";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import type { Dispute } from "@/lib/types";
import { OutcomeBadge, SourceBadge, Money } from "./chrome";
import { fmtRemaining } from "./Countdown";

ModuleRegistry.registerModules([AllCommunityModule]);

export type CaseRow = Dispute & { _p: number; _rec: "contest" | "accept"; _ev: number; _ms: number };

const gridTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#0b2a5b",
  headerTextColor: "#ffffff",
  rowHoverColor: "#eff6ff",
  borderColor: "#e2e8f0",
  fontSize: 13,
  rowHeight: 52,
  headerHeight: 40,
});

function WinCell(p: ICellRendererParams<CaseRow>) {
  const v = p.value as number;
  const pct = Math.round(v * 100);
  const color = v >= 0.7 ? "#059669" : v >= 0.45 ? "#d97706" : "#dc2626";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></span>
      <b className="tabular-nums" style={{ color }}>{pct}%</b>
    </span>
  );
}

function DueCell(p: ICellRendererParams<CaseRow>) {
  const ms = p.value as number;
  return <span className={`font-bold tabular-nums ${ms <= 0 ? "text-red-700" : ms < 24 * 3600_000 ? "text-red-600" : "text-slate-600"}`}>{fmtRemaining(ms)}</span>;
}

function RecCell(p: ICellRendererParams<CaseRow>) {
  return p.value === "contest"
    ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">CONTEST</span>
    : <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-black text-red-700 ring-1 ring-red-200">ACCEPT</span>;
}

export function CaseGrid({ rows, query }: { rows: CaseRow[]; query: string }) {
  const router = useRouter();
  const apiRef = useRef<GridApi<CaseRow> | null>(null);

  useEffect(() => { apiRef.current?.setGridOption("quickFilterText", query); }, [query]);

  const colDefs = useMemo<ColDef<CaseRow>[]>(() => [
    {
      headerName: "Case", width: 210, pinned: "left",
      valueGetter: (p) => p.data?.order.item_title,
      cellRenderer: (p: ICellRendererParams<CaseRow>) => (
        <span className="block leading-tight py-1">
          <span className="block truncate text-[13px] font-bold text-slate-800">{p.data?.order.item_title}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">{p.data?.dispute_id} · {p.data?.order.buyer_name}</span>
        </span>
      ),
    },
    { headerName: "Amount", width: 105, valueGetter: (p) => p.data?.dispute_amount, cellRenderer: (p: ICellRendererParams<CaseRow>) => <b><Money v={p.value ?? 0} currency={p.data?.currency} /></b> },
    { field: "reason_label", headerName: "Reason", width: 155 },
    { headerName: "Win odds", width: 125, valueGetter: (p) => p.data?._p, cellRenderer: WinCell, sort: "desc" },
    { headerName: "Expected value", width: 120, valueGetter: (p) => p.data?._ev, cellRenderer: (p: ICellRendererParams<CaseRow>) => <span className={`font-bold tabular-nums ${(p.value ?? 0) > 0 ? "text-emerald-700" : "text-red-600"}`}>${(p.value ?? 0).toFixed(0)}</span> },
    { headerName: "AI / rules says", width: 130, valueGetter: (p) => p.data?._rec, cellRenderer: RecCell },
    { headerName: "Due", width: 120, valueGetter: (p) => p.data?._ms, cellRenderer: DueCell },
    { headerName: "Stage", width: 130, valueGetter: (p) => p.data?.outcome, cellRenderer: (p: ICellRendererParams<CaseRow>) => p.data ? <OutcomeBadge outcome={p.data.outcome} /> : null },
    { headerName: "Source", width: 135, valueGetter: (p) => p.data?.source, cellRenderer: (p: ICellRendererParams<CaseRow>) => p.data ? <SourceBadge source={p.data.source} /> : null },
    {
      headerName: "", width: 96, sortable: false, filter: false, pinned: "right",
      cellRenderer: (p: ICellRendererParams<CaseRow>) => (
        <Link href={`/disputes/${p.data?.dispute_id}`} onClick={(e) => e.stopPropagation()} className="rounded-full bg-[#003087] px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#0050a0]">Review</Link>
      ),
    },
  ], []);

  return (
    <div style={{ height: 430, width: "100%" }}>
      <AgGridReact<CaseRow>
        theme={gridTheme}
        rowData={rows}
        columnDefs={colDefs}
        pagination
        paginationPageSize={9}
        animateRows
        onGridReady={(e) => { apiRef.current = e.api; }}
        onRowClicked={(e) => { if (e.data) router.push(`/disputes/${e.data.dispute_id}`); }}
        rowStyle={{ cursor: "pointer" }}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
      />
    </div>
  );
}

export function exportRows(rows: CaseRow[]) {
  const head = "case_id,item,buyer,amount,currency,reason,win_probability,recommendation,expected_value,due_date,status,outcome,source";
  const esc = (s: unknown) => `"${String(s ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((r) => [r.dispute_id, r.order.item_title, r.order.buyer_name, r.dispute_amount, r.currency, r.reason_label, r._p, r._rec, r._ev, r.seller_response_due_date, r.status, r.outcome, r.source].map(esc).join(","));
  const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dispute-cases.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
