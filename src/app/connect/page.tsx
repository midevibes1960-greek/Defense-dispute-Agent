import { ConnectPanel } from "@/components/ConnectPanel";

export default function ConnectPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] font-black tracking-tight">PayPal connection</h1>
      <p className="mb-4 mt-1 text-[13px] text-slate-500">This app talks directly to the Disputes API — list, show, provide-evidence, accept-claim, make-offer, send-message, webhooks. No connection, no submissions: the UI says so instead of faking it.</p>
      <ConnectPanel />
    </main>
  );
}
