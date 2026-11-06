import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld } from '../../../src/testing';

const wide = { map: { width: 900, height: 300 } };

describe('weapon.bumper', () => {
  it('kicks an enemy next to the post far across the map, with fall damage where it lands', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [100, 300] });
    let highest = w.tanks[1]!.y;
    const idx = w.weaponByIndex('weapon.bumper');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 285 * 65536,
      y: 190 * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let n = 0; n < 2000 && w.phase === 'resolve'; n++) {
      w.step();
      highest = Math.min(highest, w.tanks[1]!.y);
    }
    expect(w.phase).not.toBe('resolve');
    expect(w.tanks[1]!.x).toBeGreaterThan(450);
    expect(200 - highest).toBeGreaterThan(25);
    expect(w.tanks[1]!.health).toBeLessThan(85);
    expect(w.tanks[1]!.alive).toBe(true);
    // the shooter is never kicked
    expect(w.tanks[0]!.x).toBe(100);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('leaves the shooter alone even right next to the post', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [300, 700] });
    dropAt(w, 'weapon.bumper', 315);
    expect(w.tanks[0]!.x).toBe(300);
    expect(w.tanks[1]!.x).toBe(700);
  });

  it('bounces off the edge of the map and stays on it', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [400, 820] });
    dropAt(w, 'weapon.bumper', 805);
    const t = w.tanks[1]!;
    expect(t.x).toBeLessThan(820);
    expect(t.x).toBeGreaterThan(t.half);
    expect(t.y).toBeLessThan(300);
  });

  it('a parachute opens on the way down and the tank lands unhurt', () => {
    const w = flatWorld(200, {
      ...wide,
      tankColumns: [100, 300],
      tankSetup: [{}, { inventory: { 'gear.parachute': 1 } }],
    });
    dropAt(w, 'weapon.bumper', 285);
    expect(effectsOf(w, 'chute')).toHaveLength(1);
    expect(w.tanks[1]!.x).toBeGreaterThan(350);
    // only the shell's small blast hurts it
    expect(w.tanks[1]!.health).toBeGreaterThan(90);
  });
});
