import type { AccumulationParams } from "../config/schema";
import type { Candle, VolumeCompareDay } from "./market";

export type ScoreBreakdown = {
  tightness: number;
  demand: number;
  location: number;
  stealth: number;
  bounce: number;
  volume: number;
};

export type AccumulationHit = {
  symbol: string;
  score: number;
  zoneLow: number;
  zoneHigh: number;
  lastClose: number;
  changePct: number;
  reasons: string[];
  closes: number[];
  times: number[];
  gmtOffset?: number;
  candlesUsed: number;
  belowZone: boolean;
  passedScanFilter: boolean;
  breakdown: ScoreBreakdown;
  volumeRatio: number;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  currentVolume: number;
  averageVolume: number;
  averageVolume3d: number;
  averageVolume5d: number;
  averageVolume10d: number;
  averageVolume1m: number;
  averageVolume3m: number;
  priceChange3dPct: number | null;
  priceChange5dPct: number | null;
  priceChange10dPct: number | null;
  priceChange1mPct: number | null;
  priceChange3mPct: number | null;
  changeFromOpenPct: number | null;
  priceChangePct: number | null;
  atr: number;
  atrPct: number;
  price: number;
  asOfDate?: string;
  dataSource: string;
  lastDataAt?: number;
  priceAt?: number;
  rvolAt?: number;
  dataInterval?: string;
  liveDay?: boolean;
  companyName: string | null;
  companySector: string | null;
  companyIndustry: string | null;
  companySummary: string | null;
  shortPercentOfFloat: number | null;
  shortInterestChangePct: number | null;
  shortVolumeRatio: number | null;
  daysToCover: number | null;
  volumeDays?: VolumeCompareDay[];
};

function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const den = n * sumXX - sumX * sumX;
  if (den === 0) return 0;
  return (n * sumXY - sumX * sumY) / den;
}

