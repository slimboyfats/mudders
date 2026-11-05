import {
  MODE_CORE_KEYS,
  type DamageType,
  type EffectEvent,
  type EmbeddedExplosion,
  type EmbeddedTerrainOp,
  type EntityView,
  type Input,
  type ModeManifest,
  type RenderSnapshot,
  type WallRule,
} from '@mudders/shared';
import {
  type FlightBehaviour,
  type ModeApi,
  type ModeBehaviour,
  type OpCall,
  type OpInstance,
  type Projectile,
  type SimApi,
  type TankHandle,
  type TerrainOpBehaviour,
} from './behaviours';
import { behaviourParams, type ResolvedContent } from './content/resolve';
import { FP, cosDeci, isqrt, sinDeci, toFixed } from './fixed';
import { DebrisPool } from './debris';
import { Grid } from './grid';
import { Hasher } from './hash';
import { MaterialTable, damageTypeIndex } from './materials';
import { Prng } from './prng';
import { Scratch } from './scratch';
import { settleStep } from './settle';

/** Tank footprint (§2a: ~16×10). x is the centre column, y the row the tank stands on. */
export const TANK_W = 16;
export const TANK_H = 10;
export const TANK_HALF = TANK_W / 2;
const BARREL = 8 * FP;
const MAX_TANK_FALL = 8;

export interface WorldOptions {
  seed: number;
  mode: string;
  players: number;
  map?:
    | { generator?: string | undefined; width?: number | undefined; height?: number | undefined }
    | undefined;
  /** Force tank columns instead of the generator's spawns. */
  tankColumns?: readonly number[] | undefined;
  /** Force wind (cells/tick²) for the whole match. */
  wind?: number | undefined;
  /** Force the turn order (showcases, tests). The mode's order is still drawn, keeping the RNG in step. */
  turnOrder?: readonly number[] | undefined;
}

export type Phase = 'aim' | 'resolve' | 'over';

export interface Tank extends TankHandle {
  readonly player: number;
  alive: boolean;
  x: number;
  y: number;
  health: number;
  angle: number;
  power: number;
  weapon: number;
  inventory: number[];
  falling: boolean;
  fallFrom: number;
  fallVel: number;
  lastHitBy: number;
  kills: number;
  damageDealt: number;
  selfDamage: number;
}

interface OpSite {
  b: TerrainOpBehaviour;
  params: unknown;
}

interface RtExplosion {
  radius: number;
  damage: number;
  damageType: DamageType;
  dt: number;
  linear: boolean;
  push: number;
  op: number;
  effects: [string, Record<string, number>][];
}

type RtImpact =
  | { kind: 'explosion'; e: RtExplosion }
  | { kind: 'op'; op: number; radius: number; damageType: DamageType };

interface RtWeapon {
  id: string;
  flight: FlightBehaviour;
  flightParams: unknown;
  maxTicks: number;
  onSolid: boolean;
  onTank: boolean;
  onWall: boolean;
  onApex: boolean;
  onTimer: number;
  impacts: RtImpact[];
}

interface PendingDeath {
  player: number;
  killer: number;
}

/**
 * The match state and tick loop (ARCHITECTURE §3.2). State advances only through `applyInput`
 * and `tick`; `hash()` covers everything that can influence future ticks.
 */
export class World implements SimApi {
  readonly grid: Grid;
  readonly mats: MaterialTable;
  readonly rng: Prng;
  readonly scratch: Scratch;
  readonly tanks: Tank[] = [];
  readonly weapons: RtWeapon[] = [];
  readonly mode: ModeManifest;
  readonly gravity: number;

  tick = 0;
  phase: Phase = 'aim';
  wind = 0;
  /** Turns taken this round. */
  turn = 0;
  order: number[] = [];
  turnPos = 0;
  projectiles: Projectile[] = [];
  ops: OpInstance[] = [];
  readonly debris = new DebrisPool();

  private readonly opSites: OpSite[] = [];
  private readonly modeB: ModeBehaviour;
  private readonly modeParams: unknown;
  private readonly maxSpeed: number;
  private readonly walls: WallRule;
  private readonly settleCap: number;
  private readonly deathExplosion: RtExplosion;
  private readonly windLocked: boolean;
  private readonly weaponIndex: Record<string, number> = {};
  private nextProjectileId = 1;
  private shooter = -1;
  private pendingInputs: { player: number; input: Input }[] = [];
  private pendingDeaths: PendingDeath[] = [];
  private effects: EffectEvent[] = [];
  private readonly modeApi: ModeApi;

