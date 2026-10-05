import type { AppConfig, LiveSettings, ScanPeriod } from "../config/schema";
import { analyzeAccumulation, type AccumulationHit } from "./accumulation";
import {
  averageVolume30,
  dailyVolumes,
  exchangeDayISO,
  fetchCandles,
  fetchQuoteStats,
  isIsoToday,
  rvolAtTime,
  volumeAvg30OverDays,
  volumeMultiple,
  type Candle,
  type CandleFetch,
  type QuoteStats,
} from "./market";
import {
  averageTrueRange,
  changeFromOpenPct,
  currentVolume,
  lastPrice,
  priceChangeOverSessions,
  priceChangeVsPrevClose,
} from "./metrics";

export const PERIOD_LABELS: Record<ScanPeriod, string> = {
  day: "Today",
  week: "5 days",
  month: "1 month",
  quarter: "3 months",
  year: "1 year",
};

export const PERIOD_QUERY: Record<
  ScanPeriod,
  { range: string; interval: string }
> = {
  day: { range: "1d", interval: "5m" },
  week: { range: "5d", interval: "15m" },
  month: { range: "1mo", interval: "1d" },
  quarter: { range: "3mo", interval: "1d" },
  year: { range: "1y", interval: "1d" },
};

export type ScanProgress = {
  done: number;
  total: number;
  symbol: string;
};

export type ScanFailure = {
  symbol: string;
  message: string;
  asOfDate?: string;
};

export type ScanJob = {
  symbol: string;
  period: ScanPeriod;
  endDate?: string;
};

export type ScanResult = {
  hits: AccumulationHit[];
  failures: ScanFailure[];
};

