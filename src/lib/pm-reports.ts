import { fetchCandles, type Candle } from "./market";
import type { PmHistoryDay, SavedPreMarket } from "./premarket-saves";
import type { ScanProgress } from "./scan";

export type PmReports = {
  pmRetention: number | null;
  postOpenHigh: number | null;
  pmHighBreak: number | null;
  openToClose: number | null;
  pmHighToClose: number | null;
};

function finite(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function pct(numer: number, denom: number): number | null {
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom === 0) {
    return null;
  }
  return (numer / denom) * 100;
}

export function pmHighOf(row: SavedPreMarket): number | null {
  return finite(row.pmHigh) ?? finite(row.preMarketPrice);
}

/** After the open, session fields are usable. Pre-market still uses n/a for RTH reports. */
export function sessionReady(row: SavedPreMarket): boolean {
  const state = (row.marketState ?? "").toUpperCase();
  if (state === "PRE" || state === "PREPRE") return false;
  return finite(row.regularOpen) != null;
}

export function reportsFromLevels(p: {
  open: number | null;
  prevClose: number | null;
  pmHigh: number | null;
  dayHigh: number | null;
  close: number | null;
}): PmReports {
  const { open, prevClose, pmHigh, dayHigh, close } = p;
  return {
    pmRetention:
      open != null && prevClose != null && pmHigh != null
        ? pct(open - prevClose, pmHigh - prevClose)
        : null,
    postOpenHigh:
      dayHigh != null && open != null ? pct(dayHigh - open, open) : null,
    pmHighBreak:
      dayHigh != null && pmHigh != null ? pct(dayHigh - pmHigh, pmHigh) : null,
    openToClose:
      close != null && open != null ? pct(close - open, open) : null,
    pmHighToClose:
      close != null && pmHigh != null ? pct(close - pmHigh, pmHigh) : null,
  };
}

export function computePmReports(row: SavedPreMarket): PmReports {
  if (!sessionReady(row)) {
    return {
      pmRetention: null,
      postOpenHigh: null,
      pmHighBreak: null,
      openToClose: null,
      pmHighToClose: null,
    };
  }
  return reportsFromLevels({
    open: finite(row.regularOpen),
    prevClose: finite(row.previousClose),
    pmHigh: pmHighOf(row),
    dayHigh: finite(row.intradayHigh),
    close: finite(row.regularClose),
  });
}

function sessionClock(
  t: number,
  gmtOffsetSec: number,
): { day: string; minute: number } {
  const local = new Date(t + gmtOffsetSec * 1000);
  return {
    day: local.toISOString().slice(0, 10),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

type DayLevels = {
  date: string;
  pmHigh: number | null;
  open: number | null;
  dayHigh: number | null;
  close: number | null;
};

function levelsFromCandles(
  candles: Candle[],
  gmtOffset: number,
  startMin: number,
  endMin: number,
): DayLevels[] {
  type Acc = {
    pmHigh: number;
    open: number | null;
    dayHigh: number;
    close: number | null;
  };
  const byDay = new Map<string, Acc>();
  const order: string[] = [];
  for (const c of candles) {
    const { day, minute } = sessionClock(c.t, gmtOffset);
    if (!byDay.has(day)) {
      order.push(day);
      byDay.set(day, { pmHigh: 0, open: null, dayHigh: 0, close: null });
    }
    const acc = byDay.get(day)!;
    if (minute < startMin) {
      if (c.h > acc.pmHigh) acc.pmHigh = c.h;
      continue;
    }
    if (minute >= endMin) continue;
    if (acc.open == null) acc.open = c.o;
    if (c.h > acc.dayHigh) acc.dayHigh = c.h;
    acc.close = c.c;
  }
  return order.map((date) => {
    const acc = byDay.get(date)!;
    return {
      date,
      pmHigh: acc.pmHigh > 0 ? acc.pmHigh : null,
      open: acc.open,
      dayHigh: acc.dayHigh > 0 ? acc.dayHigh : null,
      close: acc.close,
    };
  });
}

function historyFromLevels(days: DayLevels[], today: string): PmHistoryDay[] {
  const withRth = days.filter((d) => d.open != null);
  const out: PmHistoryDay[] = [];
  for (let i = 0; i < withRth.length; i++) {
    const d = withRth[i];
    if (d.date >= today) continue;
    const prevClose = i > 0 ? withRth[i - 1].close : null;
    const r = reportsFromLevels({
      open: d.open,
      prevClose,
      pmHigh: d.pmHigh,
      dayHigh: d.dayHigh,
      close: d.close,
    });
    out.push({ date: d.date, ...r });
  }
  return out.slice(-3).reverse();
}

type YahooQuoteRow = {
  symbol?: string;
  shortName?: string | null;
  longName?: string | null;
  displayName?: string | null;
  marketCap?: number | null;
  marketState?: string | null;
  preMarketPrice?: number | null;
  preMarketChangePercent?: number | null;
  preMarketVolume?: number | null;
  preMarketTime?: number | null;
  regularMarketPreviousClose?: number | null;
  regularMarketOpen?: number | null;
  regularMarketDayHigh?: number | null;
  regularMarketPrice?: number | null;
  regularMarketTime?: number | null;
  sharesOutstanding?: number | null;
};

async function fetchQuoteMap(
  symbols: string[],
  signal?: AbortSignal,
): Promise<Map<string, YahooQuoteRow>> {
  const out = new Map<string, YahooQuoteRow>();
  const chunkSize = 20;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    if (signal?.aborted) break;
    const chunk = symbols.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      symbols: chunk.join(","),
      fields: [
        "symbol",
        "shortName",
        "longName",
        "displayName",
        "marketCap",
        "marketState",
        "preMarketPrice",
        "preMarketChangePercent",
        "preMarketVolume",
        "preMarketTime",
        "regularMarketPreviousClose",
        "regularMarketOpen",
        "regularMarketDayHigh",
        "regularMarketPrice",
        "regularMarketTime",
        "sharesOutstanding",
      ].join(","),
    });
    const res = await fetch(`/yahoo/v7/finance/quote?${params}`, { signal });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      quoteResponse?: { result?: YahooQuoteRow[] };
    };
    for (const row of data.quoteResponse?.result ?? []) {
      const symbol = row.symbol?.toUpperCase();
      if (symbol) out.set(symbol, row);
    }
  }
  return out;
}

