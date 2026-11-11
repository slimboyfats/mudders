import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { dropAt, flatWorld, makeWorld, passTurns } from './testing';

/**
 * Damage profile (run with `PROFILE=1 pnpm --filter @mudders/content exec vitest run
 * src/damage-profile.test.ts`): drops each weapon at several distances from a tank on flat ground
 * and prints the health it lost over the shot plus the following turns (for clouds and fires).
 */
const WEAPONS = (process.env.PROFILE_WEAPONS ?? '').split(',').filter(Boolean);
const DEFAULT = [
  'weapon.missile',
  'weapon.baby-nuke',
  'weapon.nuke',
  'weapon.napalm',
  'weapon.hot-napalm',
  'weapon.incendiary',
  'weapon.magma-bomb',
  'weapon.acid-rain',
  'weapon.acid-cloud',
  'weapon.toxic-gas',
  'weapon.plague',
  'weapon.fuel-air-bomb',
  'weapon.baby-shockwave',
  'weapon.shockwave',
  'weapon.heavy-shockwave',
];
const OFFSETS = [0, 10, 25, 50, 80];
const TURNS = 6;

describe.runIf(process.env.PROFILE === '1')('damage profile', () => {
  it('prints damage per weapon', () => {
    const rows: string[] = [];
    for (const wpn of WEAPONS.length ? WEAPONS : DEFAULT) {
      const cells: string[] = [];
      for (const off of OFFSETS) {
        // PROFILE_MAP=hills: the classic generated hills (seed 3) instead of flat dirt
        const w =
          process.env.PROFILE_MAP === 'hills'
            ? makeWorld({
                seed: 3,
                tankColumns: [100, 400],
                wind: 0,
                turnOrder: [0, 1],
                rules: { turnTimer: 0, suddenDeath: false },
              })
            : flatWorld(150, { map: { width: 800, height: 260 }, tankColumns: [60, 400] });
        const t = w.tanks[1]!;
        t.shield = 0;
        const h0 = t.health;
        const x0 = t.x;
        const y0 = t.y;
        dropAt(w, wpn, 400 - off);
        const shot = h0 - t.health;
        passTurns(w, TURNS);
        cells.push(`${shot}/${h0 - t.health} (${t.x - x0},${t.y - y0})`);
      }
      rows.push(`${wpn.padEnd(24)} ${cells.join('  ')}`);
    }
    writeFileSync(
      process.env.PROFILE_OUT ?? 'damage-profile.txt',
      `offsets ${OFFSETS.join(',')}: shot/total-after-${TURNS}-turns (moved)\n${rows.join('\n')}`,
    );
  });
});
