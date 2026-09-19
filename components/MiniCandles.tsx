"use client";

import { MinuteCandle } from "@/lib/candles";
import { formatUsdPit } from "@/lib/scoring";

export function MiniCandles({ candles }: { candles: MinuteCandle[] }) {
  if (!candles.length) {
    return <p className="font-mono text-[10px] text-pit-muted">1m tape warming…</p>;
  }

  const prices = candles.flatMap((c) => [c.open, c.high, c.low, c.close]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || max * 0.0001 || 1;

  const toPct = (p: number) => ((p - min) / span) * 100;

  return (
    <div className="flex items-end gap-2">
      {candles.map((c) => {
        const up = c.close >= c.open;
        const hi = toPct(c.high);
        const lo = toPct(c.low);
        const top = toPct(Math.max(c.open, c.close));
        const bot = toPct(Math.min(c.open, c.close));
        const bodyH = Math.max(8, top - bot);
        const wickBot = lo;
        const wickTop = 100 - hi;

        return (
          <div key={c.minuteEpochMs} className="flex flex-col items-center gap-0.5">
            <div className="relative h-10 w-3 bg-pit-border/30">
              <span
                className="absolute left-1/2 w-px -translate-x-1/2 bg-pit-muted"
                style={{ bottom: `${wickBot}%`, top: `${wickTop}%` }}
              />
              <span
                className={`absolute left-0 right-0 ${up ? "bg-pit-green" : "bg-pit-red"}`}
                style={{ bottom: `${bot}%`, height: `${bodyH}%` }}
              />
            </div>
            <span className="max-w-[4.5rem] truncate font-mono text-[9px] leading-tight text-pit-muted">
              {formatUsdPit(c.close)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
