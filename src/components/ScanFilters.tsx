import type { ReactNode } from "react";
import type { LiveSettings } from "../config/schema";
import { toneAtLeast, toneAtMost, toneClass, toneSet } from "../lib/tone";
import { InfoTip } from "./InfoTip";

type Props = {
  live: LiveSettings;
  onChange: (next: LiveSettings) => void;
};

function Field({
  label,
  title,
  body,
  example,
  suffix,
  children,
}: {
  label: string;
  title: string;
  body: string;
  example: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <label className="filter">
      <span className="filter-head">
        {label}
        <InfoTip title={title} body={body} example={example} />
      </span>
      <span className="filter-row">
        {children}
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function ScanFilters({ live, onChange }: Props) {
  function num(key: keyof LiveSettings, raw: string) {
    const n = Number(raw);
    onChange({ ...live, [key]: Number.isFinite(n) ? n : 0 });
  }

  return (
    <div className="filters">
      <Field
        label="Relative volume"
        title="RVOL at Time"
        body="Volumul acumulat azi până la momentul X ÷ media volumului acumulat până la aceeași oră în ultimele 30 de ședințe. Peste 1 = mai mult decât ritmul obișnuit la ora asta. 0 = fără filtru."
        example="×3 la 11:00 păstrează doar acțiuni care până la 11:00 au deja de 3 ori volumul tipic până la 11:00, nu de 3 ori volumul unei zile întregi."
        suffix="×"
      >
        <input
          type="number"
          min={0}
          max={50}
          step={0.5}
          className={toneClass(toneAtLeast(live.volumeMultiple, 1))}
          value={live.volumeMultiple}
          onChange={(e) => num("volumeMultiple", e.target.value)}
        />
      </Field>

      <Field
        label="Price min"
        title="Price (minim)"
        body="Prețul curent al acțiunii. Sub acest nivel, scanarea o exclude. 0 = fără filtru."
        example="5 scoate penny stocks sub 5$."
      >
        <input
          type="number"
          min={0}
          max={1000000}
          step={0.5}
          className={toneClass(toneSet(live.minPrice))}
          value={live.minPrice}
          onChange={(e) => num("minPrice", e.target.value)}
        />
      </Field>

      <Field
        label="Market cap min"
        title="Market cap"
        body="Valoarea de piață a companiei, în milioane USD. Sub prag, nu apare. 0 = fără filtru."
        example="2000 înseamnă cel puțin 2 miliarde USD (large/mid cap)."
        suffix="$M"
      >
        <input
          type="number"
          min={0}
          max={5000000}
          step={50}
          className={toneClass(toneSet(live.minMarketCapM))}
          value={live.minMarketCapM}
          onChange={(e) => num("minMarketCapM", e.target.value)}
        />
      </Field>

      <Field
        label="Accumulation score"
        title="Scor acumulare"
        body="Nota internă a zonei de volum (0–100): range, cerere, OBV. Sub acest scor, scanarea nu arată tickerul. 0 = fără filtru pe scor."
        example="70 e mai strict decât 55: rămân doar zonele clare de acumulare."
      >
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className={toneClass(toneAtLeast(live.minScore, 55))}
          value={live.minScore}
          onChange={(e) => num("minScore", e.target.value)}
        />
      </Field>

      <Field
        label="Short Interest Change <="
        title="Short Interest Change"
        body="Păstrează doar acțiuni unde variația short-ului (față de luna anterioară) e cel mult acest procent. Gol sau 0 = fără filtru. Fără cifră Yahoo, tickerul e exclus doar când pui un prag diferit de 0."
        example="−5 păstrează doar unde short-ul a scăzut cu cel puțin 5%. 10 exclude creșteri de short peste +10%."
        suffix="%"
      >
        <input
          type="number"
          min={-200}
          max={500}
          step={0.5}
          className={toneClass(
            live.maxShortInterestChangePct == null
              ? "plain"
              : toneAtMost(live.maxShortInterestChangePct, 0),
          )}
          value={live.maxShortInterestChangePct ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") {
              onChange({ ...live, maxShortInterestChangePct: null });
              return;
            }
            num("maxShortInterestChangePct", raw);
          }}
        />
      </Field>
    </div>
  );
}
