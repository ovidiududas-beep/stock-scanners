import { useId } from "react";
import type { PreMarketVolumeDay } from "../lib/premarket";
import { InfoTip } from "./InfoTip";

type Props = {
  days: PreMarketVolumeDay[];
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

export function volLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

function tickIndices(n: number): number[] {
  if (n <= 1) return [0];
  if (n <= 8) return Array.from({ length: n }, (_, i) => i);
  const wanted = 8;
  const out: number[] = [];
  for (let k = 0; k < wanted; k++) {
    const i = Math.round((k / (wanted - 1)) * (n - 1));
    if (out[out.length - 1] !== i) out.push(i);
  }
  return out;
}

function median(values: number[]): number {
  const s = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (s.length === 0) return 1;
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function volumeTicks(yMin: number, yMax: number, count = 9): number[] {
  const span = yMax - yMin;
  if (!(span > 0) || count < 2) return [yMax, yMin];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(yMax - (span * i) / (count - 1));
  }
  return out;
}

export function volumeScale(days: PreMarketVolumeDay[]): { yMin: number; yMax: number; mid: number } {
  const mid = Math.max(median(days.map((d) => d.avg30)), 1);
  const diffs = days
    .map((d) => Math.abs(d.volume - mid))
    .sort((a, b) => a - b);
  const p90 = diffs[Math.min(diffs.length - 1, Math.floor((diffs.length - 1) * 0.9))] ?? 0;
  const avgDrift = Math.max(...days.map((d) => Math.abs(d.avg30 - mid)), 0);
  const span = Math.max(p90, avgDrift, mid * 0.35);
  let yMin = mid - span;
  let yMax = mid + span;
  if (yMin < 0) {
    yMin = 0;
    yMax = mid * 2;
  }
  if (yMax <= yMin) yMax = yMin + 1;
  return { yMin, yMax, mid };
}

export function PreMarketVolumeChart({ days }: Props) {
  const clipId = `pre-vol-clip-${useId().replace(/:/g, "")}`;
  if (days.length === 0) return null;
  const w = 960;
  const h = 320;
  const padL = 12;
  const padR = 64;
  const padT = 16;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const n = days.length;
  const { yMin, yMax, mid } = volumeScale(days);
  const ySpan = yMax - yMin || 1;
  const y = (v: number) => {
    const c = Math.min(yMax, Math.max(yMin, v));
    return padT + ((yMax - c) / ySpan) * plotH;
  };
  const x = (i: number) => padL + (i / Math.max(n - 1, 1)) * plotW;
  const axisY = padT + plotH;
  const volLine = days
    .map((d, i) => `${x(i).toFixed(2)},${y(d.volume).toFixed(2)}`)
    .join(" ");
  const avgLine = days
    .map((d, i) => `${x(i).toFixed(2)},${y(d.avg30).toFixed(2)}`)
    .join(" ");
  const yTicks = volumeTicks(yMin, yMax, 9);
  const xTicks = tickIndices(n);

  return (
    <figure className="pre-vol-chart-wrap">
      <svg
        className="pre-vol-chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Daily volume versus 30-day average over 20 sessions"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        {yTicks.map((t, i) => (
          <g key={`yt-${i}`}>
            <line
              x1={padL}
              x2={padL + plotW}
              y1={y(t)}
              y2={y(t)}
              className={Math.abs(t - mid) < (yMax - yMin) * 0.02 ? "pre-vol-mid" : "zone-grid"}
            />
            <text
              x={w - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="pre-vol-axis"
            >
              {volLabel(t)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          <polyline points={volLine} className="pre-vol-day-line" />
          <polyline points={avgLine} className="pre-vol-avg" />
          {days.map((d, i) => (
            <circle
              key={d.date}
              className="pre-vol-dot"
              cx={x(i)}
              cy={y(d.volume)}
              r="2.4"
            />
          ))}
        </g>
        <line
          x1={padL}
          x2={padL + plotW}
          y1={axisY}
          y2={axisY}
          className="zone-grid"
        />
        {xTicks.map((i, k) => (
          <text
            key={days[i]!.date}
            x={x(i)}
            y={axisY + 14}
            textAnchor={
              k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle"
            }
            className="zone-axis-x"
          >
            {dateLabel(days[i]!.date)}
          </text>
        ))}
      </svg>
      <ul className="zone-legend">
        <li>
          <span className="swatch pre-vol-day" />
          Daily volume
          <InfoTip
            title="Volum zilnic"
            body="Volumul total pe fiecare din ultimele 20 de ședințe (linie roșie)."
            example="Un vârf pe linie e o zi cu tranzacții peste celelalte 19."
          />
        </li>
        <li>
          <span className="swatch pre-vol-avg30" />
          30D average
          <InfoTip
            title="Media 30 zile"
            body="Pentru fiecare din cele 20 de zile, media volumului pe cele 30 de ședințe dinainte (linie verde). Scala e centrata pe această medie, ca spike-urile zilnice să se vadă deasupra și dedesubt."
            example="Linia verde stă la mijlocul graficului. Dacă roșul iese sus, volumul zilei e peste media de 30 de zile."
          />
        </li>
      </ul>
    </figure>
  );
}
