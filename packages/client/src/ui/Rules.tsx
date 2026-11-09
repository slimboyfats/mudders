import {
  PRESETS,
  PRESET_NAMES,
  SUDDEN_DEATH_DEFAULT,
  SUDDEN_DEATH_TURNS,
  estimateMinutes,
  type MapSize,
  type MatchSetup,
  type Preset,
} from '../game/setup';

export type RulesValue = Omit<MatchSetup, 'slots' | 'tanks'>;

interface Props {
  value: RulesValue;
  onChange: (patch: Partial<RulesValue>) => void;
  /** Players in the match, for the length estimate. */
  players?: number;
}

/** Match rules (§8): length, timers, map, scenery, wind, cash. Shared by local setup and the online lobby. */
export function Rules({ value, onChange, players = 2 }: Props) {
  const preset = (Object.keys(PRESETS) as Preset[]).find(
    (k) => PRESETS[k].rounds === value.rounds && PRESETS[k].turnTimer === value.turnTimer,
  );
  return (
    <section className="rules" aria-label="Rules">
      <div className="seg" role="radiogroup" aria-label="Match length">
        {(Object.keys(PRESETS) as Preset[]).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={preset === k}
            className={preset === k ? 'on' : ''}
            onClick={() => onChange({ ...PRESETS[k] })}
          >
            {PRESET_NAMES[k]}
            <small>
              {PRESETS[k].rounds} round{PRESETS[k].rounds > 1 ? 's' : ''}
            </small>
          </button>
        ))}
      </div>
      <p className="estimate" data-testid="estimate">
        About {estimateMinutes(value.rounds, value.turnTimer, players)} min with {players} players
      </p>
      <label>
        Rounds
        <select value={value.rounds} onChange={(e) => onChange({ rounds: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 7, 10, 15, 20].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Turn timer
        <select
          value={value.turnTimer}
          onChange={(e) => onChange({ turnTimer: Number(e.target.value) })}
        >
          <option value={0}>Off</option>
          {[10, 15, 20, 30, 45].map((s) => (
            <option key={s} value={s}>
              {s} s
            </option>
          ))}
        </select>
      </label>
      <label>
        Map
        <select value={value.size} onChange={(e) => onChange({ size: e.target.value as MapSize })}>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
      <label>
        Scenery
        <select
          value={value.scenery}
          onChange={(e) => onChange({ scenery: e.target.value as MatchSetup['scenery'] })}
        >
          <option value="none">Bare hills</option>
          <option value="village">Village</option>
          <option value="badlands">Badlands</option>
          <option value="marsh">Marsh</option>
          <option value="city">City</option>
          <option value="islands">Floating islands</option>
          <option value="caves">Caves</option>
          <option value="glacier">Glacier</option>
          <option value="claypits">Clay pits</option>
        </select>
      </label>
      <label>
        Wind
        <select
          value={value.wind}
          onChange={(e) => onChange({ wind: e.target.value as MatchSetup['wind'] })}
        >
          <option value="none">None</option>
          <option value="constant">Per round</option>
          <option value="perTurn">Every turn</option>
          <option value="gusty">Gusty</option>
        </select>
      </label>
      <label>
        Weather
        <select
          value={value.weather ?? 'clear'}
          onChange={(e) => onChange({ weather: e.target.value as MatchSetup['weather'] })}
        >
          <option value="clear">Clear</option>
          <option value="rain">Rain</option>
          <option value="snow">Snow</option>
          <option value="random">Random</option>
        </select>
      </label>
      <label>
        Starting cash
        <select
          value={value.startingCash}
          onChange={(e) => onChange({ startingCash: Number(e.target.value) })}
        >
          {[0, 3000, 10000, 30000, 50000].map((c) => (
            <option key={c} value={c}>
              {c.toLocaleString('en')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sudden death
        <select
          value={value.suddenDeath ? String(value.suddenDeathFrom ?? SUDDEN_DEATH_DEFAULT) : 'off'}
          onChange={(e) =>
            onChange(
              e.target.value === 'off'
                ? { suddenDeath: false }
                : { suddenDeath: true, suddenDeathFrom: Number(e.target.value) },
            )
          }
        >
          <option value="off">Off</option>
          {SUDDEN_DEATH_TURNS.map((t) => (
            <option key={t} value={t}>
              From turn {t}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
