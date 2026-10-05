import { COUNTRIES, type CountryId } from "../data/universes";

type Hours = {
  timeZone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
};

const HOURS: Record<Exclude<CountryId, "all">, Hours> = {
  us: { timeZone: "America/New_York", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0 },
  au: { timeZone: "Australia/Sydney", openHour: 10, openMinute: 0, closeHour: 16, closeMinute: 0 },
  ro: { timeZone: "Europe/Bucharest", openHour: 10, openMinute: 0, closeHour: 17, closeMinute: 45 },
  uk: { timeZone: "Europe/London", openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 },
  ca: { timeZone: "America/Toronto", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0 },
  de: { timeZone: "Europe/Berlin", openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 30 },
  fr: { timeZone: "Europe/Paris", openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 30 },
  jp: { timeZone: "Asia/Tokyo", openHour: 9, openMinute: 0, closeHour: 15, closeMinute: 0 },
  hk: { timeZone: "Asia/Hong_Kong", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0 },
};

type Zoned = {
  weekday: string;
  year: number;
  month: number;
  day: number;
  minutes: number;
};

function zoned(now: Date, timeZone: string): Zoned {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    weekday: get("weekday"),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    minutes: hour * 60 + minute,
  };
}

function hoursFor(country: CountryId): Hours {
  return country === "all" ? HOURS.us : HOURS[country];
}

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Regular-session open/close on an exchange calendar day (Yahoo gmtoffset). */
export function cashSessionBells(
  country: CountryId,
  dayISO: string,
  gmtOffsetSec: number,
): { openMs: number; closeMs: number; openLabel: string; closeLabel: string } {
  const spec = hoursFor(country);
  const [y, mo, da] = dayISO.split("-").map(Number);
  const openMs =
    Date.UTC(y!, (mo ?? 1) - 1, da ?? 1, spec.openHour, spec.openMinute) -
    gmtOffsetSec * 1000;
  const closeMs =
    Date.UTC(y!, (mo ?? 1) - 1, da ?? 1, spec.closeHour, spec.closeMinute) -
    gmtOffsetSec * 1000;
  return {
    openMs,
    closeMs,
    openLabel: hhmm(spec.openHour, spec.openMinute),
    closeLabel: hhmm(spec.closeHour, spec.closeMinute),
  };
}

function isoOf(z: Pick<Zoned, "year" | "month" | "day">): string {
  return `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;
}

export function sessionDayISO(country: CountryId, now = new Date()): string {
  if (country === "all") {
    const open = COUNTRIES.find((c) => marketIsOpenNow(c.id, now));
    const tz = open ? HOURS[open.id].timeZone : HOURS.us.timeZone;
    return isoOf(zoned(now, tz));
  }
  return isoOf(zoned(now, HOURS[country].timeZone));
}

function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

function marketIsOpenNow(
  country: Exclude<CountryId, "all">,
  now: Date,
): boolean {
  const spec = HOURS[country];
  const clock = zoned(now, spec.timeZone);
  if (isWeekend(clock.weekday)) return false;
  const open = spec.openHour * 60 + spec.openMinute;
  const close = spec.closeHour * 60 + spec.closeMinute;
  return clock.minutes >= open && clock.minutes < close;
}

/** Regular cash session is in progress for the selected country. */
export function regularSessionIsOpen(
  country: CountryId,
  now = new Date(),
): boolean {
  if (country === "all") {
    return COUNTRIES.some((c) => marketIsOpenNow(c.id, now));
  }
  return marketIsOpenNow(country, now);
}

function shiftCalendarDay(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number; weekday: string } {
  const utc = Date.UTC(year, month - 1, day + delta, 12, 0, 0);
  const d = new Date(utc);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday,
  };
}

function previousWeekday(
  year: number,
  month: number,
  day: number,
): { year: number; month: number; day: number } {
  let cur = shiftCalendarDay(year, month, day, -1);
  while (isWeekend(cur.weekday)) {
    cur = shiftCalendarDay(cur.year, cur.month, cur.day, -1);
  }
  return cur;
}

/** Most recent completed cash session date (YYYY-MM-DD) in that market. */
export function lastTradingDayISO(
  country: CountryId,
  now = new Date(),
): string {
  const spec = hoursFor(country);
  const clock = zoned(now, spec.timeZone);
  if (isWeekend(clock.weekday)) {
    return isoOf(previousWeekday(clock.year, clock.month, clock.day));
  }
  const open = spec.openHour * 60 + spec.openMinute;
  if (clock.minutes < open) {
    return isoOf(previousWeekday(clock.year, clock.month, clock.day));
  }
  if (regularSessionIsOpen(country === "all" ? "us" : country, now)) {
    return isoOf(previousWeekday(clock.year, clock.month, clock.day));
  }
  return isoOf(clock);
}