  constructor(
    readonly content: ResolvedContent,
    readonly options: WorldOptions,
  ) {
    const mode = content.get('mode', options.mode);
    this.mode = mode;
    this.modeB = content.behaviours.getKind(mode.behaviour, 'mode');
    this.modeParams = this.modeB.params.parse(behaviourParams(mode, MODE_CORE_KEYS));
    this.rng = new Prng(options.seed);
    this.mats = new MaterialTable(content.list('material'));
    const width = options.map?.width ?? mode.map.width;
    const height = options.map?.height ?? mode.map.height;
    this.grid = new Grid(width, height);
    this.scratch = new Scratch(this.grid.size);
    this.gravity = toFixed(mode.physics.gravity);
    this.maxSpeed = toFixed(mode.physics.maxSpeed);
    this.walls = mode.walls;
    this.settleCap = mode.settle.maxCellsPerTick;
    this.windLocked = options.wind !== undefined;
    if (options.wind !== undefined) this.wind = toFixed(options.wind);

    for (const w of content.list('weapon')) {
      this.weaponIndex[w.id] = this.weapons.length;
      const flight = content.behaviours.getKind(w.flight.behaviour, 'flight');
      const flightParams = flight.params.parse(behaviourParams(w.flight));
      let onTimer = 0;
      const named: string[] = [];
      for (const t of w.triggers) {
        if (typeof t === 'string') named.push(t);
        else onTimer = t.onTimer;
      }
      this.weapons.push({
        id: w.id,
        flight,
        flightParams,
        maxTicks: flight.maxTicks(flightParams),
        onSolid: named.includes('onSolid'),
        onTank: named.includes('onTank'),
        onWall: named.includes('onWall'),
        onApex: named.includes('onApex'),
        onTimer,
        impacts: w.impact.map((imp): RtImpact =>
          'explosion' in imp
            ? { kind: 'explosion', e: this.bindExplosion(imp.explosion) }
            : {
                kind: 'op',
                op: this.bindOp(imp.terrainOp),
                radius: imp.radius,
                damageType: imp.damageType,
              },
        ),
      });
    }
    this.deathExplosion = this.bindExplosion(mode.deathExplosion);

    this.modeApi = {
      rng: this.rng,
      players: options.players,
      alive: (p) => this.tanks[p]?.alive ?? false,
      turn: () => this.turn,
      setWind: (w) => {
        if (!this.windLocked) this.wind = w;
      },
      windMax: toFixed(mode.wind.max),
      windType: mode.wind.type,
    };

    this.startRound();
  }

  // ── setup ───────────────────────────────────────────────────────────────────────────────

  private bindOp(op: EmbeddedTerrainOp): number {
    const b = this.content.behaviours.getKind(op.behaviour, 'terrainop');
    this.opSites.push({ b, params: b.params.parse(behaviourParams(op)) });
    return this.opSites.length - 1;
  }

  private bindExplosion(e: EmbeddedExplosion): RtExplosion {
    const keys = Object.keys(e.effects).sort();
    return {
      radius: e.radius,
      damage: e.damage,
      damageType: e.damageType,
      dt: damageTypeIndex(e.damageType),
      linear: e.falloff === 'linear',
      push: e.push,
      op: e.terrainOp ? this.bindOp(e.terrainOp) : -1,
      effects: keys.map((k) => [k, { ...e.effects[k] }]),
    };
  }

