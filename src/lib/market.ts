export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketTime?: number;
        dataGranularity?: string;
        exchangeName?: string;
        fullExchangeName?: string;
        gmtoffset?: number;
        currentTradingPeriod?: {
          regular?: { start?: number; end?: number };
          pre?: { start?: number; end?: number };
        };
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string };
  };
};

export type QuoteStats = {
  marketCap: number | null;
  averageDailyVolume: number | null;
  sessionVolume: number | null;
  price: number | null;
  open: number | null;
  regularMarketTime: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  changePercent: number | null;
  companyName: string | null;
  shortPercentOfFloat: number | null;
  shortInterestChangePct: number | null;
  daysToCover: number | null;
};

function finiteOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function asPercent(n: number | null): number | null {
  if (n == null) return null;
  return n <= 1.5 ? n * 100 : n;
}

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      marketCap?: number | null;
      netAssets?: number | null;
      enterpriseValue?: number | null;
      averageDailyVolume3Month?: number | null;
      averageDailyVolume10Day?: number | null;
      regularMarketVolume?: number | null;
      regularMarketPrice?: number | null;
      regularMarketOpen?: number | null;
      regularMarketTime?: number | null;
      trailingPE?: number | null;
      forwardPE?: number | null;
      pegRatio?: number | null;
      trailingPegRatio?: number | null;
      regularMarketChangePercent?: number | null;
      regularMarketPreviousClose?: number | null;
      shortName?: string | null;
      longName?: string | null;
      displayName?: string | null;
      shortPercentOfFloat?: number | null;
      shortRatio?: number | null;
      sharesShort?: number | null;
      sharesShortPriorMonth?: number | null;
    }>;
  };
};

export async function fetchQuoteStats(
  symbols: string[],
  signal?: AbortSignal,
): Promise<Map<string, QuoteStats>> {
  const out = new Map<string, QuoteStats>();
  const chunkSize = 20;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    if (signal?.aborted) break;
    const chunk = symbols.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      symbols: chunk.join(","),
      fields: [
        "symbol",
        "marketCap",
        "netAssets",
        "enterpriseValue",
        "averageDailyVolume3Month",
        "averageDailyVolume10Day",
        "regularMarketVolume",
        "regularMarketPrice",
        "regularMarketOpen",
        "regularMarketTime",
        "trailingPE",
        "forwardPE",
        "pegRatio",
        "trailingPegRatio",
        "regularMarketChangePercent",
        "regularMarketPreviousClose",
        "shortName",
        "longName",
        "displayName",
        "shortPercentOfFloat",
        "shortRatio",
        "sharesShort",
        "sharesShortPriorMonth",
      ].join(","),
    });
    const res = await fetch(`/yahoo/v7/finance/quote?${params}`, { signal });
    if (!res.ok) continue;
    const data = (await res.json()) as YahooQuoteResponse;
    for (const row of data.quoteResponse?.result ?? []) {
      const symbol = row.symbol?.toUpperCase();
      if (!symbol) continue;
      out.set(symbol, {
        marketCap:
          row.marketCap ?? row.netAssets ?? row.enterpriseValue ?? null,
        averageDailyVolume:
          row.averageDailyVolume3Month ?? row.averageDailyVolume10Day ?? null,
        sessionVolume: row.regularMarketVolume ?? null,
        price: row.regularMarketPrice ?? null,
        open: row.regularMarketOpen ?? null,
        regularMarketTime: row.regularMarketTime ?? null,
        trailingPE: finiteOrNull(row.trailingPE),
        forwardPE: finiteOrNull(row.forwardPE),
        pegRatio: finiteOrNull(row.pegRatio ?? row.trailingPegRatio),
        changePercent: finiteOrNull(row.regularMarketChangePercent),
        companyName:
          row.shortName?.trim() ||
          row.displayName?.trim() ||
          row.longName?.trim() ||
          null,
        shortPercentOfFloat: asPercent(finiteOrNull(row.shortPercentOfFloat)),
        shortInterestChangePct: (() => {
          const now = finiteOrNull(row.sharesShort);
          const prior = finiteOrNull(row.sharesShortPriorMonth);
          if (now == null || prior == null || prior === 0) return null;
          return ((now - prior) / prior) * 100;
        })(),
        daysToCover: finiteOrNull(row.shortRatio),
      });
    }
  }
  return out;
}

