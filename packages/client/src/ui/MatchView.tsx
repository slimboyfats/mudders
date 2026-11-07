import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Input } from '@mudders/shared';
import { effectSounds, setMusic, sfx } from '../audio/bridge';
import { clampAim, slingshotAim } from '../game/aim';
import { HudStore, type SimMatch } from '../game/match';
import { paletteFrom } from '../game/palette';
import type { Settings } from '../game/settings';
import { loadRenderer, type Renderer, type Vec2 } from '../render';
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
  const perfOn = useRef(settings.perfHud);
  useEffect(() => {
    perfOn.current = settings.perfHud;
  }, [settings.perfHud]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: Vec2 } | null>(null);
  const panDrag = useRef<{ id: number; x: number; y: number } | null>(null);

  const active = hud.tanks[hud.activePlayer];
  const canAim = hud.phase === 'aim' && active !== undefined && controls(hud.activePlayer);

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
  const myTurn = hud.phase === 'aim' && hud.activePlayer >= 0 && controls(hud.activePlayer);
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
      if (hud.activePlayer >= 0) match.input(hud.activePlayer, input);
    },
    [match, hud.activePlayer],
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
    const frame = (now: number) => {
      const r = rendererRef.current;
      if (!r) return;
      raf = requestAnimationFrame(frame);
      const dt = last < 0 ? 0 : now - last;
      last = now;
      if (perfOn.current) {
        const tick0 = match.world.tick;
        const t0 = performance.now();
        const at = match.advance(dt);
        const t1 = performance.now();
        r.render(at);
        const t2 = performance.now();
        const stats = meter.frame(now, dt, match.world.tick - tick0, t1 - t0, t2 - t1);
        if (stats) setPerf(stats);
      } else {
        r.render(match.advance(dt));
      }
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
        });
        rendererRef.current = r;
        const size = () => {
          const rect = wrap.getBoundingClientRect();
          r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
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
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', vis);
      ro?.disconnect();
      rendererRef.current?.unmount();
      rendererRef.current = null;
    };
  }, [match, settings.quality, settings.shake, settings.theme, refreshHud]);

  // keyboard (§3.3): fine and coarse steps, fire, weapon cycle, zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const r = rendererRef.current;
      if (e.key === '+' || e.key === '=') return r?.camera.zoomBy(1);
      if (e.key === '-' || e.key === '_') return r?.camera.zoomBy(-1);
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

  // pointer: one finger / left button = slingshot; two fingers = pinch + pan; right/middle = pan
  const local = (e: React.PointerEvent): Vec2 => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const fullPx = () => {
    const rect = wrapRef.current?.getBoundingClientRect() ?? { width: 400, height: 300 };
    return Math.max(120, Math.min(rect.width, rect.height) * 0.45);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = local(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, p);
    if (e.pointerType === 'mouse' && e.button !== 0) {
      panDrag.current = { id: e.pointerId, x: p.x, y: p.y };
      return;
    }
    if (pointers.current.size === 2) {
      setDrag(null);
      const [a, b] = [...pointers.current.values()] as [Vec2, Vec2];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    if (pointers.current.size === 1 && canAim) {
      setDrag({ id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const r = rendererRef.current;
    if (panDrag.current?.id === e.pointerId) {
      r?.camera.pan(p.x - panDrag.current.x, p.y - panDrag.current.y);
      panDrag.current = { id: e.pointerId, x: p.x, y: p.y };
      return;
    }
    if (pinch.current && pointers.current.size >= 2 && r) {
      const [a, b] = [...pointers.current.values()] as [Vec2, Vec2];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      r.camera.pan(mid.x - pinch.current.mid.x, mid.y - pinch.current.mid.y);
      const ratio = dist / Math.max(1, pinch.current.dist);
      if (ratio > 1.25 || ratio < 0.8) {
        r.camera.zoomBy(ratio > 1 ? 1 : -1, mid);
        pinch.current = { dist, mid };
      } else {
        pinch.current = { dist: pinch.current.dist, mid };
      }
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
    if (panDrag.current?.id === e.pointerId) panDrag.current = null;
    if (pointers.current.size < 2) pinch.current = null;
    if (drag?.id === e.pointerId) setDrag(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = rendererRef.current;
    if (!r) return;
    const rect = e.currentTarget.getBoundingClientRect();
    r.camera.zoomBy(e.deltaY < 0 ? 1 : -1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const aimLine = (() => {
    if (!anchor || !active || hud.phase !== 'aim') return null;
    const a = (active.angle * Math.PI) / 180;
    const len = 30 + (active.power / 1000) * 120;
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
              <line
                x1={anchor.x}
                y1={anchor.y}
                x2={aimLine.x2}
                y2={aimLine.y2}
                stroke={color}
                strokeWidth={drag ? 2.5 : 1.5}
                strokeDasharray="5 5"
                opacity={drag ? 0.95 : 0.55}
              />
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
