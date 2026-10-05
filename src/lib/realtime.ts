import { exchangeDayISO, fetchCandles, fetchQuoteStats, type CandleFetch } from "./market";
import { isScanAbort } from "./scan";
import { inferCountry } from "./tickers";
import type { CountryId } from "../data/universes";

export type RealTimeSnapshot = {
  symbol: string;
  country: CountryId;
  gmtOffset: number;
  interval: string;
  times: number[];
  prices: number[];
  volumes: number[];
  price: number;
  sessionVolume: number;
  updatedAt: number;
};

function lastFiveSessionCandles(series: CandleFetch): CandleFetch["candles"] {
  const { candles, gmtOffset } = series;
  const days: string[] = [];
  for (const c of candles) {
    const d = exchangeDayISO(c.t, gmtOffset);
    if (days[days.length - 1] !== d) days.push(d);
  }
  const keep = new Set(days.slice(-5));
  return candles.filter((c) => keep.has(exchangeDayISO(c.t, gmtOffset)));
}

async function fetchIntraday(
  symbol: string,
  signal?: AbortSignal,
): Promise<CandleFetch> {
  const attempts: Array<{ range: string; interval: string }> = [
    { range: "5d", interval: "1m" },
    { range: "5d", interval: "5m" },
    { range: "5d", interval: "15m" },
  ];
  let lastErr: unknown = new Error(`${symbol}: no intraday data`);
  for (const attempt of attempts) {
    try {
      const series = await fetchCandles(
        symbol,
        attempt.range,
        attempt.interval,
        undefined,
        signal,
        true,
      );
      if (series.candles.length >= 8) return series;
      lastErr = new Error(`${symbol}: too few bars`);
    } catch (err) {
      if (isScanAbort(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function fetchRealTimeSeries(
  symbol: string,
  signal?: AbortSignal,
  country: CountryId = inferCountry(symbol),
): Promise<RealTimeSnapshot> {
  const series = await fetchIntraday(symbol, signal);
  const candles = lastFiveSessionCandles(series);
  if (candles.length < 2) {
    throw new Error(`${symbol}: need at least two bars in the last 5 sessions`);
  }
  const quotes = await fetchQuoteStats([symbol], signal);
  const quote = quotes.get(symbol.toUpperCase());
  const times = candles.map((c) => c.t);
  const prices = candles.map((c) => c.c);
  const volumes = candles.map((c) => c.v);
  const now = Date.now();
  const livePrice =
    quote?.price && quote.price > 0 ? quote.price : prices[prices.length - 1]!;
  const lastI = times.length - 1;
  const lastT = times[lastI]!;
  if (now - lastT > 90_000) {
    times.push(now);
    prices.push(livePrice);
    volumes.push(volumes[lastI]!);
  } else {
    prices[lastI] = livePrice;
    times[lastI] = now;
  }
  return {
    symbol,
    country: country === "all" ? inferCountry(symbol) : country,
    gmtOffset: series.gmtOffset,
    interval: series.interval,
    times,
    prices,
    volumes,
    price: livePrice,
    sessionVolume: quote?.sessionVolume && quote.sessionVolume > 0
      ? quote.sessionVolume
      : volumes[volumes.length - 1]!,
    updatedAt: now,
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
