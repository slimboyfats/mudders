import { z } from '@mudders/shared';
import {
  AI_FUEL,
  type AiApi,
  type AiGearView,
  type AiPurchase,
  type AiShopApi,
  type AiSpot,
  type AiTankView,
  type AiWeaponView,
} from '@mudders/sim';

/**
 * Shared helpers for `ai.*` behaviours (§3.7). Everything here runs inside the deterministic sim:
 * integer maths plus `Math.sqrt`, the match RNG only.
 */

/** Living tanks on other teams (in a free-for-all: everyone else). */
export function enemies(api: AiApi): AiTankView[] {
  const team = api.tanks[api.me]!.team;
  return api.tanks.filter((t) => t.alive && t.team !== team);
}

export function me(api: AiApi): AiTankView {
  return api.tanks[api.me]!;
}

/** Nearest living enemy by horizontal distance (ties: lower player number). */
export function nearest(api: AiApi): AiTankView | undefined {
  const m = me(api);
  let best: AiTankView | undefined;
  for (const t of enemies(api)) {
    if (!best || Math.abs(t.x - m.x) < Math.abs(best.x - m.x)) best = t;
  }
  return best;
}

/** Weakest living enemy, then nearest. */
export function weakest(api: AiApi): AiTankView | undefined {
  const m = me(api);
  let best: AiTankView | undefined;
  for (const t of enemies(api)) {
    if (
      !best ||
      t.health < best.health ||
      (t.health === best.health && Math.abs(t.x - m.x) < Math.abs(best.x - m.x))
    ) {
      best = t;
    }
  }
  return best;
}

/** Highest expected damage among owned weapons; unlimited ones win ties (cheapest to spend). */
export function strongest(api: AiApi): AiWeaponView {
  let best = api.weapons[0]!;
  for (const w of api.weapons) {
    if (
      w.expectedDamage > best.expectedDamage ||
      (w.expectedDamage === best.expectedDamage && w.count < 0)
    ) {
      best = w;
    }
  }
  return best;
}

/** An unlimited weapon if there is one, else the most plentiful. */
export function cheapest(api: AiApi): AiWeaponView {
  let best = api.weapons[0]!;
  for (const w of api.weapons) {
    if (w.count < 0) return w;
    if (w.count > best.count) best = w;
  }
  return best;
}

/**
 * Flat-ground estimate of the power that carries `dist` cells at 45° with no wind:
 * range = v² / g, v = maxSpeed × power / 1000.
 */
export function flatPower(api: AiApi, dist: number): number {
  const v = Math.sqrt(Math.abs(dist) * api.gravity * 65536);
  return Math.max(80, Math.min(1000, Math.round((v * 1000) / api.maxSpeed)));
}

/**
 * Binary-search the power that makes a shell at `angle` land at column `tx` (horizontal range
 * grows with power until terrain gets in the way). Returns the best power and its miss in cells.
 */
export function solvePower(
  api: AiApi,
  weapon: number,
  angle: number,
  tx: number,
  iterations = 11,
  from?: AiSpot,
): { power: number; miss: number; hit: number } {
  const m = me(api);
  const dir = tx >= (from ?? m).x ? 1 : -1;
  let lo = 50;
  let hi = 1000;
  let best = { power: hi, miss: Infinity, hit: -1 };
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) >> 1;
    const p = from ? api.predict(weapon, angle, mid, from) : api.predict(weapon, angle, mid);
    const miss = p.landed ? (p.x - tx) * dir : Infinity;
    const enemy = p.tank >= 0 && api.tanks[p.tank]?.team !== m.team;
    const score = enemy ? -1 : Math.abs(miss);
    if (score < (best.hit >= 0 ? -1 : Math.abs(best.miss))) {
      best = { power: mid, miss: p.landed ? p.x - tx : Infinity, hit: p.tank };
    }
    if (!p.landed || miss > 0) hi = mid - 1;
    else lo = mid + 1;
    if (lo > hi) break;
  }
  return best;
}

/** Spend money on the best value-per-price items first, never below `reserve`. */
export function buyByValue(
  api: AiShopApi,
  value: (item: AiShopApi['items'][number]) => number,
  reserve: number,
  maxPicks: number,
): AiPurchase[] {
  const items = api.items
    .filter((i) => i.price > 0 && i.count >= 0 && value(i) > 0)
    .map((i) => ({ i, v: (value(i) * i.pack * 1000) / i.price }))
    .sort((a, b) => b.v - a.v || a.i.index - b.i.index);
  const out: AiPurchase[] = [];
  let money = api.money;
  for (let k = 0; k < items.length && out.length < maxPicks; k++) {
    const it = items[k]!.i;
    const packs = Math.min(3, Math.floor((money - reserve) / it.price));
    if (packs < 1) continue;
    out.push({ item: it.index, packs });
    money -= packs * it.price;
  }
  return out;
}

