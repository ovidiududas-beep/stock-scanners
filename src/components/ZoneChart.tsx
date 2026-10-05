import { useId } from "react";
import type { AccumulationHit } from "../lib/accumulation";
import type { VolumeCompareDay } from "../lib/market";
import { InfoTip } from "./InfoTip";
import { volLabel, volumeScale, volumeTicks } from "./PreMarketVolumeChart";

type Props = {
  hit: AccumulationHit;
  tall?: boolean;
  overlayVolume?: boolean;
};

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

function fmt(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function exchangeParts(t: number, gmtOffsetSec: number) {
  const d = new Date(t + gmtOffsetSec * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    hh: String(d.getUTCHours()).padStart(2, "0"),
    mm: String(d.getUTCMinutes()).padStart(2, "0"),
  };
}

function isIntraday(interval: string | undefined): boolean {
  return (
    interval === "1m" ||
    interval === "2m" ||
    interval === "5m" ||
    interval === "15m" ||
    interval === "30m" ||
    interval === "60m" ||
    interval === "1h" ||
    interval === "90m"
  );
}

function sameExchangeDay(
  a: number,
  b: number,
  gmtOffsetSec: number,
): boolean {
  const pa = exchangeParts(a, gmtOffsetSec);
  const pb = exchangeParts(b, gmtOffsetSec);
  return pa.y === pb.y && pa.m === pb.m && pa.day === pb.day;
}

function formatXLabel(
  t: number,
  hit: AccumulationHit,
  times: number[],
): string {
  const offset = hit.gmtOffset ?? 0;
  const p = exchangeParts(t, offset);
  const first = times[0];
  const last = times[times.length - 1];
  const oneDay =
    first != null && last != null && sameExchangeDay(first, last, offset);
  if (isIntraday(hit.dataInterval)) {
    if (oneDay) return `${p.hh}:${p.mm}`;
    return `${p.day} ${MONTHS[p.m]} ${p.hh}:${p.mm}`;
  }
  const yearChanges =
    first != null &&
    last != null &&
    exchangeParts(first, offset).y !== exchangeParts(last, offset).y;
  if (yearChanges) return `${p.day} ${MONTHS[p.m]} ${p.y}`;
  return `${p.day} ${MONTHS[p.m]}`;
}

function xTickIndices(n: number): number[] {
  if (n <= 1) return [0];
  if (n <= 4) return Array.from({ length: n }, (_, i) => i);
  const wanted = 5;
  const out: number[] = [];
  for (let k = 0; k < wanted; k++) {
    const i = Math.round((k / (wanted - 1)) * (n - 1));
    if (out[out.length - 1] !== i) out.push(i);
  }
  return out;
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

function priceSpanMs(times: number[]): number {
  if (times.length < 2) return 0;
  return times[times.length - 1]! - times[0]!;
}

function lastInZone(hit: AccumulationHit): "in" | "below" | "above" {
  const p = hit.lastClose;
  if (p < hit.zoneLow) return "below";
  if (p > hit.zoneHigh) return "above";
  return "in";
}

export function ZoneChart({ hit, tall = false, overlayVolume = false }: Props) {
  const gid = `zg-${useId().replace(/:/g, "")}`;
  const n = hit.closes.length;
  const times =
    hit.times?.length === n ? hit.times : hit.times?.length ? hit.times : [];
  const showVol =
    overlayVolume &&
    (hit.volumeDays?.length ?? 0) > 1 &&
    priceSpanMs(times) >= 4 * 86_400_000;
  const volDays: VolumeCompareDay[] = showVol ? hit.volumeDays! : [];
  const w = showVol ? 720 : 560;
  const h = showVol ? 300 : tall ? 240 : 168;
  const padL = showVol ? 64 : 10;
  const padR = 86;
  const padT = 14;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const rawMin = Math.min(...hit.closes, hit.zoneLow);
  const rawMax = Math.max(...hit.closes, hit.zoneHigh);
  const rawSpan = rawMax - rawMin || 1;
  const min = rawMin - rawSpan * 0.06;
  const max = rawMax + rawSpan * 0.06;
  const span = max - min || 1;

  const y = (price: number) => padT + ((max - price) / span) * plotH;
  const x = (i: number) =>
    padL + (i / Math.max(hit.closes.length - 1, 1)) * plotW;

  const zoneTop = y(hit.zoneHigh);
  const zoneBot = y(hit.zoneLow);
  const last = hit.closes[hit.closes.length - 1] ?? hit.lastClose;
  const lastX = x(Math.max(hit.closes.length - 1, 0));
  const lastY = y(last);
  const pos = lastInZone(hit);
  const lastColor =
    pos === "in" ? "#15803d" : pos === "below" ? "#b42318" : "#b45309";

  const line = hit.closes
    .map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`)
    .join(" ");
  const area = `${padL.toFixed(1)},${(padT + plotH).toFixed(1)} ${line} ${lastX.toFixed(1)},${(padT + plotH).toFixed(1)}`;

  const ticks = [max, (max + min) / 2, min];
  const axisY = padT + plotH;
  const xTicks: { i: number; label: string; anchor: "start" | "middle" | "end" }[] =
    [];
  if (times.length > 0) {
    const lastI = times.length - 1;
    const minGap = 56;
    for (const i of xTickIndices(times.length)) {
      const xi = x(i);
      const prev = xTicks[xTicks.length - 1];
      if (prev && i !== lastI && xi - x(prev.i) < minGap) continue;
      if (prev && i === lastI && xi - x(prev.i) < minGap) xTicks.pop();
      xTicks.push({
        i,
        label: formatXLabel(times[i]!, hit, times),
        anchor: "middle",
      });
    }
    if (xTicks.length === 1) xTicks[0]!.anchor = "middle";
    else if (xTicks.length > 1) {
      xTicks[0]!.anchor = "start";
      xTicks[xTicks.length - 1]!.anchor = "end";
    }
  }

  const volScale = showVol ? volumeScale(volDays) : null;
  const yVol = (v: number) => {
    if (!volScale) return padT;
    const { yMin, yMax } = volScale;
    const c = Math.min(yMax, Math.max(yMin, v));
    return padT + ((yMax - c) / (yMax - yMin || 1)) * plotH;
  };
  const volLine = showVol
    ? volDays
        .map((d) => `${xAtTime(d.t, times, x).toFixed(2)},${yVol(d.volume).toFixed(2)}`)
        .join(" ")
    : "";
  const avgLine = showVol
    ? volDays
        .map((d) => `${xAtTime(d.t, times, x).toFixed(2)},${yVol(d.avg30).toFixed(2)}`)
        .join(" ")
    : "";
  const volTicks = volScale ? volumeTicks(volScale.yMin, volScale.yMax, 9) : [];

  return (
    <figure className="zone-chart-wrap">
      <svg
        className={showVol ? "zone-chart overlay-vol" : "zone-chart"}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Price ${fmt(last)} vs zone ${fmt(hit.zoneLow)}–${fmt(hit.zoneHigh)}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={padL + plotW}
              y1={y(t)}
              y2={y(t)}
              className="zone-grid"
            />
            <text
              x={w - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="zone-axis"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        {volTicks.map((t, i) => (
          <g key={`v-${i}`}>
            <line
              x1={padL}
              x2={padL + plotW}
              y1={yVol(t)}
              y2={yVol(t)}
              className="zone-vol-grid"
            />
            <text
              x={6}
              y={yVol(t) + 4}
              className="zone-vol-axis"
            >
              {volLabel(t)}
            </text>
          </g>
        ))}

        {showVol ? (
          <g>
            <polyline points={volLine} className="zone-vol-day-line" />
            <polyline points={avgLine} className="zone-vol-avg-line" />
            {volDays.map((d) => (
              <circle
                key={d.date}
                className="zone-vol-dot"
                cx={xAtTime(d.t, times, x)}
                cy={yVol(d.volume)}
                r="2.2"
              />
            ))}
          </g>
        ) : null}

        <rect
          x={padL}
          y={zoneTop}
          width={plotW}
          height={Math.max(3, zoneBot - zoneTop)}
          className="zone-band"
        />
        <line
          x1={padL}
          x2={padL + plotW}
          y1={zoneTop}
          y2={zoneTop}
          className="zone-edge high"
        />
        <line
          x1={padL}
          x2={padL + plotW}
          y1={zoneBot}
          y2={zoneBot}
          className="zone-edge low"
        />
        <text
          x={padL + 8}
          y={zoneTop + Math.max(14, (zoneBot - zoneTop) / 2 + 4)}
          className="zone-label"
        >
          Accumulation zone
        </text>

        <polygon points={area} fill={`url(#${gid})`} />
        <polyline points={line} className="zone-line" />

        <circle cx={lastX} cy={lastY} r="5" fill={lastColor} stroke="#fff" strokeWidth="2" />
        <text
          x={lastX - 8}
          y={Math.max(padT + 12, lastY - 10)}
          textAnchor="end"
          className="zone-last"
          fill={lastColor}
        >
          {fmt(last)}
        </text>

        <line
          x1={padL}
          x2={padL + plotW}
          y1={axisY}
          y2={axisY}
          className="zone-grid"
        />
        {xTicks.map((tick) => (
          <g key={tick.i}>
            <line
              x1={x(tick.i)}
              x2={x(tick.i)}
              y1={axisY}
              y2={axisY + 4}
              className="zone-grid"
            />
            <text
              x={x(tick.i)}
              y={axisY + 16}
              textAnchor={tick.anchor}
              className="zone-axis-x"
            >
              {tick.label}
            </text>
          </g>
        ))}
      </svg>

      <ul className="zone-legend">
        <li>
          <span className="swatch zone" />
          Zone {fmt(hit.zoneLow)} – {fmt(hit.zoneHigh)}
          <InfoTip
            title="Bandă gri"
            body="Zona de acumulare: unde s-a făcut cel mai mult volum. Liniile punctate sunt plafonul și podeaua zonei."
            example={`Aici ${fmt(hit.zoneLow)}–${fmt(hit.zoneHigh)}. Prețul care se tot întoarce aici e ținut în zonă.`}
          />
        </li>
        <li>
          <span className="swatch price" />
          Price
          <InfoTip
            title="Linia albastră"
            body="Evoluția close-urilor pe fereastra aleasă (azi = bare de 5 minute, săptămână = 15m, luni = zilnic)."
            example="O linie care urcă în bandă gri, fără break-out violent, e consolidare în zonă."
          />
        </li>
        {showVol ? (
          <>
            <li>
              <span className="swatch zone-vol-day" />
              Daily volume
              <InfoTip
                title="Volum zilnic"
                body="Aceeași serie ca la Pre Market: volumul pe ședință, suprapus pe graficul de preț (axa stângă, roșu)."
                example="Un vârf roșu peste linia verde e o zi cu volum peste media 30D."
              />
            </li>
            <li>
              <span className="swatch zone-vol-avg" />
              30D average
              <InfoTip
                title="Media 30 zile"
                body="Media de volum pe 30 de ședințe anterioare, centrată pe axa de volum. Verde, peste graficul de preț."
                example="Linia verde stă la mijlocul scalei de volum, ca la scanarea Pre Market."
              />
            </li>
          </>
        ) : null}
        <li>
          <span className="swatch now" style={{ background: lastColor }} />
          Last: {pos === "in" ? "in zone" : pos === "below" ? "below zone" : "above zone"}
          <InfoTip
            title="Ultimul punct"
            body="Ultimul preț din momentul Analyze, ca ultim punct pe grafic, inclusiv ziua respectivă pe axa X. Verde = în zonă, roșu = sub zonă, portocaliu = peste zonă."
            example={`Acum e ${fmt(last)} și punctul e ${pos === "in" ? "verde (în zonă)" : pos === "below" ? "roșu (sub zonă)" : "portocaliu (peste zonă)"}.`}
          />
        </li>
      </ul>
    </figure>
  );
}