  private startRound(): void {
    const genId = this.options.map?.generator ?? this.mode.map.generator;
    const genItem = this.content.get('gen', genId);
    const gen = this.content.behaviours.getKind(genItem.behaviour, 'gen');
    const res = gen.generate(
      this,
      gen.params.parse(behaviourParams(genItem)),
      this.options.players,
    );
    // Pre-settle anything loose the generator left, so a match starts still.
    this.grid.markDirty(0, 0, this.grid.width - 1, this.grid.height - 1);
    for (let i = 0; i < 2000 && this.grid.settling; i++) {
      settleStep(this.grid, this.mats, i, this.grid.size);
    }
    this.grid.clearSettle();
    this.grid.takeRenderRects();
    this.grid.addRenderRect(0, 0, this.grid.width, this.grid.height);
    this.grid.fallVel.fill(0);

    const loadout = this.mode.loadout;
    for (let p = 0; p < this.options.players; p++) {
      const col = this.options.tankColumns?.[p] ?? res.spawns[p] ?? 0;
      const x = Math.max(TANK_HALF, Math.min(this.grid.width - TANK_HALF - 1, col));
      const inventory = new Array<number>(this.weapons.length).fill(0);
      for (const l of loadout) inventory[this.weaponIndex[l.weapon]!] = l.count;
      const first = loadout[0] ? this.weaponIndex[loadout[0].weapon]! : 0;
      const tank: Tank = {
        player: p,
        alive: true,
        x,
        y: 0,
        health: this.mode.startingHealth,
        angle: x < this.grid.width / 2 ? 45 : 135,
        power: 500,
        weapon: first,
        inventory,
        falling: false,
        fallFrom: 0,
        fallVel: 0,
        lastHitBy: -1,
        kills: 0,
        damageDealt: 0,
        selfDamage: 0,
      };
      tank.y = this.restingY(tank);
      this.tanks.push(tank);
    }

    this.order = this.modeB.turnOrder(this.modeApi, this.modeParams);
    if (this.options.turnOrder) this.order = [...this.options.turnOrder];
    this.modeB.onRoundStart(this.modeApi, this.modeParams);
    this.turnPos = 0;
    this.turn = 0;
    this.phase = 'aim';
    this.modeB.onTurnStart(this.modeApi, this.modeParams);
  }

  /** Highest surface under the tank's footprint. */
  private restingY(t: Tank): number {
    let y = this.grid.height;
    for (let x = t.x - TANK_HALF; x < t.x + TANK_HALF; x++) y = Math.min(y, this.grid.surfaceY(x));
    return y;
  }

  // ── public API ──────────────────────────────────────────────────────────────────────────

  get activePlayer(): number {
    return this.order[this.turnPos] ?? -1;
  }

  /** Nothing moving: no projectiles, ops, settling, falling tanks or pending deaths. */
  get quiet(): boolean {
    return (
      this.projectiles.length === 0 &&
      this.ops.length === 0 &&
      this.debris.count === 0 &&
      !this.grid.settling &&
      this.pendingDeaths.length === 0 &&
      !this.tanks.some((t) => t.falling)
    );
  }

  /** Queue an input; it is applied at the start of the next tick, in arrival order. */
  applyInput(player: number, input: Input): void {
    this.pendingInputs.push({ player, input });
  }

  launch(cellIndex: number, vx: number, vy: number): boolean {
    const g = this.grid;
    const m = g.material[cellIndex]!;
    if (m === 0) return false;
    const x = cellIndex % g.width;
    const y = (cellIndex - x) / g.width;
    if (
      !this.debris.spawn(
        x * FP + FP / 2,
        y * FP + FP / 2,
        vx,
        vy,
        m,
        g.coating[cellIndex]!,
        g.cellState[cellIndex]!,
      )
    ) {
      return false;
    }
    g.material[cellIndex] = 0;
    g.coating[cellIndex] = 0;
    g.cellState[cellIndex] = 0;
    g.fallVel[cellIndex] = 0;
    return true;
  }

  emit(type: string, x: number, y: number, radius: number, params?: Record<string, number>): void {
    this.effects.push({ type, tick: this.tick, x, y, radius, params: params ?? {} });
  }

