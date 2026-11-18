import type { ShotPrediction, Tank, World } from '@mudders/sim';

/**
 * Training coach: after each shot, says what went wrong (wind, angle, power, the ground in the
 * way) and how to think about the next one. Client-only: it reads the world through the same
 * read-only predictor the bots aim with (`World.predict`), so it changes nothing in the sim.
 * Notes: docs/TRAINING.md.
 */

/** A shot read at the moment it was fired, against the world it was fired into. */
export interface ShotReport {
  angle: number;
  power: number;
  weapon: number;
  /** Player the shot was meant for: the live foe nearest where it came down. */
  target: number;
  result: 'hit' | 'close' | 'short' | 'long' | 'away';
  /** Cells along the line to the target where it landed: negative short, positive long. */
  missBy: number;
  /** Cells the wind moved the landing point: positive carried it on, negative held it back. */
  windDrift: number;
  /** In still air this aim was a direct hit: the wind alone cost it. */
  windOnly: boolean;
  /** Came down short on ground well above the target: a hill in the way. */
  blocked: boolean;
  /** Cells the landing point moves per 50 power at this angle (how touchy power is here). */
  per50: number;
  /** Wind along the line to the target, -1 (full headwind) to 1 (full tailwind). */
  wind: number;
  /** Shell left the map or never came down. */
  lost: boolean;
  /** Width of your tank in cells: the coach counts distances in tanks. */
  tank: number;
}

/** An aim for the next shot. */
export interface Aim {
  angle: number;
  power: number;
}

/** What the coach card shows. */
export interface Coaching {
  headline: string;
  tone: 'good' | 'near' | 'miss';
  /** Why it went where it went, one line each. */
  why: string[];
  /** How to think about the next shot. */
  next: string;
  /** A rule of thumb that fits this miss. */
  tip: string;
  /** An aim that hits from here (the "Set it for me" button), or null. */
  suggest: Aim | null;
}

/** Within this many cells of the target counts as close. */
const CLOSE = 14;
/** Most of a wind's strength, as a fraction of the mode's top wind, before it reads as calm. */
const CALM = 0.08;

/** Which way an aim shoots: 1 right, -1 left, 0 straight up. */
export function aimDir(angle: number): number {
  return angle < 90 ? 1 : angle > 90 ? -1 : 0;
}

function liveFoes(w: World, me: Tank): Tank[] {
  return w.tanks.filter((t) => t.alive && t.player !== me.player && t.team !== me.team);
}

/** The foe nearest a column. */
function nearest(foes: readonly Tank[], x: number): Tank | undefined {
  let best: Tank | undefined;
  for (const t of foes) if (!best || Math.abs(t.x - x) < Math.abs(best.x - x)) best = t;
  return best;
}

/** The shot in still air: the base wind is set aside for one prediction and put back. */
function stillAir(w: World, me: Tank, weapon: number, angle: number, power: number) {
  const base = w.windBase;
  w.windBase = 0;
  try {
    return w.predict(me, weapon, angle, power);
  } finally {
    w.windBase = base;
  }
}

/** Landing column of a prediction, with a shell that left the map put just past its edge. */
function landX(w: World, p: ShotPrediction): number {
  if (p.landed) return p.x;
  return p.x <= 0 ? -40 : p.x >= w.grid.width - 1 ? w.grid.width + 40 : p.x;
}

/** Reads a shot just fired (call it before the shell changes the ground). */
export function reportShot(w: World, me: Tank, aim: Aim & { weapon: number }): ShotReport | null {
  const foes = liveFoes(w, me);
  if (foes.length === 0) return null;
  const { angle, power, weapon } = aim;
  const p = w.predict(me, weapon, angle, power);
  const x = landX(w, p);
  const hitTank = w.tanks[p.tank];
  const target = p.landed && hitTank && hitTank.player !== me.player ? hitTank : nearest(foes, x);
  if (!target) return null;
  const dir = Math.sign(target.x - me.x) || 1;
  const missBy = Math.round((x - target.x) * dir);
  const still = stillAir(w, me, weapon, angle, power);
  const windDrift = Math.round((x - landX(w, still)) * dir);
  const max = w.mode.wind.max * 65536;
  const wind = max > 0 ? Math.max(-1, Math.min(1, (w.windBase / max) * dir)) : 0;
  const more = w.predict(me, weapon, angle, Math.min(1000, power + 50));
  const less = w.predict(me, weapon, angle, Math.max(0, power - 50));
  const per50 = Math.round(Math.abs(landX(w, more) - landX(w, less)) / 2);
  const hit = p.landed && p.tank === target.player;
  const away = aimDir(angle) !== dir;
  const result: ShotReport['result'] = hit
    ? 'hit'
    : away && missBy < -CLOSE
      ? 'away'
      : Math.abs(missBy) <= CLOSE
        ? 'close'
        : missBy < 0
          ? 'short'
          : 'long';
  const between = (x - me.x) * dir > 0 && missBy < 0;
  const blocked = p.landed && result === 'short' && between && target.y - p.y > 12;
  const windOnly = !hit && still.landed && still.tank === target.player;
  return {
    angle,
    power,
    weapon,
    target: target.player,
    result,
    missBy,
    windDrift,
    windOnly,
    blocked,
    per50,
    wind,
    lost: !p.landed,
    tank: Math.max(1, me.w),
  };
}

