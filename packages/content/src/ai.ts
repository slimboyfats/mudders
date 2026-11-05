import type { AiApi, AiShopApi, AiTankView, AiWeaponView } from '@mudders/sim';

/**
 * Shared helpers for `ai.*` behaviours (§3.7). Everything here runs inside the deterministic sim:
 * integer maths plus `Math.sqrt`, the match RNG only.
 */

export function enemies(api: AiApi): AiTankView[] {
  return api.tanks.filter((t) => t.alive && t.player !== api.me);
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
): { power: number; miss: number; hit: number } {
  const m = me(api);
  const dir = tx >= m.x ? 1 : -1;
  let lo = 50;
  let hi = 1000;
  let best = { power: hi, miss: Infinity, hit: -1 };
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) >> 1;
    const p = api.predict(weapon, angle, mid);
    const miss = p.landed ? (p.x - tx) * dir : Infinity;
    const score = p.tank >= 0 && p.tank !== api.me ? -1 : Math.abs(miss);
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
): { item: number; packs: number }[] {
  const items = api.items
    .filter((i) => i.price > 0 && i.count >= 0 && value(i) > 0)
    .map((i) => ({ i, v: (value(i) * i.pack * 1000) / i.price }))
    .sort((a, b) => b.v - a.v || a.i.index - b.i.index);
  const out: { item: number; packs: number }[] = [];
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
