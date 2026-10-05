import type { Candle } from "./market";
import type { QuoteStats } from "./market";
import { latestDayVolume } from "./market";

export function currentVolume(
  candles: Candle[],
  stats: QuoteStats | undefined,
): number {
  if (stats?.sessionVolume && stats.sessionVolume > 0) return stats.sessionVolume;
  return latestDayVolume(candles);
}

export function lastPrice(
  candles: Candle[],
  stats: QuoteStats | undefined,
): number {
  if (stats?.price && stats.price > 0) return stats.price;
  return candles[candles.length - 1]?.c ?? 0;
}

export function changeFromOpenPct(
  candles: Candle[],
  stats: QuoteStats | undefined,
): number | null {
  const price = lastPrice(candles, stats);
  let open =
    stats?.open && stats.open > 0 ? stats.open : undefined;
  if (!open && candles.length > 0) {
    const lastDay = new Date(candles[candles.length - 1].t).toDateString();
    const first = candles.find(
      (c) => new Date(c.t).toDateString() === lastDay && c.o > 0,
    );
    open = first?.o;
  }
  if (!open || !price) return null;
  return ((price - open) / open) * 100;
}

/** Creștere/scădere față de close-ul ședinței anterioare. */
export function priceChangeVsPrevClose(
  price: number,
  dailyCandles: Candle[],
  asOfMs: number,
  quote?: QuoteStats,
): number | null {
  if (quote?.changePercent != null && Number.isFinite(quote.changePercent)) {
    return quote.changePercent;
  }
  if (price <= 0 || dailyCandles.length === 0) return null;
  const byDay = new Map<string, number>();
  const order: string[] = [];
  for (const c of dailyCandles) {
    const key = new Date(c.t).toDateString();
    if (!byDay.has(key)) order.push(key);
    byDay.set(key, c.c);
  }
  const asOfDay = new Date(asOfMs).toDateString();
  let prev: number | undefined;
  for (let i = order.length - 1; i >= 0; i--) {
    if (order[i] !== asOfDay) {
      prev = byDay.get(order[i]);
      break;
    }
  }
  if (prev == null || prev <= 0) return null;
  return ((price - prev) / prev) * 100;
}

/** Mișcarea prețului pe ultimele `sessions` ședințe, până la prețul curent. */
export function priceChangeOverSessions(
  price: number,
  dailyCandles: Candle[],
  sessions: number,
  asOfMs: number,
): number | null {
  if (price <= 0 || sessions < 2 || dailyCandles.length === 0) return null;
  const byDay = new Map<string, { t: number; c: number }>();
  const order: string[] = [];
  for (const c of dailyCandles) {
    const key = new Date(c.t).toDateString();
    if (!byDay.has(key)) order.push(key);
    byDay.set(key, { t: c.t, c: c.c });
  }
  const asOfDay = new Date(asOfMs).toDateString();
  let end = -1;
  for (let i = order.length - 1; i >= 0; i--) {
    const row = byDay.get(order[i]);
    if (!row) continue;
    if (order[i] === asOfDay || row.t <= asOfMs) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const start = end - (sessions - 1);
  if (start < 0) return null;
  const from = byDay.get(order[start])?.c ?? 0;
  if (from <= 0) return null;
  return ((price - from) / from) * 100;
}

export function averageTrueRange(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].c;
    const { h, l } = candles[i];
    tr.push(Math.max(h - l, Math.abs(h - prev), Math.abs(l - prev)));
  }
  const n = Math.min(period, tr.length);
  const slice = tr.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}