/** Does this aim hit `target` from where `me` stands now? */
function hits(w: World, me: Tank, weapon: number, target: number, angle: number, power: number) {
  const p = w.predict(me, weapon, angle, power);
  return p.landed && p.tank === target;
}

/**
 * The aim nearest `from` that hits the target from here, in today's ground and wind: first the
 * same angle with other power, then the same power at other angles, then both. Null when no
 * plain shot gets there.
 */
export function suggestAim(
  w: World,
  me: Tank,
  weapon: number,
  target: number,
  from: Aim,
): (Aim & { change: 'power' | 'angle' | 'both' }) | null {
  const t = w.tanks[target];
  if (!t || !t.alive) return null;
  const dir = Math.sign(t.x - me.x) || 1;
  // keep the angle when it points the right way
  if (aimDir(from.angle) === dir) {
    for (let d = 0; d <= 1000; d += 5) {
      for (const p of d === 0 ? [from.power] : [from.power + d, from.power - d]) {
        if (p < 50 || p > 1000) continue;
        if (hits(w, me, weapon, target, from.angle, p))
          return { angle: from.angle, power: p, change: 'power' };
      }
    }
  }
  // same power, nearest angle on the target's side
  const lo = dir > 0 ? 5 : 91;
  const hi = dir > 0 ? 89 : 175;
  const a0 = Math.max(lo, Math.min(hi, from.angle));
  for (let d = 0; d <= 84; d++) {
    for (const a of d === 0 ? [a0] : [a0 + d, a0 - d]) {
      if (a < lo || a > hi) continue;
      if (hits(w, me, weapon, target, a, from.power))
        return { angle: a, power: from.power, change: 'angle' };
    }
  }
  // both: a coarse grid, nearest by a mix of the two
  let best: Aim | null = null;
  let cost = Infinity;
  for (let a = lo; a <= hi; a += 3) {
    for (let p = 100; p <= 1000; p += 25) {
      const c = Math.abs(a - from.angle) / 90 + Math.abs(p - from.power) / 1000;
      if (c >= cost) continue;
      if (hits(w, me, weapon, target, a, p)) {
        best = { angle: a, power: p };
        cost = c;
      }
    }
  }
  return best ? { ...best, change: 'both' } : null;
}

/** "a light headwind" / "a strong tailwind" / "no wind". */
export function windWords(wind: number): string {
  const s = Math.abs(wind);
  if (s < CALM) return 'almost no wind';
  const how = s < 0.35 ? 'a light' : s < 0.7 ? 'a strong' : 'a very strong';
  return `${how} ${wind < 0 ? 'headwind' : 'tailwind'}`;
}

/**
 * A distance in tank lengths, the unit a player can see: "less than a tank", "1 tank",
 * "2½ tanks", "12 tanks".
 */
export function tanks(cells: number, tank: number): string {
  const v = Math.abs(cells) / Math.max(1, tank);
  if (v < 0.75) return 'less than a tank';
  const n = v >= 10 ? Math.round(v) : Math.round(v * 2) / 2;
  const whole = Math.floor(n);
  const half = n - whole >= 0.5 ? '½' : '';
  return `${whole}${half} ${n === 1 ? 'tank' : 'tanks'}`;
}
/** Angles the player sees: the HUD shows the angle as is (0 right, 90 up, 180 left). */
const deg = (a: number) => `${a}°`;

/**
 * Turns a report (and, once it is your turn again, the aim that would hit now) into the card.
 * `history` holds this range's earlier reports, oldest first, for bracketing.
 */