export function latestDayVolume(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  const lastDay = new Date(candles[candles.length - 1].t).toDateString();
  const sameDay = candles.filter((c) => new Date(c.t).toDateString() === lastDay);
  if (sameDay.length > 1) {
    return sameDay.reduce((a, c) => a + c.v, 0);
  }
  return candles[candles.length - 1].v;
}

export function dailyVolumes(candles: Candle[]): number[] {
  return dailySessionVolumes(candles).map((d) => d.v);
}

export type DailyVolume = { date: string; t: number; v: number };

export function dailySessionVolumes(
  candles: Candle[],
  gmtOffsetSec = 0,
): DailyVolume[] {
  const days = new Map<string, DailyVolume>();
  const order: string[] = [];
  for (const c of candles) {
    const key = new Date(c.t + gmtOffsetSec * 1000).toISOString().slice(0, 10);
    const prev = days.get(key);
    if (!prev) {
      order.push(key);
      days.set(key, { date: key, t: c.t, v: c.v });
    } else {
      days.set(key, { date: key, t: c.t, v: prev.v + c.v });
    }
  }
  return order.map((k) => days.get(k)!);
}

export type VolumeCompareDay = {
  date: string;
  t: number;
  volume: number;
  avg30: number;
};

export function exchangeDayISO(t: number, gmtOffsetSec: number): string {
  return new Date(t + gmtOffsetSec * 1000).toISOString().slice(0, 10);
}

/** Ultimele `days` ședințe încheiate (fără ziua curentă): volum zilnic + media 30D. */
export function volumeAvg30OverDays(
  candles: Candle[],
  days = 20,
  avgWindow = 30,
  gmtOffsetSec = 0,
): VolumeCompareDay[] {
  const today = exchangeDayISO(Date.now(), gmtOffsetSec);
  const bars = dailySessionVolumes(candles, gmtOffsetSec).filter(
    (b) => b.date < today,
  );
  if (bars.length < 2) return [];
  const first = Math.max(avgWindow, bars.length - days);
  const out: VolumeCompareDay[] = [];
  for (let i = first; i < bars.length; i++) {
    const prior = bars.slice(Math.max(0, i - avgWindow), i);
    if (prior.length === 0) continue;
    const avg30 = prior.reduce((a, b) => a + b.v, 0) / prior.length;
    const bar = bars[i]!;
    out.push({ date: bar.date, t: bar.t, volume: bar.v, avg30 });
  }
  return out;
}

