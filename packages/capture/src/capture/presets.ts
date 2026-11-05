import type { Scenario, TimedInput } from '@mudders/shared';
import { World, type ResolvedContent } from '@mudders/sim';

/**
 * Scenario presets (§2d). A preset turns a content id into a full scenario, so "show me" is one
 * command for any item: `pnpm capture weapon-showcase weapon.missile`.
 */
export const PRESETS = ['weapon-showcase'] as const;
export type PresetName = (typeof PRESETS)[number];

export function isPreset(name: string): name is PresetName {
  return (PRESETS as readonly string[]).includes(name);
}

/** The standard target map: small hills, fixed seed, shooter on the left, three targets. */
const SHOWCASE = {
  seed: 4242,
  width: 800,
  height: 400,
  shooter: 80,
  targets: [250, 450, 690],
};

/** Impact column of one shot from a fresh world, or NaN if it never lands. */
function landing(world: World, angle: number, power: number): number {
  world.applyInput(0, { type: 'aim', angle, power });
  world.applyInput(0, { type: 'fire' });
  let lastX = NaN;
  for (let i = 0; i < 1200; i++) {
    world.step();
    const snap = world.snapshot();
    for (const e of snap.effectEvents) {
      if (e.type !== 'muzzle') return e.x;
    }
    const p = snap.entities.find((e) => e.kind === 'projectile');
    if (p) lastX = p.x;
    else if (world.phase !== 'resolve' || i > 2) return lastX;
  }
  return lastX;
}

/**
 * Find angle/power that lands a shot on column `tx` by running the real sim (no closed-form
 * ballistics to drift from the fixed-point integrator). Binary search on power per angle.
 */
export function solveAim(
  makeWorld: () => World,
  shooterX: number,
  tx: number,
): { angle: number; power: number; error: number } {
  const right = tx > shooterX;
  let best = { angle: 45, power: 500, error: Infinity };
  for (const base of [55, 45, 65, 70]) {
    const angle = right ? base : 180 - base;
    let lo = 50;
    let hi = 1000;
    for (let it = 0; it < 14; it++) {
      const mid = Math.round((lo + hi) / 2);
      const x = landing(makeWorld(), angle, mid);
      const err = Number.isNaN(x) ? Infinity : Math.abs(x - tx);
      if (err < best.error) best = { angle, power: mid, error: err };
      if (Number.isNaN(x)) hi = mid;
      else if (right ? x < tx : x > tx) lo = mid;
      else hi = mid;
      if (hi - lo <= 1) break;
    }
    if (best.error <= 3) break;
  }
  return best;
}

/** Fire `weapon` at a standard target map from three ranges (near, mid, far). */
export function weaponShowcase(content: ResolvedContent, weapon: string): Scenario {
  content.get('weapon', weapon); // throws a clear error for an unknown id
  const s = SHOWCASE;
  const base: Scenario = {
    id: `weapon-showcase.${weapon}`,
    schemaVersion: 1,
    description: `weapon-showcase preset: ${weapon} fired at three ranges on the standard target map.`,
    subject: weapon,
    mode: 'mode.classic',
    seed: s.seed,
    players: 1 + s.targets.length,
    map: { generator: 'gen.hills', width: s.width, height: s.height },
    tanks: [
      { x: s.shooter, inventory: { [weapon]: -1 } },
      ...s.targets.map((x) => ({ x, health: 100 })),
    ],
    turnOrder: [0],
    wind: 0,
    inputs: [],
    capture: { maxTicks: 1800, untilSettled: true, extraTicks: 40 },
  };
  const makeWorld = () => {
    const w = new World(content, {
      seed: base.seed,
      mode: base.mode,
      players: base.players,
      map: base.map,
      tankColumns: base.tanks!.map((t) => t.x),
      tankSetup: base.tanks!.map((t) => ({ health: t.health, inventory: t.inventory })),
      wind: 0,
      turnOrder: [0],
    });
    w.applyInput(0, { type: 'selectWeapon', weapon });
    w.step();
    w.snapshot();
    return w;
  };
  const inputs: TimedInput[] = [{ t: 0, player: 0, action: { type: 'selectWeapon', weapon } }];
  // Beams fly straight whatever the power: point the barrel at each target instead.
  const beam = content.get('weapon', weapon).flight.behaviour === 'flight.beam';
  const probe = beam ? makeWorld() : null;
  for (let k = 0; k < s.targets.length; k++) {
    const tx = s.targets[k]!;
    let aim: { angle: number; power: number };
    if (probe) {
      const me = probe.tanks[0]!;
      const t = probe.tanks[k + 1]!;
      const deg = (Math.atan2(me.y - 14 - (t.y - 5), t.x - me.x) * 180) / Math.PI;
      aim = { angle: Math.round(Math.max(0, Math.min(180, deg))), power: 500 };
    } else aim = solveAim(makeWorld, s.shooter, tx);
    inputs.push(
      { t: 0, player: 0, action: { type: 'aim', angle: aim.angle, power: aim.power } },
      { t: 0, player: 0, action: { type: 'fire' } },
    );
  }
  return { ...base, inputs };
}
