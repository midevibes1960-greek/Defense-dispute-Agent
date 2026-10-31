import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dispute Defense — PayPal dispute workspace",
  description: "Watch PayPal disputes, score contest vs accept by expected value, auto-fill the evidence PayPal asks for, and submit only after human approval. Real Disputes API, persistent cases, full audit trail.",
  openGraph: {
    title: "Dispute Defense — never miss a PayPal dispute deadline",
    description: "Contest-vs-accept EV scoring, reason-specific evidence packs, human-approved submission via the PayPal Disputes API.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-screen text-slate-900`}>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
