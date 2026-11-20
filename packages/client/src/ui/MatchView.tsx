import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Input } from '@mudders/shared';
import { KERNEL_VERSION, STEP_PARTS } from '@mudders/sim';
import {
  effectSounds,
  processSounds,
  setListener,
  setMusic,
  setMusicTension,
  sfx,
} from '../audio/bridge';
import { musicTension } from '../audio/tension';
import { clampAim, slingshotAim } from '../game/aim';
import { AutoQuality, renderDpr } from '../game/auto-quality';
import { MatchStats, earthCells } from '../game/awards';
import { HudStore, SIM_BUDGET_MS, type GameMatch, volleyView } from '../game/match';
import { paletteFrom } from '../game/palette';
import {
  PerfRecorder,
  SlowWatch,
  perfFileName,
  stallDetail,
  watchGl,
  type PerfContext,
} from '../game/perf-log';
import { BUILD_ID } from '../config';
import type { Settings } from '../game/settings';
import { holdSimWarmup } from '../game/sim-warmup';
import { ShotGhost } from '../game/shot-ghost';
import { TurnSignals } from '../game/turn-signals';
import { SlowMo } from '../game/slowmo';
import { loadRenderer, type Renderer, type Vec2 } from '../render';
import { HitStop } from '../render/impact';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { previewing } from './WeaponPreview';
import { PerfMeter, PerfOverlay, saveText, type PerfLog, type PerfStats } from './Perf';
import { Hud } from './Hud';
import { PlayerMarkers, measureInsets, type MarkerTank } from './markers';
import type { FrameOverlay } from './training-overlay';
import { GhostOverlay } from './ghost-overlay';

