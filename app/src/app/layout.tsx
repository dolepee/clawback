import type { Metadata } from "next";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { shortHex } from "@/lib/format";
import { WalletButton } from "@/components/WalletButton";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://clawback-bay.vercel.app"),
  title: "Clawback",
  description: "AI calls that pay you back when they are wrong.",
  icons: {
    icon: "/clawback-logo.svg",
    shortcut: "/clawback-logo.svg",
  },
  openGraph: {
    title: "Clawback",
    description: "AI calls that pay you back when they are wrong.",
    type: "website",
    url: "https://clawback-bay.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clawback",
    description: "AI calls that pay you back when they are wrong.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const navItems = [
    { href: "/how-it-works", label: "How it works" },
    { href: "/feed", label: "Receipts" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/agent/3", label: "Agents" },
  ];

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/62 px-4 py-3 backdrop-blur-xl md:px-8">
          <div className="mx-auto flex max-w-[1660px] items-center justify-between gap-4">
            <a href="/" className="flex shrink-0 items-center gap-3 text-lg font-black tracking-tight md:text-xl">
              <img
                src="/clawback-logo.svg"
                alt="Clawback logo"
                className="h-9 w-9 rounded-xl border border-emerald-300/30 bg-neutral-950 shadow-[0_0_24px_rgba(16,185,129,0.22)] md:h-10 md:w-10"
              />
              <span>Clawback</span>
            </a>
            <div className="flex min-w-0 items-center gap-3 md:gap-5">
              <nav className="hidden items-center gap-7 text-sm font-medium text-neutral-300 md:flex">
                {navItems.map((item) => (
                  <a key={item.href} href={item.href} className="transition-colors hover:text-white">
                    {item.label}
                  </a>
                ))}
              </nav>
              <span className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-neutral-200 md:inline-flex">
                <span className="size-2 rounded-full bg-emerald-300" aria-hidden />
                Mantle Sepolia
              </span>
              <WalletButton />
            </div>
          </div>
        </header>
        <nav className="flex gap-4 overflow-x-auto border-b border-white/10 bg-black/45 px-4 py-2 text-xs text-neutral-300 backdrop-blur-xl md:hidden">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="whitespace-nowrap hover:text-white">
              {item.label}
            </a>
          ))}
          <span className="ml-auto whitespace-nowrap rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-500">
            Mantle Sepolia
          </span>
        </nav>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        <footer className="border-t border-neutral-800 px-4 md:px-6 py-6 text-xs text-neutral-500">
          <div className="max-w-5xl mx-auto flex flex-wrap gap-3 items-center mb-4 text-[11px]">
            <span className="uppercase tracking-[0.24em] text-neutral-400">powered by</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/[0.06] px-2.5 py-1 text-emerald-200/90">
              <span className="size-1.5 rounded-full bg-emerald-300" /> Mantle
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-white/[0.03] px-2.5 py-1 text-neutral-300">
              <span className="size-1.5 rounded-full bg-neutral-400" /> Pyth oracle
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/[0.06] px-2.5 py-1 text-amber-200/90">
              <span className="size-1.5 rounded-full bg-amber-300" /> Bankr LLM
            </span>
            <span className="text-neutral-500">no wallet required to browse</span>
          </div>
          <div className="max-w-5xl mx-auto mb-3 text-neutral-400 max-w-3xl leading-relaxed">
            Every claim, refund, and payout on this site is a real transaction on Mantle Sepolia.
            No wallet is required to browse receipts; contract links open the public block explorer.
          </div>
          <div className="max-w-5xl mx-auto flex flex-wrap gap-x-6 gap-y-2">
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.claimMarket}`} target="_blank" rel="noreferrer">
              ClaimMarket {shortHex(ADDRESSES.claimMarket)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.clawbackEscrow}`} target="_blank" rel="noreferrer">
              ClawbackEscrow {shortHex(ADDRESSES.clawbackEscrow)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.agentRegistry}`} target="_blank" rel="noreferrer">
              AgentRegistry {shortHex(ADDRESSES.agentRegistry)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.reputationLedger}`} target="_blank" rel="noreferrer">
              ReputationLedger {shortHex(ADDRESSES.reputationLedger)}
            </a>
            <a className="hover:text-neutral-300" href={`${EXPLORER}/address/${ADDRESSES.pythSettlementAdapter}`} target="_blank" rel="noreferrer">
              PythAdapter {shortHex(ADDRESSES.pythSettlementAdapter)}
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
