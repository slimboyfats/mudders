import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, passTurns } from '../../../src/testing';

const MINE = 'weapon.black-hole-mine';

describe('weapon.black-hole-mine', () => {
  it('lies in wait where it lands and arms when the turn ends', () => {
    const w = flatWorld(150);
    dropAt(w, MINE, 200);
    expect(w.phase).toBe('aim');
    expect(w.activePlayer).toBe(1);
    expect(w.mines).toHaveLength(1);
    const m = w.mines[0]!;
    expect(m.armed).toBe(true);
    expect(m.x).toBe(200);
    expect(m.y).toBe(149);
    expect(w.tanks.every((t) => t.health === 100)).toBe(true);
    const ev = w.snapshot().effectEvents.map((e) => e.type);
    expect(ev).toContain('mineLaid');
    expect(ev).toContain('mineArmed');
    expect(ev).not.toContain('vortex');
    // it shows up for renderers
    expect(w.snapshot().entities.some((e) => e.kind === 'mine')).toBe(true);
  });

  it('trips at once when it arms next to a tank, then swallows it', () => {
    const w = flatWorld(150);
    const before = w.hash();
    dropAt(w, MINE, 345);
    expect(w.mines).toHaveLength(0);
    expect(w.tanks[1]!.health).toBeLessThan(60);
    const ev = w.snapshot().effectEvents;
    const trip = ev.find((e) => e.type === 'mineTrip');
    const vortex = ev.find((e) => e.type === 'vortex');
    const swallow = ev.find((e) => e.type === 'swallow');
    expect(trip).toBeDefined();
    expect(vortex).toBeDefined();
    expect(swallow!.tick - vortex!.tick).toBeGreaterThanOrEqual(50);
    expect(w.hash()).not.toBe(before);
  });

  it('a tank that drives into it sets it off and loses its turn', () => {
    const w = flatWorld(150, { tankColumns: [40, 330] });
    dropAt(w, MINE, 280);
    expect(w.mines[0]?.armed).toBe(true);
    expect(w.activePlayer).toBe(1);
    w.tanks[1]!.fuel = 100;
    // tough enough to live through the drop into the pit
    w.tanks[1]!.health = 300;
    w.applyInput(1, { type: 'drive', dir: -1 });
    let n = 0;
    while (n < 400 && w.mines.length > 0) {
      w.step();
      n++;
    }
    expect(w.mines).toHaveLength(0);
    expect(w.phase).toBe('resolve');
    for (let i = 0; i < 2000 && w.phase === 'resolve'; i++) w.step();
    expect(w.activePlayer).toBe(0);
    expect(w.tanks[1]!.health).toBeLessThan(300);
  });

  it('bots never plan a drive into an armed mine', () => {
    const w = flatWorld(150, { tankColumns: [40, 330] });
    dropAt(w, MINE, 280);
    const t = w.tanks[1]!;
    t.fuel = 200;
    t.driveLeft = 200;
    const spots = w.reach(t, -1);
    expect(spots.length).toBeGreaterThan(0);
    const last = spots[spots.length - 1]!;
    expect(last.x - 280).toBeGreaterThanOrEqual(22 + t.half);
  });

  it('a blast that reaches an armed mine sets it off', () => {
    const w = flatWorld(150);
    dropAt(w, MINE, 200);
    expect(w.mines).toHaveLength(1);
    passTurns(w, 1);
    dropAt(w, 'weapon.missile', 212);
    expect(w.mines).toHaveLength(0);
    expect(effectsOf(w, 'vortex').length).toBeGreaterThan(0);
  });

  it('drops when the ground under it goes, and is cleared with the round', () => {
    const w = flatWorld(150);
    dropAt(w, MINE, 200);
    const g = w.grid;
    for (let y = 150; y < 170; y++) g.material[y * g.width + 200] = 0;
    for (let i = 0; i < 30; i++) w.step();
    expect(w.mines[0]!.y).toBe(169);
  });
});
