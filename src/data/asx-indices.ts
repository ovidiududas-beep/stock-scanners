/** S&P/ASX și All Ordinaries → Yahoo `.AX`. Nested: 50 ⊂ 100 ⊂ 200 ⊂ 300 ⊂ XAO. */

function ax(codes: string[]): string[] {
  return [...new Set(codes.map((c) => `${c.trim().toUpperCase()}.AX`))];
}

/** S&P/ASX 50 (fără ETF-uri). */
export const ASX_50: string[] = ax([
  "ALL", "AMC", "ANZ", "APA", "BHP", "BXB", "CAR", "CBA", "COH", "COL",
  "CPU", "CSL", "EVN", "FMG", "FPH", "GMG", "IAG", "JBH", "JHX", "LYC",
  "MPL", "MQG", "NAB", "NEM", "NST", "NWS", "ORG", "PME", "QAN", "QBE",
  "REA", "RIO", "RMD", "S32", "SCG", "SGH", "SGP", "SIG", "SOL", "STO",
  "SUN", "TCL", "TLS", "WBC", "WDS", "WES", "WOW", "WTC", "XRO", "XYZ",
]);

const ASX_100_REST: string[] = ax([
  "AFI", "AGL", "AIA", "ALD", "ALQ", "ALX", "ANN", "APE", "ARG", "ASX",
  "AUB", "AZJ", "BEN", "BSL", "CDA", "CGF", "CHC", "CMM", "DNL", "DXS",
  "EDV", "GMD", "GPT", "GQG", "HUB", "HVN", "IFT", "IGO", "MCY", "MEZ",
  "MIN", "MGR", "NXT", "ORI", "PLS", "PRU", "QUB", "REH", "RMS", "SFR",
  "SHL", "TNE", "TLC", "TPG", "VCX", "WGX", "WHC", "WOR", "YAL", "VAU",
]);

/** S&P/ASX 100 = ASX 50 + următoarele 50. */
export const ASX_100: string[] = [...new Set([...ASX_50, ...ASX_100_REST])];

/** S&P/ASX 200 — benchmark principal (Wikipedia, apr. 2026). */
export const ASX_200: string[] = ax([
  "360", "4DX", "A2M", "AAI", "AFI", "AGL", "AIA", "ALD", "ALK", "ALL",
  "ALQ", "ALX", "AMC", "AMP", "ANN", "ANZ", "APA", "APE", "ARB", "ARG",
  "ASB", "ASK", "ASX", "AUB", "AZJ", "BEN", "BFL", "BGA", "BGL", "BHP",
  "BOQ", "BPT", "BRG", "BSL", "BWP", "BXB", "CAR", "CBA", "CDA", "CEN",
  "CGF", "CHC", "CIA", "CIP", "CLW", "CMM", "CNU", "COH", "COL", "CPU",
  "CQR", "CSC", "CSL", "CTD", "CWY", "CYL", "DBI", "DNL", "DOW", "DRO",
  "DRR", "DXS", "DYL", "EBO", "EDV", "EMR", "EOS", "EVN", "EVT", "FBU",
  "FLT", "FMG", "FPH", "FRW", "GDG", "GGP", "GMD", "GMG", "GNE", "GPT",
  "GQG", "HDN", "HUB", "HVN", "IAG", "IFL", "IFT", "IGO", "ILU", "IMD",
  "JBH", "JHX", "L1G", "LLC", "LNW", "LOV", "LSF", "LTR", "LYC", "MCY",
  "MEZ", "MFF", "MFG", "MGR", "MIN", "MND", "MPL", "MQG", "MSB", "MTS",
  "MXT", "NAB", "NEM", "NHC", "NHF", "NIC", "NSR", "NST", "NWH", "NWL",
  "NWS", "NXG", "NXT", "OBM", "ORA", "ORG", "ORI", "PDI", "PDN", "PLS",
  "PME", "PMV", "PNI", "PPT", "PRN", "PRU", "PXA", "QAN", "QBE", "QUB",
  "RDX", "REA", "REG", "REH", "RGN", "RHC", "RIO", "RMD", "RMS", "RRL",
  "RSG", "RWC", "RYM", "S32", "SCG", "SDF", "SEK", "SFR", "SGH", "SGM",
  "SGP", "SHL", "SIG", "SMR", "SNZ", "SOL", "SPK", "STO", "SUL", "SUN",
  "TAH", "TCL", "TLC", "TLS", "TLX", "TNE", "TPG", "TUA", "TWE", "VAU",
  "VCX", "VEA", "VGN", "VNT", "WAF", "WAM", "WBC", "WDS", "WES", "WGX",
  "WHC", "WLE", "WOR", "WOW", "WTC", "XRO", "XYZ", "YAL", "ZIM", "ZIP",
]);

