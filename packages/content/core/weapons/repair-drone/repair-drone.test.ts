import { describe, expect, it } from 'vitest';
import { launchAt, dropAt, effectsOf, flatWorld, passTurns } from '../../../src/testing';

describe('weapon.repair-drone', () => {
  it('flies to the nearest friendly tank and patches it on arrival and every turn after', () => {
    const w = flatWorld();
    const t = w.tanks[0]!;
    t.health = 40;
    dropAt(w, 'weapon.repair-drone', 90);
    // arrived (the shot waited for it) and patched 15
    expect(t.health).toBe(55);
    // the turn its own shot ended is covered by the arrival patch; then 10 a turn for two rounds
    passTurns(w, 1);
    expect(t.health).toBe(55);
    passTurns(w, 2);
    expect(t.health).toBe(75);
    passTurns(w, 2);
    expect(t.health).toBe(95);
    // two rounds done: it's gone, no more patching
    passTurns(w, 2);
    expect(t.health).toBe(95);
    expect(w.tanks[1]!.health).toBe(100);
  });

  it('never heals past round-start health', () => {
    const w = flatWorld();
    const t = w.tanks[0]!;
    t.health = 95;
    dropAt(w, 'weapon.repair-drone', 60);
    passTurns(w, 4);
    expect(t.health).toBe(100);
  });

  it('heals a friend, never an enemy, even when landed next to the enemy', () => {
    const w = flatWorld();
    w.tanks[1]!.health = 50;
    w.tanks[0]!.health = 50;
    dropAt(w, 'weapon.repair-drone', 350);
    expect(w.tanks[1]!.health).toBe(50);
    expect(w.tanks[0]!.health).toBe(65);
  });

  it('is shot down by a shell passing close by', () => {
    const w = flatWorld();
    const t = w.tanks[0]!;
    t.health = 40;
    dropAt(w, 'weapon.repair-drone', 60);
    expect(t.health).toBe(55);
    effectsOf(w, 'droneDown');
    // the enemy's turn: a flat shot straight through where the drone hovers
    const y = t.y - t.h - 12;
    launchAt(w, 'weapon.tracer', 75, y, -2, 0);
    expect(effectsOf(w, 'droneDown').length).toBe(1);
    // no more patching once it's down
    const hp = t.health;
    expect(hp).toBe(55);
    passTurns(w, 2);
    expect(t.health).toBe(hp);
  });
});
