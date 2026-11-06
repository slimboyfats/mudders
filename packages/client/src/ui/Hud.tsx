import type { RefObject } from 'react';
import type { Input } from '@mudders/shared';
import { clampAim } from '../game/aim';
import type { HudState } from '../game/match';
import type { Renderer } from '../render';
import { teamName } from '../game/setup';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { Scoreboard, Shop } from './Shop';
import { CHILL_POWER } from '@mudders/sim';

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
function Wind({ wind, max }: { wind: number; max: number }) {
  const k = max > 0 ? Math.max(-1, Math.min(1, wind / max)) : 0;
  const n = Math.round(Math.abs(k) * 10);
  const arrow = k === 0 ? '·' : k > 0 ? '→' : '←';
  return (
    <div className="wind" aria-label={`Wind ${n} ${k > 0 ? 'right' : k < 0 ? 'left' : 'calm'}`}>
      <span className="label">Wind</span>
      <span className="wind-bar">
        <span
          className="wind-fill"
          style={{
            left: k < 0 ? `${50 + k * 50}%` : '50%',
            width: `${Math.abs(k) * 50}%`,
          }}
        />
      </span>
      <span className="wind-value">
        {arrow} {n}
      </span>
    </div>
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
  const off = disabled || left <= 0;
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

function Stepper(props: {
  label: string;
  value: number;
  unit?: string;
  step: number;
  big: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const { label, value, unit, step, big, disabled, onChange } = props;
  return (
    <div className="stepper">
      <span className="label">{label}</span>
      <button
        disabled={disabled}
        onClick={() => onChange(value - big)}
        aria-label={`${label} −${big}`}
      >
        «
      </button>
      <button
        disabled={disabled}
        onClick={() => onChange(value - step)}
        aria-label={`${label} −${step}`}
      >
        −
      </button>
      <span className="value">
        {value}
        {unit}
      </span>
      <button
        disabled={disabled}
        onClick={() => onChange(value + step)}
        aria-label={`${label} +${step}`}
      >
        +
      </button>
      <button
        disabled={disabled}
        onClick={() => onChange(value + big)}
        aria-label={`${label} +${big}`}
      >
        »
      </button>
    </div>
  );
}

export function Hud({ hud, canAim, send, sendAs, controls, renderer, onExit, onRematch }: Props) {
  const t = hud.tanks[hud.activePlayer];
  const aim = (angle: number, power: number) =>
    send({ type: 'aim', ...clampAim({ angle, power }) });
  return (
    <>
      <div className="hud-top">
        <div className={`players${hud.tanks.length > 4 ? ' many' : ''}`}>
          {hud.tanks.map((p) => (
            <div
              key={p.player}
              className={`player${p.player === hud.activePlayer && hud.phase === 'aim' ? ' active' : ''}${p.alive ? '' : ' dead'}`}
            >
              <span className="swatch" style={{ background: pcolor(p.player) }} />
              <span className="pname">P{p.player + 1}</span>
              {hud.teams && (
                <span
                  className={`team-badge team-${p.team}`}
                  aria-label={`Team ${teamName(p.team)}`}
                >
                  {teamName(p.team)}
                </span>
              )}
              <span className="hp">{p.alive ? `${p.health}` : '✕'}</span>
              {p.alive && p.shield > 0 && (
                <span className="shield" aria-label="shield">
                  +{p.shield}
                </span>
              )}
              <span className="pscore" aria-label="score">
                {p.score}
              </span>
            </div>
          ))}
        </div>
        <div className="round-info">
          <span className="badge" aria-label="Round">
            R{Math.min(hud.round, hud.rounds)}/{hud.rounds}
          </span>
          {hud.suddenDeath && <span className="badge sudden">Sudden death</span>}
        </div>
        <Wind wind={hud.wind} max={hud.windMax} />
        <div className="cam">
          <button onClick={() => renderer.current?.camera.zoomBy(-1)} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => renderer.current?.camera.fit()} aria-label="Fit map">
            Fit
          </button>
          <button onClick={() => renderer.current?.camera.zoomBy(1)} aria-label="Zoom in">
            +
          </button>
          {onExit && (
            <button onClick={onExit} aria-label="Leave match">
              ✕
            </button>
          )}
        </div>
      </div>

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
        <div className="turn" style={{ borderColor: t ? pcolor(t.player) : undefined }}>
          {hud.phase === 'aim' && t ? (
            <>
              <span className="swatch" style={{ background: pcolor(t.player) }} />
              Player {t.player + 1}
              {t.bot ? <small className="thinking"> {t.bot} is aiming…</small> : null}
              {hud.seconds >= 0 && (
                <span className={`timer${hud.seconds <= 5 ? ' low' : ''}`} aria-label="Time left">
                  {hud.seconds}s
                </span>
              )}
            </>
          ) : hud.phase === 'resolve' ? (
            'Incoming…'
          ) : hud.phase === 'shop' ? (
            'Shop'
          ) : (
            'Match over'
          )}
        </div>
        <div className="aim">
          <Stepper
            label="Angle"
            unit="°"
            value={t?.angle ?? 0}
            step={1}
            big={10}
            disabled={!canAim}
            onChange={(v) => t && aim(v, t.power)}
          />
          <Stepper
            label="Power"
            value={t?.power ?? 0}
            step={5}
            big={50}
            disabled={!canAim}
            onChange={(v) => t && aim(t.angle, v)}
          />
          {t && t.chill > 0 && (
            <span className="frost-note" role="status">
              ❄ Frosted: max power {CHILL_POWER}
            </span>
          )}
        </div>
        <Drive tank={t} disabled={!canAim} send={send} />
        <div className="weapons" role="listbox" aria-label="Weapons">
          {t?.inventory.map((w) => (
            <button
              key={w.id}
              role="option"
              aria-selected={w.id === t.weapon}
              className={w.id === t.weapon ? 'selected' : ''}
              disabled={!canAim}
              onClick={() => send({ type: 'selectWeapon', weapon: w.id })}
            >
              <span className="wname">{w.name}</span>
              <span className="count">{w.count < 0 ? '∞' : w.count}</span>
            </button>
          ))}
        </div>
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
