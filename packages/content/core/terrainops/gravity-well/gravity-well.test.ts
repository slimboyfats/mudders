import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, launchAt, passTurns } from '../../../src/testing';

const wide = { map: { width: 800, height: 300 } };

describe('terrainop.gravity-well', () => {
  it('stays between turns without holding them up', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 700] });
    dropAt(w, 'weapon.gravity-well', 200);
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(1);
    expect(w.quiet).toBe(true);
    passTurns(w, 2);
    expect(w.ops).toHaveLength(1);
  });

  it('bends an enemy shell into it and swallows it whole', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 700] });
    dropAt(w, 'weapon.gravity-well', 200);
    expect(w.activePlayer).toBe(1);
    w.snapshot();
    const before = w.tanks[0]!.health;
    // player 1's shell heads for player 0, arcing down past the well
    launchAt(w, 'weapon.missile', 330, 60, -2.4, 0);
    expect(effectsOf(w, 'wellSwallow')).toHaveLength(1);
    expect(w.tanks[0]!.health).toBe(before);
    expect(effectsOf(w, 'explosion')).toHaveLength(0);
  });

  it('lets its own side’s shells fly past', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 700] });
    dropAt(w, 'weapon.gravity-well', 200);
    passTurns(w, 1);
    expect(w.activePlayer).toBe(0);
    w.snapshot();
    launchAt(w, 'weapon.missile', 70, 60, 2.4, 0);
    expect(effectsOf(w, 'wellSwallow')).toHaveLength(0);
  });

  it('closes after its rounds are up', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 700] });
    dropAt(w, 'weapon.gravity-well', 200);
    passTurns(w, 6);
    expect(w.ops).toHaveLength(0);
  });
});
