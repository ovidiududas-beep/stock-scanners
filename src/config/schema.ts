import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Culoare hex invalidă");

export const ScanPeriodSchema = z.enum([
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);

/** Motor intern — nu se editează din UI. */
export const AccumulationParamsSchema = z.object({
  minCandles: z.number().int().min(8).max(200).default(16),
  priceBins: z.number().int().min(8).max(64).default(24),
  valueAreaVolume: z.number().min(0.4).max(0.95).default(0.7),
  minScore: z.number().min(0).max(100).default(55),
  requireAboveZone: z.boolean().default(true),
  maxPriceDrift: z.number().min(0).max(0.8).default(0.12),
  tightnessScale: z.number().min(0.005).max(0.2).default(0.04),
  tightnessReason: z.number().min(0).max(1).default(0.55),
  demandPocMax: z.number().min(0.2).max(1).default(0.62),
  inZoneBuffer: z.number().min(0).max(0.1).default(0.01),
  wickLowSlack: z.number().min(0.9).max(1).default(0.995),
  bounceShare: z.number().min(0.02).max(0.4).default(0.08),
  bounceFloor: z.number().int().min(1).max(20).default(3),
  bounceReasonTouches: z.number().int().min(1).max(20).default(2),
  recentShare: z.number().min(0.05).max(0.5).default(0.2),
  recentMinBars: z.number().int().min(2).max(30).default(4),
  dryUpRatio: z.number().min(0.3).max(1.2).default(0.9),
  volumeSpikeRatio: z.number().min(0.8).max(3).default(1.15),
  dryUpScore: z.number().min(0).max(1).default(1),
  spikeInZoneScore: z.number().min(0).max(1).default(0.6),
  volumeNeutralScore: z.number().min(0).max(1).default(0.3),
  dryUpReason: z.number().min(0).max(1).default(0.8),
  weightTightness: z.number().min(0).max(50).default(22),
  weightDemandHigh: z.number().min(0).max(50).default(18),
  weightDemandLow: z.number().min(0).max(50).default(6),
  weightInZone: z.number().min(0).max(50).default(16),
  weightHeldAbove: z.number().min(0).max(50).default(10),
  weightStealth: z.number().min(0).max(50).default(20),
  weightObvSlope: z.number().min(0).max(50).default(10),
  weightBounce: z.number().min(0).max(50).default(14),
  weightVolume: z.number().min(0).max(50).default(10),
});

/** Filtre din UI. 0 / gol = fără filtru. */
export const LiveSettingsSchema = z.object({
  volumeMultiple: z.number().min(0).max(50).default(0),
  minCurrentVolume: z.number().min(0).max(1_000_000_000).default(0),
  minChangeFromOpenPct: z.number().min(-100).max(500).default(0),
  minAtrPct: z.number().min(0).max(50).default(0),
  minPrice: z.number().min(0).max(1_000_000).default(0),
  maxPrice: z.number().min(0).max(1_000_000).default(0),
  minMarketCapM: z.number().min(0).max(5_000_000).default(0),
  minScore: z.number().min(0).max(100).default(0),
  maxShortInterestChangePct: z
    .number()
    .min(-200)
    .max(500)
    .nullable()
    .default(null),
});

export const AppConfigSchema = z.object({
  appName: z.string().min(1).default("Stock Scanners"),
  market: z.object({
    watchlist: z.array(z.string().min(1)).min(1),
    defaultPeriod: ScanPeriodSchema.default("day"),
    scanDelayMs: z.number().int().min(0).max(2000).default(80),
  }),
  accumulation: AccumulationParamsSchema,
  features: z.object({
    allowCustomTickers: z.boolean().default(true),
    maxItemsPerPage: z.number().int().min(5).max(200).default(20),
    darkModeAllowed: z.boolean().default(true),
  }),
  theme: z.object({
    primaryColor: hexColor.default("#3d7a5a"),
    borderRadius: z.string().default("10px"),
  }),
});

export type ScanPeriod = z.infer<typeof ScanPeriodSchema>;
export type AccumulationParams = z.infer<typeof AccumulationParamsSchema>;
export type LiveSettings = z.infer<typeof LiveSettingsSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(raw: unknown): AppConfig {
  return AppConfigSchema.parse(raw);
}
