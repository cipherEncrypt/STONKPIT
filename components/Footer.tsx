import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto max-w-3xl border-t border-pit-border px-4 py-6 font-mono text-xs normal-case leading-relaxed text-pit-muted md:px-8">
      <p>USDC for pits and payouts is held in escrow until you withdraw or the pot settles.</p>
      <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer">
        <Link href="/rooms" className="text-pit-green hover:text-white">Rooms</Link>
        <Link href="/wallet" className="text-pit-green hover:text-white">Wallet</Link>
        <Link href="/#faq" className="text-pit-green hover:text-white">FAQ</Link>
        <Link href="/spectate" className="text-pit-muted hover:text-white">Spectate</Link>
      </nav>
    </footer>
  );
}
