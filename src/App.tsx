import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ScanFilters } from "./components/ScanFilters";
import { ZoneChart } from "./components/ZoneChart";
import { RealTimeChart } from "./components/RealTimeChart";
import { PreMarketVolumeChart } from "./components/PreMarketVolumeChart";
import { InfoTip } from "./components/InfoTip";
import { appConfig, applyLiveSettings } from "./config/default";
import { loadLiveSettings, saveLiveSettings } from "./config/live";
import type { LiveSettings, ScanPeriod } from "./config/schema";
import {
  applyCountrySymbol,
  COUNTRIES,
  COUNTRY_CHIPS,
  US_CAP_CHIPS,
  universeFor,
  type CountryId,
  type UsCapId,
} from "./data/universes";
import type { AccumulationHit } from "./lib/accumulation";
import {
  attachCompanyProfiles,
  companyInfoBody,
} from "./lib/profile";
import { indicesFor } from "./lib/indices";
import { lastTradingDayISO, regularSessionIsOpen, sessionDayISO } from "./lib/market-hours";
import { filterHealthcareHits } from "./lib/sector";
import {
  attachPreMarketVolume,
  runPreMarketScan,
  type PreMarketHit,
  type PreMarketResult,
} from "./lib/premarket";
import {
  dropPreMarketSave,
  loadPreMarketSaves,
  persistPreMarketSaves,
  upsertPreMarketSave,
  type SavedPreMarket,
} from "./lib/premarket-saves";
import {
  PERIOD_LABELS,
  isScanAbort,
  runScan,
  type ScanFailure,
  type ScanProgress,
} from "./lib/scan";
import {
  fetchRealTimeSeries,
  sleep,
  type RealTimeSnapshot,
} from "./lib/realtime";
import {
  toneAtLeast,
  toneAtMost,
  toneClass,
  tonePeg,
  type Tone,
} from "./lib/tone";
import {
  holdingKey,
  inferCountry,
  loadManualHoldings,
  newHoldingId,
  parseTickers,
  saveManualHoldings,
  todayISO,
  type ManualHolding,
} from "./lib/tickers";

const PERIODS: ScanPeriod[] = ["day", "week", "month", "quarter", "year"];
type MarketDay = "today" | "last";

type AppPage = "home" | "market" | "premarket" | "mine" | "saved";
type BusyKind = "scan" | "mine" | "premarket" | "presaved";

function capLabel(usd: number | null): string {
  if (usd == null) return "cap n/a";
  if (usd >= 1e12) return `${(usd / 1e12).toFixed(1)}T`;
  if (usd >= 1e9) return `${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `${(usd / 1e6).toFixed(0)}M`;
  return usd.toFixed(0);
}

function money(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function ratioLabel(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

function volLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

/** (current / average − 1) as percent; null when RVOL is missing. */
function rvolVsAvgPct(ratio: number): number | null {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return (ratio - 1) * 100;
}

function rvolTimeLabel(ratio: number): string {
  return signedPct(rvolVsAvgPct(ratio));
}

function rvolClockLabel(ms: number | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function volWithChg(vol: number, chg: number | null): string {
  if (chg == null || !Number.isFinite(chg)) return volLabel(vol);
  const sign = chg > 0 ? "+" : "";
  return `${volLabel(vol)} (price ${sign}${chg.toFixed(1)}%)`;
}

function pctStat(n: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${n.toFixed(digits)}%`;
}

function daysStat(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return n.toFixed(1);
}

function signedPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

const PREMARKET_PCT_KEY = "stock-scanners:premarket-min-pct";

function loadPreMarketMinPct(): number {
  try {
    const raw = localStorage.getItem(PREMARKET_PCT_KEY);
    const n = raw == null ? 2 : Number(raw);
    return Number.isFinite(n) ? n : 2;
  } catch {
    return 2;
  }
}

