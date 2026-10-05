import type { PreMarketHit } from "./premarket";

export type SavedPreMarket = PreMarketHit & {
  savedAt: number;
  updatedAt?: number;
  pmHigh?: number | null;
  regularOpen?: number | null;
  intradayHigh?: number | null;
  regularClose?: number | null;
  marketState?: string | null;
  pmHistory?: PmHistoryDay[];
};

export type PmHistoryDay = {
  date: string;
  pmRetention: number | null;
  postOpenHigh: number | null;
  pmHighBreak: number | null;
  openToClose: number | null;
  pmHighToClose: number | null;
};

const STORAGE_KEY = "stock-scanners:premarket-saves";

function finite(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function parseHistory(raw: unknown): PmHistoryDay[] {
  if (!Array.isArray(raw)) return [];
  const out: PmHistoryDay[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      continue;
    }
    out.push({
      date: row.date,
      pmRetention: finite(row.pmRetention),
      postOpenHigh: finite(row.postOpenHigh),
      pmHighBreak: finite(row.pmHighBreak),
      openToClose: finite(row.openToClose),
      pmHighToClose: finite(row.pmHighToClose),
    });
  }
  return out.slice(0, 3);
}

function text(n: unknown): string | null {
  if (typeof n !== "string") return null;
  const t = n.trim();
  return t ? t : null;
}

export function loadPreMarketSaves(): SavedPreMarket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedPreMarket[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const symbol =
        typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
      const preMarketPrice = finite(row.preMarketPrice);
      const changePct = finite(row.changePct);
      if (!symbol || preMarketPrice == null || changePct == null) continue;
      out.push({
        symbol,
        companyName: text(row.companyName),
        changePct,
        preMarketPrice,
        previousClose: finite(row.previousClose),
        volume: finite(row.volume),
        at: finite(row.at),
        marketCap: finite(row.marketCap),
        sharesOutstanding: finite(row.sharesOutstanding),
        companySector: text(row.companySector),
        companyIndustry: text(row.companyIndustry),
        companySummary: text(row.companySummary),
        savedAt:
          typeof row.savedAt === "number" && Number.isFinite(row.savedAt)
            ? row.savedAt
            : Date.now(),
        updatedAt: finite(row.updatedAt) ?? undefined,
        pmHigh: finite(row.pmHigh),
        regularOpen: finite(row.regularOpen),
        intradayHigh: finite(row.intradayHigh),
        regularClose: finite(row.regularClose),
        marketState: text(row.marketState),
        pmHistory: parseHistory(row.pmHistory),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function persistPreMarketSaves(rows: SavedPreMarket[]): void {
  const slim = rows.map(({ volumeDays: _drop, ...row }) => row);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
}

export function upsertPreMarketSave(
  hit: PreMarketHit,
  rows: SavedPreMarket[],
): SavedPreMarket[] {
  const saved: SavedPreMarket = {
    ...hit,
    volumeDays: undefined,
    savedAt: Date.now(),
  };
  return [saved, ...rows.filter((r) => r.symbol !== hit.symbol)];
}

export function dropPreMarketSave(
  symbol: string,
  rows: SavedPreMarket[],
): SavedPreMarket[] {
  return rows.filter((r) => r.symbol !== symbol);
}
