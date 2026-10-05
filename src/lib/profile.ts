export type CompanyProfile = {
  sector: string | null;
  industry: string | null;
  summary: string | null;
  shortPercentOfFloat: number | null;
  shortInterestChangePct: number | null;
  shortVolumeRatio: number | null;
  daysToCover: number | null;
};

const cache = new Map<string, CompanyProfile>();

type YNum = number | { raw?: number | null } | null | undefined;

function yRaw(v: YNum): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof v.raw === "number" && Number.isFinite(v.raw)) {
    return v.raw;
  }
  return null;
}

/** Yahoo sends 0.12 or 12 for 12%. */
function asPercent(n: number | null): number | null {
  if (n == null) return null;
  return n <= 1.5 ? n * 100 : n;
}

type QuoteSummary = {
  quoteSummary?: {
    result?: Array<{
      assetProfile?: {
        sector?: string | null;
        industry?: string | null;
        longBusinessSummary?: string | null;
      };
      summaryProfile?: {
        sector?: string | null;
        industry?: string | null;
        longBusinessSummary?: string | null;
      };
      defaultKeyStatistics?: KeyStats;
    }>;
  };
};

type SummaryRow = NonNullable<
  NonNullable<QuoteSummary["quoteSummary"]>["result"]
>[number];

function emptyProfile(): CompanyProfile {
  return {
    sector: null,
    industry: null,
    summary: null,
    shortPercentOfFloat: null,
    shortInterestChangePct: null,
    shortVolumeRatio: null,
    daysToCover: null,
  };
}

type KeyStats = {
  shortPercentOfFloat?: YNum;
  shortRatio?: YNum;
  sharesShort?: YNum;
  sharesShortPriorMonth?: YNum;
  sharesShortPreviousMonth?: YNum;
};

function shortsFromStats(stats: KeyStats | null | undefined): Pick<
  CompanyProfile,
  | "shortPercentOfFloat"
  | "shortInterestChangePct"
  | "shortVolumeRatio"
  | "daysToCover"
> {
  const k = stats ?? {};
  const shortNow = yRaw(k.sharesShort);
  const shortPrior =
    yRaw(k.sharesShortPriorMonth) ?? yRaw(k.sharesShortPreviousMonth);
  let change: number | null = null;
  if (shortNow != null && shortPrior != null && shortPrior !== 0) {
    change = ((shortNow - shortPrior) / shortPrior) * 100;
  }
  return {
    shortPercentOfFloat: asPercent(yRaw(k.shortPercentOfFloat)),
    shortInterestChangePct: change,
    shortVolumeRatio: null,
    daysToCover: yRaw(k.shortRatio),
  };
}

function clean(s: string | null | undefined): string | null {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

function clip(s: string, max = 420): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > 200 ? cut.slice(0, at) : cut).trim()}…`;
}

async function fetchOne(
  symbol: string,
  signal?: AbortSignal,
): Promise<CompanyProfile> {
  const cached = cache.get(symbol);
  if (cached) return cached;
  const empty = emptyProfile();
  try {
    const path = encodeURIComponent(symbol);
    const urls = [
      `/yahoo/v10/finance/quoteSummary/${path}?modules=assetProfile,summaryProfile,defaultKeyStatistics`,
      `/yahoo/v10/finance/quoteSummary/${path}?modules=assetProfile,summaryProfile`,
    ];
    let row: SummaryRow | undefined;
    for (const url of urls) {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const data = (await res.json()) as QuoteSummary;
      row = data.quoteSummary?.result?.[0];
      if (row) break;
    }
    if (!row) {
      cache.set(symbol, empty);
      return empty;
    }
    const p = row?.assetProfile;
    const s = row?.summaryProfile;
    const shorts = shortsFromStats(row?.defaultKeyStatistics);
    const profile: CompanyProfile = {
      sector: clean(p?.sector) ?? clean(s?.sector),
      industry: clean(p?.industry) ?? clean(s?.industry),
      summary: clip(
        clean(p?.longBusinessSummary) ?? clean(s?.longBusinessSummary) ?? "",
      ),
      ...shorts,
    };
    if (!profile.summary) profile.summary = null;
    cache.set(symbol, profile);
    return profile;
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "AbortError"
    ) {
      throw err;
    }
    cache.set(symbol, empty);
    return empty;
  }
}

export function companyInfoBody(p: CompanyProfile | null | undefined): string {
  if (!p) {
    return "Yahoo nu a trimis un profil (sector / ce face) pentru acest simbol.";
  }
  const lines: string[] = [];
  if (p.sector) lines.push(`Sector: ${p.sector}`);
  if (p.industry) lines.push(`Industrie: ${p.industry}`);
  if (p.summary) lines.push(p.summary);
  if (!lines.length) {
    return "Yahoo nu a trimis un profil (sector / ce face) pentru acest simbol.";
  }
  return lines.join("\n");
}

export async function attachCompanyProfiles<
  T extends {
    symbol: string;
    companySector?: string | null;
    companyIndustry?: string | null;
    companySummary?: string | null;
    shortPercentOfFloat?: number | null;
    shortInterestChangePct?: number | null;
    shortVolumeRatio?: number | null;
    daysToCover?: number | null;
  },
>(hits: T[], signal?: AbortSignal): Promise<T[]> {
  const unique = [...new Set(hits.map((h) => h.symbol))];
  const workers = 6;
  let i = 0;
  const map = new Map<string, CompanyProfile>();
  async function worker() {
    while (i < unique.length) {
      if (signal?.aborted) return;
      const symbol = unique[i++];
      try {
        map.set(symbol, await fetchOne(symbol, signal));
      } catch (err) {
        if (
          typeof err === "object" &&
          err !== null &&
          "name" in err &&
          (err as { name: string }).name === "AbortError"
        ) {
          return;
        }
        throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, unique.length) }, worker));
  return hits.map((h) => {
    const p = map.get(h.symbol);
    return {
      ...h,
      companySector: p?.sector ?? null,
      companyIndustry: p?.industry ?? null,
      companySummary: p?.summary ?? null,
      shortPercentOfFloat: p?.shortPercentOfFloat ?? h.shortPercentOfFloat ?? null,
      shortInterestChangePct:
        p?.shortInterestChangePct ?? h.shortInterestChangePct ?? null,
      shortVolumeRatio: p?.shortVolumeRatio ?? h.shortVolumeRatio ?? null,
      daysToCover: p?.daysToCover ?? h.daysToCover ?? null,
    };
  });
}