  step(): void {
    const inputs = this.pendingInputs;
    this.pendingInputs = [];
    for (const { player, input } of inputs) this.handleInput(player, input);

    this.stepProjectiles();
    this.stepOps();
    this.debris.step(this.grid, this.gravity);
    settleStep(this.grid, this.mats, this.tick, this.settleCap);
    this.stepTanks();

    if (this.phase === 'resolve' && this.quiet) this.endTurn();
    this.tick++;
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  // ── inputs ──────────────────────────────────────────────────────────────────────────────

  private handleInput(player: number, input: Input): void {
    const t = this.tanks[player];
    if (!t || !t.alive || this.phase !== 'aim' || player !== this.activePlayer) return;
    switch (input.type) {
      case 'aim':
        t.angle = Math.max(0, Math.min(180, input.angle | 0));
        t.power = Math.max(0, Math.min(1000, input.power | 0));
        break;
      case 'selectWeapon': {
        const w = Object.hasOwn(this.weaponIndex, input.weapon)
          ? this.weaponIndex[input.weapon]
          : undefined;
        if (w !== undefined && t.inventory[w] !== 0) t.weapon = w;
        break;
      }
      case 'fire':
        this.fire(t);
        break;
    }
  }

  private fire(t: Tank): void {
    const inv = t.inventory[t.weapon] ?? 0;
    if (inv === 0) return;
    if (inv > 0) t.inventory[t.weapon] = inv - 1;
    const a = t.angle * 10;
    const c = cosDeci(a);
    const s = sinDeci(a);
    const speed = Math.trunc((this.maxSpeed * t.power) / 1000);
    const x = t.x * FP + FP / 2 + Math.trunc((BARREL * c) / FP);
    const y = (t.y - TANK_H) * FP - Math.trunc((BARREL * s) / FP);
    this.projectiles.push({
      id: this.nextProjectileId++,
      weapon: t.weapon,
      owner: t.player,
      x,
      y,
      vx: Math.trunc((speed * c) / FP),
      vy: -Math.trunc((speed * s) / FP),
      age: 0,
      alive: true,
      data: [],
    });
    this.shooter = t.player;
    this.phase = 'resolve';
    this.emit('muzzle', Math.floor(x / FP), Math.floor(y / FP), 3, { angle: t.angle });
  }

  // ── projectiles ─────────────────────────────────────────────────────────────────────────

  private stepProjectiles(): void {
    const W = this.grid.width * FP;
    const H = this.grid.height;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const w = this.weapons[p.weapon]!;
      let px = p.x;
      const py = p.y;
      const pvy = p.vy;
      w.flight.step(this, p, w.flightParams);
      p.age++;

      if (p.x < 0 || p.x >= W) {
        const wx = p.x < 0 ? 0 : this.grid.width - 1;
        const wy = Math.floor(p.y / FP);
        if (this.walls === 'concrete' || w.onWall) {
          this.impact(p, wx, Math.max(0, Math.min(H - 1, wy)));
          continue;
        }
        if (this.walls === 'absorb') {
          p.alive = false;
          continue;
        }
        if (this.walls === 'bounce') {
          p.x = p.x < 0 ? -p.x : 2 * W - p.x - 1;
          p.vx = -p.vx;
        } else {
          p.x = ((p.x % W) + W) % W;
          px = p.x;
        }
      }

      const hit = this.trace(px, py, p, w);
      if (hit >= 0) {
        this.impact(p, hit % this.grid.width, Math.floor(hit / this.grid.width));
      } else if (w.onApex && pvy < 0 && p.vy >= 0) {
        this.impactHere(p);
      } else if (w.onTimer > 0 && p.age >= w.onTimer) {
        this.impactHere(p);
      } else if (p.age >= w.maxTicks || p.y < -4 * H * FP) {
        p.alive = false;
      }
    }
    if (this.projectiles.some((p) => !p.alive)) {
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }
  }

