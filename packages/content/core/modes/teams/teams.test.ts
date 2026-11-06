import { describe, expect, it } from 'vitest';
import { enemies } from '../../../src/ai';
import { dropAt, flatWorld, makeWorld } from '../../../src/testing';

const four = { width: 800, height: 300 };

describe('mode.teams', () => {
  it('alternates teams in the turn order', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const teams = [0, 1, 0, 1];
      const w = makeWorld({ seed, mode: 'mode.teams', players: 4, map: four, teams });
      const o = w.order;
      expect([...o].sort()).toEqual([0, 1, 2, 3]);
      for (let i = 1; i < o.length; i++) expect(teams[o[i]!]).not.toBe(teams[o[i - 1]!]);
    }
    // uneven teams: three teams, the small one runs out first
    const teams = [0, 0, 0, 1, 1, 2];
    const w = makeWorld({ seed: 3, mode: 'mode.teams', players: 6, map: four, teams });
    const o = w.order;
    expect([...o].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(o.slice(0, 3).map((p) => teams[p]))).toEqual(new Set([0, 1, 2]));
  });

  it('ends the round when one team is left and the whole team wins it', () => {
    const w = flatWorld(150, {
      mode: 'mode.teams',
      players: 3,
      teams: [0, 0, 1],
      tankColumns: [40, 120, 360],
      turnOrder: [0, 2, 1],
      rules: { turnTimer: 0, suddenDeath: false, rounds: 1 },
    });
    expect(w.activePlayer).toBe(0);
    w.tanks[2]!.health = 5;
    dropAt(w, 'weapon.missile', 360);
    expect(w.tanks[2]!.alive).toBe(false);
    expect(w.phase).toBe('over');
    const r = w.results[0]!;
    expect(r.winnerTeam).toBe(0);
    const sc = w.mode.scoring;
    // the teammate who never shot still gets survival + the round win
    expect(r.points[1]).toBe(sc.survival + sc.roundWin);
    expect(r.points[0]!).toBeGreaterThan(r.points[1]!);
    expect(r.winner).toBe(0);
    expect(w.matchWinnerTeam).toBe(0);
    expect(w.matchWinner).toBe(0);
  });

  it('scores a hit on a teammate like self-damage, with no kill credit', () => {
    const w = flatWorld(150, {
      mode: 'mode.teams',
      players: 3,
      teams: [0, 0, 1],
      tankColumns: [40, 200, 360],
      turnOrder: [0, 2, 1],
    });
    w.tanks[1]!.health = 5;
    dropAt(w, 'weapon.missile', 200);
    const me = w.tanks[0]!;
    expect(w.tanks[1]!.alive).toBe(false);
    expect(me.selfDamage).toBe(5);
    expect(me.damageDealt).toBe(0);
    expect(me.kills).toBe(0);
    // the other team is still up against a team with one tank: the round goes on
    expect(w.phase).toBe('aim');
  });

  it('keeps a free-for-all exactly as before (each player its own team)', () => {
    const w = flatWorld(150, { players: 3, tankColumns: [40, 200, 360], turnOrder: [0, 1, 2] });
    expect(w.tanks.map((t) => t.team)).toEqual([0, 1, 2]);
    w.tanks[1]!.health = 5;
    dropAt(w, 'weapon.missile', 200);
    expect(w.tanks[0]!.kills).toBe(1);
    expect(w.tanks[0]!.damageDealt).toBe(5);
  });

  it('bots never aim at their own team', () => {
    const w = makeWorld({
      seed: 2,
      mode: 'mode.teams',
      players: 4,
      map: four,
      teams: [0, 1, 0, 1],
      tankColumns: [100, 300, 500, 700],
      turnOrder: [0, 1, 2, 3],
      wind: 0,
      bots: ['ai.cyborg', 'ai.cyborg', 'ai.cyborg', 'ai.cyborg'],
    });
    const api = { me: 0, tanks: w.tanks } as unknown as Parameters<typeof enemies>[0];
    expect(enemies(api).map((t) => t.player)).toEqual([1, 3]);
    // a full 2v2 bot match: nobody's first shot lands on a teammate
    for (let i = 0; i < 5000 && w.tanks[0]!.lastShotX < 0; i++) w.step();
    expect(w.tanks[2]!.health).toBe(100);
  });
});
