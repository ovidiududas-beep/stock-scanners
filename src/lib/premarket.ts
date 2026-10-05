import { fetchCandles, volumeAvg30OverDays, type VolumeCompareDay } from "./market";

export type PreMarketVolumeDay = VolumeCompareDay;

export type PreMarketHit = {
  symbol: string;
  companyName: string | null;
  changePct: number;
  preMarketPrice: number;
  previousClose: number | null;
  volume: number | null;
  at: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  companySector: string | null;
  companyIndustry: string | null;
  companySummary: string | null;
  volumeDays?: PreMarketVolumeDay[];
};

export type PreMarketResult = {
  hits: PreMarketHit[];
  scanned: number;
  skipped: number;
};

type YahooPreQuote = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      shortName?: string | null;
      longName?: string | null;
      displayName?: string | null;
      marketCap?: number | null;
      preMarketPrice?: number | null;
      preMarketChangePercent?: number | null;
      preMarketVolume?: number | null;
      preMarketTime?: number | null;
      regularMarketPreviousClose?: number | null;
      sharesOutstanding?: number | null;
    }>;
  };
};

function finite(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

async function fetchChunk(
  symbols: string[],
  signal?: AbortSignal,
): Promise<PreMarketHit[]> {
  const params = new URLSearchParams({
    symbols: symbols.join(","),
    fields: [
      "symbol",
      "shortName",
      "longName",
      "displayName",
      "marketCap",
      "preMarketPrice",
      "preMarketChangePercent",
      "preMarketVolume",
      "preMarketTime",
      "regularMarketPreviousClose",
      "sharesOutstanding",
    ].join(","),
  });
  const res = await fetch(`/yahoo/v7/finance/quote?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as YahooPreQuote;
  const hits: PreMarketHit[] = [];
  for (const row of data.quoteResponse?.result ?? []) {
    const symbol = row.symbol?.toUpperCase();
    if (!symbol) continue;
    const price = finite(row.preMarketPrice);
    const prev = finite(row.regularMarketPreviousClose);
    let change = finite(row.preMarketChangePercent);
    if (change == null && price != null && prev != null && prev > 0) {
      change = ((price - prev) / prev) * 100;
    }
    if (price == null || change == null) continue;
    hits.push({
      symbol,
      companyName:
        row.shortName?.trim() ||
        row.displayName?.trim() ||
        row.longName?.trim() ||
        null,
      changePct: change,
      preMarketPrice: price,
      previousClose: prev,
      volume: finite(row.preMarketVolume),
      at: row.preMarketTime ? row.preMarketTime * 1000 : null,
      marketCap: finite(row.marketCap),
      sharesOutstanding: finite(row.sharesOutstanding),
      companySector: null,
      companyIndustry: null,
      companySummary: null,
    });
  }
  return hits;
}

export async function runPreMarketScan(
  symbols: string[],
  minPct: number,
  onProgress?: (p: { done: number; total: number; symbol: string }) => void,
  signal?: AbortSignal,
): Promise<PreMarketResult> {
  const unique = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  const found: PreMarketHit[] = [];
  const chunkSize = 20;
  for (let i = 0; i < unique.length; i += chunkSize) {
    if (signal?.aborted) break;
    const chunk = unique.slice(i, i + chunkSize);
    onProgress?.({
      done: i,
      total: unique.length,
      symbol: chunk[0] ?? "",
    });
    try {
      found.push(...(await fetchChunk(chunk, signal)));
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name: string }).name === "AbortError"
      ) {
        break;
      }
      throw err;
    }
  }
  onProgress?.({
    done: Math.min(found.length ? unique.length : 0, unique.length),
    total: unique.length,
    symbol: "",
  });
  const floor = Number.isFinite(minPct) ? minPct : 0;
  const hits = found
    .filter((h) => h.changePct >= floor)
    .sort((a, b) => b.changePct - a.changePct);
  return {
    hits,
    scanned: unique.length,
    skipped: unique.length - found.length,
  };
}

function isAbort(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "AbortError"
  );
}

export async function attachPreMarketVolume(
  hits: PreMarketHit[],
  onProgress?: (p: { done: number; total: number; symbol: string }) => void,
  signal?: AbortSignal,
): Promise<PreMarketHit[]> {
  if (hits.length === 0) return hits;
  const out = hits.map((h) => ({ ...h }));
  let next = 0;
  let done = 0;
  const workers = Math.min(4, out.length);
  async function worker() {
    while (next < out.length) {
      if (signal?.aborted) return;
      const i = next++;
      const hit = out[i]!;
      onProgress?.({ done, total: out.length, symbol: hit.symbol });
      try {
        const series = await fetchCandles(hit.symbol, "3mo", "1d", undefined, signal);
        hit.volumeDays = volumeAvg30OverDays(
          series.candles,
          20,
          30,
          series.gmtOffset,
        );
      } catch (err) {
        if (isAbort(err) || signal?.aborted) return;
        hit.volumeDays = [];
      }
      done += 1;
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  onProgress?.({ done: out.length, total: out.length, symbol: "" });
  return out;
}
