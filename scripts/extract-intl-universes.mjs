import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CACHE = join("scripts", ".wiki-cache");
mkdirSync(CACHE, { recursive: true });
const UA =
  "StockScanners/1.0 (local universe extract; https://github.com/)";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function wiki(page) {
  const file = join(CACHE, `${page.replace(/[^\w]+/g, "_")}.txt`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", page);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.parse?.wikitext?.["*"];
  if (!text) throw new Error(`${page}: no wikitext`);
  writeFileSync(file, text);
  return text;
}

function uniqSort(arr) {
  return [...new Set(arr.filter(Boolean))].sort();
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

function yahooUk(epic) {
  const s = String(epic).trim().toUpperCase().replace(/\s+/g, "");
  if (!s || s.length > 8) return "";
  return `${s.replace(/\./g, "-")}.L`;
}

function yahooCa(sym) {
  const s = String(sym).trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  return `${s.replace(/\./g, "-")}.TO`;
}

function yahooDe(sym) {
  const s = String(sym).trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  if (s.includes(".")) return s;
  return `${s}.DE`;
}

function yahooPa(sym) {
  const s = String(sym).trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  if (s.endsWith(".PA")) return s;
  if (s.includes(".")) return "";
  return `${s}.PA`;
}

function fromFwbLinks(text) {
  const out = [];
  for (const m of text.matchAll(/\{\{FWB link\|([^}|]+)/g)) {
    out.push(yahooDe(m[1]));
  }
  return out;
}

function fromTsxLinks(text) {
  const out = [];
  for (const m of text.matchAll(/\{\{TSX link\|([^}|]+)/g)) {
    out.push(yahooCa(m[1]));
  }
  return out;
}

function fromEuronextParis(text) {
  const out = [];
  for (const m of text.matchAll(/\{\{EuronextParis\|([^}|]+)/g)) {
    out.push(yahooPa(m[1]));
  }
  return out;
}

/** FTSE-style: |[[Name]]|| EPIC || */
function fromFtseTable(text) {
  const out = [];
  const start = text.search(/id="constituents"/i);
  const chunk = start >= 0 ? text.slice(start) : text;
  for (const m of chunk.matchAll(
    /\n\|[^\n]*\|\|\s*([A-Z][A-Z0-9.]{0,6})\s*\|/g,
  )) {
    const t = yahooUk(m[1]);
    if (t) out.push(t);
  }
  return out;
}

/** CAC-style trailing AC.PA */
function fromPaTickers(text) {
  const out = [];
  for (const m of text.matchAll(/\b([A-Z]{1,6})\.PA\b/g)) {
    out.push(`${m[1]}.PA`);
  }
  return out;
}

/** MDAX/SDAX last cell ticker AIXA */
function fromDeTableLastCell(text) {
  const out = [];
  const start = text.search(/id="constituents"/i);
  const chunk = start >= 0 ? text.slice(start, start + 80_000) : text;
  const rows = chunk.split(/\n\|-/);
  for (const row of rows) {
    const cells = row.split(/\n\|/).map((c) => c.trim());
    const last = cells[cells.length - 1] ?? "";
    const m = last.match(/^([A-Z0-9]{1,6})$/);
    if (m) out.push(yahooDe(m[1]));
  }
  return out;
}

async function collect() {
  const pages = [
    "FTSE 100 Index",
    "FTSE 250 Index",
    "S&P/TSX 60",
    "DAX",
    "MDAX",
    "SDAX",
    "CAC 40",
    "CAC Next 20",
    "CAC Mid 60",
  ];
  const texts = {};
  for (const p of pages) {
    process.stderr.write(`fetch ${p}\n`);
    try {
      texts[p] = await wiki(p);
    } catch (err) {
      process.stderr.write(`skip ${p}: ${err.message}\n`);
      texts[p] = "";
    }
    await sleep(1200);
  }

  const uk100 = uniqSort(fromFtseTable(texts["FTSE 100 Index"] ?? ""));
  const uk250 = uniqSort(fromFtseTable(texts["FTSE 250 Index"] ?? ""));
  const ca60 = uniqSort(fromTsxLinks(texts["S&P/TSX 60"] ?? ""));
  const dax = uniqSort(
    (fromFwbLinks(texts.DAX ?? "")).filter((s) => s.endsWith(".DE")),
  );
  const mdax = uniqSort([
    ...fromFwbLinks(texts.MDAX ?? ""),
    ...fromDeTableLastCell(texts.MDAX ?? ""),
  ].filter((s) => s.endsWith(".DE")));
  const sdax = uniqSort([
    ...fromFwbLinks(texts.SDAX ?? ""),
    ...fromDeTableLastCell(texts.SDAX ?? ""),
  ].filter((s) => s.endsWith(".DE")));
  const cac40 = uniqSort(fromPaTickers(texts["CAC 40"] ?? ""));
  const cacNext = uniqSort(fromEuronextParis(texts["CAC Next 20"] ?? ""));
  const cacMid = uniqSort([
    ...fromEuronextParis(texts["CAC Mid 60"] ?? ""),
    ...fromPaTickers(texts["CAC Mid 60"] ?? ""),
  ]);

  return { uk100, uk250, ca60, dax, mdax, sdax, cac40, cacNext, cacMid };
}

const { uk100, uk250, ca60, dax, mdax, sdax, cac40, cacNext, cacMid } =
  await collect();

const counts = {
  uk100: uk100.length,
  uk250: uk250.length,
  ca60: ca60.length,
  dax: dax.length,
  mdax: mdax.length,
  sdax: sdax.length,
  cac40: cac40.length,
  cacNext: cacNext.length,
  cacMid: cacMid.length,
};
console.log(counts);

if (uk100.length < 80 || dax.length < 30 || ca60.length < 40) {
  throw new Error(`extract too small: ${JSON.stringify(counts)}`);
}
if (cac40.length < 30) {
  process.stderr.write(`warning: CAC 40 only ${cac40.length}\n`);
}

const body = `/** Constituenți de indici (Wikipedia → Yahoo). UK: punctul din EPIC e „-”. CA: .TO. */\n\n${emit("UK_FTSE100", uk100)}\n${emit("UK_FTSE250", uk250)}\n${emit("CA_TSX60", ca60)}\n${emit("DE_DAX", dax)}\n${emit("DE_MDAX", mdax)}\n${emit("DE_SDAX", sdax)}\n${emit("FR_CAC40", cac40)}\n${emit("FR_CAC_NEXT20", cacNext)}\n${emit("FR_CAC_MID60", cacMid)}\n`;
writeFileSync("src/data/intl-indices.ts", body);
