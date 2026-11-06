import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt, makeWorld } from '../../../src/testing';

describe('weapon.cluster-fireworks', () => {
  it('pops at the apex and sends five rockets up that burst in the sky', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.cluster-fireworks', 80, 120, 2, -3);
    const ev = w.snapshot().effectEvents;
    const launch = ev.filter((e) => e.type === 'fireworkLaunch');
    expect(launch).toHaveLength(1);
    const bursts = ev.filter((e) => e.type === 'fireworkBurst');
    expect(bursts).toHaveLength(5);
    // every burst is high above the ground (surface at y = 150) and above the launch pop
    for (const b of bursts) expect(b.y).toBeLessThan(launch[0]!.y);
    console.log(
      launch[0],
      bursts.map((b) => [b.tick, b.x, b.y]),
    );
  });

  it('bursts one after another in a rolling chain, not all at once', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.cluster-fireworks', 80, 120, 2, -3);
    const ticks = w
      .snapshot()
      .effectEvents.filter((e) => e.type === 'fireworkBurst')
      .map((e) => e.tick)
      .sort((a, b) => a - b);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    expect(ticks[ticks.length - 1]! - ticks[0]!).toBeGreaterThan(10);
  });

  it('rains burning stars down over a wide patch of ground', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.cluster-fireworks', 80, 120, 2, -3);
    const stars = w.snapshot().effectEvents.filter((e) => e.type === 'fireworkStar');
    expect(stars.length).toBeGreaterThanOrEqual(25);
    const xs = stars.map((s) => s.x);
    console.log(
      stars.length,
      Math.min(...xs),
      Math.max(...xs),
      stars.map((s) => s.tick),
    );
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(60);
  });

  it('hurts a tank under the chain', () => {
    const w = flatWorld(150, { tankColumns: [20, 170] });
    launchAt(w, 'weapon.cluster-fireworks', 80, 120, 2, -3);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[1]!.health).toBeGreaterThan(30);
  });

  it('is fired by a bot that owns it, and its stars land around the target', () => {
    const w = makeWorld({
      seed: 3,
      map: { width: 800, height: 400 },
      players: 2,
      tankColumns: [150, 560],
      wind: 0,
      turnOrder: [0, 1],
      bots: ['ai.cyborg', 'ai.cyborg'],
      tankSetup: [{ inventory: { 'weapon.cluster-fireworks': 1 } }, undefined],
    });
    const stars: number[] = [];
    let launched = 0;
    for (let i = 0; i < 1500 && w.tanks[0]!.lastShotX < 0; i++) {
      w.step();
      for (const e of w.snapshot().effectEvents) {
        if (e.type === 'fireworkLaunch') launched++;
        if (e.type === 'fireworkStar') stars.push(e.x);
      }
    }
    for (let i = 0; i < 400; i++) {
      w.step();
      for (const e of w.snapshot().effectEvents) if (e.type === 'fireworkStar') stars.push(e.x);
    }
    expect(launched).toBe(1);
    expect(stars.filter((x) => Math.abs(x - 560) < 60).length).toBeGreaterThan(3);
  });
});