export function coach(
  r: ShotReport,
  suggest: (Aim & { change: 'power' | 'angle' | 'both' }) | null,
  history: readonly ShotReport[] = [],
  windNow = r.wind,
): Coaching {
  const why: string[] = [];
  const cells = (n: number) => tanks(n, r.tank);
  const off = Math.abs(r.missBy);
  let headline: string;
  let tone: Coaching['tone'] = 'miss';
  switch (r.result) {
    case 'hit':
      headline = 'Direct hit!';
      tone = 'good';
      break;
    case 'close':
      headline =
        r.missBy === 0 ? 'Right on it' : `Close: ${cells(off)} ${r.missBy < 0 ? 'short' : 'long'}`;
      tone = 'near';
      break;
    case 'away':
      headline = 'Wrong way';
      why.push('Under 90° shoots right, over 90° shoots left. Turn the barrel toward the target.');
      break;
    case 'short':
      headline = r.lost ? 'Lost it' : `${cells(off)} short`;
      break;
    default:
      headline = r.lost ? 'Over and off the map' : `${cells(off)} long`;
  }
  if (r.blocked) why.push('It came down on the high ground in front of the target.');
  if (r.result !== 'hit' && r.result !== 'away') {
    if (r.windOnly) why.push('In still air that was a direct hit. The wind took it.');
    else if (Math.abs(r.windDrift) >= 6)
      why.push(
        r.windDrift < 0
          ? `${capital(windWords(r.wind))} held it back about ${cells(-r.windDrift)}.`
          : `${capital(windWords(r.wind))} carried it about ${cells(r.windDrift)} farther.`,
      );
    else if (Math.abs(r.wind) < CALM) why.push('No wind to speak of: this miss was all aim.');
    if (r.per50 > 0 && !r.blocked)
      why.push(`At ${deg(r.angle)}, every 50 power moves the landing about ${cells(r.per50)}.`);
  }

  // how to think about the next one
  let next: string;
  const prev = history.length > 0 ? history[history.length - 1] : undefined;
  const bracket =
    prev &&
    prev.angle === r.angle &&
    prev.target === r.target &&
    Math.sign(prev.missBy) !== Math.sign(r.missBy) &&
    prev.result !== 'hit' &&
    r.result !== 'hit';
  if (r.result === 'hit') {
    next = `Remember it: ${deg(r.angle)} at ${r.power} power in ${windWords(r.wind)}.`;
  } else if (bracket && prev) {
    const mid = Math.round((prev.power + r.power) / 20) * 10;
    next = `You have it bracketed: one short, one long. Split the difference, about ${mid} power.`;
  } else if (suggest) {
    if (suggest.change === 'power') {
      const d = suggest.power - r.power;
      next =
        d === 0
          ? `Same again: ${deg(r.angle)}, ${r.power} power.`
          : `Keep ${deg(r.angle)} and ${d > 0 ? 'add' : 'take off'} about ${Math.abs(round10(d))} power.`;
    } else if (suggest.change === 'angle') {
      next = `Keep ${r.power} power and go ${steeper(suggest.angle, r.angle)}, about ${deg(suggest.angle)}.`;
    } else {
      next = `Change both: about ${deg(suggest.angle)} and ${round10(suggest.power)} power.`;
    }
  } else if (r.result === 'away') {
    next = `Try ${deg(180 - r.angle)}: the same arc, the other way.`;
  } else if (r.blocked) {
    next = 'Go steeper so the shell clears the hill, then add power to reach.';
  } else {
    next = r.missBy < 0 ? 'Add power.' : 'Take some power off.';
  }
  if (r.result !== 'hit' && Math.abs(windNow - r.wind) > 0.15)
    next += ` The wind has changed: now ${windWords(windNow)}.`;

  return { headline, tone, why, next, tip: tipFor(r), suggest };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function round10(n: number): number {
  return Math.max(10, Math.round(Math.abs(n) / 10) * 10) * Math.sign(n || 1);
}

/** "steeper" or "flatter" for an angle change, on either side. */
function steeper(to: number, from: number): string {
  // steepness is closeness to 90°
  return Math.abs(90 - to) < Math.abs(90 - from) ? 'steeper' : 'flatter';
}

/** A rule of thumb that fits the shot. */
function tipFor(r: ShotReport): string {
  if (r.result === 'away') return 'Look at where the target is first, then pick the side.';
  if (r.blocked) return 'A hill in the way? Lob it: 55° to 70° clears most ridges.';
  if (r.wind <= -0.35 && r.missBy < 0)
    return 'Into the wind, aim flatter and hit harder: a flat shot spends less time in the air.';
  if (r.wind >= 0.35 && r.missBy > 0)
    return 'With the wind behind you, ease off the power: it carries the shell for you.';
  if (r.result === 'hit') return 'Same spot, same wind: the same aim hits again.';
  if (Math.abs(r.wind) >= 0.35 && Math.abs(r.angle - 90) < 30)
    return 'Steep shots fly a long time, so the wind moves them more. Go flatter in strong wind.';
  if (Math.abs(r.angle - 90) > 55)
    return 'Flat shots are fast but easily stopped by hills. Around 45° reaches farthest.';
  return 'Change one thing at a time, power or angle, so you learn what each one does.';
}
