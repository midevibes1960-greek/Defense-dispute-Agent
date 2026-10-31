import { NextResponse } from "next/server";
import { getCase } from "@/lib/db";
import { buildEvidences, decide, draftNote } from "@/lib/decision";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dispute = await getCase(decodeURIComponent(id));
  if (!dispute) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const d = dispute.last_decision ?? decide(dispute);
  return NextResponse.json({
    dispute_id: dispute.dispute_id, reason: dispute.reason, source: dispute.source,
    evidence_requested: dispute.evidence_requested, checklist: d.evidence_checklist,
    completeness: d.evidence_completeness, payload_preview: buildEvidences(dispute, d.draft_note || draftNote(dispute)),
  });
}
