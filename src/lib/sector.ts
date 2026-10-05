/** Yahoo GICS-style labels. Empty profile is kept (unknown). */

function blob(sector: string | null | undefined, industry: string | null | undefined): string {
  return `${sector ?? ""} ${industry ?? ""}`.toLowerCase();
}

export function isFinancialCategory(
  sector?: string | null,
  industry?: string | null,
): boolean {
  const t = blob(sector, industry);
  if (!t.trim()) return false;
  if (/\bhealthcare\b/.test(t) && /plan/.test(t)) return false;
  return (
    /\bfinancial/.test(t) ||
    /\bbanks?\b/.test(t) ||
    /insurance/.test(t) ||
    /asset management/.test(t) ||
    /capital markets/.test(t) ||
    /credit services/.test(t) ||
    /mortgage/.test(t) ||
    /\breit\b/.test(t) ||
    /savings/.test(t) ||
    /investment (broker|banking)/.test(t) ||
    /closed[- ]end fund/.test(t) ||
    /specialty finance/.test(t) ||
    /shell company/.test(t)
  );
}

export function isHealthcareCompany(
  sector?: string | null,
  industry?: string | null,
): boolean {
  const t = blob(sector, industry);
  if (!t.trim()) return true;
  if (isFinancialCategory(sector, industry)) return false;
  return (
    /health/.test(t) ||
    /biotech/.test(t) ||
    /pharma/.test(t) ||
    /drug manufacturer/.test(t) ||
    /medical/.test(t) ||
    /diagnos/.test(t) ||
    /life science/.test(t)
  );
}

export function healthcareScanReject(
  sector?: string | null,
  industry?: string | null,
): string | null {
  if (isHealthcareCompany(sector, industry)) return null;
  const label = sector || industry || "other";
  return `Not Healthcare (${label})`;
}

export function filterHealthcareHits<
  T extends {
    symbol: string;
    companySector?: string | null;
    companyIndustry?: string | null;
  },
>(
  hits: T[],
  enabled: boolean,
): { hits: T[]; rejected: { symbol: string; message: string }[] } {
  if (!enabled) return { hits, rejected: [] };
  const kept: T[] = [];
  const rejected: { symbol: string; message: string }[] = [];
  for (const hit of hits) {
    const why = healthcareScanReject(hit.companySector, hit.companyIndustry);
    if (why) rejected.push({ symbol: hit.symbol, message: why });
    else kept.push(hit);
  }
  return { hits: kept, rejected };
}
