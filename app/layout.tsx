import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "StonkPit Live",
  description:
    "Custodial credits pit on Solana mainnet. Pick AAPLx/TSLAx/NVDAx, best Pyth % move wins.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Header />
          <main className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
