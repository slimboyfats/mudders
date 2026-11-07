import { useState, type CSSProperties, type RefObject } from 'react';
import { TEMP_COLD, TEMP_HOT, type Input } from '@mudders/shared';
import { clampAim } from '../game/aim';
import type { HudState } from '../game/match';
import type { Renderer } from '../render';
import { teamName } from '../game/setup';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { Scoreboard, Shop } from './Shop';
import { CHILL_POWER } from '@mudders/sim';
import { ANGLE_SCRUB, POWER_SCRUB } from '../game/scrub';
import { Scrub } from './Scrub';
import { WeaponPicker } from './WeaponPicker';

interface Props {
  hud: HudState;
  canAim: boolean;
  send: (input: Input) => void;
  /** Send for a specific player (shop: every hot-seat human shops). */
  sendAs: (player: number, input: Input) => void;
  controls: (player: number) => boolean;
  renderer: RefObject<Renderer | null>;
  onExit?: () => void;
  onRematch?: () => void;
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const pcolor = (p: number) => css(PLAYER_COLORS[p % PLAYER_COLORS.length] ?? 0xffffff);

/** Wind as text plus an arrow, so it never relies on colour alone (§8). */
function Wind({
  wind,
  base,
  max,
  gusty,
  weather,
}: {
  wind: number;
  base: number;
  max: number;
  gusty: boolean;
  weather: string;
}) {
  const clamp = (v: number) => (max > 0 ? Math.max(-1, Math.min(1, v / max)) : 0);
  const k = clamp(wind);
  const b = clamp(base);
  const n = Math.round(Math.abs(k) * 10);
  const arrow = k === 0 ? '·' : k > 0 ? '→' : '←';
  const dir = k > 0 ? 'right' : k < 0 ? 'left' : 'calm';
  return (
    <div
      className="wind"
      aria-label={`${weather ? `${weather}, ` : ''}${gusty ? 'gusty wind' : 'wind'} ${n} ${dir}`}
    >
      {weather && <span className="weather">{weather}</span>}
      <span className="label">{gusty ? 'Gusts' : 'Wind'}</span>
      <span className="wind-bar">
        <span
          className="wind-fill"
          style={{
            left: k < 0 ? `${50 + k * 50}%` : '50%',
            width: `${Math.abs(k) * 50}%`,
          }}
        />
        {gusty && <span className="wind-base" style={{ left: `${50 + b * 50}%` }} />}
      </span>
      <span className="wind-value">
        {arrow} {n}
      </span>
    </div>
  );
}

/** Air temperature (§3.4): °C plus a word, so cold and hot never rely on colour alone (§8). */
function Temperature({ temp }: { temp: number }) {
  const band = temp <= TEMP_COLD ? 'cold' : temp >= TEMP_HOT ? 'hot' : 'mild';
  const word = band === 'cold' ? 'Freezing' : band === 'hot' ? 'Scorching' : '';
  return (
    <span className={`badge temp ${band}`} aria-label={`Temperature ${temp} °C ${word}`.trim()}>
      {band !== 'mild' && <span aria-hidden="true">{band === 'cold' ? '❄ ' : '☀ '}</span>}
      {temp}°{word && <span className="temp-word"> {word}</span>}
    </span>
  );
}

/**
 * Hold ◀ or ▶ to drive (§3.2): pressing starts the tank rolling, releasing stops it. Shows the
 * cells left this turn.
 */
function Drive({
  tank,
  disabled,
  send,
}: {
  tank: HudState['tanks'][number] | undefined;
  disabled: boolean;
  send: (input: Input) => void;
}) {
  const left = Math.min(tank?.driveLeft ?? 0, tank?.fuel ?? 0);
  const off = disabled || left <= 0 || (tank?.glue ?? 0) > 0;
  const button = (dir: -1 | 1, label: string, glyph: string) => (
    <button
      className={`drive-btn${tank?.driving === dir ? ' on' : ''}`}
      disabled={off}
      aria-label={label}
      data-testid={dir < 0 ? 'drive-left' : 'drive-right'}
      onPointerDown={(e) => {
        send({ type: 'drive', dir });
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // no live pointer (synthetic event): the release still stops the drive
        }
      }}
      onPointerUp={() => send({ type: 'drive', dir: 0 })}
      onPointerCancel={() => send({ type: 'drive', dir: 0 })}
      onContextMenu={(e) => e.preventDefault()}
    >
      {glyph}
    </button>
  );
  return (
    <div className="drive" aria-label="Drive">
      {button(-1, 'Drive left', '◀')}
      <span
        className="drive-left"
        aria-label={`Drive ${left} cells this turn, ${tank?.fuel ?? 0} fuel`}
        title={`Fuel ${tank?.fuel ?? 0}`}
      >
        <span className="drive-n">{left}</span>
        <small className="fuel">fuel {tank?.fuel ?? 0}</small>
      </span>
      {button(1, 'Drive right', '▶')}
    </div>
  );
}

