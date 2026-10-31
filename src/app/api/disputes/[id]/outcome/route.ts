import { NextResponse } from "next/server";
import { getCase, updateCase, logEvent } from "@/lib/db";
import type { CaseOutcome } from "@/lib/types";

const OK: CaseOutcome[] = ["open", "under_review", "won", "lost", "accepted"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const disputeId = decodeURIComponent(id);
  const existing = await getCase(disputeId);
  if (!existing) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (!OK.includes(b.outcome)) return NextResponse.json({ ok: false, error: "outcome must be won | lost | accepted | under_review | open" }, { status: 422 });
  const outcome = b.outcome as CaseOutcome;
  const status = outcome === "won" || outcome === "lost" || outcome === "accepted" ? "RESOLVED" : outcome === "under_review" ? "UNDER_REVIEW" : existing.status;
  const updated = await updateCase(disputeId, { outcome, status });
  await logEvent(disputeId, "seller", "outcome_recorded", `Outcome recorded: ${outcome.toUpperCase()}${b.note ? ` — ${String(b.note).slice(0, 200)}` : ""}`);
  return NextResponse.json({ ok: true, dispute: updated });
}