/** Medie pe ultimele `days` ședințe, fără ziua curentă (incompletă). */
export function averageVolume30(candles: Candle[], days = 30): number {
  const vols = dailyVolumes(candles);
  const prior = vols.length > 1 ? vols.slice(0, -1) : vols;
  const slice = prior.slice(-days);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function exchangeClock(t: number, gmtOffsetSec: number): { day: string; minute: number } {
  const local = new Date(t + gmtOffsetSec * 1000);
  const day = local.toISOString().slice(0, 10);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { day, minute };
}

/**
 * RVOL at Time: volum acumulat până la momentul X
 * ÷ media volumului acumulat până la aceeași oră (ora bursei) în ultimele 30 de ședințe.
 */
export function rvolAtTime(
  candles: Candle[],
  atMs: number,
  gmtOffsetSec = 0,
  priorDays = 30,
): number {
  if (!atMs || candles.length === 0) return 0;
  const cutoff = exchangeClock(atMs, gmtOffsetSec);
  const byDay = new Map<string, number>();
  const order: string[] = [];
  for (const c of candles) {
    if (c.t > atMs) continue;
    const clock = exchangeClock(c.t, gmtOffsetSec);
    if (clock.minute > cutoff.minute) continue;
    if (!byDay.has(clock.day)) order.push(clock.day);
    byDay.set(clock.day, (byDay.get(clock.day) ?? 0) + c.v);
  }
  const current = byDay.get(cutoff.day) ?? 0;
  const prior = order.filter((d) => d !== cutoff.day).slice(-priorDays);
  if (prior.length === 0 || current <= 0) return 0;
  const baseline = prior.reduce((a, d) => a + (byDay.get(d) ?? 0), 0) / prior.length;
  if (baseline <= 0) return 0;
  return current / baseline;
}

export function volumeMultiple(
  candles: Candle[],
  stats: QuoteStats | undefined,
  dailyCandles: Candle[] = candles,
): number {
  const current =
    stats?.sessionVolume && stats.sessionVolume > 0
      ? stats.sessionVolume
      : latestDayVolume(candles);
  const baseline = averageVolume30(dailyCandles, 30);
  if (baseline > 0 && current > 0) return current / baseline;
  return 0;
}

const LOOKBACK_DAYS: Record<string, number> = {
  "1d": 1,
  "5d": 5,
  "1mo": 31,
  "2mo": 62,
  "3mo": 93,
  "6mo": 186,
  "1y": 366,
};

export function isIsoToday(iso: string): boolean {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return iso === `${t.getFullYear()}-${m}-${d}`;
}

export type CandleFetch = {
  candles: Candle[];
  lastMarketTime: number | null;
  interval: string;
  exchange: string | null;
  gmtOffset: number;
  regularStart: number | null;
  regularEnd: number | null;
};

export async function fetchCandles(
  symbol: string,
  range: string,
  interval: string,
  endDate?: string,
  signal?: AbortSignal,
  includePrePost = false,
): Promise<CandleFetch> {
  const params = new URLSearchParams({
    includePrePost: includePrePost ? "true" : "false",
    events: "div,splits",
  });
  let intervalUsed = interval;
  if (endDate && !isIsoToday(endDate)) {
    const [y, mo, da] = endDate.split("-").map(Number);
    const end = new Date(y, mo - 1, da, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ageDays = Math.round(
      (today.getTime() - new Date(y, mo - 1, da).getTime()) / 86_400_000,
    );
    const intradayTooOld =
      ageDays > 55 && (interval === "5m" || interval === "15m");
    if (intradayTooOld) intervalUsed = "1d";
    let days = LOOKBACK_DAYS[range] ?? 31;
    if (intradayTooOld) days = Math.max(days, 21);
    if (
      (intervalUsed === "5m" || intervalUsed === "15m") &&
      days > 55
    ) {
      days = 55;
    }
    const start = end.getTime() - days * 24 * 60 * 60 * 1000;
    params.set("period1", String(Math.floor(start / 1000)));
    params.set("period2", String(Math.floor(end.getTime() / 1000)));
    params.set("interval", intervalUsed);
  } else {
    const days = LOOKBACK_DAYS[range] ?? 0;
    const longIntraday =
      (interval === "5m" || interval === "15m") && days > 7;
    if (longIntraday) {
      const end = Date.now();
      const span = Math.min(days, 55) * 86_400_000;
      params.set("period1", String(Math.floor((end - span) / 1000)));
      params.set("period2", String(Math.floor(end / 1000)));
      params.set("interval", interval);
    } else {
      params.set("range", range);
      params.set("interval", interval);
    }
  }
  const res = await fetch(
    `/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`${symbol}: Yahoo ${res.status}`);
  }
  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const stamps = result?.timestamp;
  if (!result || !quote || !stamps) {
    throw new Error(data.chart?.error?.description ?? `${symbol}: no data`);
  }
  const candles: Candle[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];
    if (
      o == null ||
      h == null ||
      l == null ||
      c == null ||
      v == null ||
      !Number.isFinite(c)
    ) {
      continue;
    }
    candles.push({ t: stamps[i] * 1000, o, h, l, c, v });
  }
  const metaTime = result.meta?.regularMarketTime
    ? result.meta.regularMarketTime * 1000
    : null;
  const lastBar = candles[candles.length - 1]?.t ?? null;
  const lastMarketTime = Math.max(metaTime ?? 0, lastBar ?? 0) || null;
  const regularStartSec = result.meta?.currentTradingPeriod?.regular?.start;
  const regularEndSec = result.meta?.currentTradingPeriod?.regular?.end;
  return {
    candles,
    lastMarketTime,
    interval: result.meta?.dataGranularity ?? intervalUsed,
    exchange: result.meta?.exchangeName ?? result.meta?.fullExchangeName ?? null,
    gmtOffset: result.meta?.gmtoffset ?? 0,
    regularStart:
      typeof regularStartSec === "number" && Number.isFinite(regularStartSec)
        ? regularStartSec * 1000
        : null,
    regularEnd:
      typeof regularEndSec === "number" && Number.isFinite(regularEndSec)
        ? regularEndSec * 1000
        : null,
  };
}
