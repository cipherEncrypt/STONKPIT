"use client";

import { useState } from "react";

type FaqItem = { id: string; question: string; answer: React.ReactNode };

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "what",
    question: "What is StonkPit?",
    answer:
      "A timed stock pit on Solana. You pick a tokenized ticker as your fighter, the room goes live on a Pyth price snapshot, and whoever posts the best % move when the timer ends wins the USDC pot.",
  },
  {
    id: "buy-stock",
    question: "Do I buy the stock?",
    answer:
      "No. You pick AAPLx, TSLAx, or NVDAx as your fighter. Prices come from Pyth xStocks feeds — you are not buying shares or holding the underlying equity.",
  },
  {
    id: "start",
    question: "How does a room start?",
    answer:
      "When everyone seated clicks READY and there are at least 2 fighters, the pit goes live. Or the room auto-starts when every seat is filled.",
  },
  {
    id: "same-stock",
    question: "What if we pick the same stock?",
    answer:
      "Same ticker is allowed. If you finish with the same % move, you tie and split the place pots for those ranks.",
  },
  {
    id: "custody",
    question: "Where does my USDC sit?",
    answer:
      "Deposits sit in USDC escrow. Your playable balance is in-app credits (1:1 USDC). Withdraw sends funds back to the wallet you connected.",
  },
  {
    id: "rooms",
    question: "What are the rooms and stakes?",
    answer: (
      <ul className="list-none space-y-1">
        <li>Opening Bell — $1 · 5 seats</li>
        <li>After Hours — $5 · 5 seats</li>
        <li>Green Tape — $10 · 8 seats</li>
        <li>Red Pit — $25 · 15 seats</li>
        <li>Tesla Cage — $50 · 20 seats</li>
      </ul>
    ),
  },
  {
    id: "split",
    question: "How is the pot split?",
    answer:
      "The pot is who actually sat (not empty seats). 2 players: winner takes all. 3: 60 / 30 / 10. 4–5: 50 / 30 / 20. Larger rooms use deeper splits. 3% platform fee.",
  },
  {
    id: "legal",
    question: "Is this legal gambling?",
    answer:
      "StonkPit is a skill-based price race on live market data — not sports betting or a casino game. You control when you join, what you stake, and when you withdraw. We do not provide financial or legal advice; know your local rules and only risk what you can lose.",
  },
  {
    id: "mobile",
    question: "Mobile?",
    answer: "Yes. Built mobile-first — connect, pick a room, READY, and watch the live board from your phone.",
  },
];

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  return (
    <div id="faq" className="divide-y divide-pit-border border border-pit-border scroll-mt-20">
      {FAQ_ITEMS.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              className="flex w-full min-h-12 items-center justify-between gap-3 px-4 py-3 text-left font-mono text-sm text-white sm:px-5 sm:text-base"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : item.id)}
            >
              <span>{item.question}</span>
              <span className="shrink-0 text-pit-muted">{open ? "−" : "+"}</span>
            </button>
            {open && (
              <div className="border-t border-pit-border/40 px-4 pb-4 pt-2 font-mono text-sm leading-relaxed text-pit-muted sm:px-5 sm:text-[15px]">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
