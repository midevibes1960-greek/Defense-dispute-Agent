import { NextResponse } from "next/server";
import { listCases, upsertCase, logEvent } from "@/lib/db";
import { fetchAllDisputes, paypalConfigured, PaypalError } from "@/lib/paypal";

export async function POST() {
  if (!paypalConfigured()) {
    return NextResponse.json({ ok: false, error: "PayPal is not connected. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.local (sandbox keys from developer.paypal.com) and restart the server." }, { status: 409 });
  }
  try {
    const existing = new Map((await listCases()).map((c) => [c.dispute_id, c]));
    const disputes = await fetchAllDisputes(existing);
    for (const d of disputes) await upsertCase(d);
    await logEvent("system", "system", "paypal_sync", `Synced ${disputes.length} disputes from PayPal (${process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"})`);
    return NextResponse.json({ ok: true, synced: disputes.length, message: `Synced ${disputes.length} dispute${disputes.length === 1 ? "" : "s"} from PayPal.` });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logEvent("system", "system", "paypal_sync_failed", message);
    return NextResponse.json({ ok: false, error: message, paypal_debug_id: e instanceof PaypalError ? e.debugId : undefined }, { status: 502 });
  }
}
