import { listCases } from "@/lib/db";
import { computeMetrics } from "@/lib/cases";
import { decide } from "@/lib/decision";
import { paypalConfigured } from "@/lib/paypal";
import { DashboardClient } from "@/components/DashboardClient";
import type { CaseRow } from "@/components/CaseGrid";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cases = await listCases();
  const metrics = computeMetrics(cases);
  const rows: CaseRow[] = cases.map((c) => {
    const d = c.last_decision ?? decide(c);
    return { ...c, _p: d.win_probability, _rec: d.recommendation, _ev: d.expected_value, _ms: 0 };
  });
  return <DashboardClient cases={cases} metrics={metrics} configured={paypalConfigured()} initialRows={rows} />;
}
