import { NextResponse } from "next/server";
import { getCase, saveDecision, logEvent } from "@/lib/db";
import { decide } from "@/lib/decision";
import type { Decision } from "@/lib/types";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dispute = await getCase(decodeURIComponent(id));
  if (!dispute) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });

  const modelName = process.env.AI_MODEL ?? "gpt-4o-mini";
  let decision: Decision = decide(dispute, process.env.AI_API_KEY ? modelName : "rules-v1");

  if (process.env.AI_API_KEY) {
    const base = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: "You score PayPal seller disputes. Reply with STRICT JSON only: {\"recommendation\":\"contest\"|\"accept\",\"win_probability\":number 0..1,\"reasoning\":string[3..5],\"draft_note\":string}. Base it only on the facts given. Never invent tracking numbers, refund IDs, dates or policies." },
            { role: "user", content: JSON.stringify({ reason: dispute.reason, amount: dispute.dispute_amount, currency: dispute.currency, status: dispute.status, stage: dispute.lifecycle_stage, due: dispute.seller_response_due_date, buyer_message: dispute.buyer_message, order: dispute.order, rules_engine: { win_probability: decision.win_probability, factors: decision.factors } }).slice(0, 6000) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) throw new Error(`AI HTTP ${r.status}`);
      const j = await r.json();
      const o = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
      if (!["contest", "accept"].includes(o.recommendation) || typeof o.win_probability !== "number") throw new Error("AI returned invalid JSON shape");
      const p = Math.min(0.97, Math.max(0.02, o.win_probability));
      const gross = +(p * dispute.dispute_amount).toFixed(2);
      decision = { ...decision, recommendation: o.recommendation, win_probability: +p.toFixed(2), gross_expected: gross, expected_value: +(gross - decision.contest_cost).toFixed(2), reasoning: Array.isArray(o.reasoning) && o.reasoning.length ? o.reasoning.map(String).slice(0, 5) : decision.reasoning, draft_note: typeof o.draft_note === "string" && o.draft_note.trim() ? o.draft_note : decision.draft_note, model: modelName };
    } catch (e) {
      decision = { ...decision, model: "rules-v1", ai_error: `AI call failed (${e instanceof Error ? e.message : "unknown"}) — showing explainable rules decision instead.` };
    }
  }

  await saveDecision(dispute.dispute_id, decision);
  await logEvent(dispute.dispute_id, "agent", "decided", `${decision.recommendation.toUpperCase()} @ ${Math.round(decision.win_probability * 100)}% · EV $${decision.expected_value} · via ${decision.model}`);
  return NextResponse.json({ ok: true, decision });
}
