import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Input } from '@mudders/shared';
import { effectSounds, processSounds, setMusic, sfx } from '../audio/bridge';
import { clampAim, slingshotAim } from '../game/aim';
import { HudStore, type SimMatch } from '../game/match';
import { paletteFrom } from '../game/palette';
import type { Settings } from '../game/settings';
import { SlowMo } from '../game/slowmo';
import { loadRenderer, type Renderer, type Vec2 } from '../render';
import { HitStop } from '../render/impact';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { PerfMeter, PerfOverlay, type PerfStats } from './Perf';
import { Hud } from './Hud';

interface Props {
  match: SimMatch;
  settings: Settings;
  /** Which players this client controls (hot-seat: all). */
  controls: (player: number) => boolean;
  onExit?: () => void;
  onRematch?: () => void;
  /** Extra panel (sandbox). */
  side?: React.ReactNode;
  /** Overlay on the playfield (online: connection state). */
  banner?: React.ReactNode;
}

interface Drag {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
}

/** One-finger (or right/middle button) map drag; `vx`/`vy` are CSS px per ms, for the fling. */
interface PanDrag {
  id: number;
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
}

export function MatchView({ match, settings, controls, onExit, onRematch, side, banner }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const hudStore = useMemo(() => new HudStore(match), [match]);
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  const refreshHud = hudStore.refresh;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [anchor, setAnchor] = useState<Vec2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<PerfStats | null>(null);
  // playfield size in CSS px, for the aim guide's length
  const [viewMin, setViewMin] = useState(300);
  const perfOn = useRef(settings.perfHud);
  useEffect(() => {
    perfOn.current = settings.perfHud;
  }, [settings.perfHud]);
  // slow-mo finisher (presentation only: it scales the time fed to the match, never the sim)
  const slowmoRef = useRef<SlowMo | null>(null);
  useEffect(() => {
    const s = (slowmoRef.current ??= new SlowMo());
    s.enabled = settings.slowmo;
    if (!settings.slowmo) s.cancel();
  }, [settings.slowmo]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; mid: Vec2 } | null>(null);
  const panDrag = useRef<PanDrag | null>(null);

  const active = hud.tanks[hud.activePlayer];
  // a mind-linked tank (Telepathy) is steered by its caster's client
  const canAim = hud.phase === 'aim' && active !== undefined && controls(hud.controller);

  // sound (§8b): battle music while the match is up, effect sounds from every snapshot, a call
  // when one of this client's players is up, a fanfare when a round ends
  useEffect(() => {
    setMusic('audio.music-battle');
    const off = match.subscribe((s) => effectSounds(s.effectEvents));
    return () => {
      off();
      setMusic('audio.music-title');
    };
  }, [match]);
  const myTurn = hud.phase === 'aim' && hud.activePlayer >= 0 && controls(hud.controller);
  useEffect(() => {
    if (myTurn) sfx('audio.turn');
  }, [myTurn, hud.activePlayer, hud.turn]);
  // the opening shop (before round 1) has no round to celebrate
  const roundOver = (hud.phase === 'shop' && hud.results.length > 0) || hud.phase === 'over';
  useEffect(() => {
    if (roundOver) sfx('audio.round-end');
  }, [roundOver]);

  const send = useCallback(
    (input: Input) => {
      if (hud.activePlayer >= 0) match.input(hud.controller, input);
    },
    [match, hud.activePlayer, hud.controller],
  );

  // renderer + frame loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let disposed = false;
    let raf = 0;
    let last = -1;
    let ro: ResizeObserver | undefined;
    const w = match.world;
    const meter = new PerfMeter();
    const slowmo = (slowmoRef.current ??= new SlowMo());
    // hit-stop (§2a): big hits hold the picture for a beat; off with screen shake
    const stop = new HitStop(settings.shake);
    const unfeed = match.subscribe((s) => stop.feed(s));
    const frame = (now: number) => {
      const r = rendererRef.current;
      if (!r) return;
      raf = requestAnimationFrame(frame);
      const wall = last < 0 ? 0 : now - last;
      last = now;
      // camera glides and fling momentum run on wall time, untouched by hit-stop and slow-mo
      r.camera.update(Math.min(wall, 100));
      // current zoom and view centre (map cells), for the touch smoke test
      const zoom = (r.camera.scale / (window.devicePixelRatio || 1)).toFixed(2);
      if (wrap.dataset['zoom'] !== zoom) wrap.dataset['zoom'] = zoom;
      const mid = r.unproject({ x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 });
      const centre = `${Math.round(mid.x)},${Math.round(mid.y)}`;
      if (wrap.dataset['centre'] !== centre) wrap.dataset['centre'] = centre;
      // a hit-stop hold eats wall time first; the slow-mo finisher then slows what is left
      const scale = slowmo.next(wall);
      const simDt = stop.take(wall) * scale;
      if (perfOn.current) {
        const tick0 = match.world.tick;
        const t0 = performance.now();
        const at = match.advance(simDt);
        const t1 = performance.now();
        r.render(at, stop.held);
        const t2 = performance.now();
        const stats = meter.frame(now, wall, match.world.tick - tick0, t1 - t0, t2 - t1);
        if (stats) setPerf(stats);
      } else {
        r.render(match.advance(simDt), stop.held);
      }
      slowmo.observe(match.world);
      refreshHud();
      const tank = match.world.tanks[match.world.activePlayer];
      if (tank) {
        const p = r.project({ x: tank.x + 0.5, y: tank.y - 7.5 });
        setAnchor((a) => (a && a.x === p.x && a.y === p.y ? a : p));
      }
    };
    void loadRenderer('pixel', w.grid.width, w.grid.height)
      .then((r) => {
        if (disposed) return;
        r.mount(canvas, match, {
          quality: settings.quality,
          theme: settings.theme,
          palette: paletteFrom(match.content),
          shake: settings.shake,
          onCues: effectSounds,
          onProcesses: processSounds,
        });
        rendererRef.current = r;
        const size = () => {
          const rect = wrap.getBoundingClientRect();
          r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
          setViewMin(Math.min(rect.width, rect.height));
        };
        size();
        ro = new ResizeObserver(size);
        ro.observe(wrap);
        raf = requestAnimationFrame(frame);
      })
      .catch((e: unknown) => setError((e as Error).message));
    // battery (§8a): stop drawing while hidden; the accumulator drops the gap
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = -1;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      disposed = true;
      unfeed();
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', vis);
      ro?.disconnect();
      rendererRef.current?.unmount();
      rendererRef.current = null;
      processSounds(null);
    };
  }, [match, settings.quality, settings.shake, settings.theme, refreshHud]);

  // keyboard (§3.3): fine and coarse steps, fire, weapon cycle, zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const r = rendererRef.current;
      if (e.key === '+' || e.key === '=') return r?.camera.glideBy(1);
      if (e.key === '-' || e.key === '_') return r?.camera.glideBy(-1);
      if (e.key === '0' || e.key === 'f') return r?.camera.fit();
      if (!canAim || !active) return;
      const big = e.shiftKey;
      let { angle, power } = active;
      switch (e.key) {
        case 'ArrowLeft':
          angle += big ? 5 : 1;
          break;
        case 'ArrowRight':
          angle -= big ? 5 : 1;
          break;
        case 'ArrowUp':
          power += big ? 50 : 5;
          break;
        case 'ArrowDown':
          power -= big ? 50 : 5;
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          send({ type: 'fire' });
          return;
        case 'a':
        case 'A':
        case 'd':
        case 'D':
          // hold A / D to drive (§3.2); the keyup handler stops
          if (!e.repeat) send({ type: 'drive', dir: e.key.toLowerCase() === 'a' ? -1 : 1 });
          return;
        case 'Tab':
        case ']':
        case '[': {
          e.preventDefault();
          const inv = active.inventory;
          const i = inv.findIndex((x) => x.id === active.weapon);
          const dir = e.key === '[' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
          const next = inv[(i + dir + inv.length) % inv.length];
          if (next) send({ type: 'selectWeapon', weapon: next.id });
          return;
        }
        default:
          return;
      }
      e.preventDefault();
      send({ type: 'aim', ...clampAim({ angle, power }) });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!canAim || !active) return;
      if ('aAdD'.includes(e.key) && e.key.length === 1) send({ type: 'drive', dir: 0 });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canAim, active, send]);

  // pointer (§8a): one finger moves the camera (at any zoom, past the map edges, with a fling on
  // release); touch aims with the angle/power pills, never by dragging. Two fingers pinch-zoom
  // smoothly around their midpoint and pan with it. Mouse: left button = slingshot anywhere,
  // right/middle = pan, wheel = zoom.
  const local = (e: React.PointerEvent): Vec2 => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const fullPx = () => {
    const rect = wrapRef.current?.getBoundingClientRect() ?? { width: 400, height: 300 };
    return Math.max(120, Math.min(rect.width, rect.height) * 0.45);
  };
  const startPan = (id: number, p: Vec2, t: number) => {
    panDrag.current = { id, x: p.x, y: p.y, t, vx: 0, vy: 0 };
  };
  const startPinch = () => {
    const r = rendererRef.current;
    const [a, b] = [...pointers.current.values()] as [Vec2, Vec2];
    pinch.current = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      scale: r?.camera.scale ?? 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = local(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, p);
    rendererRef.current?.camera.hold();
    if (e.pointerType === 'mouse' && e.button !== 0) {
      startPan(e.pointerId, p, e.timeStamp);
      return;
    }
    if (pointers.current.size === 2) {
      // a second finger turns whatever the first was doing into a pinch
      setDrag(null);
      panDrag.current = null;
      startPinch();
      return;
    }
    if (pointers.current.size !== 1) return;
    if (canAim && e.pointerType === 'mouse') {
      setDrag({ id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y });
    } else {
      startPan(e.pointerId, p, e.timeStamp);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const r = rendererRef.current;
    const pd = panDrag.current;
    if (pd?.id === e.pointerId) {
      const dx = p.x - pd.x;
      const dy = p.y - pd.y;
      r?.camera.pan(dx, dy);
      // smoothed velocity for the fling
      const dt = Math.max(1, e.timeStamp - pd.t);
      const k = Math.min(1, dt / 50);
      panDrag.current = {
        id: pd.id,
        x: p.x,
        y: p.y,
        t: e.timeStamp,
        vx: pd.vx + (dx / dt - pd.vx) * k,
        vy: pd.vy + (dy / dt - pd.vy) * k,
      };
      return;
    }
    if (pinch.current && pointers.current.size >= 2 && r) {
      const [a, b] = [...pointers.current.values()] as [Vec2, Vec2];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      r.camera.pan(mid.x - pinch.current.mid.x, mid.y - pinch.current.mid.y);
      r.camera.zoomTo((pinch.current.scale * dist) / pinch.current.dist, mid, false);
      pinch.current = { ...pinch.current, mid };
      return;
    }
    if (drag && drag.id === e.pointerId) {
      const next = { ...drag, x: p.x, y: p.y };
      setDrag(next);
      const aim = slingshotAim(p.x - drag.x0, p.y - drag.y0, fullPx());
      // release never fires (§8a): the drag only aims
      if (aim) send({ type: 'aim', ...aim });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const r = rendererRef.current;
    const pd = panDrag.current;
    if (pd?.id === e.pointerId) {
      panDrag.current = null;
      // a finger that paused before lifting doesn't fling
      if (e.type === 'pointerup' && e.timeStamp - pd.t < 80) r?.camera.fling(pd.vx, pd.vy);
    }
    if (pinch.current && pointers.current.size < 2) {
      r?.camera.settle(pinch.current.mid);
      pinch.current = null;
      // the finger still down carries on as a pan, never as a surprise slingshot
      const rest = [...pointers.current.entries()][0];
      if (rest) startPan(rest[0], rest[1], e.timeStamp);
    }
    if (drag?.id === e.pointerId) setDrag(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = rendererRef.current;
    if (!r) return;
    const rect = e.currentTarget.getBoundingClientRect();
    r.camera.glideBy(e.deltaY < 0 ? 1 : -1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // aim guide: a line from the barrel whose length follows power, sized to the screen so it
  // reads on a phone as well as a laptop
  const aimLine = (() => {
    if (!anchor || !active || hud.phase !== 'aim') return null;
    const a = (active.angle * Math.PI) / 180;
    const len = 24 + (active.power / 1000) * Math.max(120, viewMin * 0.45) * 0.8;
    return {
      x2: anchor.x + Math.cos(a) * len,
      y2: anchor.y - Math.sin(a) * len,
    };
  })();
  const color = `#${(PLAYER_COLORS[hud.activePlayer % PLAYER_COLORS.length] ?? 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;

  return (
    <div className="match">
      <div className="match-main">
        <div
          className="playfield"
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
          data-testid="playfield"
        >
          <canvas ref={canvasRef} className="game-canvas" />
          {settings.perfHud && perf && <PerfOverlay stats={perf} />}
          <svg className="overlay" aria-hidden="true">
            {aimLine && anchor && (
              <>
                <line
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={aimLine.x2}
                  y2={aimLine.y2}
                  stroke="#000"
                  strokeWidth={drag ? 5 : 4}
                  strokeLinecap="round"
                  opacity={0.35}
                />
                <line
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={aimLine.x2}
                  y2={aimLine.y2}
                  stroke={color}
                  strokeWidth={drag ? 3 : 2}
                  strokeDasharray="6 4"
                  opacity={drag ? 1 : 0.8}
                />
                <circle
                  cx={aimLine.x2}
                  cy={aimLine.y2}
                  r={drag ? 5 : 4}
                  fill={color}
                  stroke="#000"
                  strokeOpacity={0.5}
                />
                <g className="aim-marker">
                  <polygon
                    points={`${anchor.x - 7},${anchor.y - 22} ${anchor.x + 7},${anchor.y - 22} ${anchor.x},${anchor.y - 13}`}
                    fill={color}
                    stroke="#000"
                    strokeOpacity={0.6}
                    strokeLinejoin="round"
                  />
                </g>
              </>
            )}
            {drag && (
              <>
                <circle cx={drag.x0} cy={drag.y0} r={10} fill="none" stroke="#fff" opacity={0.5} />
                <line
                  x1={drag.x0}
                  y1={drag.y0}
                  x2={drag.x}
                  y2={drag.y}
                  stroke="#fff"
                  strokeWidth={2}
                  opacity={0.4}
                />
              </>
            )}
          </svg>
          {drag && active && (
            <div
              className="aim-readout"
              style={{ left: drag.x, top: drag.y - 36, '--pc': color } as React.CSSProperties}
              data-testid="aim-readout"
            >
              {active.angle}° · {active.power}
            </div>
          )}
          {error && <div className="error">Renderer failed: {error}</div>}
          {banner}
        </div>
        {side}
      </div>
      <Hud
        hud={hud}
        canAim={canAim}
        send={send}
        sendAs={(p, input) => match.input(p, input)}
        controls={controls}
        renderer={rendererRef}
        {...(onExit ? { onExit } : {})}
        {...(onRematch ? { onRematch } : {})}
      />
    </div>
  );
}
