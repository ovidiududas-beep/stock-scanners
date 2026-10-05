export type Tone = "good" | "bad" | "plain";

export function toneAtLeast(n: number | null | undefined, floor: number): Tone {
  if (n == null || !Number.isFinite(n)) return "plain";
  return n >= floor ? "good" : "bad";
}

export function toneAtMost(n: number | null | undefined, ceiling: number): Tone {
  if (n == null || !Number.isFinite(n) || n <= 0) return "plain";
  return n <= ceiling ? "good" : "bad";
}

export function toneSet(n: number): Tone {
  return n === 0 ? "bad" : "good";
}

/** PEG: sub 1 ieftin, peste 2 scump, între ele neutră. */
export function tonePeg(n: number | null | undefined): Tone {
  if (n == null || !Number.isFinite(n) || n <= 0) return "plain";
  if (n > 2) return "bad";
  if (n <= 1) return "good";
  return "plain";
}

export function toneClass(tone: Tone): string {
  return tone === "plain" ? "" : `tone-${tone}`;
}
