import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { nudgeStep, scrubMove, scrubValue, type ScrubSpec } from '../game/scrub';

interface Props {
  kind: 'angle' | 'power';
  label: string;
  value: number;
  unit?: string;
  spec: ScrubSpec;
  /** Nudge step (tap) and the bigger step once a nudge button is held. */
  step: number;
  big: number;
  /** Value grows to the left (angle: 0° points right, 180° left, like the barrel). */
  invert?: boolean;
  /** Ruler: minor tick every `minor` units, labelled major tick every `major`. */
  minor: number;
  major: number;
  /** Lower ceiling shown on the gauge (frost caps power). */
  cap?: number;
  disabled: boolean;
  onChange: (v: number) => void;
}

const RULER_W = 240;
const TAP_PX = 5;

function buzz() {
  // Vibration is not Baseline (no iOS): a light tick where it exists, nothing elsewhere
  if ('vibrate' in navigator) navigator.vibrate(4);
}

/** Tiny barrel dial for the angle pill: 0° right, 90° up, 180° left. */
function Dial({ angle }: { angle: number }) {
  const r = 11;
  const a = (angle * Math.PI) / 180;
  return (
    <svg className="scrub-dial" viewBox="-14 -14 28 16" aria-hidden="true">
      <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`} className="dial-arc" />
      <line x1={0} y1={0} x2={Math.cos(a) * r} y2={-Math.sin(a) * r} className="dial-needle" />
      <circle cx={0} cy={0} r={2} className="dial-hub" />
    </svg>
  );
}

/**
 * Press anywhere on the pill and drag sideways to change the value (touch or mouse). Moving the
 * finger up, away from the bar, slows it down for fine aim. While dragging, a ruler pops up above
 * the finger with the value in big type. The end buttons nudge by one step and repeat when held.
 */
export function Scrub(props: Props) {
  const { kind, label, value, unit = '', spec, step, big, invert = false, disabled } = props;
  const { minor, major, cap, onChange } = props;
  const dir = invert ? -1 : 1;
  const [drag, setDrag] = useState<{ fine: boolean; moved: boolean } | null>(null);
  // the value this control last sent, shown while the match catches up (null: show `value`)
  const [local, setLocal] = useState<number | null>(null);
  const live = useRef({ id: -1, x: 0, y0: 0, raw: 0, sent: 0, travel: 0 });
  const repeat = useRef(0);
  const dragging = drag !== null && !disabled;
  const shown = !disabled && local !== null ? local : value;

  const emit = (v: number) => {
    const next = scrubValue(spec, v);
    const prev = live.current.sent;
    if (next === prev) return;
    const crossed = Math.floor(next / major) !== Math.floor(prev / major);
    if (crossed || next === spec.min || next === spec.max) buzz();
    live.current.sent = next;
    setLocal(next);
    onChange(next);
  };

  const stopRepeat = () => {
    window.clearTimeout(repeat.current);
    repeat.current = 0;
  };
  const endRepeat = () => {
    stopRepeat();
    setLocal(null);
  };
  useEffect(() => {
    if (disabled) stopRepeat();
    return stopRepeat;
  }, [disabled]);

  const startNudge = (e: PointerEvent<HTMLButtonElement>, sign: 1 | -1) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic event without a live pointer
    }
    stopRepeat();
    live.current.sent = value;
    const tick = (n: number) => {
      emit(live.current.sent + sign * nudgeStep(n, step, big));
      repeat.current = window.setTimeout(() => tick(n + 1), n === 0 ? 380 : 70);
    };
    tick(0);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic event without a live pointer
    }
    live.current = {
      id: e.pointerId,
      x: e.clientX,
      y0: e.clientY,
      raw: value,
      sent: value,
      travel: 0,
    };
    setDrag({ fine: false, moved: false });
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const l = live.current;
    if (!dragging || e.pointerId !== l.id) return;
    const dx = e.clientX - l.x;
    l.x = e.clientX;
    l.travel += Math.abs(dx);
    const off = e.clientY - l.y0;
    l.raw = scrubMove(spec, l.raw, dx * dir, off);
    emit(l.raw);
    const fine = Math.abs(off) > spec.fineAfterPx;
    const moved = l.travel > TAP_PX;
    if (fine !== drag.fine || moved !== drag.moved) setDrag({ fine, moved });
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== live.current.id) return;
    setDrag(null);
    setLocal(null);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const up = invert ? ['ArrowLeft', 'ArrowUp'] : ['ArrowRight', 'ArrowUp'];
    const down = invert ? ['ArrowRight', 'ArrowDown'] : ['ArrowLeft', 'ArrowDown'];
    const s = e.shiftKey ? big : step;
    const v = up.includes(e.key) ? value + s : down.includes(e.key) ? value - s : null;
    if (v === null) return;
    const next = scrubValue(spec, v);
    if (next !== value) onChange(next);
    // the match's own arrow-key shortcuts must not apply the same press twice
    e.preventDefault();
    e.stopPropagation();
  };

  const ppu = 1 / spec.perPx;
  const ticks: number[] = [];
  for (let v = spec.min; v <= spec.max; v += minor) ticks.push(v);
  const range = spec.max - spec.min;
  const frac = (shown - spec.min) / range;
  const left = (
    <button
      className="nudge"
      disabled={disabled}
      aria-label={`${label} ${invert ? '+' : '−'}${step}`}
      onPointerDown={(e) => startNudge(e, invert ? 1 : -1)}
      onPointerUp={endRepeat}
      onPointerCancel={endRepeat}
      onContextMenu={(e) => e.preventDefault()}
      data-testid={`${kind}-${invert ? 'up' : 'down'}`}
    >
      {kind === 'angle' ? '↶' : '−'}
    </button>
  );
  const right = (
    <button
      className="nudge"
      disabled={disabled}
      aria-label={`${label} ${invert ? '−' : '+'}${step}`}
      onPointerDown={(e) => startNudge(e, invert ? -1 : 1)}
      onPointerUp={endRepeat}
      onPointerCancel={endRepeat}
      onContextMenu={(e) => e.preventDefault()}
      data-testid={`${kind}-${invert ? 'down' : 'up'}`}
    >
      {kind === 'angle' ? '↷' : '+'}
    </button>
  );

  return (
    <div
      className={`scrub scrub-${kind}${dragging ? ' dragging' : ''}${dragging && drag.fine ? ' fine' : ''}`}
    >
      {left}
      <div
        className="scrub-body"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={shown}
        aria-valuetext={`${shown}${unit}`}
        aria-disabled={disabled}
        data-testid={`aim-${kind}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="scrub-label">{label}</span>
        <span className="scrub-value value">
          {shown}
          {unit}
        </span>
        {kind === 'angle' ? (
          <Dial angle={shown} />
        ) : (
          <span className="scrub-meter" aria-hidden="true">
            <span className="scrub-meter-fill" style={{ width: `${frac * 100}%` }} />
            {cap !== undefined && cap < spec.max && (
              <span className="scrub-meter-cap" style={{ left: `${(cap / range) * 100}%` }} />
            )}
          </span>
        )}
        <span className="scrub-grip" aria-hidden="true">
          ‹ ›
        </span>
      </div>
      {right}
      {dragging && (
        <div className="scrub-pop" aria-hidden="true">
          <div className="scrub-pop-head">
            <span className="scrub-label">{label}</span>
            <span className="scrub-pop-value">
              {shown}
              {unit}
            </span>
            <span className="scrub-mode">{drag.fine ? 'Fine' : 'Slide up for fine'}</span>
          </div>
          <div className="ruler" style={{ width: RULER_W }}>
            <div
              className="ruler-strip"
              style={{ transform: `translateX(${RULER_W / 2 - dir * shown * ppu}px)` }}
            >
              {ticks.map((v) => (
                <span
                  key={v}
                  className={`tick${v % major === 0 ? ' major' : ''}${cap !== undefined && v > cap ? ' capped' : ''}`}
                  style={{ left: dir * v * ppu }}
                >
                  {v % major === 0 && <span className="tick-n">{v}</span>}
                </span>
              ))}
            </div>
            <span className="ruler-mark" />
          </div>
        </div>
      )}
    </div>
  );
}