function CountryChips({
  value,
  onChange,
}: {
  value: CountryId;
  onChange: (c: CountryId) => void;
}) {
  return (
    <div className="periods" role="group" aria-label="Country">
      {COUNTRY_CHIPS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={c.id === value ? "chip on" : "chip"}
          onClick={() => onChange(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function UsCapChips({
  value,
  onChange,
}: {
  value: UsCapId;
  onChange: (c: UsCapId) => void;
}) {
  return (
    <div className="periods" role="group" aria-label="US category">
      {US_CAP_CHIPS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={c.id === value ? "chip on" : "chip"}
          onClick={() => onChange(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function ScanActions({
  busy,
  running = false,
  idleLabel,
  busyLabel,
  progressLabel,
  canStop,
  canClean,
  onStop,
  onClean,
}: {
  busy: boolean;
  running?: boolean;
  idleLabel: string;
  busyLabel: string;
  progressLabel: string | null;
  canStop: boolean;
  canClean: boolean;
  onStop: () => void;
  onClean: () => void;
}) {
  return (
    <div className="actions">
      <div className="actions-primary">
        <button className="run" type="submit" disabled={busy}>
          {running ? busyLabel : idleLabel}
        </button>
        <span className="scan-progress" aria-live="polite">
          {running && progressLabel ? progressLabel : "\u00a0"}
        </span>
      </div>
      <button
        className="run secondary"
        type="button"
        disabled={!canStop}
        onClick={onStop}
      >
        Stop Scan
      </button>
      <button
        className="run secondary"
        type="button"
        disabled={!canClean}
        onClick={onClean}
      >
        Clean
      </button>
    </div>
  );
}

function PeriodChips({
  value,
  onChange,
}: {
  value: ScanPeriod;
  onChange: (p: ScanPeriod) => void;
}) {
  return (
    <div className="periods" role="group" aria-label="Period">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className={p === value ? "chip on" : "chip"}
          onClick={() => onChange(p)}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

function MetricRow({
  name,
  value,
  title,
  body,
  example,
  afterInfo,
  tone = "plain",
}: {
  name: string;
  value: string;
  title: string;
  body: string;
  example: string;
  afterInfo?: string;
  tone?: Tone;
}) {
  return (
    <li>
      <span className="kv-name">
        {name}
        <InfoTip title={title} body={body} example={example} />
        {afterInfo ? <span className="kv-clock">{afterInfo}</span> : null}
      </span>
      <span className="kv-rule" aria-hidden="true" />
      <span className={`kv-value ${toneClass(tone)}`.trim()}>{value}</span>
    </li>
  );
}

function Metrics({ hit }: { hit: AccumulationHit }) {
  const chg = hit.changeFromOpenPct;
  const openLabel =
    chg == null ? "n/a" : `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`;
  return (
    <ul className="metrics">
      <MetricRow
        name="Price"
        value={money(hit.price)}
        title="Price"
        body="Ultimul preț din momentul Analyze. Ora și minutul de lângă i arată când a fost preluat. Open de mai jos e doar față de deschiderea zilei. Procentul față de close-ul anterior e la Price Change, imediat sub."
        example={`Aici e ${money(hit.price)}${hit.priceAt ?? hit.lastDataAt ? ` la ${rvolClockLabel(hit.priceAt ?? hit.lastDataAt)}` : ""}.`}
        afterInfo={
          rvolClockLabel(hit.priceAt ?? hit.lastDataAt) || undefined
        }
        tone="plain"
      />
      <MetricRow
        name="Price Change"
        value={signedPct(hit.priceChangePct)}
        title="Price Change"
        body="Modificarea prețului față de close-ul ședinței anterioare, în procente. Verde = urcare, roșu = scădere."
        example={
          hit.priceChangePct == null
            ? "n/a fără close-ul zilei precedente."
            : `Aici e ${signedPct(hit.priceChangePct)}. +2% la close 50$ ≈ 51$.`
        }
        tone={
          hit.priceChangePct == null
            ? "plain"
            : toneAtLeast(hit.priceChangePct, 0)
        }
      />
      <MetricRow
        name="RVOL at Time"
        value={rvolTimeLabel(hit.volumeRatio)}
        title="RVOL at Time"
        body="Volumul acumulat până la momentul X (ora și minutul de lângă i), față de media volumului acumulat până la aceeași oră în ultimele 30 de ședințe, în procente. 0% = ritm obișnuit. Plus = peste medie. Minus = sub medie."
        example={`Aici e ${rvolTimeLabel(hit.volumeRatio)}${hit.rvolAt ? ` la ${rvolClockLabel(hit.rvolAt)}` : ""}. +200% înseamnă de trei ori volumul obișnuit până la acea oră.`}
        afterInfo={rvolClockLabel(hit.rvolAt) || undefined}
        tone="plain"
      />
      <MetricRow
        name="Vol"
        value={volLabel(hit.currentVolume)}
        title="Current volume"
        body="Câte acțiuni s-au tranzacționat în sesiunea analizei (azi live, sau ziua aleasă). La lookback-uri scurte se adună barele acelei zile."
        example={`Aici e ${volLabel(hit.currentVolume)}. 1.2M = 1,2 milioane acțiuni.`}
        tone={toneAtLeast(hit.currentVolume, hit.averageVolume10d)}
      />
      <MetricRow
        name="Avg Vol (3 days)"
        value={volWithChg(hit.averageVolume3d, hit.priceChange3dPct)}
        title="Avg Vol (3 days)"
        body="Volumul mediu zilnic pe ultimele 3 ședințe, fără ziua curentă. Procentul e creșterea sau scăderea prețului acțiunii pe aceleași 3 ședințe, până la prețul actual."
        example={
          hit.priceChange3dPct == null
            ? `Aici e ${volLabel(hit.averageVolume3d)}. Fără % de preț când nu există 3 ședințe de comparat.`
            : `Aici e ${volWithChg(hit.averageVolume3d, hit.priceChange3dPct)}. +3% înseamnă că prețul e cu 3% peste close-ul de acum 3 ședințe.`
        }
        tone={
          hit.priceChange3dPct == null
            ? toneAtLeast(hit.averageVolume3d, hit.averageVolume5d)
            : toneAtLeast(hit.priceChange3dPct, 0)
        }
      />
      <MetricRow
        name="Avg Vol (5 days)"
        value={volWithChg(hit.averageVolume5d, hit.priceChange5dPct)}
        title="Avg Vol (5 days)"
        body="Volumul mediu zilnic pe ultimele 5 ședințe, fără ziua curentă. Procentul e creșterea sau scăderea prețului acțiunii pe aceleași 5 ședințe, până la prețul actual."
        example={
          hit.priceChange5dPct == null
            ? `Aici e ${volLabel(hit.averageVolume5d)}. Fără % de preț când nu există 5 ședințe de comparat.`
            : `Aici e ${volWithChg(hit.averageVolume5d, hit.priceChange5dPct)}. +4% înseamnă că prețul e cu 4% peste close-ul de acum 5 ședințe.`
        }
        tone={
          hit.priceChange5dPct == null
            ? toneAtLeast(hit.averageVolume5d, hit.averageVolume10d)
            : toneAtLeast(hit.priceChange5dPct, 0)
        }
      />
      <MetricRow
        name="Avg Vol (10 days)"
        value={volWithChg(hit.averageVolume10d, hit.priceChange10dPct)}
        title="Avg Vol (10 days)"
        body="Volumul mediu zilnic pe ultimele 10 ședințe, fără ziua curentă. Procentul e creșterea sau scăderea prețului acțiunii pe aceleași 10 ședințe, până la prețul actual."
        example={
          hit.priceChange10dPct == null
            ? `Aici e ${volLabel(hit.averageVolume10d)}. Fără % de preț când nu există 10 ședințe de comparat.`
            : `Aici e ${volWithChg(hit.averageVolume10d, hit.priceChange10dPct)}. +8% înseamnă că prețul e cu 8% peste close-ul de acum 10 ședințe.`
        }
        tone={
          hit.priceChange10dPct == null
            ? toneAtLeast(hit.averageVolume10d, hit.averageVolume1m)
            : toneAtLeast(hit.priceChange10dPct, 0)
        }
      />
      <MetricRow
        name="Avg Vol (1 month)"
        value={volWithChg(hit.averageVolume1m, hit.priceChange1mPct)}
        title="Avg Vol (1 month)"
        body="Volumul mediu zilnic pe ~21 de ședințe (~1 lună). Procentul e mișcarea prețului pe aceeași lună de tranzacționare."
        example={
          hit.priceChange1mPct == null
            ? `Aici e ${volLabel(hit.averageVolume1m)}. Fără % când lipsește o lună de prețuri.`
            : `Aici e ${volWithChg(hit.averageVolume1m, hit.priceChange1mPct)}. −6% = acțiunea e mai jos decât acum ~21 de ședințe.`
        }
        tone={
          hit.priceChange1mPct == null
            ? toneAtLeast(hit.averageVolume1m, hit.averageVolume3m)
            : toneAtLeast(hit.priceChange1mPct, 0)
        }
      />
      <MetricRow
        name="Avg Vol (3 month)"
        value={volWithChg(hit.averageVolume3m, hit.priceChange3mPct)}
        title="Avg Vol (3 month)"
        body="Volumul mediu zilnic pe ~63 de ședințe (~3 luni). Procentul e mișcarea prețului pe același trimestru."
        example={
          hit.priceChange3mPct == null
            ? `Aici e ${volLabel(hit.averageVolume3m)}. Fără % când nu există ~3 luni de close-uri.`
            : `Aici e ${volWithChg(hit.averageVolume3m, hit.priceChange3mPct)}. +12% = prețul a urcat pe ultimele 3 luni.`
        }
        tone={
          hit.priceChange3mPct == null
            ? "plain"
            : toneAtLeast(hit.priceChange3mPct, 0)
        }
      />
      <MetricRow
        name="Open"
        value={openLabel}
        title="Change from open"
        body="Cât s-a mișcat prețul față de deschiderea zilei de interes, în procente. Negativ = scădere față de open."
        example={
          chg == null
            ? "n/a apare când lipsește prețul de open."
            : `Aici e ${openLabel}. +1,5% la open 100$ înseamnă preț ~101,50$.`
        }
        tone={chg == null ? "plain" : toneAtLeast(chg, 0)}
      />
      <MetricRow
        name="ATR"
        value={`${hit.atrPct.toFixed(2)}%`}
        title="Average true range (ATR)"
        body="Cât de larg se mișcă prețul în medie (14 perioade), ca % din preț. ATR mare = volatilitate mare."
        example={`Aici e ${hit.atrPct.toFixed(2)}% din preț. La 50$ și ATR 2%, o bară medie e ~1$.`}
        tone={toneAtMost(hit.atrPct, 2)}
      />
      <MetricRow
        name="Cap"
        value={capLabel(hit.marketCap)}
        title="Market cap"
        body="Valoarea de piață a companiei, din cotația Yahoo (USD). n/a = Yahoo nu a trimis market cap pentru acest simbol."
        example={
          hit.marketCap == null
            ? "cap n/a e frecvent la unele ETF-uri sau simboluri non-US."
            : `Aici e ${capLabel(hit.marketCap)}. 2B = circa 2 miliarde USD.`
        }
      />
      <MetricRow
        name="Trailing P/E"
        value={ratioLabel(hit.trailingPE)}
        title="Trailing P/E"
        body="Preț împărțit la profitul pe acțiune din ultimele 12 luni (TTM). Mai mare = piața plătește mai scump profitul deja raportat. n/a când Yahoo nu are EPS (pierderi, ETF, lipsă date)."
        example={
          hit.trailingPE == null
            ? "n/a e obișnuit la companii pe pierdere sau la ETF-uri."
            : `Aici e ${ratioLabel(hit.trailingPE)}. 22 înseamnă că plătești 22$ pentru 1$ de profit din ultimele 12 luni.`
        }
        tone={toneAtMost(hit.trailingPE, 25)}
      />
      <MetricRow
        name="Forward P/E"
        value={ratioLabel(hit.forwardPE)}
        title="Forward P/E"
        body="Preț împărțit la profitul estimat pe următoarele 12 luni. Compară cu Trailing P/E: dacă Forward e mai mic, analiștii așteaptă creștere de EPS."
        example={
          hit.forwardPE == null
            ? "n/a apare când Yahoo nu are estimate de earnings."
            : `Aici e ${ratioLabel(hit.forwardPE)}. Trailing 25 și Forward 18 înseamnă profit așteptat mai mare decât cel din urmă.`
        }
        tone={toneAtMost(hit.forwardPE, 25)}
      />
      <MetricRow
        name="PEG"
        value={ratioLabel(hit.pegRatio)}
        title="PEG"
        body="Trailing P/E împărțit la ritmul de creștere așteptat al profitului. Sub 1 e adesea citit ca ieftin față de creștere; peste 2, scump. n/a dacă lipsește P/E sau growth."
        example={
          hit.pegRatio == null
            ? "n/a când Yahoo nu raportează PEG (fără growth sau fără P/E)."
            : `Aici e ${ratioLabel(hit.pegRatio)}. PEG 0,8 la P/E 20 înseamnă creștere estimată ~25%.`
        }
        tone={tonePeg(hit.pegRatio)}
      />
      <MetricRow
        name="Short % of Float"
        value={pctStat(hit.shortPercentOfFloat)}
        title="Short % of Float"
        body="Acțiuni vândute short, ca procent din float (Yahoo defaultKeyStatistics.shortPercentOfFloat). Peste ~10% e short interest ridicat — combustibil pentru squeeze, dar și presiune de vânzare."
        example={
          hit.shortPercentOfFloat == null
            ? "n/a e frecvent la piețe non-US sau când Yahoo nu raportează short."
            : `Aici e ${pctStat(hit.shortPercentOfFloat)}. 15% = 15 din 100 de acțiuni flotante sunt short.`
        }
        tone={
          hit.shortPercentOfFloat == null
            ? "plain"
            : toneAtLeast(hit.shortPercentOfFloat, 10)
        }
      />
      <MetricRow
        name="Short Interest Change"
        value={signedPct(hit.shortInterestChangePct)}
        title="Short Interest Change"
        body="Variația numărului de acțiuni short față de raportul anterior (sharesShort vs sharesShortPriorMonth). Plus = s-a shortat mai mult; minus = covering."
        example={
          hit.shortInterestChangePct == null
            ? "n/a când lipsește seria lunară de shares short."
            : `Aici e ${signedPct(hit.shortInterestChangePct)}. −12% = short-ul a scăzut cu 12% față de luna anterioară.`
        }
        tone={
          hit.shortInterestChangePct == null
            ? "plain"
            : toneAtMost(hit.shortInterestChangePct, 0)
        }
      />
      <MetricRow
        name="Short Volume Ratio"
        value={pctStat(hit.shortVolumeRatio)}
        title="Short Volume Ratio"
        body="Volum short zilnic ÷ volum total (tipic FINRA). Yahoo quoteSummary nu trimite acest câmp; rămâne n/a până avem o sursă zilnică. Nu e același lucru cu Short % of Float."
        example="n/a = nu există cifră Yahoo pentru short volume / total volume pe sesiune."
        tone="plain"
      />
      <MetricRow
        name="Days to Cover"
        value={daysStat(hit.daysToCover)}
        title="Days to Cover"
        body="Yahoo shortRatio: acțiuni short ÷ volumul mediu zilnic. Câte zile ar lua acoperirea short-ului la volumul obișnuit. Peste 3 e adesea citit ca cover greu."
        example={
          hit.daysToCover == null
            ? "n/a când Yahoo nu are shortRatio."
            : `Aici e ${daysStat(hit.daysToCover)}. 4,2 zile = cover lent față de un ratio de 1.`
        }
        tone={
          hit.daysToCover == null ? "plain" : toneAtLeast(hit.daysToCover, 3)
        }
      />
    </ul>
  );
}

function Breakdown({ hit }: { hit: AccumulationHit }) {
  const rows: Array<{
    label: string;
    value: number;
    title: string;
    body: string;
    example: string;
    tone: Tone;
  }> = [
    {
      label: "Tight range",
      value: hit.breakdown.tightness,
      title: "Range strâns",
      body: "Cât de puțin s-a mișcat prețul în fereastră. Scor mare = consolidare, nu un trend violent.",
      example: `Aici e ${hit.breakdown.tightness.toFixed(0)}/100. 20+ sugerează range îngust.`,
      tone: toneAtLeast(hit.breakdown.tightness, 20),
    },
    {
      label: "Demand (low prints)",
      value: hit.breakdown.demand,
      title: "Cerere (volum jos)",
      body: "Volum mai mare pe minime: cineva cumpără slăbiciunea. Scor mic = vânzare pe scăderi.",
      example: `Aici e ${hit.breakdown.demand.toFixed(0)}. 15+ înseamnă cerere vizibilă pe jos.`,
      tone: toneAtLeast(hit.breakdown.demand, 15),
    },
    {
      label: "Price location",
      value: hit.breakdown.location,
      title: "Poziția prețului",
      body: "Unde e close-ul față de zona de volum. Sus în zonă = ținut; sub zonă = slăbiciune.",
      example: `Aici e ${hit.breakdown.location.toFixed(0)}. Prețul e ${hit.belowZone ? "sub zonă" : "în/peste zonă"}.`,
      tone: hit.belowZone ? "bad" : "good",
    },
    {
      label: "OBV stealth",
      value: hit.breakdown.stealth,
      title: "OBV stealth",
      body: "On-Balance Volume urcă în timp ce prețul stă. Semnal de acumulare tăcută (bani care intră fără să umfle prețul).",
      example: `Aici e ${hit.breakdown.stealth.toFixed(0)}. Scor mare + preț plat = stealth.`,
      tone: toneAtLeast(hit.breakdown.stealth, 10),
    },
    {
      label: "Support touches",
      value: hit.breakdown.bounce,
      title: "Atingeri suport",
      body: "De câte ori prețul a testat baza zonei și a revenit. Mai multe atingeri ținute = suport real.",
      example: `Aici e ${hit.breakdown.bounce.toFixed(0)}. 10+ atingeri = zonă apărată de mai multe ori.`,
      tone: toneAtLeast(hit.breakdown.bounce, 10),
    },
    {
      label: "Recent volume",
      value: hit.breakdown.volume,
      title: "Volum recent",
      body: "Comparație între volumul de la finalul ferestrei și cel de dinainte. Uscat la final, cu suport ținut, e tipic de acumulare.",
      example: `Aici e ${hit.breakdown.volume.toFixed(0)}. Scor mare = recent mai uscat sau healthy față de trecut.`,
      tone: toneAtLeast(hit.breakdown.volume, 6),
    },
  ];
  return (
    <dl className="break">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>
            {row.label}
            <InfoTip
              title={row.title}
              body={row.body}
              example={row.example}
            />
          </dt>
          <span className="kv-rule" aria-hidden="true" />
          <dd className={toneClass(row.tone)}>{row.value.toFixed(0)}</dd>
        </div>
      ))}
    </dl>
  );
}

function DataMeta({ hit }: { hit: AccumulationHit }) {
  const read =
    hit.liveDay && hit.lastDataAt
      ? formatLastRead(hit.lastDataAt)
      : null;
  return (
    <p className="source">
      <span className="meta-line">
        Source {hit.dataSource}
        <InfoTip
          title="Sursă date"
          body="De unde vin lumânările și cotația. Yahoo Finance, plus bursa raportată (NASDAQ, ASX, etc.). Datele pot avea întârziere față de un feed plătit."
          example="Yahoo Finance · ASX înseamnă cotații Yahoo pentru Australian Securities Exchange."
        />
      </span>
      {read ? (
        <span className="meta-line">
          {" · "}last read {read}
          <InfoTip
            title="Ultima citire"
            body="Minutul celei mai recente date Yahoo pentru acest simbol: ultima cotație sau ultima bară. Dacă piața e închisă, e ultimul print disponibil (ex. vineri)."
            example={`Aici e ${read}. Dacă scanezi duminica și vezi vineri 16:00, nu există bară mai nouă.`}
          />
        </span>
      ) : null}
    </p>
  );
}

function formatLastRead(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${day}`;
  if (iso === todayISO()) return time;
  const date = d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
  return `${date}, ${time}`;
}

function CompanyInfo({
  hit,
}: {
  hit: {
    symbol: string;
    companyName: string | null;
    companySector?: string | null;
    companyIndustry?: string | null;
    companySummary?: string | null;
  };
}) {
  return (
    <InfoTip
      wide
      title={hit.companyName ?? hit.symbol}
      body={companyInfoBody({
        sector: hit.companySector ?? null,
        industry: hit.companyIndustry ?? null,
        summary: hit.companySummary ?? null,
      })}
      example="Yahoo Finance, profilul firmei: sector, industrie și ce face (longBusinessSummary)."
    />
  );
}

function IndexMark({ symbol }: { symbol: string }) {
  const labels = indicesFor(symbol);
  if (labels.length === 0) return null;
  return (
    <span className="idx-row">
      {labels.map((label) => (
        <span key={label} className="idx-chip">
          {label}
        </span>
      ))}
      <InfoTip
        title="Indici"
        body="Indicii de piață unde apare tickerul: Dow 30, Nasdaq-100, S&P 500 / 400 / 600, Biotech, Micro cap, plus indicii locali (S&P/ASX 50, 100, 200, 300, All Ordinaries, BET, FTSE 100, TSX, DAX, CAC 40, Nikkei 225, Hang Seng)."
        example={`Aici: ${labels.join(", ")}. AAPL e de obicei în Dow 30, Nasdaq-100 și S&P 500.`}
      />
    </span>
  );
}

function TickerMark({ hit }: { hit: AccumulationHit }) {
  return (
    <>
      <strong>{hit.symbol}</strong>
      {hit.companyName ? (
        <span className="co-name">{hit.companyName}</span>
      ) : null}
      <CompanyInfo hit={hit} />
      <IndexMark symbol={hit.symbol} />
    </>
  );
}

function CapMark({
  hit,
}: {
  hit: { marketCap: number | null; sharesOutstanding?: number | null };
}) {
  const shares =
    hit.sharesOutstanding != null && hit.sharesOutstanding > 0
      ? volLabel(hit.sharesOutstanding)
      : null;
  return (
    <span className="cap-mark">
      Cap {capLabel(hit.marketCap)}
      <InfoTip
        title="Market cap"
        body={
          shares
            ? `Valoarea de piață Yahoo (preț × acțiuni, de obicei în USD). Yahoo raportează ${shares} acțiuni în circulație.`
            : "Valoarea de piață Yahoo (preț × acțiuni, de obicei în USD). La ETF-uri se folosește AUM (net assets) dacă nu există market cap."
        }
        example={
          hit.marketCap == null
            ? "n/a = Yahoo nu a dat capitalizare pentru acest simbol."
            : `Aici e ${capLabel(hit.marketCap)}${shares ? `, ~${shares} acțiuni` : ""}. 2.1B ≈ 2,1 miliarde USD.`
        }
      />
    </span>
  );
}

function PreMarketQuoteMeta({ hit }: { hit: PreMarketHit }) {
  return (
    <span className="pre-meta">
      <span className="pre-stat">
        Price {money(hit.preMarketPrice)}
        <InfoTip
          title="Preț acțiune"
          body="Cotația pre-market Yahoo: cât costă o acțiune înainte de deschiderea oficială, în valuta pieței (de obicei USD). Nu e close-ul de ieri."
          example={
            hit.previousClose != null
              ? `Aici e ${money(hit.preMarketPrice)}. Close ieri ${money(hit.previousClose)}.`
              : `Aici e ${money(hit.preMarketPrice)}.`
          }
        />
      </span>
      {hit.previousClose != null ? (
        <span className="pre-stat">close {money(hit.previousClose)}</span>
      ) : null}
      <CapMark hit={hit} />
      {hit.volume != null && hit.volume > 0 ? (
        <span className="pre-stat">vol {volLabel(hit.volume)}</span>
      ) : null}
      {hit.at ? (
        <span className="pre-stat">{rvolClockLabel(hit.at)}</span>
      ) : null}
    </span>
  );
}

function ScoreBadge({ hit }: { hit: AccumulationHit }) {
  const tone = toneAtLeast(hit.score, 55);
  return (
    <span className={`score ${toneClass(tone)}`.trim()}>
      {hit.score}
      <span className="score-max">/100</span>
      <InfoTip
        align="end"
        title="Scor acumulare"
        body="Notă internă 0–100 din range, cerere, poziție, OBV, atingeri de suport și volum. Nu e recomandare de cumpărare. Sub pragul de scan, la lista ta raportul rămâne vizibil."
        example={`Aici e ${hit.score}/100. 70 e o zonă mai clară decât 40; 83 înseamnă semnale aliniate.`}
      />
    </span>
  );
}


function DetailCard({
  hit,
  minScore,
  overlayVolume = false,
}: {
  hit: AccumulationHit;
  minScore: number;
  overlayVolume?: boolean;
}) {
  return (
    <li className="card detail">
      <div className="card-head">
        <span className="card-id">
          <TickerMark hit={hit} />
          <CapMark hit={hit} />
        </span>
        <ScoreBadge hit={hit} />
      </div>
      {hit.asOfDate ? (
        <p className="asof">
          <span className="meta-line">
            Day of interest {hit.asOfDate}
            <InfoTip
              title="Ziua de interes"
              body="Data la care se taie analiza pentru acest ticker. Lumânările se iau până la sfârșitul acelei zile, nu neapărat până azi."
              example={`Aici e ${hit.asOfDate}. Dacă pui 25.09, vezi zona de atunci, nu prețul de astăzi.`}
            />
          </span>
        </p>
      ) : null}
      {!hit.passedScanFilter ? (
        <p className="flag">
          Below scan score ({minScore}) — report kept.
          <InfoTip
            title="Sub scorul de scan"
            body="La scanarea pieței acest ticker ar fi eliminat. În lista ta rămâne, ca să vezi de ce e slab."
            example={`Pragul tău e ${minScore}. Scor ${hit.score} e sub, deci nu ar apărea la Scanare bursă.`}
          />
        </p>
      ) : null}
      {hit.belowZone ? (
        <p className="flag">
          Price is below the zone.
          <InfoTip
            title="Preț sub zonă"
            body="Close-ul e sub baza zonei de volum. Zona poate fi pierdută; nu e același lucru cu acumulare ținută."
            example={`Zona începe la ${money(hit.zoneLow)}, prețul e ${money(hit.price)}.`}
          />
        </p>
      ) : null}
      <ZoneChart hit={hit} tall overlayVolume={overlayVolume} />
      <DataMeta hit={hit} />
      <Metrics hit={hit} />
      <p className="zone">
        <span className="meta-line">
          Zone {money(hit.zoneLow)} – {money(hit.zoneHigh)}
          <InfoTip
            title="Zonă de acumulare"
            body="Intervalul de preț unde s-a tranzacționat cel mai mult volum (value area). Gri transparent pe grafic. Prețul ținut aici, cu volum uscat, e semnalul principal al scannerului."
            example={`Aici e ${money(hit.zoneLow)}–${money(hit.zoneHigh)}. Dacă prețul e ${money(hit.price)}, e ${hit.belowZone ? "sub" : "în"} zonă.`}
          />
        </span>
      </p>
      <Breakdown hit={hit} />
      <ul className="reasons">
        {hit.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </li>
  );
}

function FailList({ items, label }: { items: ScanFailure[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <details className="fails">
      <summary>
        {items.length} {label}
      </summary>
      <ul>
        {items.map((f) => (
          <li key={`${f.symbol}-${f.asOfDate ?? ""}-${f.message}`}>
            {f.symbol}
            {f.asOfDate ? ` (${f.asOfDate})` : ""}: {f.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function App() {
  const [marketDay, setMarketDay] = useState<MarketDay>("today");
  const [clock, setClock] = useState(() => Date.now());
  const [market, setMarket] = useState<CountryId>("us");
  const [usCap, setUsCap] = useState<UsCapId>("sp500");
  const [preCountry, setPreCountry] = useState<CountryId>("us");
  const [preUsCap, setPreUsCap] = useState<UsCapId>("sp500");
  const [mineCountry, setMineCountry] = useState<CountryId>("us");
  const [draft, setDraft] = useState("");
  const [draftPeriod, setDraftPeriod] = useState<ScanPeriod>(
    appConfig.market.defaultPeriod,
  );
  const [manual, setManual] = useState<ManualHolding[]>(() =>
    loadManualHoldings(),
  );
  const [busy, setBusy] = useState<BusyKind | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [hits, setHits] = useState<AccumulationHit[] | null>(null);
  const [mineHits, setMineHits] = useState<Record<string, AccumulationHit>>(
    {},
  );
  const [failures, setFailures] = useState<ScanFailure[]>([]);
  const [mineFails, setMineFails] = useState<Record<string, ScanFailure>>({});
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanStopped, setScanStopped] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);
  const [mineStopped, setMineStopped] = useState(false);
  const [preMinPct, setPreMinPct] = useState(loadPreMarketMinPct);
  const [preHits, setPreHits] = useState<PreMarketHit[] | null>(null);
  const [preMeta, setPreMeta] = useState<Omit<PreMarketResult, "hits"> | null>(
    null,
  );
  const [preError, setPreError] = useState<string | null>(null);
  const [preStopped, setPreStopped] = useState(false);
  const [savedPre, setSavedPre] = useState<SavedPreMarket[]>(() =>
    loadPreMarketSaves(),
  );
  const [preSavedPeriod, setPreSavedPeriod] = useState<ScanPeriod>("month");
  const [preSavedHits, setPreSavedHits] = useState<AccumulationHit[] | null>(
    null,
  );
  const [preSavedFails, setPreSavedFails] = useState<ScanFailure[]>([]);
  const [preSavedError, setPreSavedError] = useState<string | null>(null);
  const [preSavedStopped, setPreSavedStopped] = useState(false);
  const [analyzingSymbol, setAnalyzingSymbol] = useState<string | null>(null);
  const [analyzingHoldingId, setAnalyzingHoldingId] = useState<string | null>(
    null,
  );
  const liveAbort = useRef<AbortController | null>(null);
  const [liveKey, setLiveKey] = useState<string | null>(null);
  const [liveMine, setLiveMine] = useState<Record<string, RealTimeSnapshot>>(
    {},
  );
  const [liveSaved, setLiveSaved] = useState<Record<string, RealTimeSnapshot>>(
    {},
  );
  const [liveError, setLiveError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveSettings>(() => loadLiveSettings());
  const [page, setPage] = useState<AppPage>("home");
  const config = useMemo(() => applyLiveSettings(appConfig, live), [live]);

  const themeStyle = useMemo(
    () =>
      ({
        "--primary": appConfig.theme.primaryColor,
        "--radius": appConfig.theme.borderRadius,
      }) as CSSProperties,
    [],
  );

  const marketOpen = regularSessionIsOpen(market, new Date(clock));

  useEffect(() => {
    const tick = () => setClock(Date.now());
    const id = window.setInterval(tick, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, []);

  useEffect(() => {
    if (!marketOpen && marketDay === "today") setMarketDay("last");
  }, [marketOpen, marketDay]);
  const countryLabel =
    COUNTRY_CHIPS.find((c) => c.id === market)?.label ?? market;
  const capLabelText =
    market === "us" || market === "all"
      ? US_CAP_CHIPS.find((c) => c.id === usCap)?.label
      : null;
  const universeCount = universeFor(market, usCap).length;
  const preCapLabel =
    preCountry === "us" || preCountry === "all"
      ? US_CAP_CHIPS.find((c) => c.id === preUsCap)?.label
      : null;
  const preUniverseCount = universeFor(preCountry, preUsCap).length;
  const preCountryLabel =
    COUNTRY_CHIPS.find((c) => c.id === preCountry)?.label ?? preCountry;

  function updateLive(next: LiveSettings) {
    setLive(next);
    saveLiveSettings(next);
  }

  function stopScan() {
    scanAbort.current?.abort();
  }

  function stopLive() {
    liveAbort.current?.abort();
    liveAbort.current = null;
    setLiveKey(null);
  }

  function goHome() {
    stopScan();
    stopLive();
    setPage("home");
  }

  function endBusy(kind: BusyKind) {
    setBusy((b) => (b === kind ? null : b));
  }

  function beginScan(kind: BusyKind) {
    scanAbort.current?.abort();
    const ac = new AbortController();
    scanAbort.current = ac;
    setBusy(kind);
    return ac;
  }

  function clearMarketResults() {
    setHits(null);
    setFailures([]);
    setScanError(null);
    setScanStopped(false);
  }

  function clearPreMarketResults() {
    setPreHits(null);
    setPreMeta(null);
    setPreError(null);
    setPreStopped(false);
  }

  function dropLiveMine(id: string) {
    if (liveKey === `mine:${id}`) stopLive();
    setLiveMine((snaps) => {
      if (!(id in snaps)) return snaps;
      const next = { ...snaps };
      delete next[id];
      return next;
    });
  }

  function dropLiveSaved(symbol: string) {
    if (liveKey === `saved:${symbol}`) stopLive();
    setLiveSaved((snaps) => {
      if (!(symbol in snaps)) return snaps;
      const next = { ...snaps };
      delete next[symbol];
      return next;
    });
  }

  async function runLiveFeed(
    key: string,
    symbol: string,
    onSnap: (snap: RealTimeSnapshot) => void,
    country?: CountryId,
  ) {
    stopLive();
    const ac = new AbortController();
    liveAbort.current = ac;
    setLiveKey(key);
    setLiveError(null);
    try {
      while (!ac.signal.aborted) {
        const snap = await fetchRealTimeSeries(symbol, ac.signal, country);
        onSnap(snap);
        await sleep(8_000, ac.signal);
      }
    } catch (err) {
      if (!isScanAbort(err)) {
        setLiveError(err instanceof Error ? err.message : "Live feed failed");
      }
    } finally {
      if (liveAbort.current === ac) {
        liveAbort.current = null;
        setLiveKey((k) => (k === key ? null : k));
      }
    }
  }

  function dropMineAnalysis(id: string) {
    dropLiveMine(id);
    setMineHits((hits) => {
      if (!(id in hits)) return hits;
      const next = { ...hits };
      delete next[id];
      return next;
    });
    setMineFails((fails) => {
      if (!(id in fails)) return fails;
      const next = { ...fails };
      delete next[id];
      return next;
    });
  }

  function persistSavedPre(next: SavedPreMarket[]) {
    setSavedPre(next);
    persistPreMarketSaves(next);
  }

  function savePreHit(hit: PreMarketHit) {
    persistSavedPre(upsertPreMarketSave(hit, savedPre));
  }

  function unsavePreSymbol(symbol: string) {
    persistSavedPre(dropPreMarketSave(symbol, savedPre));
    dropSavedAnalysis(symbol);
  }

  function dropSavedAnalysis(symbol: string) {
    dropLiveSaved(symbol);
    setPreSavedHits((hits) => {
      const next = (hits ?? []).filter((h) => h.symbol !== symbol);
      return next.length ? next : null;
    });
    setPreSavedFails((fails) => fails.filter((f) => f.symbol !== symbol));
  }

  function persistManual(next: ManualHolding[]) {
    const keep = new Set(next.map((h) => h.id));
    if (liveKey?.startsWith("mine:") && !keep.has(liveKey.slice(5))) {
      stopLive();
    }
    setLiveMine((snaps) => {
      const out: Record<string, RealTimeSnapshot> = {};
      for (const id of Object.keys(snaps)) {
        if (keep.has(id)) out[id] = snaps[id]!;
      }
      return out;
    });
    setMineHits((hits) => {
      const out: Record<string, AccumulationHit> = {};
      for (const id of Object.keys(hits)) {
        if (keep.has(id)) out[id] = hits[id]!;
      }
      return out;
    });
    setMineFails((fails) => {
      const out: Record<string, ScanFailure> = {};
      for (const id of Object.keys(fails)) {
        if (keep.has(id)) out[id] = fails[id]!;
      }
      return out;
    });
    setManual(next);
    saveManualHoldings(next);
  }

  function updateHolding(id: string, patch: Partial<ManualHolding>) {
    persistManual(manual.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    dropMineAnalysis(id);
  }

  function addDraft(event?: FormEvent) {
    event?.preventDefault();
    const added = parseTickers(draft);
    if (added.length === 0) return;
    const next = [...manual];
    for (const raw of added) {
      const symbol = applyCountrySymbol(raw, mineCountry);
      const country =
        mineCountry === "all" ? inferCountry(symbol) : mineCountry;
      const row: ManualHolding = {
        id: newHoldingId(),
        symbol,
        date: todayISO(),
        period: draftPeriod,
        country,
      };
      if (!next.some((h) => holdingKey(h) === holdingKey(row))) next.push(row);
    }
    persistManual(next);
    setDraft("");
  }

  async function onMarketScan(event?: FormEvent) {
    event?.preventDefault();
    const ac = beginScan("scan");
    setScanError(null);
    setScanStopped(false);
    setHits(null);
    setFailures([]);
    try {
      const result = await runScan(
        universeFor(market, usCap).map((symbol) => ({
          symbol,
          period: "day" as const,
          endDate:
            marketDay === "today"
              ? sessionDayISO(market)
              : lastTradingDayISO(market),
        })),
        config,
        setProgress,
        { filters: live, signal: ac.signal },
      );
      const rows = await attachCompanyProfiles(
        result.hits.slice(0, config.features.maxItemsPerPage),
        ac.signal,
      );
      const healthcare = filterHealthcareHits(
        rows,
        (market === "us" || market === "all") && usCap === "biotech",
      );
      setHits(healthcare.hits);
      setFailures([...result.failures, ...healthcare.rejected]);
      if (ac.signal.aborted) setScanStopped(true);
    } catch (err) {
      if (isScanAbort(err)) {
        setScanStopped(true);
      } else {
        setScanError(err instanceof Error ? err.message : "Scan failed");
      }
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function onPreMarketScan(event?: FormEvent) {
    event?.preventDefault();
    const ac = beginScan("premarket");
    setPreError(null);
    setPreStopped(false);
    setPreHits(null);
    setPreMeta(null);
    try {
      const result = await runPreMarketScan(
        universeFor(preCountry, preUsCap),
        preMinPct,
        setProgress,
        ac.signal,
      );
      const profiled = await attachCompanyProfiles(result.hits, ac.signal);
      const healthcare = filterHealthcareHits(
        profiled,
        (preCountry === "us" || preCountry === "all") && preUsCap === "biotech",
      );
      const withVolume = await attachPreMarketVolume(
        healthcare.hits,
        setProgress,
        ac.signal,
      );
      setPreHits(withVolume);
      setPreMeta({
        scanned: result.scanned,
        skipped: result.skipped + healthcare.rejected.length,
      });
      if (ac.signal.aborted) setPreStopped(true);
    } catch (err) {
      if (isScanAbort(err)) {
        setPreStopped(true);
      } else {
        setPreError(
          err instanceof Error ? err.message : "Pre-market scan failed",
        );
      }
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function onMineAnalyze(id: string) {
    const holding = manual.find((h) => h.id === id);
    if (!holding) return;
    const ac = beginScan("mine");
    setAnalyzingHoldingId(id);
    setMineError(null);
    setMineStopped(false);
    dropMineAnalysis(id);
    try {
      const result = await runScan(
        [
          {
            symbol: holding.symbol,
            period: holding.period,
          },
        ],
        config,
        setProgress,
        { detailed: true, signal: ac.signal },
      );
      const profiled = await attachCompanyProfiles(result.hits, ac.signal);
      const hit = profiled[0];
      if (hit) {
        setMineHits((hits) => ({ ...hits, [id]: hit }));
      }
      const fail = result.failures[0];
      if (fail) {
        setMineFails((fails) => ({ ...fails, [id]: fail }));
      }
      if (ac.signal.aborted) setMineStopped(true);
    } catch (err) {
      if (isScanAbort(err)) {
        setMineStopped(true);
      } else {
        setMineError(err instanceof Error ? err.message : "Analysis failed");
      }
    } finally {
      endBusy("mine");
      setAnalyzingHoldingId(null);
      setProgress(null);
    }
  }

  async function onSavedPreAnalyze(symbol: string) {
    if (!savedPre.some((s) => s.symbol === symbol)) return;
    const ac = beginScan("presaved");
    setAnalyzingSymbol(symbol);
    setPreSavedError(null);
    setPreSavedStopped(false);
    setPreSavedFails((fails) => fails.filter((f) => f.symbol !== symbol));
    try {
      const result = await runScan(
        [
          {
            symbol,
            period: preSavedPeriod,
          },
        ],
        config,
        setProgress,
        { detailed: true, signal: ac.signal },
      );
      const profiled = await attachCompanyProfiles(result.hits, ac.signal);
      setPreSavedHits((hits) => {
        const rest = (hits ?? []).filter((h) => h.symbol !== symbol);
        return [...profiled, ...rest];
      });
      setPreSavedFails((fails) => [
        ...fails.filter((f) => f.symbol !== symbol),
        ...result.failures,
      ]);
      if (ac.signal.aborted) setPreSavedStopped(true);
    } catch (err) {
      if (isScanAbort(err)) {
        setPreSavedStopped(true);
      } else {
        setPreSavedError(
          err instanceof Error ? err.message : "Analysis failed",
        );
      }
    } finally {
      endBusy("presaved");
      setAnalyzingSymbol(null);
      setProgress(null);
    }
  }

  const progressLabel =
    busy && progress
      ? `${progress.symbol || "…"} (${progress.done}/${progress.total})`
      : null;

  return (
    <div className="app" style={themeStyle}>
      <header className="top">
        {page !== "home" ? (
          <button
            type="button"
            className="run secondary back"
            onClick={() =>
              page === "saved" ? setPage("premarket") : goHome()
            }
          >
            Back
          </button>
        ) : null}
        <div>
          <p className="kicker">Stock scanner</p>
          <h1>{appConfig.appName}</h1>
          <p className="lede">
            {page === "home"
              ? "Choose a scanner."
              : page === "market"
                ? "Accumulation scan on a country and category. Hover i for explanations."
                : page === "premarket"
                  ? "Yahoo pre-market quotes before the open. Hover i for explanations."
                  : page === "saved"
                    ? "Tickers you saved from pre-market, with the quote from that moment."
                    : "Your ticker list. Analyze uses the latest available quotes. Hover i for explanations."}
          </p>
        </div>
      </header>

      {page === "home" ? (
        <nav className="home-menu" aria-label="Choose a scanner">
          <button
            type="button"
            className="home-card"
            onClick={() => setPage("market")}
          >
            <strong>Market Scan</strong>
            <span>
              Scan a universe for accumulation. Pick country and cap category,
              then run filters.
            </span>
            <em className="home-card-go">Open</em>
          </button>
          <button
            type="button"
            className="home-card"
            onClick={() => setPage("premarket")}
          >
            <strong>Pre Market Scan</strong>
            <span>
              Independent pre-market movers. Set a minimum gain percent. Press
              Save on a ticker to keep it.
            </span>
            <em className="home-card-go">Open</em>
          </button>
          <button
            type="button"
            className="home-card"
            onClick={() => setPage("mine")}
          >
            <strong>My Stocks</strong>
            <span>
              Analyze tickers you add yourself, using the latest available data.
            </span>
            <em className="home-card-go">Open</em>
          </button>
        </nav>
      ) : null}

      {page === "home" ? (
        <figure className="home-hero">
          <figcaption>Example chart — illustration only, not a button</figcaption>
          <img
            src="/home-accumulation-chart.png"
            alt=""
            draggable={false}
          />
        </figure>
      ) : null}

      {page === "market" ? (
      <section className="panel" aria-labelledby="market-title">
        <h2 id="market-title">Market scan</h2>
        <p className="hint">
          You don’t enter tickers. Pick a country
          {capLabelText ? ` and category (${capLabelText})` : ""}, then{" "}
          {universeCount} symbols are scanned
          {market === "us" || market === "all" ? "" : ` in ${countryLabel}`},
          using the filters below.
        </p>

        <form className="panel-body" onSubmit={(e) => void onMarketScan(e)}>
          <div className="periods" role="group" aria-label="Session">
            <button
              type="button"
              className={marketDay === "today" ? "chip on" : "chip"}
              disabled={!marketOpen}
              onClick={() => setMarketDay("today")}
            >
              Today
            </button>
            <button
              type="button"
              className={marketDay === "last" ? "chip on" : "chip"}
              onClick={() => setMarketDay("last")}
            >
              Last Trading Day
            </button>
          </div>
          {!marketOpen ? (
            <p className="hint session-note">
              Today is available while this market’s regular session is open.
            </p>
          ) : marketDay === "today" ? (
            <p className="hint session-note">
              Today runs on the live regular session.
            </p>
          ) : null}
          <CountryChips value={market} onChange={setMarket} />
          {market === "us" || market === "all" ? (
            <UsCapChips value={usCap} onChange={setUsCap} />
          ) : null}

          <ScanFilters live={live} onChange={updateLive} />

          <ScanActions
            busy={busy !== null}
            running={busy === "scan"}
            idleLabel="Scan market"
            busyLabel="Scanning market…"
            progressLabel={busy === "scan" ? progressLabel : null}
            canStop={busy === "scan"}
            canClean={
              busy === null &&
              !(
                hits == null &&
                !scanError &&
                !scanStopped &&
                failures.length === 0
              )
            }
            onStop={stopScan}
            onClean={clearMarketResults}
          />
        </form>

        {scanError ? <p className="banner err">{scanError}</p> : null}
        {scanStopped ? (
          <p className="banner">
            Scan stopped. Showing results found so far.
          </p>
        ) : null}

        {hits && hits.length === 0 ? (
          <p className="banner">
            No stock in this universe passes the filters. Loosen the thresholds.
          </p>
        ) : null}

        {hits && hits.length > 0 ? (
          <ol className="results">
            {hits.map((hit) => (
              <li key={hit.symbol} className="card">
                <div className="card-head">
                  <span className="card-id">
                    <TickerMark hit={hit} />
                    <CapMark hit={hit} />
                  </span>
                  <ScoreBadge hit={hit} />
                </div>
                <ZoneChart hit={hit} />
                <DataMeta hit={hit} />
                <Metrics hit={hit} />
                <p className="zone">
                  <span className="meta-line">
                    Zone {money(hit.zoneLow)} – {money(hit.zoneHigh)}
                    <InfoTip
                      title="Zonă de acumulare"
                      body="Intervalul de preț unde s-a tranzacționat cel mai mult volum (value area). Gri transparent pe grafic. Prețul ținut aici, cu volum uscat, e semnalul principal al scannerului."
                      example={`Aici e ${money(hit.zoneLow)}–${money(hit.zoneHigh)}. Dacă prețul e ${money(hit.price)}, e ${hit.belowZone ? "sub" : "în"} zonă.`}
                    />
                  </span>
                </p>
                <ul className="reasons">
                  {hit.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : null}

        <FailList items={failures} label="symbols excluded by the scan" />
      </section>
      ) : null}

      {page === "premarket" ? (
      <section className="panel" aria-labelledby="pre-title">
        <h2 id="pre-title">Pre-market</h2>
        <p className="hint">
          Independent of the accumulation scan. Pick a country and category,
          then {preUniverseCount} symbols are scanned
          {preCapLabel ? ` (${preCapLabel})` : ""}
          {preCountry === "us" || preCountry === "all"
            ? ""
            : ` in ${preCountryLabel}`}
          . Yahoo pre-market quotes only, no zone score. Press Save on a ticker
          to keep it on the Saved page.
        </p>

        <form className="panel-body" onSubmit={(e) => void onPreMarketScan(e)}>
          <CountryChips value={preCountry} onChange={setPreCountry} />
          {preCountry === "us" || preCountry === "all" ? (
            <UsCapChips value={preUsCap} onChange={setPreUsCap} />
          ) : null}
          <div className="filters">
            <label className="filter">
              <span className="filter-head">
                Pre-market gain
                <InfoTip
                  title="Creștere pre-market"
                  body="Prag minim pentru preMarketChangePercent Yahoo: (preț pre-market − close-ul de ieri) / close-ul de ieri. Doar valori ≥ acest procent apar. 0 = orice plus sau zero."
                  example="3 păstrează doar acțiuni cu cel puțin +3% în pre-market. La close 100$ trebuie preț ≥ 103$ înainte de open."
                />
              </span>
              <span className="filter-row">
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={0.5}
                  className={toneClass(toneAtLeast(preMinPct, 2))}
                  value={preMinPct}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? n : 0;
                    setPreMinPct(next);
                    localStorage.setItem(PREMARKET_PCT_KEY, String(next));
                  }}
                />
                <span className="suffix">%</span>
              </span>
            </label>
          </div>
          <ScanActions
            busy={busy !== null}
            running={busy === "premarket"}
            idleLabel="Scan pre-market"
            busyLabel="Scanning pre-market…"
            progressLabel={busy === "premarket" ? progressLabel : null}
            canStop={busy === "premarket"}
            canClean={
              busy === null &&
              !(preHits == null && !preError && !preStopped)
            }
            onStop={stopScan}
            onClean={clearPreMarketResults}
          />
          <div className="pre-access">
            <button
              type="button"
              className="run secondary saved-open"
              onClick={() => setPage("saved")}
            >
              <span className="saved-open-name">Saved</span>
              <span className="saved-open-count">{savedPre.length} saved</span>
            </button>
          </div>
        </form>

        {preError ? <p className="banner err">{preError}</p> : null}
        {preStopped ? (
          <p className="banner">
            Scan stopped. Showing results found so far.
          </p>
        ) : null}

        {preHits && preHits.length === 0 ? (
          <p className="banner">
            Nobody is above the +{preMinPct}% threshold
            {preMeta
              ? ` (${preMeta.skipped} without a pre-market quote of ${preMeta.scanned}).`
              : "."}{" "}
            Outside US pre-market hours, Yahoo may not send these fields.
          </p>
        ) : null}

        {preHits && preHits.length > 0 ? (
          <ol className="pre-results">
            {preHits.map((hit) => (
              <li key={hit.symbol} className="pre-row">
                <span className="card-id">
                  <strong>{hit.symbol}</strong>
                  {hit.companyName ? (
                    <span className="co-name">{hit.companyName}</span>
                  ) : null}
                  <CompanyInfo hit={hit} />
                  <IndexMark symbol={hit.symbol} />
                </span>
                <span
                  className={`pre-chg ${toneClass(toneAtLeast(hit.changePct, 0))}`.trim()}
                >
                  {hit.changePct >= 0 ? "+" : ""}
                  {hit.changePct.toFixed(1)}%
                </span>
                <PreMarketQuoteMeta hit={hit} />
                {hit.volumeDays && hit.volumeDays.length > 0 ? (
                  <PreMarketVolumeChart days={hit.volumeDays} />
                ) : null}
                <button
                  type="button"
                  className={
                    savedPre.some((s) => s.symbol === hit.symbol)
                      ? "ghost compact on"
                      : "ghost compact"
                  }
                  onClick={() => {
                    if (savedPre.some((s) => s.symbol === hit.symbol)) {
                      unsavePreSymbol(hit.symbol);
                    } else {
                      savePreHit(hit);
                    }
                  }}
                >
                  {savedPre.some((s) => s.symbol === hit.symbol)
                    ? "Saved"
                    : "Save"}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      ) : null}

      {page === "saved" ? (
      <section className="panel" aria-labelledby="saved-pre-title">
        <h2 id="saved-pre-title">Saved</h2>
        <p className="saved-count">{savedPre.length} saved</p>
        <p className="hint">
          Tickers you kept with Save from a pre-market scan. Each row shows the
          same quote as at save. Analyze one ticker at a time, or Real-time for
          live price and volume on the last 5 sessions. On a 1 month lookback,
          the price chart overlays the pre-market volume series (daily volume
          and 30-day average).
        </p>
        {savedPre.length === 0 ? (
          <p className="banner">
            Nothing saved yet. Run Pre Market Scan and press Save on a ticker.
          </p>
        ) : (
          <>
            <div className="saved-toolbar">
              <PeriodChips
                value={preSavedPeriod}
                onChange={setPreSavedPeriod}
              />
            </div>
            {preSavedError ? (
              <p className="banner err">{preSavedError}</p>
            ) : null}
            {liveError && page === "saved" ? (
              <p className="banner err">{liveError}</p>
            ) : null}
            {preSavedStopped ? (
              <p className="banner">
                Scan stopped. Showing results found so far.
              </p>
            ) : null}
            <ul className="saved-pre-list">
              {savedPre.map((row) => {
                const running =
                  busy === "presaved" && analyzingSymbol === row.symbol;
                const liveOn = liveKey === `saved:${row.symbol}`;
                const liveSnap = liveSaved[row.symbol];
                const hit = preSavedHits?.find((h) => h.symbol === row.symbol);
                const fail = preSavedFails.find((f) => f.symbol === row.symbol);
                return (
                  <li key={row.symbol} className="saved-pre-item">
                    <div className="pre-row">
                      <span className="card-id">
                        <strong>{row.symbol}</strong>
                        {row.companyName ? (
                          <span className="co-name">{row.companyName}</span>
                        ) : null}
                        <CompanyInfo hit={row} />
                        <IndexMark symbol={row.symbol} />
                      </span>
                      <span
                        className={`pre-chg ${toneClass(toneAtLeast(row.changePct, 0))}`.trim()}
                      >
                        {row.changePct >= 0 ? "+" : ""}
                        {row.changePct.toFixed(1)}%
                      </span>
                      <PreMarketQuoteMeta hit={row} />
                      <span className="pre-row-actions">
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={busy !== null}
                          onClick={() => void onSavedPreAnalyze(row.symbol)}
                        >
                          {running ? "Analyzing…" : "Analyze"}
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={liveOn}
                          onClick={() =>
                            void runLiveFeed(
                              `saved:${row.symbol}`,
                              row.symbol,
                              (snap) =>
                                setLiveSaved((s) => ({
                                  ...s,
                                  [row.symbol]: snap,
                                })),
                              inferCountry(row.symbol),
                            )
                          }
                        >
                          {liveOn ? "Live…" : "Real-time"}
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={!running && !liveOn}
                          onClick={() => {
                            if (liveOn) stopLive();
                            if (running) stopScan();
                          }}
                        >
                          Stop
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={busy !== null || (!hit && !fail && !liveSnap)}
                          onClick={() => dropSavedAnalysis(row.symbol)}
                        >
                          Clean
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={running}
                          onClick={() => unsavePreSymbol(row.symbol)}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                    {running && progressLabel ? (
                      <p className="scan-progress">{progressLabel}</p>
                    ) : null}
                    {fail ? (
                      <p className="banner err">
                        {fail.symbol}: {fail.message}
                      </p>
                    ) : null}
                    {liveSnap ? <RealTimeChart snap={liveSnap} /> : null}
                    {hit ? (
                      <ol className="results">
                        <DetailCard
                          hit={hit}
                          minScore={config.accumulation.minScore}
                          overlayVolume
                        />
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      ) : null}

      {page === "mine" ? (
      <section className="panel" aria-labelledby="mine-title">
        <h2 id="mine-title">My stocks</h2>
        <p className="hint">
          Pick a country, then the ticker. Without a suffix, we add it
          (Australia <code>.AX</code>, Romania <code>.RO</code>, UK{" "}
          <code>.L</code>). Each row has a country, lookback, and its own
          Analyze. Analysis uses the latest available data. Real-time follows
          price and volume on the last 5 sessions. Analysis stays visible even
          if it misses the market filters.
        </p>

        <form className="panel-body" onSubmit={(e) => addDraft(e)}>
          <CountryChips value={mineCountry} onChange={setMineCountry} />
          <div className="add-row holdings-add">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                mineCountry === "au"
                  ? "BHP, CBA, WES"
                  : mineCountry === "ro"
                    ? "TLV, SNP, H2O"
                    : mineCountry === "uk"
                      ? "SHEL, AZN, HSBA"
                      : "AAPL, MSFT, BHP.AX"
              }
              autoComplete="off"
              aria-label="Add ticker"
            />
            <select
              value={draftPeriod}
              onChange={(e) => setDraftPeriod(e.target.value as ScanPeriod)}
              aria-label="Lookback for the new ticker"
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
            <button type="button" className="ghost" onClick={() => addDraft()}>
              Add
            </button>
          </div>

          {manual.length > 0 ? (
            <ul className="holdings">
              {manual.map((h) => {
                const running =
                  busy === "mine" && analyzingHoldingId === h.id;
                const liveOn = liveKey === `mine:${h.id}`;
                const liveSnap = liveMine[h.id];
                const hit = mineHits[h.id];
                const fail = mineFails[h.id];
                return (
                  <li key={h.id} className="holding-item">
                    <div className="holding">
                      <span className="holding-sym">{h.symbol}</span>
                      <select
                        value={
                          h.country === "all"
                            ? inferCountry(h.symbol)
                            : h.country
                        }
                        onChange={(e) => {
                          const country = e.target.value as CountryId;
                          updateHolding(h.id, {
                            country,
                            symbol: applyCountrySymbol(h.symbol, country),
                          });
                        }}
                        aria-label={`Country for ${h.symbol}`}
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={h.period}
                        onChange={(e) =>
                          updateHolding(h.id, {
                            period: e.target.value as ScanPeriod,
                          })
                        }
                        aria-label={`Lookback for ${h.symbol}`}
                      >
                        {PERIODS.map((p) => (
                          <option key={p} value={p}>
                            {PERIOD_LABELS[p]}
                          </option>
                        ))}
                      </select>
                      <span className="holding-actions">
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={busy !== null}
                          onClick={() => void onMineAnalyze(h.id)}
                        >
                          {running ? "Analyzing…" : "Analyze"}
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={liveOn}
                          onClick={() =>
                            void runLiveFeed(
                              `mine:${h.id}`,
                              h.symbol,
                              (snap) =>
                                setLiveMine((s) => ({ ...s, [h.id]: snap })),
                              h.country === "all"
                                ? inferCountry(h.symbol)
                                : h.country,
                            )
                          }
                        >
                          {liveOn ? "Live…" : "Real-time"}
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={!running && !liveOn}
                          onClick={() => {
                            if (liveOn) stopLive();
                            if (running) stopScan();
                          }}
                        >
                          Stop
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={busy !== null || (!hit && !fail && !liveSnap)}
                          onClick={() => dropMineAnalysis(h.id)}
                        >
                          Clean
                        </button>
                        <button
                          type="button"
                          className="ghost compact"
                          disabled={running}
                          onClick={() =>
                            persistManual(manual.filter((t) => t.id !== h.id))
                          }
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                    {running && progressLabel ? (
                      <p className="scan-progress">{progressLabel}</p>
                    ) : null}
                    {fail ? (
                      <p className="banner err">
                        {fail.symbol}: {fail.message}
                      </p>
                    ) : null}
                    {liveSnap ? <RealTimeChart snap={liveSnap} /> : null}
                    {hit ? (
                      <ol className="results">
                        <DetailCard
                          hit={hit}
                          minScore={config.accumulation.minScore}
                          overlayVolume
                        />
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="hint">No tickers saved yet.</p>
          )}
        </form>

        {mineError ? <p className="banner err">{mineError}</p> : null}
        {liveError && page === "mine" ? (
          <p className="banner err">{liveError}</p>
        ) : null}
        {mineStopped ? (
          <p className="banner">
            Scan stopped. Showing results found so far.
          </p>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
