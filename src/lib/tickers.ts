import type { ScanPeriod } from "../config/schema";
import {
  applyCountrySymbol,
  type CountryId,
} from "../data/universes";

/** Simboluri Yahoo: AAPL, BHP.AX, TLV.RO, BRK-B */

/** Simboluri Yahoo: AAPL, BHP.AX, TLV.RO, BRK-B */
export function parseTickers(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9][A-Z0-9._-]{0,15}$/.test(s)),
    ),
  ];
}

export type ManualHolding = {
  id: string;
  symbol: string;
  date: string;
  period: ScanPeriod;
  country: CountryId;
};

const STORAGE_KEY = "stock-scanners:manual-tickers";

export function todayISO(): string {
  return toISODate(new Date());
}

export function yesterdayISO(): string {
  const t = new Date();
  t.setDate(t.getDate() - 1);
  return toISODate(t);
}

function toISODate(t: Date): string {
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

export function newHoldingId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function holdingKey(
  h: Pick<ManualHolding, "symbol" | "period" | "country">,
): string {
  return `${h.symbol}|${h.period}|${h.country}`;
}

export function loadManualHoldings(): ManualHolding[] {
  const today = todayISO();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ManualHolding[] = [];
    for (const item of parsed) {
      if (typeof item === "string") {
        const symbol = parseTickers(item)[0];
        if (symbol)
          out.push({
            id: newHoldingId(),
            symbol,
            date: today,
            period: "day",
            country: inferCountry(symbol),
          });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const symbol =
        typeof row.symbol === "string" ? parseTickers(row.symbol)[0] : undefined;
      if (!symbol) continue;
      const date =
        typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
          ? row.date
          : today;
      const period =
        row.period === "week" ||
        row.period === "month" ||
        row.period === "quarter" ||
        row.period === "year" ||
        row.period === "day"
          ? row.period
          : "day";
      const country = parseCountry(row.country) ?? inferCountry(symbol);
      out.push({
        id: typeof row.id === "string" && row.id ? row.id : newHoldingId(),
        symbol: applyCountrySymbol(symbol, country === "all" ? inferCountry(symbol) : country),
        date,
        period,
        country: country === "all" ? inferCountry(symbol) : country,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveManualHoldings(holdings: ManualHolding[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

function parseCountry(value: unknown): CountryId | undefined {
  if (
    value === "us" ||
    value === "au" ||
    value === "ro" ||
    value === "uk" ||
    value === "ca" ||
    value === "de" ||
    value === "fr" ||
    value === "jp" ||
    value === "hk"
  ) {
    return value;
  }
  return undefined;
}

export function inferCountry(symbol: string): CountryId {
  const u = symbol.toUpperCase();
  if (u.endsWith(".AX")) return "au";
  if (u.endsWith(".RO")) return "ro";
  if (u.endsWith(".L")) return "uk";
  if (u.endsWith(".TO")) return "ca";
  if (u.endsWith(".DE")) return "de";
  if (u.endsWith(".PA")) return "fr";
  if (u.endsWith(".T")) return "jp";
  if (u.endsWith(".HK")) return "hk";
  return "us";
}