// ── driving (§3.2) ────────────────────────────────────────────────────────────────────────

/**
 * Where I could drive this turn: my own spot first, then every `step`-th reachable spot each way
 * (and the far end), nearest first, keeping at least `keepFuel` fuel in the tank.
 */
export function candidateSpots(api: AiApi, step: number, keepFuel = 0): AiSpot[] {
  const m = me(api);
  const budget = Math.max(0, Math.min(api.driveLeft, api.fuel - keepFuel));
  const sides: AiSpot[][] = [];
  for (const dir of [-1, 1] as const) {
    const r = api.reach(dir).slice(0, budget);
    const picks: AiSpot[] = [];
    for (let i = step - 1; i < r.length; i += step) picks.push(r[i]!);
    const last = r[r.length - 1];
    if (last && picks[picks.length - 1] !== last) picks.push(last);
    sides.push(picks);
  }
  const out: AiSpot[] = [{ x: m.x, y: m.y }];
  const [l, r] = [sides[0]!, sides[1]!];
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    if (r[i]) out.push(r[i]!);
    if (l[i]) out.push(l[i]!);
  }
  return out;
}

export interface ShotPlan {
  spot: AiSpot;
  weapon: number;
  angle: number;
  power: number;
  /** -1 = the shell hits the target; otherwise how far it lands from it, in cells. */
  score: number;
}

/**
 * The best shot at `target` from each candidate spot in turn (nearest first), trying each weapon
 * and launch angle (mirrored for a target on the left) through the sim's predictor. Stops at the
 * first spot that hits. `plans[0]` is always from the first spot.
 */
export function planShots(
  api: AiApi,
  spots: readonly AiSpot[],
  weapons: readonly number[],
  angles: readonly number[],
  target: AiTankView,
  iterations = 11,
): ShotPlan[] {
  const plans: ShotPlan[] = [];
  for (const spot of spots) {
    const dir = target.x >= spot.x ? 1 : -1;
    let best: ShotPlan = { spot, weapon: weapons[0] ?? 0, angle: 90, power: 300, score: Infinity };
    for (const w of weapons) {
      for (const a of angles) {
        const angle = dir > 0 ? a : 180 - a;
        const s = solvePower(api, w, angle, target.x, iterations, spot);
        const score = s.hit === target.player ? -1 : Math.abs(s.miss);
        if (score < best.score) best = { spot, weapon: w, angle, power: s.power, score };
        if (score < 0) break;
      }
      if (best.score < 0) break;
    }
    plans.push(best);
    if (best.score < 0) break;
  }
  return plans;
}

/**
 * Drive for a better shot: stay if the shot from here hits (or nothing reachable is at least
 * `minGain` cells better), else go to the nearest spot that hits, or failing that the one that
 * misses by least.
 */
export function moveForShot(
  api: AiApi,
  target: AiTankView | undefined,
  weapons: readonly number[],
  angles: readonly number[],
  step: number,
  keepFuel: number,
  minGain: number,
): number {
  const m = me(api);
  if (!target || weapons.length === 0) return m.x;
  // at most 6 spots besides my own, so a turn's thinking stays within a frame or two
  const spots = candidateSpots(api, step, keepFuel).slice(0, 7);
  if (spots.length < 2) return m.x;
  const plans = planShots(api, spots, weapons, angles, target, 9);
  const here = plans[0]!;
  if (here.score < 0) return m.x;
  let best = here;
  for (const p of plans) if (p.score < best.score) best = p;
  if (best.score < 0 || best.score + minGain <= here.score) return best.spot.x;
  return m.x;
}

/**
 * The far end of my reach in `dir` (keeping `keepFuel`), or my own column if I can't move that
 * way.
 */
export function driveEnd(api: AiApi, dir: -1 | 1, keepFuel = 0): number {
  const budget = Math.max(0, Math.min(api.driveLeft, api.fuel - keepFuel));
  const r = api.reach(dir).slice(0, budget);
  return r[r.length - 1]?.x ?? me(api).x;
}