async function fetchSessionSeries(symbol: string, signal?: AbortSignal) {
  try {
    return await fetchCandles(symbol, "5d", "5m", undefined, signal, true);
  } catch {
    try {
      return await fetchCandles(symbol, "5d", "15m", undefined, signal, true);
    } catch {
      return null;
    }
  }
}

function maxNum(...vals: Array<number | null | undefined>): number | null {
  let m = -Infinity;
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v) && v > m) m = v;
  }
  return Number.isFinite(m) && m !== -Infinity ? m : null;
}

export async function refreshSavedPreMarkets(
  rows: SavedPreMarket[],
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<SavedPreMarket[]> {
  if (rows.length === 0) return rows;
  const symbols = rows.map((r) => r.symbol);
  onProgress?.({ done: 0, total: symbols.length, symbol: symbols[0] ?? "" });
  const quotes = await fetchQuoteMap(symbols, signal);
  const now = Date.now();
  const next: SavedPreMarket[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) {
      next.push(...rows.slice(i));
      break;
    }
    const row = rows[i];
    onProgress?.({
      done: i,
      total: rows.length,
      symbol: row.symbol,
    });
    const q = quotes.get(row.symbol);
    const state = q?.marketState?.toUpperCase() ?? row.marketState ?? null;
    const prePrice = finite(q?.preMarketPrice) ?? row.preMarketPrice;
    const prev =
      finite(q?.regularMarketPreviousClose) ?? row.previousClose;
    let change = finite(q?.preMarketChangePercent);
    if (change == null && prev != null && prev > 0) {
      change = ((prePrice - prev) / prev) * 100;
    }
    const series = await fetchSessionSeries(row.symbol, signal);
    const gmt = series?.gmtOffset ?? 0;
    const startMin = series?.regularStart
      ? sessionClock(series.regularStart, gmt).minute
      : 9 * 60 + 30;
    const endMin = series?.regularEnd
      ? sessionClock(series.regularEnd, gmt).minute
      : 16 * 60;
    const today = sessionClock(now, gmt).day;
    const days = series
      ? levelsFromCandles(series.candles, gmt, startMin, endMin)
      : [];
    const todayLevels = days.find((d) => d.date === today);
    const chartPmHigh = todayLevels?.pmHigh ?? null;
    const pmHigh = maxNum(row.pmHigh, prePrice, chartPmHigh);
    const open = finite(q?.regularMarketOpen);
    const dayHigh = finite(q?.regularMarketDayHigh);
    const last = finite(q?.regularMarketPrice);
    next.push({
      ...row,
      companyName:
        q?.shortName?.trim() ||
        q?.displayName?.trim() ||
        q?.longName?.trim() ||
        row.companyName,
      changePct: change ?? row.changePct,
      preMarketPrice: prePrice,
      previousClose: prev,
      volume: finite(q?.preMarketVolume) ?? row.volume,
      at: q?.preMarketTime ? q.preMarketTime * 1000 : row.at,
      marketCap: finite(q?.marketCap) ?? row.marketCap,
      sharesOutstanding:
        finite(q?.sharesOutstanding) ?? row.sharesOutstanding,
      pmHigh,
      regularOpen: open ?? row.regularOpen ?? null,
      intradayHigh: maxNum(row.intradayHigh, dayHigh),
      regularClose: last ?? row.regularClose ?? null,
      marketState: state,
      updatedAt: now,
      pmHistory: historyFromLevels(days, today),
    });
  }
  onProgress?.({
    done: next.length,
    total: rows.length,
    symbol: "",
  });
  return next;
}
