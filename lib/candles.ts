/** Display-only 1m OHLC buckets from Pyth samples (not used for scoring). */

export type PriceSample = {
  ts: number;
  price: number;
  publishTime: number;
};

export type MinuteCandle = {
  minuteEpochMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  lastPublishTime: number;
};

export function minuteEpochMs(ts: number): number {
  return Math.floor(ts / 60_000) * 60_000;
}

export function addSample(candles: MinuteCandle[], sample: PriceSample): MinuteCandle[] {
  const key = minuteEpochMs(sample.ts);
  const next = candles.map((c) => ({ ...c }));

  const idx = next.findIndex((c) => c.minuteEpochMs === key);
  if (idx >= 0) {
    const c = next[idx];
    c.high = Math.max(c.high, sample.price);
    c.low = Math.min(c.low, sample.price);
    c.close = sample.price;
    c.lastPublishTime = sample.publishTime;
    return next;
  }

  next.push({
    minuteEpochMs: key,
    open: sample.price,
    high: sample.price,
    low: sample.price,
    close: sample.price,
    lastPublishTime: sample.publishTime,
  });
  next.sort((a, b) => a.minuteEpochMs - b.minuteEpochMs);
  return next;
}

export function lastCandles(candles: MinuteCandle[], n: number): MinuteCandle[] {
  if (n <= 0) return [];
  return candles.slice(-n);
}
