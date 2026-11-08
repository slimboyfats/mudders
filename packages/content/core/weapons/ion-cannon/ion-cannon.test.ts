import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

const big = { map: { width: 1200, height: 600 } };

describe('weapon.ion-cannon', () => {
  it('charges, then strikes with a crater twice as wide as a Heavy Nuke', () => {
    const ion = flatWorld(300, { ...big, tankColumns: [30, 1170] });
    launchAt(ion, 'weapon.ion-cannon', 600, 290, 0, 1);
    const nuke = flatWorld(300, { ...big, tankColumns: [30, 1170] });
    launchAt(nuke, 'weapon.heavy-nuke', 600, 290, 0, 1);
    // 150 cells out: beyond the Heavy Nuke's crater, deep inside the Ion Cannon's
    expect(nuke.grid.surfaceY(750)).toBeLessThanOrEqual(330);
    expect(ion.grid.surfaceY(750)).toBeGreaterThan(380);
    expect(ion.grid.surfaceY(600)).toBeGreaterThan(nuke.grid.surfaceY(600));
  });

  it('sends a lock-on, the strike and two more shockwave pulses', () => {
    const w = flatWorld(300, { ...big, tankColumns: [30, 1170] });
    launchAt(w, 'weapon.ion-cannon', 600, 290, 0, 1);
    const snap = w.snapshot().effectEvents;
    const of = (t: string) => snap.filter((e) => e.type === t);
    expect(of('ionCharge')).toHaveLength(1);
    expect(of('ionBlast')).toHaveLength(1);
    expect(of('ionPulse')).toHaveLength(2);
    // the strike comes after the charge, the pulses after the strike, one by one
    const [charge] = of('ionCharge');
    const [blast] = of('ionBlast');
    const pulses = of('ionPulse');
    expect(blast!.tick - charge!.tick).toBeGreaterThanOrEqual(60);
    expect(pulses[0]!.tick).toBeGreaterThan(blast!.tick);
    expect(pulses[1]!.tick).toBeGreaterThan(pulses[0]!.tick);
    expect(effectsOf(w, 'nukeBlast')).toHaveLength(0);
  });

  it('wrecks a tank a Heavy Nuke barely scratches', () => {
    const ion = flatWorld(300, { ...big, tankColumns: [30, 760] });
    launchAt(ion, 'weapon.ion-cannon', 600, 290, 0, 1);
    const nuke = flatWorld(300, { ...big, tankColumns: [30, 760] });
    launchAt(nuke, 'weapon.heavy-nuke', 600, 290, 0, 1);
    expect(nuke.tanks[1]!.health).toBeGreaterThan(80);
    expect(ion.tanks[1]!.health).toBeLessThan(20);
  });
});