export function Hud({ hud, canAim, send, sendAs, controls, renderer, onExit, onRematch }: Props) {
  const t = hud.tanks[hud.activePlayer];
  const [menu, setMenu] = useState(false);
  const aim = (angle: number, power: number) =>
    send({ type: 'aim', ...clampAim({ angle, power }) });
  return (
    <>
      <div className="hud-top">
        <div className={`players${hud.tanks.length > 4 ? ' many' : ''}`}>
          {hud.tanks.map((p) => {
            const hp = p.alive ? Math.max(0, Math.min(1, p.health / p.maxHealth)) : 0;
            return (
              <div
                key={p.player}
                className={`player${p.player === hud.activePlayer && hud.phase === 'aim' ? ' active' : ''}${p.alive ? '' : ' dead'}`}
                style={{ '--pc': pcolor(p.player) } as CSSProperties}
                aria-label={`Player ${p.player + 1}${p.alive ? `, health ${p.health}` : ', destroyed'}, score ${p.score}`}
              >
                <span className="pname">P{p.player + 1}</span>
                {hud.teams && (
                  <span
                    className={`team-badge team-${p.team}`}
                    aria-label={`Team ${teamName(p.team)}`}
                  >
                    {teamName(p.team)}
                  </span>
                )}
                <span className="pbar" aria-hidden="true">
                  <span
                    className={`pbar-fill${hp <= 0.3 ? ' low' : ''}`}
                    style={{ width: `${hp * 100}%` }}
                  />
                  {p.alive && p.shield > 0 && <span className="pbar-shield" />}
                </span>
                <span className="hp">{p.alive ? `${p.health}` : '✕'}</span>
                {p.alive && p.shield > 0 && (
                  <span className="shield" aria-label="shield">
                    +{p.shield}
                  </span>
                )}
                <span className="pscore" aria-label="score">
                  ★{p.score}
                </span>
              </div>
            );
          })}
        </div>
        <div className="hud-center">
          <span className="badge" aria-label="Round">
            R{Math.min(hud.round, hud.rounds)}/{hud.rounds}
          </span>
          {hud.suddenDeath && <span className="badge sudden">Sudden death</span>}
          <Wind
            wind={hud.wind}
            base={hud.windBase}
            max={hud.windMax}
            gusty={hud.gusty}
            weather={hud.weather}
          />
          <Temperature temp={hud.temperature} />
          {hud.phase === 'aim' && hud.seconds >= 0 && (
            <span className={`badge timer${hud.seconds <= 5 ? ' low' : ''}`} aria-label="Time left">
              {hud.seconds}s
            </span>
          )}
        </div>
        <div className="cam" role="group" aria-label="Camera">
          <button onClick={() => renderer.current?.camera.zoomBy(-1)} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => renderer.current?.camera.fit()} aria-label="Fit map">
            ⤢
          </button>
          <button onClick={() => renderer.current?.camera.zoomBy(1)} aria-label="Zoom in">
            +
          </button>
        </div>
        {onExit && (
          <button
            className="menu-btn"
            onClick={() => setMenu(true)}
            aria-label="Menu"
            aria-haspopup="dialog"
          >
            ☰
          </button>
        )}
      </div>

      {hud.phase === 'aim' && t && (
        <div
          key={`${hud.round}-${hud.turn}`}
          className="turn-banner"
          style={{ '--pc': pcolor(t.player) } as CSSProperties}
          aria-live="polite"
        >
          <span className="turn-banner-name">Player {t.player + 1}</span>
          <span className="turn-banner-sub">{t.bot ? `${t.bot} is aiming…` : 'Your shot'}</span>
        </div>
      )}

      {menu && onExit && (
        <div className="sheet-scrim" onClick={() => setMenu(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-label="Match menu"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Menu</h2>
            <p className="sheet-note">The match keeps running while this is open.</p>
            <button className="primary" onClick={() => setMenu(false)}>
              Back to the match
            </button>
            <button
              onClick={() => {
                renderer.current?.camera.fit();
                setMenu(false);
              }}
            >
              Fit map to screen
            </button>
            <button className="danger" onClick={onExit} aria-label="Leave match">
              Leave match
            </button>
          </div>
        </div>
      )}

      {hud.phase === 'shop' && <Shop hud={hud} controls={controls} send={sendAs} />}

      {hud.phase === 'over' && (
        <div className="round-over" role="dialog">
          <h2>
            {hud.teams && hud.winnerTeam >= 0 ? (
              <>Team {teamName(hud.winnerTeam)} wins the match</>
            ) : hud.winner >= 0 ? (
              <>
                <span className="swatch" style={{ background: pcolor(hud.winner) }} /> Player{' '}
                {hud.winner + 1} wins the match
              </>
            ) : (
              'Draw'
            )}
          </h2>
          <Scoreboard hud={hud} final />
          <div className="row">
            {onRematch && <button onClick={onRematch}>Play again</button>}
            {onExit && <button onClick={onExit}>Menu</button>}
          </div>
        </div>
      )}

      <div className="controls">
        <div className="aim">
          <Scrub
            kind="angle"
            label="Angle"
            unit="°"
            value={t?.angle ?? 0}
            spec={ANGLE_SCRUB}
            step={1}
            big={5}
            invert
            minor={5}
            major={45}
            disabled={!canAim}
            onChange={(v) => t && aim(v, t.power)}
          />
          <Scrub
            kind="power"
            label="Power"
            value={t?.power ?? 0}
            spec={POWER_SCRUB}
            step={5}
            big={25}
            minor={25}
            major={100}
            {...(t && t.chill > 0 ? { cap: CHILL_POWER } : {})}
            disabled={!canAim}
            onChange={(v) => t && aim(t.angle, v)}
          />
          {t && t.chill > 0 && (
            <span className="frost-note" role="status">
              ❄ Frosted: max power {CHILL_POWER}
            </span>
          )}
          {t && t.glue > 0 && (
            <span className="glue-note" role="status">
              ◍ Glued: can't drive
            </span>
          )}
        </div>
        <Drive tank={t} disabled={!canAim} send={send} />
        <div className="weapons" aria-label="Gear">
          {t?.gear
            .filter((g) => g.count > 0)
            .map((g) =>
              g.deploy === 'manual' ? (
                <button
                  key={g.id}
                  className="gear-btn"
                  disabled={!canAim || !g.useful}
                  onClick={() => send({ type: 'useGear', gear: g.id })}
                  aria-label={`Use ${g.name} (${g.count} left)`}
                  data-testid={`gear-${g.id}`}
                >
                  <span className="wname">{g.label}</span>
                  <span className="count">use · {g.count}</span>
                </button>
              ) : (
                <span
                  key={g.id}
                  className="gear-chip"
                  title={`${g.name}: opens by itself on a long fall`}
                >
                  <span className="wname">{g.label}</span>
                  <span className="count">auto · {g.count}</span>
                </span>
              ),
            )}
        </div>
        <WeaponPicker
          inventory={t?.inventory ?? []}
          selected={t?.weapon ?? ''}
          disabled={!canAim}
          onSelect={(weapon) => send({ type: 'selectWeapon', weapon })}
        />
        <button
          className="fire"
          disabled={!canAim}
          onClick={() => send({ type: 'fire' })}
          data-testid="fire"
        >
          FIRE
        </button>
      </div>
    </>
  );
}
