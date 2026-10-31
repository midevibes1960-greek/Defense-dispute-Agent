import { NextResponse } from "next/server";
import { connectionTest, paypalConfigured } from "@/lib/paypal";
import { listCases } from "@/lib/db";

export async function GET() {
  const test = await connectionTest();
  const cases = await listCases();
  return NextResponse.json({
    ...test,
    configured: paypalConfigured(),
    webhook_id_set: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    ai_configured: Boolean(process.env.AI_API_KEY),
    ai_model: process.env.AI_API_KEY ? (process.env.AI_MODEL ?? "gpt-4o-mini") : null,
    local_cases: cases.length,
    paypal_cases: cases.filter((c) => c.source === "paypal").length,
  });
}
