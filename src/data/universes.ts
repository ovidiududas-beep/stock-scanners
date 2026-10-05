/** Yahoo Finance. Scanarea de piață nu folosește tickerile utilizatorului. */

import {
  SP400_UNIVERSE,
  SP500_UNIVERSE,
  SP600_UNIVERSE,
} from "./sp-indices";
import { BIOTECH_UNIVERSE, MICRO_UNIVERSE } from "./theme-universes";
import { ASX_XAO } from "./asx-indices";
import {
  CA_TSX60,
  DE_DAX,
  DE_MDAX,
  FR_CAC40,
  FR_CAC_NEXT20,
  UK_FTSE100,
  UK_FTSE250,
} from "./intl-indices";

export type CountryId =
  | "all"
  | "us"
  | "au"
  | "ro"
  | "uk"
  | "ca"
  | "de"
  | "fr"
  | "jp"
  | "hk";

export type CountryInfo = {
  id: Exclude<CountryId, "all">;
  label: string;
  suffix: string;
};

export const COUNTRIES: CountryInfo[] = [
  { id: "us", label: "US", suffix: "" },
  { id: "au", label: "Australia", suffix: ".AX" },
  { id: "ro", label: "Romania", suffix: ".RO" },
  { id: "uk", label: "United Kingdom", suffix: ".L" },
  { id: "ca", label: "Canada", suffix: ".TO" },
  { id: "de", label: "Germany", suffix: ".DE" },
  { id: "fr", label: "France", suffix: ".PA" },
  { id: "jp", label: "Japan", suffix: ".T" },
  { id: "hk", label: "Hong Kong", suffix: ".HK" },
];

export const COUNTRY_CHIPS: Array<{ id: CountryId; label: string }> = [
  { id: "all", label: "All" },
  ...COUNTRIES.map((c) => ({ id: c.id, label: c.label })),
];

export type UsCapId = "sp500" | "sp400" | "sp600" | "biotech" | "micro";

export const US_CAP_CHIPS: Array<{ id: UsCapId; label: string }> = [
  { id: "sp500", label: "Large cap S&P 500" },
  { id: "sp400", label: "Mid cap 400" },
  { id: "sp600", label: "Small cap 600" },
  { id: "micro", label: "Micro cap" },
  { id: "biotech", label: "Biotech" },
];

const KNOWN_SUFFIX = new Set(
  COUNTRIES.map((c) => c.suffix.replace(".", "")).filter(Boolean),
);

export function countryInfo(id: CountryId): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.id === id);
}

export function applyCountrySymbol(symbol: string, country: CountryId): string {
  const raw = symbol.trim().toUpperCase();
  if (country === "all") return raw;
  const dot = raw.lastIndexOf(".");
  let base = raw;
  if (dot > 0) {
    const suf = raw.slice(dot + 1);
    if (KNOWN_SUFFIX.has(suf)) base = raw.slice(0, dot);
  }
  if (country === "us") return base;
  const info = countryInfo(country);
  return info?.suffix ? `${base}${info.suffix}` : base;
}

export const US_UNIVERSE: string[] = [
  "AAPL", "ABBV", "ABT", "ACN", "ADBE", "AIG", "AMD", "AMGN", "AMT", "AMZN",
  "AVGO", "AXP", "BA", "BAC", "BK", "BKNG", "BLK", "BMY", "BRK-B", "C",
  "CAT", "CHTR", "CL", "CMCSA", "COF", "COP", "COST", "CRM", "CSCO", "CVS",
  "CVX", "DE", "DHR", "DIS", "DUK", "EMR", "EXC", "F", "FDX", "GD",
  "GE", "GILD", "GM", "GOOGL", "GS", "HD", "HON", "IBM", "INTC", "INTU",
  "ISRG", "JNJ", "JPM", "KO", "LIN", "LLY", "LMT", "LOW", "MA", "MCD",
  "MDLZ", "MDT", "MET", "META", "MMM", "MO", "MRK", "MS", "MSFT", "NEE",
  "NFLX", "NKE", "NOW", "NVDA", "ORCL", "PEP", "PFE", "PG", "PLTR", "PM",
  "PYPL", "QCOM", "RTX", "SBUX", "SCHW", "SO", "SPG", "T", "TGT", "TMO",
  "TMUS", "TSLA", "TXN", "UNH", "UNP", "UPS", "USB", "V", "VZ", "WFC",
  "WMT", "XOM", "SPY", "QQQ", "IWM", "DIA",
];

export const AU_UNIVERSE: string[] = ASX_XAO;

export const RO_UNIVERSE: string[] = [
  "TLV.RO", "SNP.RO", "SNG.RO", "SNN.RO", "BRD.RO", "FP.RO", "H2O.RO",
  "DIGI.RO", "EL.RO", "TGN.RO", "TEL.RO", "M.RO", "ONE.RO", "TRP.RO",
  "WINE.RO", "AQ.RO", "ATB.RO", "EBS.RO", "BVB.RO", "SFG.RO", "ALR.RO",
  "COTE.RO", "TTS.RO", "SIF1.RO", "SIF2.RO", "SIF4.RO", "SIF5.RO", "BRK.RO",
  "IMP.RO", "IAB.RO", "CMP.RO", "PEI.RO", "SAFE.RO", "RMAH.RO",
];

