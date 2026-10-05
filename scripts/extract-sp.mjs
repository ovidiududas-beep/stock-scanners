import { readFileSync, writeFileSync } from "node:fs";

function yahoo(sym) {
  return String(sym)
    .trim()
    .toUpperCase()
    .replace(/\./g, "-");
}

function fromCsv(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).slice(1);
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const sym = line.split(",")[0];
    if (sym) out.push(yahoo(sym));
  }
  return [...new Set(out)].sort();
}

function fromWiki(path) {
  const text = readFileSync(path, "utf8");
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\| ([A-Z][A-Z0-9.-]{0,8}) \|/);
    if (m) out.push(yahoo(m[1]));
  }
  return [...new Set(out)].sort();
}

function emit(name, arr) {
  const rows = [];
  for (let i = 0; i < arr.length; i += 10) {
    rows.push(`  ${arr.slice(i, i + 10).map((s) => JSON.stringify(s)).join(", ")},`);
  }
  return `export const ${name}: string[] = [\n${rows.join("\n")}\n];\n`;
}

const sp500 = fromCsv(
  "C:/Users/ovidi/.cursor/projects/c-Users-ovidi-stock-scanners/agent-tools/e9238ec4-821f-47e3-abc1-dbfbab912ef2.txt",
);
const sp400 = fromWiki(
  "C:/Users/ovidi/.cursor/projects/c-Users-ovidi-stock-scanners/agent-tools/15e01771-8e9e-4ea2-ac69-ce013dcb7fcd.txt",
);
const sp600 = fromWiki(
  "C:/Users/ovidi/.cursor/projects/c-Users-ovidi-stock-scanners/agent-tools/b58242dd-d027-42c2-8dc2-71b73f53bbfa.txt",
);

const body = `/** Constituenți S&P (Yahoo: punctul din ticker e „-”, ex. BRK-B). */\n\n${emit("SP500_UNIVERSE", sp500)}\n${emit("SP400_UNIVERSE", sp400)}\n${emit("SP600_UNIVERSE", sp600)}`;

writeFileSync("src/data/sp-indices.ts", body);
console.log({
  sp500: sp500.length,
  sp400: sp400.length,
  sp600: sp600.length,
});
