import { readFileSync, writeFileSync } from "node:fs";

const tmp = process.env.TEMP;

function yahoo(s) {
  return String(s).trim().toUpperCase().replace(/\./g, "-");
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

const ndx = [];
for (const line of readFileSync(`${tmp}/ndx-list.wiki`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\| ([A-Z][A-Z0-9.-]{0,8}) \|\|/);
  if (m) ndx.push(yahoo(m[1]));
}

const dji = [];
const djiText = readFileSync(`${tmp}/dji-list.wiki`, "utf8");
for (const m of djiText.matchAll(/\{\{(?:NYSE|NASDAQ) link\|([A-Z0-9.-]+)\}\}/g)) {
  dji.push(yahoo(m[1]));
}

const uNdx = [...new Set(ndx)].sort();
const uDji = [...new Set(dji)].sort();
const body = `/** Constituenți Nasdaq-100 și Dow 30 (Yahoo: punctul din ticker e „-”). */\n\n${emit("NDX_UNIVERSE", uNdx)}\n${emit("DJI_UNIVERSE", uDji)}`;
writeFileSync("src/data/us-indices.ts", body);
console.log({ ndx: uNdx.length, dji: uDji.length, djiTickers: uDji });