  /** Walk the segment cell by cell; return the cell index of the first hit, or -1. */
  private trace(x0: number, y0: number, p: Projectile, w: RtWeapon): number {
    const g = this.grid;
    const dx = p.x - x0;
    const dy = p.y - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / FP));
    for (let i = 1; i <= n; i++) {
      const cx = Math.floor((x0 + Math.trunc((dx * i) / n)) / FP);
      const cy = Math.floor((y0 + Math.trunc((dy * i) / n)) / FP);
      if (cx < 0 || cx >= g.width) continue;
      if (cy >= g.height) return (g.height - 1) * g.width + cx;
      if (cy < 0) continue;
      if (w.onSolid && g.material[cy * g.width + cx] !== 0) return cy * g.width + cx;
      if (w.onTank) {
        for (const t of this.tanks) {
          if (!t.alive || (t.player === p.owner && p.age < 4)) continue;
          if (cx >= t.x - TANK_HALF && cx < t.x + TANK_HALF && cy >= t.y - TANK_H && cy < t.y) {
            return cy * g.width + cx;
          }
        }
      }
    }
    return -1;
  }

  private impactHere(p: Projectile): void {
    const x = Math.max(0, Math.min(this.grid.width - 1, Math.floor(p.x / FP)));
    const y = Math.max(0, Math.min(this.grid.height - 1, Math.floor(p.y / FP)));
    this.impact(p, x, y);
  }

  private impact(p: Projectile, x: number, y: number): void {
    p.alive = false;
    for (const imp of this.weapons[p.weapon]!.impacts) {
      if (imp.kind === 'explosion') this.explode(imp.e, x, y, p.owner);
      else this.startOp(imp.op, x, y, imp.radius, imp.damageType, p.owner);
    }
  }

  // ── explosions, ops, damage ─────────────────────────────────────────────────────────────

  private explode(e: RtExplosion, x: number, y: number, owner: number): void {
    if (e.op >= 0) this.startOp(e.op, x, y, e.radius, e.damageType, owner);
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const dx = t.x - x;
      const dy = t.y - TANK_H / 2 - y;
      const d = isqrt(dx * dx + dy * dy);
      const reach = e.radius + TANK_HALF;
      if (d >= reach) continue;
      if (e.damage > 0) {
        this.damageTank(
          t,
          e.linear ? Math.trunc((e.damage * (reach - d)) / reach) : e.damage,
          owner,
        );
      }
      if (e.push > 0 && dx !== 0) {
        const shove = Math.trunc((e.push * (reach - d)) / reach);
        t.x = Math.max(
          TANK_HALF,
          Math.min(this.grid.width - TANK_HALF - 1, t.x + (dx > 0 ? shove : -shove)),
        );
        t.lastHitBy = owner;
      }
    }
    for (const [type, params] of e.effects) this.emit(type, x, y, e.radius, params);
  }

  private startOp(
    op: number,
    x: number,
    y: number,
    radius: number,
    damageType: DamageType,
    owner: number,
  ): void {
    const site = this.opSites[op]!;
    const call: OpCall = {
      x,
      y,
      radius,
      damageType,
      damageTypeIndex: damageTypeIndex(damageType),
      owner,
    };
    const data = site.b.start(this, site.params, call);
    if (data) this.ops.push({ op, call, t: 0, data });
  }

  private stepOps(): void {
    if (this.ops.length === 0) return;
    const next: OpInstance[] = [];
    for (const inst of this.ops) {
      inst.t++;
      const site = this.opSites[inst.op]!;
      if (site.b.step?.(this, site.params, inst)) next.push(inst);
    }
    this.ops = next;
  }

  private damageTank(t: Tank, dmg: number, by: number): void {
    if (dmg <= 0 || !t.alive) return;
    const applied = Math.min(dmg, t.health);
    t.health -= applied;
    const src = by >= 0 ? this.tanks[by] : undefined;
    if (src) {
      if (by === t.player) src.selfDamage += applied;
      else src.damageDealt += applied;
    }
    if (by >= 0) t.lastHitBy = by;
    if (t.health <= 0) {
      t.alive = false;
      t.falling = false;
      if (src && by !== t.player) src.kills++;
      this.pendingDeaths.push({ player: t.player, killer: by });
    }
  }

  // ── tanks ───────────────────────────────────────────────────────────────────────────────

  private supported(t: Tank): boolean {
    if (t.y >= this.grid.height) return true;
    const m = this.grid.material;
    const row = t.y * this.grid.width;
    for (
      let x = Math.max(0, t.x - TANK_HALF);
      x < Math.min(this.grid.width, t.x + TANK_HALF);
      x++
    ) {
      if (m[row + x] !== 0) return true;
    }
    return false;
  }

  private stepTanks(): void {
    const fd = this.mode.fallDamage;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (!this.supported(t)) {
        if (!t.falling) {
          t.falling = true;
          t.fallFrom = t.y;
          t.fallVel = 0;
        }
        t.fallVel = Math.min(t.fallVel + 1, MAX_TANK_FALL);
        for (let i = 0; i < t.fallVel && !this.supported(t); i++) t.y++;
      } else if (t.falling) {
        t.falling = false;
        const dist = t.y - t.fallFrom;
        const dmg = Math.trunc(Math.max(0, dist - fd.safeCells) * fd.perCell);
        this.emit('land', t.x, t.y, TANK_HALF, { distance: dist });
        this.damageTank(t, dmg, this.shooter >= 0 ? this.shooter : t.lastHitBy);
      }
    }
    // Death explosions; they may chain. Attribution follows the original killer (§3.5).
    for (let i = 0; i < this.pendingDeaths.length; i++) {
      const d = this.pendingDeaths[i]!;
      const t = this.tanks[d.player]!;
      this.emit('tankDeath', t.x, t.y - TANK_H / 2, TANK_W, { player: d.player });
      this.explode(this.deathExplosion, t.x, t.y - TANK_H / 2, d.killer);
    }
    this.pendingDeaths = [];
  }

  // ── turns ───────────────────────────────────────────────────────────────────────────────

  private endTurn(): void {
    this.turn++;
    const alive = this.tanks.filter((t) => t.alive).length;
    if (alive <= 1 || this.turn >= this.mode.turnCap * this.tanks.length) {
      this.phase = 'over';
      return;
    }
    for (let i = 0; i < this.order.length; i++) {
      this.turnPos = (this.turnPos + 1) % this.order.length;
      if (this.tanks[this.order[this.turnPos]!]?.alive) break;
    }
    this.shooter = -1;
    this.phase = 'aim';
    this.modeB.onTurnStart(this.modeApi, this.modeParams);
  }

  // ── observation ─────────────────────────────────────────────────────────────────────────

  weaponId(index: number): string {
    return this.weapons[index]?.id ?? '';
  }

  /** Read-only render snapshot (§2b). Dirty rects and effect events since the previous call. */
  snapshot(): RenderSnapshot {
    const entities: EntityView[] = [];
    for (const t of this.tanks) {
      entities.push({
        kind: 'tank',
        player: t.player,
        x: t.x,
        y: t.y,
        angle: t.angle,
        health: t.health,
        alive: t.alive,
      });
    }
    for (const p of this.projectiles) {
      entities.push({
        kind: 'projectile',
        id: p.id,
        weapon: this.weaponId(p.weapon),
        x: p.x / FP,
        y: p.y / FP,
      });
    }
    const effectEvents = this.effects;
    this.effects = [];
    return {
      tick: this.tick,
      width: this.grid.width,
      height: this.grid.height,
      terrain: this.grid.material,
      coating: this.grid.coating,
      dirtyRects: this.grid.takeRenderRects(),
      entities,
      effectEvents,
      debris: {
        count: this.debris.count,
        x: this.debris.x,
        y: this.debris.y,
        material: this.debris.mat,
      },
      wind: this.wind / FP,
      theme: 'theme.default',
    };
  }

  /** Hash of everything that can influence future ticks (desync detection, golden tests). */
  hash(): string {
    const h = new Hasher();
    const g = this.grid;
    h.num(this.tick).str(this.phase).num(this.wind).num(this.turn).num(this.turnPos);
    h.num(this.shooter).num(this.nextProjectileId);
    for (const o of this.order) h.num(o);
    for (let i = 0; i < 4; i++) h.u32(this.rng.state[i]!);
    h.bytes(g.material).bytes(g.coating).bytes(g.cellState).bytes(g.fallVel);
    h.num(g.settleMinX).num(g.settleMaxX).num(g.settleMaxY);
    for (const t of this.tanks) {
      h.num(t.player)
        .num(t.alive ? 1 : 0)
        .num(t.x)
        .num(t.y)
        .num(t.health)
        .num(t.angle)
        .num(t.power);
      h.num(t.weapon)
        .num(t.falling ? 1 : 0)
        .num(t.fallFrom)
        .num(t.fallVel)
        .num(t.lastHitBy);
      h.num(t.kills).num(t.damageDealt).num(t.selfDamage);
      for (const v of t.inventory) h.num(v);
    }
    h.num(this.projectiles.length);
    for (const p of this.projectiles) {
      h.num(p.id).num(p.weapon).num(p.owner).num(p.x).num(p.y).num(p.vx).num(p.vy).num(p.age);
      for (const v of p.data) h.num(v);
    }
    const d = this.debris;
    h.num(d.count);
    for (let i = 0; i < d.count; i++) {
      h.num(d.x[i]!)
        .num(d.y[i]!)
        .num(d.vx[i]!)
        .num(d.vy[i]!)
        .u32(d.mat[i]!)
        .u32(d.coat[i]!)
        .u32(d.state[i]!);
    }
    h.num(this.ops.length);
    for (const o of this.ops) {
      h.num(o.op).num(o.t).num(o.call.x).num(o.call.y).num(o.call.radius).num(o.call.owner);
      for (const v of o.data) h.num(v);
    }
    return h.hex();
  }
}
