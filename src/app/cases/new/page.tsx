import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewCaseForm } from "@/components/NewCaseForm";

export default function NewCasePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" /> Case queue</Link>
      <h1 className="mt-2 text-[22px] font-black tracking-tight">Add a dispute case</h1>
      <p className="mb-4 mt-1 text-[13px] text-slate-500">For disputes you are tracking outside PayPal sync — from your store, email, or another channel. To pull real PayPal disputes automatically, use <Link href="/connect" className="font-bold underline">Sync PayPal</Link> instead.</p>
      <NewCaseForm />
    </main>
  );
}
