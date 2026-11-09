import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld, passTurns } from '../../../src/testing';

describe('weapon.spotter-flare', () => {
  it('spots enemies in reach without hurting them or the ground', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    dropAt(w, 'weapon.spotter-flare', 290);
    const t = w.tanks[1]!;
    expect(t.health).toBe(100);
    expect(t.mark).toBeGreaterThan(0);
    expect(t.markBy).toBe(0);
    expect(w.grid.surfaceY(290)).toBe(150);
  });

  it('spotted tanks take 50% more from the spotter, until the end of the spotter’s next turn', () => {
    const plain = flatWorld(150, { tankColumns: [40, 300] });
    dropAt(plain, 'weapon.baby-missile', 300);
    const lost = 100 - plain.tanks[1]!.health;

    const w = flatWorld(150, { tankColumns: [40, 300] });
    dropAt(w, 'weapon.spotter-flare', 290);
    passTurns(w, 1); // player 1's turn
    expect(w.activePlayer).toBe(0);
    dropAt(w, 'weapon.baby-missile', 300);
    expect(100 - w.tanks[1]!.health).toBe(Math.trunc((lost * 150) / 100));
    // the spotter's next turn is over: the mark is gone
    expect(w.tanks[1]!.mark).toBe(0);
  });

  it('gives the shooter a full aim preview on the next turn only', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    dropAt(w, 'weapon.spotter-flare', 290);
    // player 1 aims: not on the spotter's team, no preview
    expect(w.previewPath()).toBeNull();
    passTurns(w, 1);
    const path = w.previewPath();
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(20);
    passTurns(w, 2);
    expect(w.previewPath()).toBeNull();
  });
});
