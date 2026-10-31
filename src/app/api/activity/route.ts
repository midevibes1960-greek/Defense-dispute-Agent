import { NextResponse } from "next/server";
import { listEvents, listSubmissions } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ events: await listEvents(), submissions: await listSubmissions() });
}
