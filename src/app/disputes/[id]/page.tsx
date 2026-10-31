import Link from "next/link";
import { getCase, listEvents, listSubmissions } from "@/lib/db";
import { decide } from "@/lib/decision";
import { paypalConfigured } from "@/lib/paypal";
import { CaseWorkspace } from "@/components/CaseWorkspace";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dispute = await getCase(decodeURIComponent(id));
  if (!dispute) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-black">Case not found</h1>
        <p className="mt-1 text-[13px] text-slate-500">It may have been deleted, or never synced. Pull it from PayPal with Sync, or add it manually.</p>
        <Link href="/" className="mt-3 inline-block rounded-full bg-[#003087] px-4 py-2 text-[13px] font-bold text-white">Back to queue</Link>
      </main>
    );
  }
  const [events, submissions] = await Promise.all([listEvents(dispute.dispute_id), listSubmissions(dispute.dispute_id)]);
  return (
    <CaseWorkspace
      dispute={dispute}
      decision={dispute.last_decision ?? decide(dispute)}
      events={events}
      submissions={submissions}
      canSubmit={dispute.source === "paypal" && paypalConfigured()}
      aiConfigured={Boolean(process.env.AI_API_KEY)}
    />
  );
}
