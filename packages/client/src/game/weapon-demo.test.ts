import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { WeaponDemo, solveDemoAim } from './weapon-demo';

const content = loadContent();

describe('weapon demo (shop preview)', () => {
  it('aims a plain shell onto the target', () => {
    const demo = new WeaponDemo(content, 'weapon.missile');
    const w = demo.world;
    const aim = solveDemoAim(w);
    const p = w.predict(w.tanks[0]!, w.tanks[0]!.weapon, aim.angle, aim.power);
    expect(p.tank).toBe(1);
  });

  it('fires, settles, and starts the next loop as a new round with time moving on', () => {
    const demo = new WeaponDemo(content, 'weapon.missile');
    const seen: { tick: number; turn: number; full: boolean; blast: boolean }[] = [];
    demo.subscribe((s) =>
      seen.push({
        tick: s.tick,
        turn: s.turn,
        full: s.dirtyRects.some((r) => r.w >= s.width && r.h >= s.height),
        blast: s.effectEvents.some((e) => e.type === 'burst'),
      }),
    );
    let n = 0;
    while (demo.loop === 0 && n < 3000) {
      demo.step();
      n++;
    }
    expect(demo.loop).toBe(1);
    expect(seen.some((s) => s.blast)).toBe(true);
    const last = seen[seen.length - 1]!;
    expect(last.full).toBe(true);
    expect(Math.floor(last.turn / 1000)).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.tick).toBeGreaterThan(seen[i - 1]!.tick);
  });

  it('plays every shop weapon without throwing', () => {
    for (const w of content.list('weapon')) {
      if (w.shop.price <= 0) continue;
      const demo = new WeaponDemo(content, w.id);
      for (let i = 0; i < 200; i++) demo.step();
    }
  }, 120_000);
});
