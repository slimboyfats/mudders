import { it } from 'vitest';
import { flatWorld } from '../../../src/testing';
it('dbg', () => {
  const w = flatWorld(150, { map: { width: 400, height: 260 }, tankColumns: [40, 215] });
  const idx = w.weaponByIndex('weapon.crystal-bloom');
  w.projectiles.push({
    id: 999,
    weapon: idx,
    owner: 0,
    x: 200 * 65536,
    y: 140 * 65536,
    vx: 0,
    vy: 65536,
    age: 10,
    alive: true,
    data: [],
  });
  w.phase = 'resolve';
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) {
    w.step();
    if (n < 40) console.log(n, w.tanks[1]!.x, w.tanks[1]!.y, w.tanks[1]!.health, w.ops.length);
  }
  console.log(w.phase);
});
