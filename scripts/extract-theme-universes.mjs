import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function yahoo(sym) {
  return String(sym)
    .trim()
    .toUpperCase()
    .replace(/\./g, "-");
}

function emit(name, arr) {
  const rows = [];
  for (let i = 0; i < arr.length; i += 10) {
    rows.push(
      `  ${arr.slice(i, i + 10).map((s) => JSON.stringify(s)).join(", ")},`,
    );
  }
  return `export const ${name}: string[] = [\n${rows.join("\n")}\n];\n`;
}

function capOf(row) {
  const n = Number(String(row.marketCap ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const src = path.join(os.tmpdir(), "nasdaq-all.json");
const rows = JSON.parse(readFileSync(src, "utf8")).data.rows;

const skipSym = /[\^/=]|W$|U$|\d{4,}/;
function keepTicker(sym) {
  const s = yahoo(sym);
  if (!s || s.length > 5) return false;
  if (!/^[A-Z]{1,5}(-[A-Z])?$/.test(s)) return false;
  if (skipSym.test(s)) return false;
  return true;
}

const bioInd = (ind) =>
  /Biotechnology/i.test(ind || "") &&
  !/Laboratory Analytical/i.test(ind || "");

const bioSector = (sec) => {
  const t = String(sec || "");
  if (!t.trim()) return true;
  if (/financial/i.test(t)) return false;
  return /health/i.test(t);
};

const biotech = [
  ...new Set(
    rows
      .filter(
        (r) =>
          bioInd(r.industry) &&
          bioSector(r.sector) &&
          keepTicker(r.symbol),
      )
      .map((r) => yahoo(r.symbol)),
  ),
].sort();

// Russell Microcap ~ under $300M; keep names with some size for Yahoo liquidity.
const micro = [
  ...new Set(
    rows
      .filter((r) => {
        const c = capOf(r);
        return (
          r.country === "United States" &&
          c >= 50_000_000 &&
          c < 300_000_000 &&
          keepTicker(r.symbol)
        );
      })
      .map((r) => yahoo(r.symbol)),
  ),
].sort();

const body = `/** Nasdaq screener: biotech (industrie) și micro cap SUA (50–300M USD). */\n\n${emit("BIOTECH_UNIVERSE", biotech)}\n${emit("MICRO_UNIVERSE", micro)}`;
writeFileSync("src/data/theme-universes.ts", body);
console.log({ biotech: biotech.length, micro: micro.length });
