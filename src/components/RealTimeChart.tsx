import { useState } from "react";
import type { RealTimeSnapshot } from "../lib/realtime";
import { exchangeDayISO } from "../lib/market";
import { cashSessionBells } from "../lib/market-hours";
import { volLabel, volumeTicks } from "./PreMarketVolumeChart";
import { InfoTip } from "./InfoTip";

type Props = {
  snap: RealTimeSnapshot;
};

type LiveWindow = 1 | 3 | 5;

const LIVE_WINDOWS: { days: LiveWindow; label: string }[] = [
  { days: 5, label: "5 days" },
  { days: 3, label: "3 days" },
  { days: 1, label: "Today" },
];

function sliceToWindow(
  snap: RealTimeSnapshot,
  days: LiveWindow,
): { times: number[]; prices: number[]; volumes: number[] } {
  const sessions = sessionRanges(snap.times, snap.gmtOffset);
  const keep = sessions.slice(-days);
  if (keep.length === 0) {
    return { times: [], prices: [], volumes: [] };
  }
  const a = keep[0]!.startI;
  const b = keep[keep.length - 1]!.endI;
  return {
    times: snap.times.slice(a, b + 1),
    prices: snap.prices.slice(a, b + 1),
    volumes: snap.volumes.slice(a, b + 1),
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtPrice(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function exchangeParts(t: number, gmtOffsetSec: number) {
  const d = new Date(t + gmtOffsetSec * 1000);
  return {
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    hh: String(d.getUTCHours()).padStart(2, "0"),
    mm: String(d.getUTCMinutes()).padStart(2, "0"),
    ss: String(d.getUTCSeconds()).padStart(2, "0"),
  };
}

function sameDay(a: number, b: number, gmt: number): boolean {
  const pa = exchangeParts(a, gmt);
  const pb = exchangeParts(b, gmt);
  return pa.day === pb.day && pa.m === pb.m;
}

function xAtTime(
  t: number,
  times: number[],
  xOf: (i: number) => number,
): number {
  if (times.length === 0) return xOf(0);
  if (t <= times[0]!) return xOf(0);
  const last = times.length - 1;
  if (t >= times[last]!) return xOf(last);
  for (let i = 1; i < times.length; i++) {
    if (t <= times[i]!) {
      const a = times[i - 1]!;
      const b = times[i]!;
      const r = (t - a) / (b - a || 1);
      return xOf(i - 1) + r * (xOf(i) - xOf(i - 1));
    }
  }
  return xOf(last);
}

function sessionRanges(times: number[], gmt: number): { startI: number; endI: number }[] {
  if (times.length === 0) return [];
  const out: { startI: number; endI: number }[] = [];
  let startI = 0;
  for (let i = 1; i < times.length; i++) {
    if (!sameDay(times[i]!, times[i - 1]!, gmt)) {
      out.push({ startI, endI: i - 1 });
      startI = i;
    }
  }
  out.push({ startI, endI: times.length - 1 });
  return out;
}

function formatDay(t: number, gmt: number): string {
  const p = exchangeParts(t, gmt);
  return `${p.day} ${MONTHS[p.m]}`;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RealTimeChart({ snap }: Props) {
  const [windowDays, setWindowDays] = useState<LiveWindow>(5);
  const view = sliceToWindow(snap, windowDays);
  const n = view.prices.length;
  const gmt = snap.gmtOffset;
  const windowLabel =
    windowDays === 1 ? "Today" : `Last ${windowDays} sessions`;

  const toolbar = (
    <div className="live-toolbar">
      <p className="live-readout">
        <span key={snap.updatedAt} className="live-flash">
          {fmtPrice(snap.price)} · {formatClock(snap.updatedAt)}
        </span>
      </p>
      <div className="periods" role="group" aria-label="Live window">
        {LIVE_WINDOWS.map((w) => (
          <button
            key={w.days}
            type="button"
            className={w.days === windowDays ? "chip on" : "chip"}
            onClick={() => setWindowDays(w.days)}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (n < 2) {
    return (
      <figure className="live-chart-wrap">
        {toolbar}
        <p className="hint">Not enough bars in this window.</p>
      </figure>
    );
  }

  const w = 720;
  const h = 280;
  const padL = 64;
  const padR = 86;
  const padT = 16;
  const padB = 56;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const times = view.times;
  const prices = view.prices;
  const volumes = view.volumes;

  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const rawSpan = rawMax - rawMin || 1;
  const pMin = rawMin - rawSpan * 0.06;
  const pMax = rawMax + rawSpan * 0.06;
  const pSpan = pMax - pMin || 1;
  const yPrice = (p: number) => padT + ((pMax - p) / pSpan) * plotH;

  const vMax = Math.max(...volumes, 1) * 1.08;
  const yVol = (v: number) => padT + ((vMax - Math.max(0, v)) / vMax) * plotH;
  const lastI = n - 1;
  const x = (i: number) => padL + (i / Math.max(n - 1, 1)) * plotW;
  const sessions = sessionRanges(times, gmt);
  const priceLine = prices
    .map((p, i) => `${x(i).toFixed(2)},${yPrice(p).toFixed(2)}`)
    .join(" ");
  const volLine = volumes
    .map((v, i) => `${x(i).toFixed(2)},${yVol(v).toFixed(2)}`)
    .join(" ");
  const lastX = x(lastI);
  const lastPY = yPrice(prices[lastI]!);
  const lastVY = yVol(volumes[lastI]!);
  const last = prices[lastI]!;
  const priceTicks = [pMax, (pMax + pMin) / 2, pMin];
  const volTicks = volumeTicks(0, vMax, 7);
  const axisY = padT + plotH;

  return (
    <figure className="live-chart-wrap">
      {toolbar}
      <svg
        className="zone-chart overlay-vol"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Real-time price ${fmtPrice(last)}, volume ${volLabel(snap.sessionVolume)}`}
      >
        {priceTicks.map((t) => {
          const yy = yPrice(t);
          const onAxis = yy > axisY - 12;
          return (
            <g key={`p-${t}`}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={yy}
                y2={yy}
                className="zone-grid"
              />
              {onAxis ? null : (
                <text
                  x={w - 8}
                  y={yy + 4}
                  textAnchor="end"
                  className="zone-axis"
                >
                  {fmtPrice(t)}
                </text>
              )}
            </g>
          );
        })}
        {volTicks.map((t, i) => {
          const yy = yVol(t);
          const onAxis = yy > axisY - 12;
          return (
            <g key={`v-${i}`}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={yy}
                y2={yy}
                className="zone-vol-grid"
              />
              {onAxis ? null : (
                <text x={6} y={yy + 4} className="zone-vol-axis">
                  {volLabel(t)}
                </text>
              )}
            </g>
          );
        })}

        <polyline points={volLine} className="zone-vol-day-line" />
        <polyline points={priceLine} className="zone-line" />

        <circle
          key={`v-${snap.updatedAt}`}
          className="zone-vol-dot live-flash"
          cx={lastX}
          cy={lastVY}
          r="4"
        />
        <circle
          key={`p-${snap.updatedAt}`}
          className="live-price-dot live-flash"
          cx={lastX}
          cy={lastPY}
          r="6"
        />

        <line
          x1={padL}
          x2={padL + plotW}
          y1={axisY}
          y2={axisY}
          className="zone-grid"
        />
        {sessions.map((s) => {
          const day = exchangeDayISO(times[s.startI]!, gmt);
          const bells = cashSessionBells(snap.country, day, gmt);
          const dayStartT = times[s.startI]!;
          const dayEndT = times[s.endI]!;
          const openT = Math.min(Math.max(bells.openMs, dayStartT), dayEndT);
          const closeT = Math.min(Math.max(bells.closeMs, dayStartT), dayEndT);
          const x0 = xAtTime(openT, times, x);
          const x1 = xAtTime(closeT, times, x);
          const wide = x1 - x0 >= 44;
          const mid = (x0 + x1) / 2;
          const sessionEnded = dayEndT >= bells.closeMs - 60_000;
          return (
            <g key={`ses-${s.startI}`}>
              <line
                x1={x0}
                x2={x0}
                y1={axisY - 8}
                y2={axisY + 4}
                className="live-session-tick"
              />
              <line
                x1={x1}
                x2={x1}
                y1={axisY - 8}
                y2={axisY + 4}
                className="live-session-tick"
              />
              {wide ? (
                <>
                  <text
                    x={x0}
                    y={axisY + 16}
                    textAnchor="start"
                    className="live-session-time"
                  >
                    {bells.openLabel}
                  </text>
                  <text
                    x={x1}
                    y={axisY + 16}
                    textAnchor="end"
                    className="live-session-time"
                  >
                    {sessionEnded
                      ? bells.closeLabel
                      : formatClock(snap.updatedAt)}
                  </text>
                </>
              ) : null}
              <text
                x={mid}
                y={axisY + 30}
                textAnchor="middle"
                className="zone-axis-x"
              >
                {formatDay(dayStartT, gmt)}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="zone-legend">
        <li>
          <span className="swatch price" />
          Price {fmtPrice(snap.price)} · {formatClock(snap.updatedAt)}
          <InfoTip
            title="Preț live"
            body="Cotația și ora (cu secunde) din același moment ca blink-ul punctului albastru."
            example={`Aici e ${fmtPrice(snap.price)}.`}
          />
        </li>
        <li>
          <span className="swatch zone-vol-day" />
          Volume {volLabel(snap.sessionVolume)}
          <InfoTip
            title="Volum live"
            body="Linia roșie e volumul pe bară. Ultimul punct roșu clipeste la update. Cifra e volumul sesiunii curente (Yahoo)."
            example={`Aici e ${volLabel(snap.sessionVolume)}.`}
          />
        </li>
        <li>
          {windowLabel}
          <InfoTip
            title="Fereastră live"
            body="Alege 5 zile, 3 zile sau doar ziua curentă. Linioarele de pe X rămân ora de deschidere și de închidere a ședinței regulate."
            example={`Acum: ${windowLabel}. Interval ${snap.interval}.`}
          />
        </li>
      </ul>
    </figure>
  );
}
