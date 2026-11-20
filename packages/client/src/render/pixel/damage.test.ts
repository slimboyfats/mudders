import { describe, expect, it } from 'vitest';
import { damageLevel, damagePuff, damageTint } from './damage';

describe('tank damage look', () => {
  it('levels follow health: whole, battered at half, crippled at a quarter', () => {
    const t = (health: number, alive = true) => ({ alive, health, maxHealth: 100 });
    expect(damageLevel(t(100))).toBe(0);
    expect(damageLevel(t(51))).toBe(0);
    expect(damageLevel(t(50))).toBe(1);
    expect(damageLevel(t(26))).toBe(1);
    expect(damageLevel(t(25))).toBe(2);
    expect(damageLevel(t(0, false))).toBe(0);
    expect(damageLevel({ alive: true, health: 60, maxHealth: 150 })).toBe(1);
  });

  it('a whole tank keeps every cell; a crippled one loses three track links', () => {
    const sw = 16;
    const sh = 8;
    let gone = 0;
    let changed1 = 0;
    let changed2 = 0;
    for (let r = 0; r < sh; r++) {
      for (let c = 0; c < sw; c++) {
        expect(damageTint(0x40a040, c, r, sw, sh, 0, 1)).toBe(0x40a040);
        if (damageTint(0x40a040, c, r, sw, sh, 1, 1) !== 0x40a040) changed1++;
        const v = damageTint(0x40a040, c, r, sw, sh, 2, 1);
        if (v === -1) {
          gone++;
          expect(r).toBe(sh - 1);
        } else if (v !== 0x40a040) changed2++;
      }
    }
    expect(gone).toBe(3);
    expect(changed1).toBeGreaterThan(8);
    expect(changed2).toBeGreaterThan(changed1);
  });

  it('smoke: none when whole, more often and darker when crippled', () => {
    let a = 0;
    let b = 0;
    let sparks = 0;
    for (let t = 0; t < 480; t++) {
      expect(damagePuff(0, 0, t)).toBeNull();
      if (damagePuff(1, 0, t)) a++;
      const p = damagePuff(2, 0, t);
      if (p) {
        b++;
        if (p.spark) sparks++;
      }
    }
    expect(a).toBe(30);
    expect(b).toBe(80);
    expect(sparks).toBe(20);
  });
});