const CA_EXTRA: string[] = [
  "AC.TO", "AGI.TO", "AIF.TO", "AQN.TO", "ARX.TO", "ATH.TO", "ATZ.TO", "BB.TO",
  "BHC.TO", "BTO.TO", "BTE.TO", "CAE.TO", "CAR-UN.TO", "CG.TO", "CHR.TO", "CIGI.TO",
  "CLS.TO", "DCBO.TO", "DOO.TO", "DSG.TO", "EFX.TO", "EIF.TO", "ELD.TO", "EMP-A.TO",
  "EQX.TO", "ERF.TO", "FFH.TO", "FM.TO", "FNV.TO", "FTS.TO", "GIL.TO", "GOOS.TO",
  "GRT-UN.TO", "GWO.TO", "H.TO", "HBM.TO", "HR-UN.TO", "HWX.TO", "IFC.TO", "IGM.TO",
  "IMO.TO", "K.TO", "KEY.TO", "KXS.TO", "L.TO", "LAC.TO", "LSPD.TO", "LUN.TO",
  "MDA.TO", "MEG.TO", "MFC.TO", "MRU.TO", "NA.TO", "NFI.TO", "NTR.TO", "NWC.TO",
  "NXE.TO", "OGC.TO", "ONEX.TO", "OTEX.TO", "OVV.TO", "PAAS.TO", "PBH.TO", "PD.TO",
  "PEY.TO", "POW.TO", "PPL.TO", "PSI.TO", "PSK.TO", "QBR-B.TO", "QSR.TO", "RCI-B.TO",
  "REI-UN.TO", "SAP.TO", "SCL.TO", "SES.TO", "SJR-B.TO", "SLF.TO", "SRU-UN.TO",
  "STN.TO", "T.TO", "TAC.TO", "TECK-B.TO", "TFII.TO", "TIH.TO", "TOU.TO", "TRI.TO",
  "VET.TO", "WCN.TO", "WCP.TO", "WEED.TO", "WN.TO", "WPM.TO", "WSP.TO", "X.TO",
  "YRI.TO",
];

const FR_EXTRA: string[] = [
  "ADP.PA", "ALO.PA", "AM.PA", "ATE.PA", "BOL.PA", "CO.PA", "COV.PA", "DBG.PA",
  "DEC.PA", "ELIS.PA", "ETL.PA", "FNAC.PA", "IPN.PA", "LBIRD.PA", "MMB.PA",
  "NEX.PA", "NRO.PA", "NXI.PA", "RF.PA", "RUI.PA", "SCR.PA", "SK.PA", "SPIE.PA",
  "TFF.PA", "TKO.PA", "VCT.PA", "VK.PA", "VRLA.PA", "WLN.PA",
];

const DE_EXTRA: string[] = [
  "FME.DE", "FRE.DE", "HEN3.DE", "SY1.DE", "G1A.DE", "LXS.DE", "SDF.DE", "TKA.DE",
  "LEG.DE", "VNA.DE", "HOT.DE", "KRN.DE", "NDX1.DE", "PSM.DE", "TEG.DE", "WCH.DE",
  "ZAL.DE", "HFG.DE", "SHL.DE", "PUM.DE", "1U1.DE", "AFX.DE", "BC8.DE", "EVD.DE",
  "DHER.DE", "LHA.DE", "FNTN.DE", "SAX.DE", "BOSS.DE", "GXI.DE",
];

function packLists(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

export const UK_UNIVERSE: string[] = packLists(UK_FTSE100, UK_FTSE250);

export const CA_UNIVERSE: string[] = packLists(CA_TSX60, CA_EXTRA);

export const DE_UNIVERSE: string[] = packLists(DE_DAX, DE_MDAX, DE_EXTRA);

export const FR_UNIVERSE: string[] = packLists(FR_CAC40, FR_CAC_NEXT20, FR_EXTRA);

export const JP_UNIVERSE: string[] = [
  "7203.T", "6758.T", "9984.T", "8306.T", "6861.T", "6098.T", "4063.T",
  "8035.T", "9432.T", "9983.T", "7267.T", "6902.T", "4502.T", "7974.T",
];

export const HK_UNIVERSE: string[] = [
  "0700.HK", "9988.HK", "3690.HK", "1299.HK", "0941.HK", "0005.HK",
  "0388.HK", "1810.HK", "2318.HK", "1398.HK", "0939.HK", "1211.HK",
];

const BY_COUNTRY: Record<Exclude<CountryId, "all">, string[]> = {
  us: US_UNIVERSE,
  au: AU_UNIVERSE,
  ro: RO_UNIVERSE,
  uk: UK_UNIVERSE,
  ca: CA_UNIVERSE,
  de: DE_UNIVERSE,
  fr: FR_UNIVERSE,
  jp: JP_UNIVERSE,
  hk: HK_UNIVERSE,
};

/** @deprecated folosește CountryId */
export type MarketId = CountryId;

export function universeFor(
  market: CountryId,
  usCap: UsCapId = "sp500",
): string[] {
  const usList =
    usCap === "sp400"
      ? SP400_UNIVERSE
      : usCap === "sp600"
        ? SP600_UNIVERSE
        : usCap === "biotech"
          ? BIOTECH_UNIVERSE
          : usCap === "micro"
            ? MICRO_UNIVERSE
            : SP500_UNIVERSE;
  if (market === "us") return [...new Set(usList)];
  if (market === "all") {
    const rest = COUNTRIES.filter((c) => c.id !== "us").flatMap(
      (c) => BY_COUNTRY[c.id],
    );
    return [...new Set([...usList, ...rest])];
  }
  return [...new Set(BY_COUNTRY[market])];
}
