import {
  LiveSettingsSchema,
  loadConfig,
  type AppConfig,
  type LiveSettings,
} from "./schema";

export const appConfig: AppConfig = loadConfig({
  appName: "Stock Scanners",
  market: {
    watchlist: [
      "SPY",
      "QQQ",
      "IWM",
      "AAPL",
      "MSFT",
      "NVDA",
      "AMZN",
      "GOOGL",
      "META",
      "TSLA",
      "AMD",
      "AVGO",
      "JPM",
      "XOM",
      "GLD",
    ],
    defaultPeriod: "day",
    scanDelayMs: 80,
  },
  accumulation: {},
  features: {
    allowCustomTickers: true,
    maxItemsPerPage: 20,
    darkModeAllowed: true,
  },
  theme: {
    primaryColor: "#1d4ed8",
    borderRadius: "10px",
  },
});

export function defaultLiveSettings(): LiveSettings {
  return LiveSettingsSchema.parse({});
}

export function applyLiveSettings(
  config: AppConfig,
  live: LiveSettings,
): AppConfig {
  return {
    ...config,
    accumulation: {
      ...config.accumulation,
      minScore: live.minScore,
      requireAboveZone: false,
    },
  };
}