export function isScanAbort(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "AbortError"
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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

async function dailyBarsForAdv(
  symbol: string,
  job: ScanJob,
  analysis: { candles: Candle[]; interval: string },
  signal?: AbortSignal,
): Promise<Candle[]> {
  if (
    analysis.interval === "1d" &&
    dailyVolumes(analysis.candles).length >= 130
  ) {
    return analysis.candles;
  }
  try {
    const six = await fetchCandles(symbol, "6mo", "1d", job.endDate, signal);
    if (dailyVolumes(six.candles).length >= 80) return six.candles;
    if (six.candles.length > 0) return six.candles;
  } catch (err) {
    if (isScanAbort(err)) throw err;
  }
  try {
    const three = await fetchCandles(symbol, "3mo", "1d", job.endDate, signal);
    if (three.candles.length > 0) return three.candles;
  } catch (err) {
    if (isScanAbort(err)) throw err;
  }
  return analysis.candles;
}

function sessionCount(candles: Candle[], gmtOffset: number): number {
  const days = new Set<string>();
  for (const c of candles) {
    days.add(new Date(c.t + gmtOffset * 1000).toISOString().slice(0, 10));
  }
  return days.size;
}

async function barsForRvol(
  symbol: string,
  job: ScanJob,
  analysis: CandleFetch,
  signal?: AbortSignal,
): Promise<CandleFetch> {
  const enough =
    (analysis.interval === "5m" || analysis.interval === "15m") &&
    sessionCount(analysis.candles, analysis.gmtOffset) >= 20;
  if (enough) return analysis;
  try {
    const five = await fetchCandles(symbol, "2mo", "5m", job.endDate, signal);
    if (sessionCount(five.candles, five.gmtOffset) >= 10) return five;
    if (five.candles.length > analysis.candles.length) return five;
  } catch (err) {
    if (isScanAbort(err)) throw err;
  }
  try {
    const fifteen = await fetchCandles(
      symbol,
      "2mo",
      "15m",
      job.endDate,
      signal,
    );
    if (fifteen.candles.length > 0) return fifteen;
  } catch (err) {
    if (isScanAbort(err)) throw err;
  }
  return analysis;
}

function formatCap(usd: number): string {
  if (usd >= 1e12) return `${(usd / 1e12).toFixed(1)}T`;
  if (usd >= 1e9) return `${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `${(usd / 1e6).toFixed(0)}M`;
  return `${usd.toFixed(0)}`;
}

function sessionStats(
  stats: QuoteStats | undefined,
  endDate?: string,
): QuoteStats | undefined {
  if (!stats) return undefined;
  if (!endDate || isIsoToday(endDate)) return stats;
  return {
    marketCap: stats.marketCap,
    averageDailyVolume: stats.averageDailyVolume,
    sessionVolume: null,
    price: null,
    open: null,
    regularMarketTime: null,
    trailingPE: stats.trailingPE,
    forwardPE: stats.forwardPE,
    pegRatio: stats.pegRatio,
    changePercent: null,
    companyName: stats.companyName,
    shortPercentOfFloat: stats.shortPercentOfFloat,
    shortInterestChangePct: stats.shortInterestChangePct,
    daysToCover: stats.daysToCover,
  };
}

function enrichHit(
  hit: AccumulationHit,
  candles: Parameters<typeof currentVolume>[0],
  stats: QuoteStats | undefined,
  job: ScanJob,
  series: CandleFetch,
  dailyCandles: Candle[],
  rvolSeries: CandleFetch,
): AccumulationHit {
  const quote = sessionStats(stats, job.endDate);
  const price = lastPrice(candles, quote);
  const atr = averageTrueRange(candles);
  const adv = averageVolume30(dailyCandles, 30);
  const lastRvolBar = rvolSeries.candles[rvolSeries.candles.length - 1]?.t ?? 0;
  const at =
    quote?.regularMarketTime && quote.regularMarketTime > 0
      ? quote.regularMarketTime * 1000
      : lastRvolBar || candles[candles.length - 1]?.t || 0;
  const timed = rvolAtTime(rvolSeries.candles, at, rvolSeries.gmtOffset);
  hit.volumeRatio =
    timed > 0 ? timed : volumeMultiple(candles, quote, dailyCandles);
  hit.rvolAt = at || undefined;
  hit.marketCap = stats?.marketCap ?? null;
  hit.companyName = stats?.companyName ?? null;
  hit.trailingPE = stats?.trailingPE ?? null;
  hit.forwardPE = stats?.forwardPE ?? null;
  hit.pegRatio = stats?.pegRatio ?? null;
  hit.shortPercentOfFloat = stats?.shortPercentOfFloat ?? null;
  hit.shortInterestChangePct = stats?.shortInterestChangePct ?? null;
  hit.daysToCover = stats?.daysToCover ?? null;
  hit.currentVolume = currentVolume(candles, quote);
  hit.averageVolume = adv;
  hit.averageVolume3d = averageVolume30(dailyCandles, 3);
  hit.averageVolume5d = averageVolume30(dailyCandles, 5);
  hit.averageVolume10d = averageVolume30(dailyCandles, 10);
  hit.averageVolume1m = averageVolume30(dailyCandles, 21);
  hit.averageVolume3m = averageVolume30(dailyCandles, 63);
  hit.priceChange3dPct = priceChangeOverSessions(price, dailyCandles, 3, at);
  hit.priceChange5dPct = priceChangeOverSessions(price, dailyCandles, 5, at);
  hit.priceChange10dPct = priceChangeOverSessions(price, dailyCandles, 10, at);
  hit.priceChange1mPct = priceChangeOverSessions(price, dailyCandles, 21, at);
  hit.priceChange3mPct = priceChangeOverSessions(price, dailyCandles, 63, at);
  hit.changeFromOpenPct = changeFromOpenPct(candles, quote);
  hit.priceChangePct = priceChangeVsPrevClose(price, dailyCandles, at, quote);
  hit.atr = atr;
  hit.price = price;
  hit.atrPct = price > 0 ? (atr / price) * 100 : 0;
  hit.asOfDate = job.endDate;
  const exchange = series.exchange ? ` · ${series.exchange}` : "";
  hit.dataSource = `Yahoo Finance${exchange}`;
  hit.dataInterval = series.interval;
  hit.gmtOffset = series.gmtOffset;
  const quoteTs = quote?.regularMarketTime ? quote.regularMarketTime * 1000 : 0;
  const lastBar = candles[candles.length - 1]?.t ?? 0;
  hit.lastDataAt =
    Math.max(series.lastMarketTime ?? 0, quoteTs, lastBar) || undefined;
  hit.liveDay =
    job.period === "day" && (!job.endDate || isIsoToday(job.endDate));
  hit.volumeDays = volumeAvg30OverDays(
    dailyCandles,
    job.period === "month" || job.period === "quarter" || job.period === "year"
      ? 30
      : 20,
    30,
    series.gmtOffset,
  );
  const gmt = series.gmtOffset;
  const analyzingToday = !job.endDate || isIsoToday(job.endDate);
  if (analyzingToday) {
    const stampPrice =
      quote?.price && quote.price > 0 ? quote.price : price;
    const stampAt = Date.now();
    if (stampPrice > 0) {
      const dayStamp = exchangeDayISO(stampAt, gmt);
      while (hit.times.length > 0) {
        const d = exchangeDayISO(hit.times[hit.times.length - 1]!, gmt);
        if (d > dayStamp) {
          hit.times.pop();
          hit.closes.pop();
        } else break;
      }
      const lastT = hit.times[hit.times.length - 1];
      const dayLast =
        lastT != null ? exchangeDayISO(lastT, gmt) : "";
      if (dayLast === dayStamp && hit.closes.length > 0) {
        hit.closes[hit.closes.length - 1] = stampPrice;
        hit.times[hit.times.length - 1] = stampAt;
      } else {
        hit.closes.push(stampPrice);
        hit.times.push(stampAt);
      }
      hit.lastClose = stampPrice;
      hit.price = stampPrice;
    }
    hit.priceAt = stampAt;
  } else {
    const lastT = hit.times[hit.times.length - 1];
    hit.priceAt = lastT || at || undefined;
  }
  return hit;
}

function rejectByFilters(
  hit: AccumulationHit,
  filters: LiveSettings,
): string | null {
  if (filters.volumeMultiple > 0 && hit.volumeRatio < filters.volumeMultiple) {
    return `RVOL at Time ×${hit.volumeRatio.toFixed(1)} < ×${filters.volumeMultiple}`;
  }
  if (filters.minPrice > 0 && hit.price < filters.minPrice) {
    return `Price ${hit.price.toFixed(2)} < ${filters.minPrice}`;
  }
  if (filters.minMarketCapM > 0) {
    const minCap = filters.minMarketCapM * 1_000_000;
    if (hit.marketCap == null) return "No market cap — excluded";
    if (hit.marketCap < minCap) {
      return `Market cap ${formatCap(hit.marketCap)} below ${filters.minMarketCapM}M`;
    }
  }
  if (filters.minScore > 0 && hit.score < filters.minScore) {
    return `Score ${hit.score} < ${filters.minScore}`;
  }
  const sicMax = filters.maxShortInterestChangePct;
  if (sicMax != null && sicMax !== 0) {
    if (hit.shortInterestChangePct == null) {
      return "No Short Interest Change — excluded";
    }
    if (hit.shortInterestChangePct > sicMax) {
      return `Short Interest Change ${hit.shortInterestChangePct.toFixed(1)}% > ${sicMax}%`;
    }
  }
  return null;
}

export async function runScan(
  jobs: ScanJob[],
  config: AppConfig,
  onProgress?: (p: ScanProgress) => void,
  options?: { detailed?: boolean; filters?: LiveSettings; signal?: AbortSignal },
): Promise<ScanResult> {
  const hits: AccumulationHit[] = [];
  const failures: ScanFailure[] = [];
  const uniqueJobs = jobs.filter((j) => j.symbol.trim());
  const detailed = options?.detailed ?? false;
  const filters = options?.filters;
  const signal = options?.signal;
  const quoteSymbols = [
    ...new Set(uniqueJobs.map((j) => j.symbol.trim().toUpperCase())),
  ];
  const quotes = await fetchQuoteStats(quoteSymbols, signal).catch((err) => {
    if (isScanAbort(err) || signal?.aborted) return new Map<string, QuoteStats>();
    throw err;
  });
  if (signal?.aborted) {
    return { hits, failures };
  }
  const workers = Math.min(4, uniqueJobs.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (true) {
      if (signal?.aborted) return;
      const i = next;
      next += 1;
      if (i >= uniqueJobs.length) return;
      const job = uniqueJobs[i];
      const symbol = job.symbol.trim().toUpperCase();
      onProgress?.({ done, total: uniqueJobs.length, symbol });
      try {
        const { range, interval } = PERIOD_QUERY[job.period];
        const series = await fetchCandles(
          symbol,
          range,
          interval,
          job.endDate,
          signal,
        );
        const candles = series.candles;
        const stats = quotes.get(symbol);
        const raw = analyzeAccumulation(symbol, candles, config.accumulation);
        if (!raw) {
          failures.push({
            symbol,
            message: "Too few candles for analysis",
            asOfDate: job.endDate,
          });
        } else {
          const dailyCandles = await dailyBarsForAdv(
            symbol,
            job,
            series,
            signal,
          );
          const rvolSeries = await barsForRvol(symbol, job, series, signal);
          const hit = enrichHit(
            raw,
            candles,
            stats,
            job,
            series,
            dailyCandles,
            rvolSeries,
          );
          if (!detailed && filters) {
            const why = rejectByFilters(hit, filters);
            if (why) {
              failures.push({ symbol, message: why, asOfDate: job.endDate });
            } else hits.push(hit);
          } else {
            hits.push(hit);
          }
        }
      } catch (err) {
        if (signal?.aborted || isScanAbort(err)) return;
        failures.push({
          symbol,
          message: err instanceof Error ? err.message : "Unknown error",
          asOfDate: job.endDate,
        });
      }
      done += 1;
      if (config.market.scanDelayMs) {
        try {
          await sleep(config.market.scanDelayMs, signal);
        } catch (err) {
          if (isScanAbort(err) || signal?.aborted) return;
          throw err;
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, workers) }, () => worker()),
  );

  onProgress?.({
    done: Math.min(done, uniqueJobs.length),
    total: uniqueJobs.length,
    symbol: "",
  });
  hits.sort((a, b) => b.score - a.score);
  return { hits, failures };
}