const ASX_300_REST: string[] = ax([
  "A4N", "AAC", "ABB", "ABG", "ADT", "AIZ", "AOV", "ARF", "AUI", "AX1",
  "BAP", "BCI", "BKI", "BKW", "BOE", "BOT", "BGP", "BVS", "CBO", "CCP",
  "CIN", "CKF", "CMW", "CNI", "CQE", "CU6", "DDR", "DGT", "DHG", "DJW",
  "DMP", "DTL", "DUI", "DVP", "DXI", "ELD", "EQT", "FCL", "GCI", "GEM",
  "GNC", "GOR", "GOZ", "GTK", "GYG", "HLI", "HLS", "HMC", "HSN", "IDX",
  "IEL", "INA", "ING", "IPH", "IPX", "IRE", "JDO", "KAR", "KLS", "LFG",
  "LFS", "LIC", "MAD", "MAF", "MAQ", "MGH", "MMS", "MP1", "MYR", "NAN",
  "NCK", "NEC", "NEU", "NGI", "NUF", "NXL", "OCL", "OML", "OPT", "PGF",
  "PL8", "PNR", "PNV", "PPC", "PPM", "QAL", "QRI", "RIC", "RPL", "SDR",
  "SIQ", "SLC", "SLX", "SNL", "SPR", "SRG", "SSM", "SX2", "TPW", "VGL",
  "VSL", "VUL", "WA1", "WEB", "WGB", "WPR",
  "AYA", "BNZ", "BRE", "CCL", "CXO", "EIQ", "EQR", "GNG", "GNP", "IMR",
  "LIN", "PYC", "SKS", "SXE", "TEA",
]);

/** S&P/ASX 300 = ASX 200 + small-cap lichide + rebalansare sept. 2026. */
export const ASX_300: string[] = [...new Set([...ASX_200, ...ASX_300_REST])];

const ASX_XAO_REST: string[] = ax([
  "29M", "5EA", "AD8", "AGE", "AHX", "AKE", "ALC", "ALU", "AMA", "AMI",
  "AMS", "AON", "APX", "AS1", "ASL", "AUK", "AVH", "AWC", "AX8", "AZY",
  "BCB", "BDM", "BET", "BIT", "BKL", "BKY", "BNL", "BOC", "BRL", "BTH",
  "BUB", "C79", "CAJ", "CAZ", "CCV", "CCR", "CDX", "CHL", "CHN", "CIM",
  "CKA", "CLV", "CLX", "CNB", "COE", "COG", "CRB", "CRN", "CTM", "CTN",
  "CUV", "CVN", "CWX", "CXL", "DC2", "DCG", "DEG", "DME", "DNK", "DUB",
  "DUG", "DZL", "E25", "EGG", "EHL", "ELT", "ENN", "ENR", "EPY", "EQN",
  "ERA", "EVR", "FAR", "FBR", "FEL", "FEX", "FND", "FSF", "FSG", "G11",
  "GAP", "GCY", "GDI", "GHY", "GLL", "GLN", "GTR", "GWA", "HAS", "HCH",
  "HGO", "HLO", "HMY", "HTA", "HXG", "ICN", "IDT", "IGL", "IHL", "IMA",
  "IMM", "IND", "INR", "IPL", "IMU", "IVR", "IVZ", "JAY", "JIN", "JRV",
  "KGN", "KLR", "KMD", "KZR", "LAM", "LCY", "LKE", "LPI", "LRS", "LYL",
  "M24", "MAU", "MDR", "MEI", "MEK", "MGX", "MLT", "MLX", "MM8", "MMI",
  "MNB", "MNS", "MOZ", "MRM", "MWY", "MXR", "MYE", "MYX", "NAM", "NEA",
  "NMT", "NTO", "NVX", "NXS", "NZM", "OBL", "OMH", "PAR", "PCI", "PDL",
  "PEK", "PEN", "PGY", "PLY", "PNN", "POS", "PPH", "PRX", "PSI", "PTM",
  "PWH", "QFE", "QHL", "QOR", "R3D", "RCR", "RD1", "RDN", "RED", "RMC",
  "RNU", "RXL", "S3N", "SBM", "SDG", "SFM", "SHN", "SLR", "SSG", "STX",
  "SVL", "SYA", "SYR", "TDO", "TER", "TG6", "TIE", "TLG", "TLM", "TMR",
  "TNG", "TOK", "TRA", "TSO", "TTM", "TUL", "TVN", "TZN", "VBX", "VML",
  "VRX", "WAK", "WBT", "WJL", "WNX", "WR1", "WWI", "X64", "YOW", "YRL",
  "Z2U", "ZNC",
]);

/** All Ordinaries (XAO) — ASX 300 plus restul pieței All Ords. */
export const ASX_XAO: string[] = [...new Set([...ASX_300, ...ASX_XAO_REST])];
