import { NextResponse } from "next/server";
import { SAMPLE_DISPUTES } from "@/lib/seed";
import { upsertCase, deleteCase, listCases, logEvent } from "@/lib/db";

export async function POST() {
  for (const d of SAMPLE_DISPUTES) await upsertCase(structuredClone(d));
  await logEvent("system", "seller", "samples_loaded", `${SAMPLE_DISPUTES.length} sample cases loaded (labelled SAMPLE — not PayPal data)`);
  return NextResponse.json({ ok: true, loaded: SAMPLE_DISPUTES.length });
}

export async function DELETE() {
  const cases = await listCases();
  let n = 0;
  for (const c of cases) if (c.source === "sample") { await deleteCase(c.dispute_id); n++; }
  await logEvent("system", "seller", "samples_cleared", `${n} sample cases removed`);
  return NextResponse.json({ ok: true, removed: n });
}
