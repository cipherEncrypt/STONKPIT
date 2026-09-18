"use client";

import { PythQuote } from "@/lib/pyth";
import { formatUsd } from "@/lib/scoring";

export function PriceFeed({
  label,
  quote,
  startPrice,
}: {
  label: string;
  quote: PythQuote | null;
  startPrice?: number;
}) {
  if (!quote) {
    return (
      <div className="border-l-2 border-pit-border bg-pit-card p-4">
        <p className="terminal-label">{label}</p>
        <p className="mt-2 font-mono text-lg text-pit-muted">SYNCING</p>
      </div>
    );
  }

  const move =
    startPrice && startPrice > 0
      ? ((quote.price - startPrice) / startPrice) * 100
      : null;
  const moveColor =
    move === null ? "text-white" : move >= 0 ? "text-pit-green" : "text-pit-red";

  return (
    <div className="border-l-2 border-pit-green bg-pit-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="terminal-label">{label}</p>
          <p className="display-type mt-1 text-3xl text-white">
            {formatUsd(quote.price)}
          </p>
        </div>
        {move !== null && (
          <p className={`display-type text-xl ${moveColor}`}>
            {move >= 0 ? "+" : ""}
            {move.toFixed(2)}%
          </p>
        )}
      </div>
      <div className="mt-3 h-px w-full bg-gradient-to-r from-pit-green/70 via-pit-green/20 to-transparent" />
      <dl className="mt-3 grid grid-cols-1 gap-y-1 font-mono text-sm text-pit-muted sm:grid-cols-2 sm:gap-x-4">
        <div>
          <dt className="inline">Feed </dt>
          <dd className="inline text-white/80">{quote.feedName}</dd>
        </div>
        <div>
          <dt className="inline">Published </dt>
          <dd className="inline text-white/80">
            {new Date(quote.publishTime * 1000).toLocaleTimeString()}
          </dd>
        </div>
        <div>
          <dt className="inline">Conf ± </dt>
          <dd className="inline text-white/80">{formatUsd(quote.conf)}</dd>
        </div>
        <div>
          <dt className="inline">Source </dt>
          <dd className="inline text-white/80">{quote.source}</dd>
        </div>
      </dl>
    </div>
  );
}
