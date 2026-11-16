import { describe, expect, it } from 'vitest';
import type { RenderSnapshot, TankView } from '@mudders/shared';
import { MatchStats, earthCells } from './awards';

const W = 20;
const H = 10;
const earth = earthCells([
  { id: 'material.dirt', cell: 1, settle: 'fall' },
  { id: 'material.water', cell: 19, settle: 'flow' },
  { id: 'material.fire', cell: 17, settle: 'static' },
]);
let terrain = new Uint8Array(W * H).fill(1);

interface T {
  player: number;
  x?: number;
  health?: number;
  active?: boolean;
}

function snap(
  tick: number,
  tanks: T[],
  dirty: { x: number; y: number; w: number; h: number }[] = [],
) {
  const entities = tanks.map(
    (t) =>
      ({
        kind: 'tank',
        player: t.player,
        x: t.x ?? 10 * t.player,
        y: 5,
        health: t.health ?? 100,
        maxHealth: 100,
        alive: (t.health ?? 100) > 0,
        active: t.active ?? false,
      }) as unknown as TankView,
  );
  return {
    tick,
    turn: 1,
    width: W,
    height: H,
    terrain,
    dirtyRects: dirty,
    entities,
  } as unknown as RenderSnapshot;
}

describe('MatchStats', () => {
  it('credits damage, the best shot, kills, dirt and close calls to the shooter', () => {
    terrain = new Uint8Array(W * H).fill(1);
    const m = new MatchStats(earth);
    m.ingest(snap(0, [{ player: 0 }, { player: 1 }, { player: 2 }], [{ x: 0, y: 0, w: W, h: H }]));
    m.ingest(snap(1, [{ player: 0, active: true }, { player: 1 }, { player: 2 }]));
    // P1 fires: blasts 6 earth cells, turns 2 into water (not earth), hits both others
    m.ingest(snap(2, [{ player: 0 }, { player: 1 }, { player: 2 }]));
    terrain = Uint8Array.from(terrain);
    for (let i = 0; i < 6; i++) terrain[i] = 0;
    terrain[10] = 19;
    terrain[11] = 19;
    m.ingest(
      snap(
        3,
        [{ player: 0 }, { player: 1, health: 10 }, { player: 2, health: 0, x: 200 }],
        [{ x: 0, y: 0, w: 12, h: 1 }],
      ),
    );
    // P2's turn: P1 is left alone
    m.ingest(
      snap(4, [
        { player: 0 },
        { player: 1, health: 10, active: true },
        { player: 2, health: 0, x: 200 },
      ]),
    );
    const p = m.stats(0);
    expect(p.damage).toBe(190);
    expect(p.bestShot).toBe(190);
    expect(p.kills).toBe(1);
    expect(p.longestKill).toBe(200);
    expect(p.dirt).toBe(8);
    expect(m.stats(1).closeCalls).toBe(1);
    const a = m.awards();
    expect(a.find((x) => x.id === 'best-shot')).toMatchObject({
      player: 0,
      detail: '190 damage in one shot',
    });
    expect(a.find((x) => x.id === 'close')).toMatchObject({ player: 1 });
    // under 50 cells is no dirt award
    expect(a.find((x) => x.id === 'dirt')).toBeUndefined();
  });

  it('counts own damage, and nothing before the first shot', () => {
    terrain = new Uint8Array(W * H).fill(1);
    const m = new MatchStats(earth);
    m.ingest(snap(0, [{ player: 0, health: 100 }, { player: 1 }]));
    m.ingest(snap(1, [{ player: 0, health: 90 }, { player: 1 }]));
    expect(m.stats(0).self).toBe(0);
    m.ingest(snap(2, [{ player: 0, health: 90, active: true }, { player: 1 }]));
    m.ingest(snap(3, [{ player: 0, health: 90 }, { player: 1 }]));
    m.ingest(snap(4, [{ player: 0, health: 70 }, { player: 1 }]));
    expect(m.stats(0).self).toBe(20);
    expect(m.awards().find((x) => x.id === 'self')).toMatchObject({ player: 0 });
  });
});
