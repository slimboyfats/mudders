import { describe, expect, it } from 'vitest';
import { SLOWMO, SlowMo, aliveSides, slowMoScale } from './slowmo';

const tank = (alive: boolean, team: number) => ({ alive, team });

describe('slow-mo finisher', () => {
  it('counts teams with a live tank', () => {
    expect(aliveSides([tank(true, 0), tank(true, 1), tank(false, 2)])).toBe(2);
    expect(aliveSides([tank(true, 0), tank(true, 0), tank(false, 1)])).toBe(1);
    expect(aliveSides([tank(false, 0), tank(false, 1)])).toBe(0);
  });

  it('freezes, slows, then eases back to real time', () => {
    expect(slowMoScale(0)).toBe(SLOWMO.freezeScale);
    expect(slowMoScale(SLOWMO.freezeMs + 10)).toBe(SLOWMO.slowScale);
    const ease = slowMoScale(SLOWMO.freezeMs + SLOWMO.slowMs + SLOWMO.easeMs / 2);
    expect(ease).toBeGreaterThan(SLOWMO.slowScale);
    expect(ease).toBeLessThan(1);
    expect(slowMoScale(SLOWMO.freezeMs + SLOWMO.slowMs + SLOWMO.easeMs)).toBe(1);
  });

  it('triggers when the last enemy falls and runs out', () => {
    const s = new SlowMo();
    s.observe({ tick: 10, round: 0, tanks: [tank(true, 0), tank(true, 1)] });
    expect(s.next(16)).toBe(1);
    s.observe({ tick: 11, round: 0, tanks: [tank(true, 0), tank(false, 1)] });
    expect(s.active).toBe(true);
    expect(s.next(16)).toBe(SLOWMO.freezeScale);
    let frames = 0;
    while (s.active && frames < 1000) {
      s.next(16);
      frames++;
    }
    expect(s.active).toBe(false);
    expect(frames * 16).toBeGreaterThan(SLOWMO.freezeMs + SLOWMO.slowMs);
  });

  it('ignores a kill that leaves two sides, a new round, a catch-up jump, or the setting off', () => {
    const three = [tank(true, 0), tank(true, 1), tank(true, 2)];
    const s = new SlowMo();
    s.observe({ tick: 1, round: 0, tanks: three });
    s.observe({ tick: 2, round: 0, tanks: [tank(true, 0), tank(false, 1), tank(true, 2)] });
    expect(s.active).toBe(false);

    const r = new SlowMo();
    r.observe({ tick: 1, round: 0, tanks: three });
    r.observe({ tick: 2, round: 1, tanks: [tank(true, 0), tank(false, 1), tank(false, 2)] });
    expect(r.active).toBe(false);

    const j = new SlowMo();
    j.observe({ tick: 1, round: 0, tanks: three });
    j.observe({ tick: 500, round: 0, tanks: [tank(true, 0), tank(false, 1), tank(false, 2)] });
    expect(j.active).toBe(false);

    const off = new SlowMo();
    off.enabled = false;
    off.observe({ tick: 1, round: 0, tanks: three });
    off.observe({ tick: 2, round: 0, tanks: [tank(true, 0), tank(false, 1), tank(false, 2)] });
    expect(off.active).toBe(false);
  });
});
