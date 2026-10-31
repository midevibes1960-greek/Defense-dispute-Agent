import { NextResponse } from "next/server";
import { listCases } from "@/lib/db";
import { computeMetrics } from "@/lib/cases";

export async function GET() {
  return NextResponse.json(computeMetrics(await listCases()));
}
