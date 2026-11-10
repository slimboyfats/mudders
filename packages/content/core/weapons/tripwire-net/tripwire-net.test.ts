import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, launchAt, passTurns } from '../../../src/testing';

const WIRE = 'weapon.tripwire-net';

describe('weapon.tripwire-net', () => {
  it('strings a wire between two stakes and arms when the turn ends', () => {
    const w = flatWorld(150);
    dropAt(w, WIRE, 200);
    expect(w.mines).toHaveLength(1);
    const m = w.mines[0]!;
    expect(m.armed).toBe(true);
    expect(m.x).toBe(170);
    expect(m.x2).toBe(230);
    expect(m.y).toBe(149);
    expect(m.wireH).toBe(4);
    const e = w.snapshot().entities.find((x) => x.kind === 'mine');
    expect(e?.kind === 'mine' && e.wire?.x2).toBe(230);
  });

  it('pulls the stakes in where a hill would cut the wire', () => {
    const w = flatWorld(150);
    const dirt = w.mats.cellOf('material.dirt');
    // a rock pillar right of the impact, taller than the wire
    for (let y = 120; y < 150; y++) {
      for (let x = 215; x < 219; x++) w.grid.material[y * 400 + x] = dirt;
    }
    w.grid.clearSettle();
    dropAt(w, WIRE, 200);
    const m = w.mines[0]!;
    expect(m.x).toBe(170);
    expect(m.x2).toBeLessThan(215);
    expect(m.x2).toBeGreaterThan(200);
  });

  it('lands right beside a cliff without freezing (stakes settle at their shortest)', () => {
    for (const side of [-1, 1]) {
      const w = flatWorld(150);
      const dirt = w.mats.cellOf('material.dirt');
      // a wall of ground rising 50 cells, starting two cells to one side of the impact
      const x0 = side < 0 ? 150 : 203;
      for (let y = 100; y < 150; y++) {
        for (let x = x0; x < x0 + 48; x++) w.grid.material[y * 400 + x] = dirt;
      }
      w.grid.clearSettle();
      dropAt(w, WIRE, 200);
      expect(w.mines).toHaveLength(1);
      const m = w.mines[0]!;
      expect(m.x2 - m.x).toBeGreaterThanOrEqual(6);
    }
  });

  it('a tank driving into the wire snaps it: a bang and a net that pins it', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    dropAt(w, WIRE, 230);
    const t = w.tanks[1]!;
    t.fuel = 200;
    w.snapshot();
    w.applyInput(1, { type: 'drive', dir: -1 });
    for (let n = 0; n < 400 && w.mines.length > 0; n++) w.step();
    expect(w.mines).toHaveLength(0);
    expect(t.x).toBeGreaterThan(255);
    const ev = w.snapshot().effectEvents;
    expect(ev.some((e) => e.type === 'wireTrip')).toBe(true);
    expect(ev.some((e) => e.type === 'mineTrip')).toBe(false);
    for (let i = 0; i < 2000 && w.phase === 'resolve'; i++) w.step();
    expect(t.health).toBeLessThan(85);
    expect(t.glue).toBeGreaterThan(0);
    expect(w.activePlayer).toBe(0);
  });

  it('a shell flying through the wire goes off on it', () => {
    const w = flatWorld(150);
    dropAt(w, WIRE, 200);
    w.snapshot();
    // straight down through the middle of the wire
    launchAt(w, 'weapon.missile', 200, 100, 0, 1);
    expect(w.mines).toHaveLength(0);
    const trip = effectsOf(w, 'wireTrip');
    expect(trip).toHaveLength(1);
    expect(trip[0]!.x).toBe(200);
    expect(trip[0]!.y).toBe(145);
  });

  it('shells passing high over the wire leave it alone', () => {
    const w = flatWorld(150);
    dropAt(w, WIRE, 200);
    passTurns(w, 2);
    expect(w.mines).toHaveLength(1);
  });

  it('a blast at a stake snaps it', () => {
    const w = flatWorld(150);
    dropAt(w, WIRE, 200);
    dropAt(w, 'weapon.missile', 232);
    expect(w.mines).toHaveLength(0);
  });

  it('bots never plan a drive into an armed wire', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    dropAt(w, WIRE, 230);
    const t = w.tanks[1]!;
    t.fuel = 200;
    t.driveLeft = 200;
    for (const s of w.reach(t, -1)) expect(s.x - t.half).toBeGreaterThan(260);
  });
});
