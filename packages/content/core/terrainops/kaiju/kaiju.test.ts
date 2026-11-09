import { describe, expect, it } from 'vitest';
import {
  dropAt,
  effectsOf,
  flatWorld,
  launchAt,
  passTurns,
  slopeWorld,
} from '../../../src/testing';

const wide = { map: { width: 1000, height: 300 } };

describe('terrainop.kaiju', () => {
  it('grabs an enemy tank in reach and hurls it far away, hurting it on the slam', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 330] });
    dropAt(w, 'weapon.kaiju', 300);
    expect(w.phase).toBe('aim');
    expect(Math.abs(w.tanks[1]!.x - 300)).toBeGreaterThan(100);
    expect(w.tanks[1]!.health).toBeLessThan(90);
    // its summoner is left alone
    expect(w.tanks[0]!.x).toBe(60);
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('stays on the map between turns without holding them up', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 900] });
    dropAt(w, 'weapon.kaiju', 500);
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(1);
    expect(w.quiet).toBe(true);
    passTurns(w, 2);
    expect(w.ops).toHaveLength(1);
  });

  it('catches an enemy shell flying past and throws it somewhere else on the map', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 900] });
    dropAt(w, 'weapon.kaiju', 500);
    expect(w.activePlayer).toBe(1);
    w.snapshot();
    // player 1's shell flies right through where the monster stands
    launchAt(w, 'weapon.missile', 560, 130, -3, 0);
    const caught = effectsOf(w, 'kaijuCatch');
    expect(caught).toHaveLength(1);
    expect(w.phase).toBe('aim');
    // it went off far from the monster, not where it was heading
    expect(w.tanks[1]!.lastShotX).toBeGreaterThanOrEqual(0);
    expect(Math.abs(w.tanks[1]!.lastShotX - 500)).toBeGreaterThan(40);
  });

  it('lets its own side’s shells fly past', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 900] });
    dropAt(w, 'weapon.kaiju', 500);
    passTurns(w, 1);
    expect(w.activePlayer).toBe(0);
    w.snapshot();
    launchAt(w, 'weapon.missile', 560, 130, -3, 0);
    expect(effectsOf(w, 'kaijuCatch')).toHaveLength(0);
  });

  it('stamps a level footing on a slope instead of floating over it', () => {
    const w = slopeWorld(100, 3, { ...wide, tankColumns: [60, 900] });
    dropAt(w, 'weapon.kaiju', 500);
    const g = w.grid;
    const feet = g.surfaceY(500);
    for (let x = 480; x <= 520; x += 5)
      expect(Math.abs(g.surfaceY(x) - feet)).toBeLessThanOrEqual(2);
  });

  it('topples over and bursts when the ground is dug out from under it', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 900] });
    dropAt(w, 'weapon.kaiju', 500);
    w.snapshot();
    const g = w.grid;
    const feet = g.surfaceY(500);
    // a deep pit blasted out under its feet
    for (let y = feet - 30; y < feet + 70; y++)
      for (let x = 440; x <= 560; x++) g.clearCell(y * g.width + x);
    for (let i = 0; i < 400 && w.ops.length > 0; i++) w.step();
    expect(w.ops).toHaveLength(0);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'kaijuTopple')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'kaijuBlast')).toHaveLength(1);
  });

  it('sinks back into the ground after three full turn rotations', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 900] });
    dropAt(w, 'weapon.kaiju', 500);
    passTurns(w, 5);
    expect(w.ops).toHaveLength(1);
    passTurns(w, 2);
    for (let i = 0; i < 200; i++) w.step();
    expect(w.ops).toHaveLength(0);
  });
});
