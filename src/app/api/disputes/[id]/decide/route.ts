import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getCase, listCases, saveDecision, logEvent } from "@/lib/db";
import { decide } from "@/lib/decision";
import type { Decision } from "@/lib/types";

const FALLBACK_SYSTEM_PROMPT = "You score PayPal seller disputes. Reply with STRICT JSON only: {\"recommendation\":\"contest\"|\"accept\",\"win_probability\":number 0..1,\"reasoning\":string[3..5],\"draft_note\":string}. Base it only on the facts given. Never invent tracking numbers, refund IDs, dates or policies.";

let cachedSystemPrompt: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "prompts", "decide.md"), "utf8");
    const lines = raw.split(/\r?\n/);
    const body = lines[0]?.trimStart().startsWith("#") ? lines.slice(1).join("\n").trim() : raw.trim();
    cachedSystemPrompt = body || FALLBACK_SYSTEM_PROMPT;
  } catch {
    cachedSystemPrompt = FALLBACK_SYSTEM_PROMPT;
  }
  return cachedSystemPrompt;
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dispute = await getCase(decodeURIComponent(id));
  if (!dispute) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });

  const modelName = process.env.AI_MODEL ?? "gpt-4o-mini";
  const allCases = await listCases();
  const history = { won: allCases.filter((c) => c.outcome === "won").length, lost: allCases.filter((c) => c.outcome === "lost").length };
  let decision: Decision = decide(dispute, process.env.AI_API_KEY ? modelName : "rules-v1", history);

  if (process.env.AI_API_KEY) {
    const base = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    try {
      const systemPrompt = await loadSystemPrompt();
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify({ reason: dispute.reason, amount: dispute.dispute_amount, currency: dispute.currency, status: dispute.status, stage: dispute.lifecycle_stage, due: dispute.seller_response_due_date, buyer_message: dispute.buyer_message, order: dispute.order, rules_engine: { win_probability: decision.win_probability, factors: decision.factors } }).slice(0, 6000) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) throw new Error(`AI HTTP ${r.status}`);
      const j = await r.json();
      const o = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
      if (!["contest", "accept"].includes(o.recommendation) || typeof o.win_probability !== "number") throw new Error("AI returned invalid JSON shape");
      let p = Math.min(0.97, Math.max(0.02, o.win_probability));
      if (dispute.reason === "UNAUTHORISED") p = Math.min(p, 0.65);
      let llmReasoning: string[] = Array.isArray(o.reasoning) ? o.reasoning.map(String) : [];
      if (llmReasoning.length < 3) {
        for (const ruleReason of decision.reasoning) {
          if (llmReasoning.length >= 3) break;
          if (!llmReasoning.includes(ruleReason)) llmReasoning.push(ruleReason);
        }
      }
      let reasoning = llmReasoning.slice(0, 5);
      let recommendation: Decision["recommendation"] = o.recommendation;
      if (recommendation === "contest" && decision.evidence_completeness === 0) {
        recommendation = "accept";
        const note = "Forced accept: LLM recommended contest but required-evidence completeness is 0 (no required evidence available).";
        reasoning = [...reasoning.slice(0, 4), note];
      }
      const gross = +(p * dispute.dispute_amount).toFixed(2);
      decision = { ...decision, recommendation, win_probability: +p.toFixed(2), gross_expected: gross, expected_value: +(gross - decision.contest_cost).toFixed(2), reasoning, draft_note: typeof o.draft_note === "string" && o.draft_note.trim() ? o.draft_note : decision.draft_note, model: modelName };
    } catch (e) {
      decision = { ...decision, model: "rules-v1", ai_error: `AI call failed (${e instanceof Error ? e.message : "unknown"}) — showing explainable rules decision instead.` };
    }
  }

  await saveDecision(dispute.dispute_id, decision);
  await logEvent(dispute.dispute_id, "agent", "decided", `${decision.recommendation.toUpperCase()} @ ${Math.round(decision.win_probability * 100)}% · EV $${decision.expected_value} · via ${decision.model}`);
  return NextResponse.json({ ok: true, decision });
}