function obvSeries(candles: Candle[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const dir = Math.sign(candles[i].c - candles[i - 1].c);
    out.push(out[i - 1] + dir * candles[i].v);
  }
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function analyzeAccumulation(
  symbol: string,
  candles: Candle[],
  params: AccumulationParams,
): AccumulationHit | null {
  if (candles.length < params.minCandles) return null;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const closes = candles.map((c) => c.c);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const span = rangeHigh - rangeLow;
  if (span <= 0) return null;

  const bins = params.priceBins;
  const volumes = new Array<number>(bins).fill(0);
  let totalVol = 0;
  for (const c of candles) {
    const typical = (c.h + c.l + c.c) / 3;
    const idx = clamp(
      Math.floor(((typical - rangeLow) / span) * bins),
      0,
      bins - 1,
    );
    volumes[idx] += c.v;
    totalVol += c.v;
  }
  if (totalVol <= 0) return null;

  let poc = 0;
  for (let i = 1; i < bins; i++) {
    if (volumes[i] > volumes[poc]) poc = i;
  }

  let loBin = poc;
  let hiBin = poc;
  let covered = volumes[poc];
  const target = totalVol * params.valueAreaVolume;
  while (covered < target) {
    const left = loBin > 0 ? volumes[loBin - 1] : -1;
    const right = hiBin < bins - 1 ? volumes[hiBin + 1] : -1;
    if (left < 0 && right < 0) break;
    if (left >= right) {
      loBin -= 1;
      covered += volumes[loBin];
    } else {
      hiBin += 1;
      covered += volumes[hiBin];
    }
  }

  const zoneLow = rangeLow + (loBin / bins) * span;
  const zoneHigh = rangeLow + ((hiBin + 1) / bins) * span;
  const last = candles[candles.length - 1];
  const first = candles[0];
  const lastClose = last.c;
  const changePct = ((lastClose - first.c) / first.c) * 100;
  const pocPos = (poc + 0.5) / bins;

  const meanClose = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance =
    closes.reduce((a, b) => a + (b - meanClose) ** 2, 0) / closes.length;
  const tightness =
    1 - clamp(Math.sqrt(variance) / meanClose / params.tightnessScale, 0, 1);

  const priceDrift = Math.abs(lastClose - first.c) / first.c;
  const obv = obvSeries(candles);
  const obvNorm = Math.abs(obv[obv.length - 1]) || 1;
  const obvSlope = slope(obv.map((v) => v / obvNorm));
  const stealth = obvSlope > 0 && priceDrift <= params.maxPriceDrift;

  const inZone =
    lastClose >= zoneLow && lastClose <= zoneHigh * (1 + params.inZoneBuffer);
  const heldAbove = lastClose >= zoneLow;
  const demandLow = pocPos <= params.demandPocMax;

  let touches = 0;
  const mid = (zoneLow + zoneHigh) / 2;
  for (const c of candles) {
    const wickInZone =
      c.l <= zoneHigh && c.l >= zoneLow * params.wickLowSlack;
    if (wickInZone && c.c > mid) touches += 1;
  }
  const bounce = clamp(
    touches / Math.max(params.bounceFloor, candles.length * params.bounceShare),
    0,
    1,
  );

  const avgVol = candles.reduce((a, c) => a + c.v, 0) / candles.length;
  const recentN = Math.max(
    params.recentMinBars,
    Math.floor(candles.length * params.recentShare),
  );
  const recent = candles.slice(-recentN);
  const recentVol = recent.reduce((a, c) => a + c.v, 0) / recent.length;
  const dryUpThenSupport =
    recentVol < avgVol * params.dryUpRatio && heldAbove
      ? params.dryUpScore
      : recentVol > avgVol * params.volumeSpikeRatio && inZone
        ? params.spikeInZoneScore
        : params.volumeNeutralScore;

  const breakdown: ScoreBreakdown = {
    tightness: tightness * params.weightTightness,
    demand: demandLow ? params.weightDemandHigh : params.weightDemandLow,
    location: inZone
      ? params.weightInZone
      : heldAbove
        ? params.weightHeldAbove
        : 0,
    stealth: stealth
      ? params.weightStealth
      : Math.max(0, obvSlope) * params.weightObvSlope,
    bounce: bounce * params.weightBounce,
    volume: dryUpThenSupport * params.weightVolume,
  };

  let score = 0;
  for (const part of Object.values(breakdown)) score += part;
  score = Math.round(clamp(score, 0, 100));

  const reasons: string[] = [];
  if (demandLow) reasons.push("Volume concentrated in the lower half (demand)");
  if (tightness > params.tightnessReason)
    reasons.push("Tight range — consolidation");
  if (stealth) reasons.push("OBV rising, price flat — stealth accumulation");
  if (inZone) reasons.push("Price still in the zone");
  else if (heldAbove) reasons.push("Price holding above the zone");
  else reasons.push("Price below the volume zone — weak or invalid accumulation");
  if (touches >= params.bounceReasonTouches)
    reasons.push(`${touches} support touches in the zone`);
  if (dryUpThenSupport > params.dryUpReason)
    reasons.push("Recent volume drier, support held");
  if (reasons.length === 0) reasons.push("Mixed signal — see component scores");

  const passedScanFilter =
    score >= params.minScore && (!params.requireAboveZone || heldAbove);

  return {
    symbol,
    score,
    zoneLow,
    zoneHigh,
    lastClose,
    changePct,
    reasons,
    closes,
    times: candles.map((c) => c.t),
    gmtOffset: undefined,
    candlesUsed: candles.length,
    belowZone: !heldAbove,
    passedScanFilter,
    breakdown,
    volumeRatio: 0,
    marketCap: null,
    trailingPE: null,
    forwardPE: null,
    pegRatio: null,
    currentVolume: 0,
    averageVolume: 0,
    averageVolume3d: 0,
    averageVolume5d: 0,
    averageVolume10d: 0,
    averageVolume1m: 0,
    averageVolume3m: 0,
    priceChange3dPct: null,
    priceChange5dPct: null,
    priceChange10dPct: null,
    priceChange1mPct: null,
    priceChange3mPct: null,
    changeFromOpenPct: null,
    priceChangePct: null,
    atr: 0,
    atrPct: 0,
    price: lastClose,
    asOfDate: undefined,
    dataSource: "Yahoo Finance",
    lastDataAt: undefined,
    priceAt: last.t,
    rvolAt: undefined,
    dataInterval: undefined,
    liveDay: undefined,
    companyName: null,
    companySector: null,
    companyIndustry: null,
    companySummary: null,
    shortPercentOfFloat: null,
    shortInterestChangePct: null,
    shortVolumeRatio: null,
    daysToCover: null,
    volumeDays: undefined,
  };
}

export function detectAccumulation(
  symbol: string,
  candles: Candle[],
  params: AccumulationParams,
): AccumulationHit | null {
  const hit = analyzeAccumulation(symbol, candles, params);
  if (!hit?.passedScanFilter) return null;
  return hit;
}
