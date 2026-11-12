import { describe, expect, it } from 'vitest';
import type { RenderSnapshot, TankView } from '@mudders/shared';
import { CalloutTracker, MERGE_TICKS, NUMBER_TICKS, glyphCells, textWidth } from './callouts';

interface T {
  player: number;
  x?: number;
  health?: number;
  alive?: boolean;
  active?: boolean;
}

function snap(tick: number, tanks: T[], turn = 1): RenderSnapshot {
  const entities = tanks.map(
    (t) =>
      ({
        kind: 'tank',
        player: t.player,
        x: t.x ?? 100 * (t.player + 1),
        y: 200,
        health: t.health ?? 100,
        maxHealth: 100,
        alive: t.alive ?? (t.health ?? 100) > 0,
        active: t.active ?? false,
      }) as unknown as TankView,
  );
  return { tick, turn, entities } as unknown as RenderSnapshot;
}

/** Player 0 aims at tick 0, fires, and the shot resolves from tick 1. */
function aimed(c: CalloutTracker, tanks: T[] = [{ player: 0 }, { player: 1 }, { player: 2 }]) {
  c.ingest(
    snap(
      0,
      tanks.map((t) => ({ ...t, active: t.player === 0 })),
    ),
  );
}

describe('CalloutTracker', () => {
  it('floats one summed number for hits close together', () => {
    const c = new CalloutTracker();
    aimed(c);
    c.ingest(snap(1, [{ player: 0 }, { player: 1, health: 90 }, { player: 2 }]));
    c.ingest(snap(1 + MERGE_TICKS - 1, [{ player: 0 }, { player: 1, health: 80 }, { player: 2 }]));
    expect(c.numbers).toHaveLength(1);
    expect(c.numbers[0]!.amount).toBe(-20);
    expect(c.callouts).toHaveLength(0);
  });

  it('shows repairs as their own green number and drops numbers once faded', () => {
    const c = new CalloutTracker();
    aimed(c, [{ player: 0 }, { player: 1, health: 50 }]);
    c.ingest(snap(1, [{ player: 0 }, { player: 1, health: 70 }]));
    expect(c.numbers[0]!.amount).toBe(20);
    c.ingest(snap(2 + NUMBER_TICKS, [{ player: 0 }, { player: 1, health: 70 }]));
    expect(c.numbers).toHaveLength(0);
  });

  it('calls a big hit a direct hit and a near-death survivor a close call', () => {
    const c = new CalloutTracker();
    aimed(c);
    c.ingest(snap(1, [{ player: 0 }, { player: 1, health: 55 }, { player: 2, health: 10 }]));
    expect(c.callouts.map((x) => [x.player, x.kind])).toEqual([
      [1, 'direct'],
      [2, 'close'],
    ]);
  });

  it('counts kills in one shot: kill, then double kill', () => {
    const c = new CalloutTracker();
    aimed(c);
    c.ingest(snap(1, [{ player: 0 }, { player: 1, health: 0 }, { player: 2 }]));
    c.ingest(snap(5, [{ player: 0 }, { player: 1, health: 0 }, { player: 2, health: 0 }]));
    expect(c.callouts.map((x) => [x.player, x.kind])).toEqual([
      [1, 'kill'],
      [2, 'double'],
    ]);
  });

  it('a far kill is a snipe; a kill replaces the direct hit on the same tank', () => {
    const c = new CalloutTracker();
    aimed(c, [
      { player: 0, x: 0 },
      { player: 1, x: 700 },
    ]);
    c.ingest(
      snap(1, [
        { player: 0, x: 0 },
        { player: 1, x: 700, health: 50 },
      ]),
    );
    c.ingest(
      snap(3, [
        { player: 0, x: 0 },
        { player: 1, x: 700, health: 0 },
      ]),
    );
    expect(c.callouts.map((x) => x.kind)).toEqual(['snipe']);
  });

  it('hurting yourself is an own goal, in orange', () => {
    const c = new CalloutTracker();
    aimed(c);
    c.ingest(snap(1, [{ player: 0, health: 80 }, { player: 1 }, { player: 2 }]));
    expect(c.callouts.map((x) => [x.player, x.kind])).toEqual([[0, 'own']]);
    expect(c.numbers[0]!.self).toBe(true);
  });

  it('damage while someone aims (turn-start burns, the death zone) gets a number but no callout', () => {
    const c = new CalloutTracker();
    aimed(c);
    c.ingest(snap(1, [{ player: 0, active: true }, { player: 1, health: 0 }, { player: 2 }]));
    expect(c.numbers).toHaveLength(1);
    expect(c.callouts).toHaveLength(0);
  });

  it('a new round resets without a repair number for the refilled tanks', () => {
    const c = new CalloutTracker();
    aimed(c);
    c.ingest(snap(1, [{ player: 0 }, { player: 1, health: 0 }, { player: 2 }]));
    c.ingest(snap(400, [{ player: 0 }, { player: 1 }, { player: 2 }], 1001));
    expect(c.numbers).toHaveLength(0);
    expect(c.callouts).toHaveLength(0);
  });

  it('kill counts start over with the next shot', () => {
    const c = new CalloutTracker();
    aimed(c);
    c.ingest(snap(1, [{ player: 0 }, { player: 1, health: 0 }, { player: 2 }]));
    c.ingest(snap(200, [{ player: 0, active: true }, { player: 1, health: 0 }, { player: 2 }]));
    c.ingest(snap(201, [{ player: 0 }, { player: 1, health: 0 }, { player: 2, health: 0 }]));
    expect(c.callouts.at(-1)!.kind).toBe('kill');
  });
});

describe('pixel text', () => {
  it('measures glyphs with one blank column between them', () => {
    expect(textWidth('-38')).toBe(11);
    expect(textWidth('KILL')).toBe(15);
  });

  it('draws bigger glyphs when zoomed out, never below a cell', () => {
    expect(glyphCells(1)).toBe(4);
    expect(glyphCells(2)).toBe(3);
    expect(glyphCells(8)).toBe(1);
  });
});