interface Props {
  match: GameMatch;
  settings: Settings;
  /** Which players this client controls (hot-seat: all). */
  controls: (player: number) => boolean;
  onExit?: () => void;
  onRematch?: () => void;
  /** Extra panel (sandbox). */
  side?: React.ReactNode;
  /** Overlay on the playfield (online: connection state). */
  banner?: React.ReactNode;
  /** The caller shows its own match-over card (solo challenges), so the HUD doesn't. */
  ownEnd?: boolean;
  /** Drawn over the map every frame (training: tank grid, shot paths). */
  overlay?: FrameOverlay;
  /**
   * Last-shot ghost (a host rule): your previous shell's path over the map while you aim, and
   * marks on the angle and power pills at the values you fired with.
   */
  ghost?: boolean;
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

/** A frame is not started sooner than this after the one before (see the frame loop). */
const MIN_FRAME_MS = 10;

export function MatchView({
  match,
  settings,
  controls,
  onExit,
  onRematch,
  side,
  banner,
  ownEnd,
  overlay,
  ghost = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const overlayHostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);
  const rendererRef = useRef<Renderer | null>(null);
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);
  // last-shot ghost: the path over the map (frame loop) and the aim marks on the pills (state,
  // set once per shot)
  const ghostRef = useRef<GhostOverlay | null>(null);
  const [lastAims, setLastAims] = useState<readonly ({ angle: number; power: number } | null)[]>(
    [],
  );
  useEffect(() => {
    if (!ghost) return;
    const shots = new ShotGhost();
    const ov = new GhostOverlay(shots, (p) => controlsRef.current(p));
    ghostRef.current = ov;
    shots.onShot = (p, shot) =>
      setLastAims((a) => {
        const next = a.slice();
        next[p] = { angle: shot.angle, power: shot.power };
        return next;
      });
    const off = match.subscribe(() => shots.observe(match.world));
    return () => {
      off();
      shots.onShot = null;
      ov.dispose();
      ghostRef.current = null;
    };
  }, [match, ghost]);
  const describe = useMemo(() => {
    const text = new Map<string, string>();
    for (const w of match.content.list('weapon')) text.set(w.id, w.meta.description);
    return (id: string) => text.get(id) ?? '';
  }, [match]);
  const hudStore = useMemo(() => new HudStore(match), [match]);
  const simHud = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  // a volley: this device's seat that still aims stands in for the active player
  const hud = useMemo(() => volleyView(simHud, controls), [simHud, controls]);
  const volleySeat = useRef(-1);
  const seat = hud.volley ? hud.activePlayer : -1;
  useEffect(() => {
    volleySeat.current = seat;
  }, [seat]);
  const refreshHud = hudStore.refresh;
  // end-of-match awards, counted from the snapshot stream over the whole match
  const stats = useMemo(() => new MatchStats(earthCells(match.content.list('material'))), [match]);
  useEffect(() => match.subscribe((s) => stats.ingest(s)), [match, stats]);
  const over = hud.phase === 'over';
  const awards = useMemo(() => (over ? stats.awards() : []), [over, stats]);
  const [drag, setDrag] = useState<Drag | null>(null);
  // where the active tank's barrel is on screen. Not React state: it changes on every frame of a
  // pan, and a render of the whole match view per frame held the game (and the rain) up. The
  // frame loop moves the aim guide itself, with a transform the compositor applies for free.
  const anchorRef = useRef<Vec2 | null>(null);
  const aimRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<PerfStats | null>(null);
  // playfield size in CSS px, for the aim guide's length
  const [viewMin, setViewMin] = useState(300);
  const perfOn = useRef(settings.perfHud);
  useEffect(() => {
    perfOn.current = settings.perfHud;
  }, [settings.perfHud]);
  // performance recorder: Record in the overlay starts it, Stop saves the log as a text file
  const recRef = useRef<PerfRecorder | null>(null);
  // seconds recorded so far, or null when not recording
  const [recording, setRecording] = useState<number | null>(null);
  const [perfLog, setPerfLog] = useState<PerfLog | null>(null);
  const startRec = useCallback(() => {
    const w = match.world;
    const c = canvasRef.current;
    const rp = rendererRef.current?.perf;
    const timed = rp?.enable(true) ?? false;
    const mem = (navigator as { deviceMemory?: number }).deviceMemory;
    recRef.current = new PerfRecorder(
      {
        when: new Date().toISOString(),
        kernel: KERNEL_VERSION,
        build: BUILD_ID,
        browser: navigator.userAgent,
        gpu: rp?.device() ?? 'unknown',
        'gpu timer': !timed
          ? 'not offered by this browser'
          : rp?.gpuSampled()
            ? 'not offered by this browser; measured for under a second when frames turn slow and after each Slow now (those frames stutter from the measuring itself)'
            : 'offered by this browser',
        cores: navigator.hardwareConcurrency,
        memory: mem === undefined ? 'unknown' : `${mem} GB`,
        screen: `${screen.width}x${screen.height} at ${window.devicePixelRatio}x`,
        canvas: c ? `${c.width}x${c.height}` : 'unknown',
        quality: `${settings.quality}${settings.autoQuality ? ' (steps down by itself)' : ''}`,
        map: `${w.grid.width}x${w.grid.height}`,
        players: w.tanks.length,
        bots: hudStore.get().tanks.filter((t) => t.bot).length,
        online: match.net().split(' ')[0] || 'no',
        'sim thread': match.simMs
          ? "worker (sim ms are the worker's; the page draws its ticks a frame later)"
          : 'page',
      },
      STEP_PARTS,
    );
    setPerfLog(null);
    setRecording(0);
  }, [match, hudStore, settings.quality, settings.autoQuality]);
  const stopRec = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    rendererRef.current?.perf?.enable(false);
    setRecording(null);
    if (!rec) return;
    const log = { name: perfFileName(new Date()), text: rec.report() };
    saveText(log.name, log.text);
    setPerfLog(log);
  }, []);
  // while recording, the browser's own reports of a blocked page go in the log too
  const isRec = recording !== null;
  useEffect(() => {
    if (!isRec || typeof PerformanceObserver === 'undefined') return;
    const types = PerformanceObserver.supportedEntryTypes;
    // long animation frames say what blocked (Chromium); long tasks only that something did
    const type = ['long-animation-frame', 'longtask'].find((t) => types.includes(t));
    if (!type) return;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        recRef.current?.stall(e.startTime, type, e.duration, stallDetail(e));
      }
    });
    obs.observe({ type });
    return () => obs.disconnect();
  }, [isRec]);
  // ... and so do shaders built during play, draw calls, console errors and a hidden tab
  const glWatch = useRef<{ take: () => number } | null>(null);
  useEffect(() => {
    if (!isRec) return;
    const note = (kind: string, detail: string): void =>
      recRef.current?.note(performance.now(), kind, detail);
    const gl = canvasRef.current?.getContext('webgl2');
    const watch = gl ? watchGl(gl, (ms) => note('shader link', `${ms.toFixed(1)} ms`)) : null;
    glWatch.current = watch;
    const text = (a: unknown[]): string =>
      a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ');
    const { error, warn } = console;
    console.error = (...a: unknown[]): void => {
      note('console error', text(a));
      error.apply(console, a);
    };
    console.warn = (...a: unknown[]): void => {
      note('console warn', text(a));
      warn.apply(console, a);
    };
    const onError = (e: ErrorEvent): void =>
      note(
        'js error',
        `${e.message} at ${e.filename.split('/').pop() ?? ''}:${e.lineno}:${e.colno}`,
      );
    const onReject = (e: PromiseRejectionEvent): void => note('promise', String(e.reason));
    const onVis = (): void => note('tab', document.hidden ? 'hidden' : 'shown');
    // the address bar sliding away, a rotation: the whole page is laid out again
    const onResize = (): void => note('resize', `${window.innerWidth}x${window.innerHeight}`);
    window.addEventListener('error', onError);
    window.addEventListener('resize', onResize);
    window.addEventListener('unhandledrejection', onReject);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      watch?.stop();
      glWatch.current = null;
      console.error = error;
      console.warn = warn;
      window.removeEventListener('error', onError);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('unhandledrejection', onReject);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isRec]);
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
  // your-turn signals: buzz, tab title flash, notification in the background (Settings)
  const signalsRef = useRef<TurnSignals | null>(null);
  useEffect(() => {
    const sig = new TurnSignals();
    signalsRef.current = sig;
    return () => {
      sig.dispose();
      signalsRef.current = null;
    };
  }, []);
  useEffect(() => {
    const sig = signalsRef.current;
    if (!sig) return;
    sig.vibrate = settings.vibrate;
    sig.notify = settings.turnNotify;
  }, [settings.vibrate, settings.turnNotify]);
  useEffect(() => {
    if (!myTurn) return;
    sfx('audio.turn');
    signalsRef.current?.turn();
  }, [myTurn, hud.activePlayer, hud.turn]);
  // a short buzz as your shell leaves, a longer one when your tank takes damage
  const seen = useRef({ phase: hud.phase, mine: false, health: [] as number[] });
  useEffect(() => {
    const s = seen.current;
    const sig = signalsRef.current;
    if (s.phase === 'aim' && hud.phase === 'resolve' && s.mine) sig?.fired();
    s.phase = hud.phase;
    s.mine = myTurn;
    let lost = 0;
    for (const t of hud.tanks) {
      const was = s.health[t.player];
      if (was !== undefined && t.health < was && t.bot === '' && controls(t.player))
        lost += was - t.health;
      s.health[t.player] = t.health;
    }
    if (lost > 0 && hud.phase !== 'shop') sig?.hit(lost);
  }, [hud, myTurn, controls]);
  // the opening shop (before round 1) has no round to celebrate
  const roundOver = (hud.phase === 'shop' && hud.results.length > 0) || hud.phase === 'over';
  useEffect(() => {
    if (roundOver) sfx('audio.round-end');
  }, [roundOver]);
  // music that follows the match (§7.2): layers build with the tension; a sting when the last
  // two of a bigger match face off, and when sudden death starts
  const tension = musicTension(hud);
  useEffect(() => {
    setMusicTension(tension);
  }, [tension]);
  useEffect(() => () => setMusicTension(0), []);
  const alive = hud.tanks.reduce((n, t) => n + (t.alive ? 1 : 0), 0);
  const duel =
    alive === 2 && hud.tanks.length > 2 && (hud.phase === 'aim' || hud.phase === 'resolve');
  useEffect(() => {
    if (duel) sfx('audio.sting-duel');
  }, [duel]);
  const sudden = hud.suddenDeath && hud.phase !== 'shop' && hud.phase !== 'over';
  useEffect(() => {
    if (sudden) sfx('audio.sting-sudden-death');
  }, [sudden]);

  const send = useCallback(
    (input: Input) => {
      // fire again while it flies (Cloud Whale) goes from the seat whose shell it is
      if (input.type === 'fire' && hud.phase === 'resolve' && hud.command >= 0) {
        match.input(hud.command, input);
      } else if (hud.activePlayer >= 0) match.input(hud.controller, input);
    },
    [match, hud.activePlayer, hud.controller, hud.phase, hud.command],
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
    const ear = { x: 0, y: 0, halfW: 0, halfH: 0 };
    setListener(ear);
    const w = match.world;
    const meter = new PerfMeter();
    const slowmo = (slowmoRef.current ??= new SlowMo());
    // hit-stop (§2a): big hits hold the picture for a beat; off with screen shake
    const stop = new HitStop(settings.shake);
    // the weapon fired last, for the performance recorder's notes
    const weapons = match.content.list('weapon');
    let fired = '';
    const unfeed = match.subscribe((s) => {
      stop.feed(s);
      for (const e of s.effectEvents) {
        if (e.type === 'muzzle') fired = weapons[e.params.weapon ?? -1]?.id ?? '';
      }
    });
    // frames running long (a phone under a big blast): the quality steps down by itself
    const auto = settings.autoQuality ? new AutoQuality(settings.quality) : null;
    let quality = settings.quality;
    let resize: (() => void) | undefined;
    // player markers: chips over tiny tanks when zoomed out, arrows at the edge for off-screen ones
    const markers = markersRef.current ? new PlayerMarkers(markersRef.current) : null;
    const marks: MarkerTank[] = [];
    let measured = -1e9;
    const perfContext = (): PerfContext => {
      const wd = match.world;
      const sim = match.takePerf();
      const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        phase: wd.phase,
        round: wd.round,
        turn: wd.turn,
        quality,
        particles: rendererRef.current?.perf?.particles() ?? 0,
        projectiles: sim.projectiles,
        debris: sim.debris,
        settle: sim.settle,
        react: sim.react,
        gpu: rendererRef.current?.perf?.takeGpu() ?? null,
        note: `${sim.note} zoom ${wrap.dataset['zoom'] ?? '?'}`,
        weapon: fired,
        holding: sim.holding,
        net: sim.net,
        heap: heap ? heap.usedJSHeapSize / 1048576 : 0,
        parts: sim.parts,
        worstTick: sim.worstTick,
      };
    };
    let recFrame: (() => void) | null = null;
    let probing = false;
    // while recording: measures the GPU by itself when frames turn slow
    let slowWatch: SlowWatch | null = null;
    // sim ms so far, where the sim runs in the worker and this loop can't time it
    let simSeen = match.simMs?.() ?? 0;
    match.limitFrame(SIM_BUDGET_MS);
    const frame = (now: number) => {
      const r = rendererRef.current;
      if (!r) return;
      raf = requestAnimationFrame(frame);
      // Even pacing on a fast screen. At 120 Hz a frame that takes 10 ms misses every other
      // refresh, and one that takes a little longer misses two: frames then land 8, 17 or 25 ms
      // apart in no order, and steady motion (rain) stutters although nothing is slow. The sim
      // ticks at 60 anyway, so a frame is never started sooner than MIN_FRAME_MS after the one
      // before: every second refresh at 120 Hz, every refresh at 60 and 90.
      if (last >= 0 && now - last < MIN_FRAME_MS) return;
      const wall = last < 0 ? 0 : now - last;
      last = now;
      const stepped = auto?.frame(wall);
      if (stepped) {
        quality = stepped;
        r.setQuality(stepped);
        wrap.dataset['quality'] = stepped;
        resize?.();
      }
      // camera glides and fling momentum run on wall time, untouched by hit-stop and slow-mo
      r.camera.update(Math.min(wall, 100));
      // current zoom and view centre (map cells), for the touch smoke test
      const zoom = (r.camera.scale / renderDpr(quality, window.devicePixelRatio)).toFixed(2);
      if (wrap.dataset['zoom'] !== zoom) wrap.dataset['zoom'] = zoom;
      const mid = r.unproject({ x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 });
      const centre = `${Math.round(mid.x)},${Math.round(mid.y)}`;
      if (wrap.dataset['centre'] !== centre) wrap.dataset['centre'] = centre;
      // sound in space: the view centre and half size are the ears (one object, updated in place)
      const corner = r.unproject({ x: 0, y: 0 });
      ear.x = mid.x;
      ear.y = mid.y;
      ear.halfW = mid.x - corner.x;
      ear.halfH = mid.y - corner.y;
      // a hit-stop hold eats wall time first; the slow-mo finisher then slows what is left
      const scale = slowmo.next(wall);
      const simDt = stop.take(wall) * scale;
      if (perfOn.current) {
        const rec = recRef.current;
        if (probing !== (rec !== null)) {
          probing = rec !== null;
          match.timeParts(probing);
        }
        const top = performance.now();
        const tick0 = match.world.tick;
        const step0 = r.perf?.pushMs() ?? 0;
        const t0 = performance.now();
        const at = match.advance(simDt);
        const t1 = performance.now();
        if (!previewing.open) r.render(at, stop.held);
        const t2 = performance.now();
        const ticks = match.world.tick - tick0;
        // in the worker: its own time for the ticks that came back since the last frame
        const simNow = match.simMs?.();
        const sim = simNow === undefined ? t1 - t0 : simNow - simSeen;
        if (simNow !== undefined) simSeen = simNow;
        const stats = meter.frame(now, wall, ticks, sim, t2 - t1);
        if (stats) {
          setPerf(stats);
          if (rec) setRecording(rec.seconds);
        }
        if (!rec) slowWatch = null;
        else if ((slowWatch ??= new SlowWatch()).frame(now, wall)) r.perf?.probeGpu();
        if (rec) {
          // the renderer takes each tick in as it is made, inside `advance`: split that off
          const step = (r.perf?.pushMs() ?? 0) - step0;
          recFrame = () => {
            // with the sim in the worker, taking its packets in is this thread's own work
            const unpack = simNow === undefined ? 0 : t1 - t0 - step;
            const other = performance.now() - top - (t2 - t0) + unpack;
            rec.drew(glWatch.current?.take() ?? 0);
            rec.frame(
              now,
              wall,
              ticks,
              simNow === undefined ? t1 - t0 - step : sim,
              step,
              t2 - t1,
              other,
              simDt,
              perfContext,
            );
          };
        }
      } else {
        // a shop weapon preview is open over it: the map is covered, so only the preview draws
        const at = match.advance(simDt);
        if (!previewing.open) r.render(at, stop.held);
      }
      slowmo.observe(match.world);
      if (match.world.phase === 'resolve') holdSimWarmup(now);
      refreshHud();
      const w0 = match.world;
      const tank = w0.tanks[w0.volley ? volleySeat.current : w0.activePlayer];
      if (tank) {
        const p = r.project({ x: tank.x + 0.5, y: tank.y - 7.5 });
        const a = anchorRef.current;
        if (!a || a.x !== p.x || a.y !== p.y) {
          anchorRef.current = p;
          const el = aimRef.current;
          if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
      }
      if (markers) {
        const ts = match.world.tanks;
        const huds = hudStore.get().tanks;
        marks.length = ts.length;
        for (const [i, t] of ts.entries()) {
          marks[i] = {
            player: i,
            alive: t.alive,
            x: t.x + 0.5,
            y: t.y - 14,
            health: t.health,
            maxHealth: t.maxHealth,
            name: huds[i]?.bot ?? '',
            active: match.world.volley
              ? match.world.phase === 'aim' && t.alive && !t.ready
              : i === match.world.activePlayer,
          };
        }
        // the HUD can reflow (a player row wraps, the shop closes): re-measure now and then
        if (now - measured >= 500) {
          measured = now;
          const insets = measureInsets(wrap);
          markers.setInsets(insets);
          // the performance overlay sits just above the controls
          wrap.style.setProperty('--hud-bottom', `${Math.round(insets.bottom)}px`);
          // the turn banner drops in under the top bar however many rows it wraps to; set on
          // the match root (the HUD lies beside the playfield) and only when it changes, since
          // a new value restyles everything below
          const top = `${Math.round(insets.top)}px`;
          const root = wrap.closest<HTMLElement>('.match');
          if (root && root.style.getPropertyValue('--hud-top') !== top)
            root.style.setProperty('--hud-top', top);
        }
        const cell = r.camera.scale / renderDpr(quality, window.devicePixelRatio);
        markers.update(marks, (q) => r.project(q), cell, wrap.clientWidth, wrap.clientHeight);
      }
      const ov = overlayRef.current;
      const host = overlayHostRef.current;
      if (ov && host) ov.frame(host, (q) => r.project(q), match.world);
      const gh = ghostRef.current;
      if (gh && host) gh.frame(host, (q) => r.project(q), match.world);
      // the recorder closes the frame last, so the HUD and marker work above counts as "other"
      if (recFrame) {
        recFrame();
        recFrame = null;
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
          dayNight: settings.dayNight,
          chatter: settings.chatter,
          walls: settings.walls,
          onCues: effectSounds,
          onProcesses: processSounds,
          // a late frame never pays GPU smoke/particle passes for more than two ticks
          catchUp: 2,
        });
        rendererRef.current = r;
        const size = () => {
          const rect = wrap.getBoundingClientRect();
          r.resize(rect.width, rect.height, renderDpr(quality, window.devicePixelRatio));
          setViewMin(Math.min(rect.width, rect.height));
        };
        size();
        resize = size;
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
      recRef.current = null;
      match.timeParts(false);
      setRecording(null);
      processSounds(null);
      setListener(null);
    };
  }, [
    match,
    settings.quality,
    settings.autoQuality,
    settings.shake,
    settings.dayNight,
    settings.chatter,
    settings.walls,
    settings.theme,
    refreshHud,
    hudStore,
  ]);

  // keyboard (§3.3): fine and coarse steps, fire, weapon cycle, zoom
  const keyAim = useRef<{ angle: number; power: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const r = rendererRef.current;
      if (e.key === '+' || e.key === '=') return r?.camera.glideBy(1);
      if (e.key === '-' || e.key === '_') return r?.camera.glideBy(-1);
      if (e.key === '0' || e.key === 'f') return r?.camera.fit();
      // fire again while a Cloud Whale shell flies: let it go
      if ((e.key === ' ' || e.key === 'Enter') && hud.command >= 0 && controls(hud.command)) {
        e.preventDefault();
        send({ type: 'fire' });
        return;
      }
      if (!canAim || !active) return;
      const big = e.shiftKey;
      // a held arrow repeats faster than the HUD echoes the aim back: count on from what we sent
      let { angle, power } = e.repeat && keyAim.current ? keyAim.current : active;
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
      keyAim.current = clampAim({ angle, power });
      send({ type: 'aim', ...keyAim.current });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) keyAim.current = null;
      if (!canAim || !active) return;
      if ('aAdD'.includes(e.key) && e.key.length === 1) send({ type: 'drive', dir: 0 });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canAim, active, send, hud.command, controls]);

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
    if (!active || hud.phase !== 'aim') return null;
    const a = (active.angle * Math.PI) / 180;
    const len = 24 + (active.power / 1000) * Math.max(120, viewMin * 0.45) * 0.8;
    // from the barrel, which is where the guide's own origin sits
    return { x2: Math.cos(a) * len, y2: -Math.sin(a) * len };
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
          <div className="frame-overlay" ref={overlayHostRef} aria-hidden="true" />
          <div className="markers" ref={markersRef} aria-hidden="true" />
          {settings.perfHud && perf && (
            <PerfOverlay
              stats={perf}
              recording={recording}
              log={perfLog}
              onRecord={startRec}
              onStop={stopRec}
              onMark={() => {
                recRef.current?.mark(performance.now());
                rendererRef.current?.perf?.probeGpu();
              }}
              onDismiss={() => setPerfLog(null)}
            />
          )}
          {aimLine && (
            <div
              className="aim-guide"
              aria-hidden="true"
              ref={(el) => {
                aimRef.current = el;
                const p = anchorRef.current;
                if (el && p) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
              }}
            >
              <svg className="aim-lines">
                <line
                  x1={0}
                  y1={0}
                  x2={aimLine.x2}
                  y2={aimLine.y2}
                  stroke="#000"
                  strokeWidth={drag ? 5 : 4}
                  strokeLinecap="round"
                  opacity={0.35}
                />
                <line
                  x1={0}
                  y1={0}
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
              </svg>
              <svg className="aim-marker" viewBox="-8 -23 16 11">
                <polygon
                  points="-7,-22 7,-22 0,-13"
                  fill={color}
                  stroke="#000"
                  strokeOpacity={0.6}
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
          <svg className="overlay" aria-hidden="true">
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
        ownEnd={ownEnd ?? false}
        awards={awards}
        lastAim={lastAims[hud.activePlayer] ?? null}
        describe={describe}
        {...(onExit ? { onExit } : {})}
        {...(onRematch ? { onRematch } : {})}
      />
    </div>
  );
}
