import {
  DJI_UNIVERSE,
  NDX_UNIVERSE,
} from "../data/us-indices";
import { BIOTECH_UNIVERSE, MICRO_UNIVERSE } from "../data/theme-universes";
import {
  SP400_UNIVERSE,
  SP500_UNIVERSE,
  SP600_UNIVERSE,
} from "../data/sp-indices";
import {
  CA_UNIVERSE,
  HK_UNIVERSE,
  JP_UNIVERSE,
  RO_UNIVERSE,
} from "../data/universes";
import {
  ASX_50,
  ASX_100,
  ASX_200,
  ASX_300,
  ASX_XAO,
} from "../data/asx-indices";
import {
  DE_DAX,
  FR_CAC40,
  UK_FTSE100,
} from "../data/intl-indices";

const TABLES: { label: string; set: Set<string> }[] = [
  { label: "Dow 30", set: pack(DJI_UNIVERSE) },
  { label: "Nasdaq-100", set: pack(NDX_UNIVERSE) },
  { label: "S&P 500", set: pack(SP500_UNIVERSE) },
  { label: "S&P 400", set: pack(SP400_UNIVERSE) },
  { label: "S&P 600", set: pack(SP600_UNIVERSE) },
  { label: "Biotech", set: pack(BIOTECH_UNIVERSE) },
  { label: "Micro cap", set: pack(MICRO_UNIVERSE) },
  { label: "ASX 50", set: pack(ASX_50) },
  { label: "ASX 100", set: pack(ASX_100) },
  { label: "ASX 200", set: pack(ASX_200) },
  { label: "ASX 300", set: pack(ASX_300) },
  { label: "All Ordinaries", set: pack(ASX_XAO) },
  { label: "BET", set: pack(RO_UNIVERSE) },
  { label: "FTSE 100", set: pack(UK_FTSE100) },
  { label: "TSX", set: pack(CA_UNIVERSE) },
  { label: "DAX", set: pack(DE_DAX) },
  { label: "CAC 40", set: pack(FR_CAC40) },
  { label: "Nikkei 225", set: pack(JP_UNIVERSE) },
  { label: "Hang Seng", set: pack(HK_UNIVERSE) },
];

const LOCAL_SUFFIX = new Set(["AX", "RO", "L", "TO", "DE", "PA", "T", "HK"]);

function pack(symbols: string[]): Set<string> {
  const set = new Set<string>();
  for (const raw of symbols) {
    const s = raw.trim().toUpperCase();
    if (!s) continue;
    set.add(s);
    set.add(s.replace(/\./g, "-"));
    set.add(s.replace(/-/g, "."));
  }
  return set;
}

function keysFor(symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  const keys = [s, s.replace(/\./g, "-"), s.replace(/-/g, ".")];
  const dot = s.lastIndexOf(".");
  if (dot > 0 && LOCAL_SUFFIX.has(s.slice(dot + 1))) {
    keys.push(s.slice(0, dot));
  }
  return keys;
}

export function indicesFor(symbol: string): string[] {
  const keys = keysFor(symbol);
  return TABLES.filter((t) => keys.some((k) => t.set.has(k))).map((t) => t.label);
}
