import { LiveSettingsSchema, type LiveSettings } from "./schema";
import { defaultLiveSettings } from "./default";

const STORAGE_KEY = "stock-scanners:live-settings";

export function loadLiveSettings(): LiveSettings {
  const fallback = defaultLiveSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    return LiveSettingsSchema.parse({
      ...fallback,
      ...parsed,
      minCurrentVolume: 0,
      minChangeFromOpenPct: 0,
      minAtrPct: 0,
      maxPrice: 0,
      maxShortInterestChangePct:
        (parsed as { maxShortInterestChangePct?: number | null })
          .maxShortInterestChangePct === 0
          ? null
          : (parsed as { maxShortInterestChangePct?: number | null })
              .maxShortInterestChangePct ?? null,
    });
  } catch {
    return fallback;
  }
}

export function saveLiveSettings(settings: LiveSettings): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(LiveSettingsSchema.parse(settings)),
  );
}