/** Shop: fuel packs to top my tank up to `want` units, never spending below `reserve`. */
export function topUpFuel(api: AiShopApi, want: number, reserve: number): AiPurchase[] {
  const goal = Math.min(want, api.fuelMax);
  if (api.fuel >= goal || api.fuelPrice <= 0) return [];
  const need = Math.ceil((goal - api.fuel) / api.fuelPack);
  const afford = Math.floor((api.money - reserve) / api.fuelPrice);
  const packs = Math.min(need, afford);
  return packs > 0 ? [{ item: AI_FUEL, packs }] : [];
}

/** Money left after a list of purchases (the kernel may still refuse some of them). */
export function moneyAfter(api: AiShopApi, buys: readonly AiPurchase[]): number {
  let money = api.money;
  for (const b of buys) {
    const price =
      b.item === AI_FUEL
        ? api.fuelPrice
        : b.gear === true
          ? (api.gear[b.item]?.price ?? 0)
          : (api.items[b.item]?.price ?? 0);
    money -= price * b.packs;
  }
  return money;
}

/**
 * A weapon that does no damage but moves a lot of ground (dirt that buries, charges that dig) if I
 * own one: bots that bought it use it now and then on a healthy target.
 */
export function terrainWeapon(api: AiApi): AiWeaponView | undefined {
  let best: AiWeaponView | undefined;
  for (const w of api.weapons) {
    if (w.expectedDamage > 0 || w.terrainValue < 0.5) continue;
    if (!best || w.terrainValue > best.terrainValue) best = w;
  }
  return best;
}

/** How much gear a personality likes to carry (§5.1): parachutes, shields, batteries. */
export const GearPlanSchema = z.strictObject({
  chute: z.number().int().min(0).max(20),
  shield: z.number().int().min(0).max(20),
  battery: z.number().int().min(0).max(20),
});
export type GearPlan = z.infer<typeof GearPlanSchema>;

/**
 * Shop: top gear up to `plan`, spending at most half of what's above `reserve` (weapons get the
 * rest). Parachutes first, then shields (the strongest one I can comfortably afford), then
 * batteries.
 */
export function buyGear(api: AiShopApi, plan: GearPlan, reserve: number): AiPurchase[] {
  const out: AiPurchase[] = [];
  let budget = Math.floor(Math.max(0, api.money - reserve) / 2);
  const have = (pick: (g: AiShopApi['gear'][number]) => boolean) =>
    api.gear.reduce((n, g) => n + (pick(g) ? g.count : 0), 0);
  const buy = (g: AiShopApi['gear'][number] | undefined, want: number) => {
    if (!g) return;
    let n = 0;
    while (want > 0 && g.price <= budget && g.count + n * g.pack < g.max) {
      out.push({ item: g.index, packs: 1, gear: true });
      budget -= g.price;
      want -= g.pack;
      n++;
    }
  };
  const chutes = api.gear.filter((g) => g.deploy === 'fall');
  buy(chutes[0], plan.chute - have((g) => g.deploy === 'fall'));
  // strongest shield that costs no more than a third of the budget, else the cheapest
  const shields = api.gear
    .filter((g) => g.deploy === 'manual' && g.shield > 0)
    .sort((a, b) => b.shield - a.shield || a.index - b.index);
  const shield = shields.find((g) => g.price * 3 <= budget) ?? shields[shields.length - 1];
  buy(shield, plan.shield - have((g) => g.deploy === 'manual' && g.shield > 0));
  const battery = api.gear.find((g) => g.deploy === 'manual' && g.heal > 0);
  buy(battery, plan.battery - have((g) => g.deploy === 'manual' && g.heal > 0));
  return out;
}

/**
 * Gear to switch on before this shot: a shield when mine is down to less than half of what a
 * shield gives (the heavy one when I'm badly hurt), a battery when it would heal in full or I'm
 * below a third of my health.
 */
export function gearToUse(api: AiApi): number[] {
  const m = me(api);
  if (enemies(api).length === 0) return [];
  const out: number[] = [];
  const ready = api.gear.filter((g) => g.useful && g.count > 0);
  const shields = ready
    .filter((g) => g.shield > 0)
    .sort((a, b) => a.shield - b.shield || a.index - b.index);
  const hurt = m.health * 2 < m.maxHealth;
  const shield: AiGearView | undefined = hurt ? shields[shields.length - 1] : shields[0];
  if (shield && m.shield * 2 < shield.shield) out.push(shield.index);
  const battery = ready.find((g) => g.heal > 0);
  if (battery && (m.health + battery.heal <= m.maxHealth || m.health * 3 < m.maxHealth)) {
    out.push(battery.index);
  }
  return out;
}
