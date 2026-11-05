import { describe, expect, it } from 'vitest';
import { fixtureBehaviours, fixtureSource } from '../__fixtures__/content';
import { ContentError, resolveContent } from './resolve';

function problems(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ContentError) return e.problems;
    throw e;
  }
  return [];
}

describe('resolveContent', () => {
  it('resolves use + override and extends into flat manifests', () => {
    const c = resolveContent(fixtureSource());
    const big = c.get('weapon', 'weapon.big-shell');
    expect(big.flight).toMatchObject({
      ref: 'flight.simple',
      behaviour: 'flight.simple',
      maxTicks: 600,
    });
    const imp = big.impact[0]!;
    expect('explosion' in imp && imp.explosion).toMatchObject({
      ref: 'explosion.boom',
      radius: 30,
      damage: 200,
      falloff: 'linear',
      terrainOp: { ref: 'terrainop.hole', behaviour: 'terrainop.hole' },
    });
    expect(big.triggers).toEqual(['onSolid', 'onTank']);
    expect(c.raw('weapon.big-shell')).toHaveProperty('extends', 'weapon.shell');
    expect(c.has('weapon.nope')).toBe(false);
    expect(() => c.get('weapon', 'material.dirt')).toThrow();
    expect(c.list('material').map((m) => m.id)).toEqual(['material.dirt', 'material.stone']);
  });

  it('hashes deterministically and changes with content or behaviour versions', () => {
    const a = resolveContent(fixtureSource()).hash;
    expect(resolveContent(fixtureSource()).hash).toBe(a);
    expect(resolveContent(fixtureSource({ 'explosions/boom': { radius: 11 } })).hash).not.toBe(a);
    const bumped = {
      ...fixtureSource(),
      behaviours: fixtureBehaviours.map((b) => ({ ...b, version: b.version + 1 })),
    };
    expect(resolveContent(bumped).hash).not.toBe(a);
  });

  it('reports missing and cyclic references', () => {
    expect(
      problems(() =>
        resolveContent(fixtureSource({ 'weapons/shell': { flight: { use: 'flight.gone' } } })),
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining('missing item "flight.gone"')]));
    const cyc = problems(() =>
      resolveContent(
        fixtureSource({
          'explosions/boom': { extends: 'explosion.boom' },
        }),
      ),
    );
    expect(cyc.join('\n')).toContain('cyclic reference: explosion.boom → explosion.boom');
  });

  it('reports schema, behaviour-param, folder, pack and cell problems', () => {
    const p = problems(() =>
      resolveContent(
        fixtureSource({
          'explosions/boom': { radius: -1, wat: 1 },
          'terrainops/slow': { ticks: 'many' },
          'flights/simple': { behaviour: 'flight.missing' },
          'materials/stone': { cell: 1 },
        }),
      ),
    ).join('\n');
    expect(p).toContain('explosion.boom: radius');
    expect(p).toContain('wat');
    expect(p).toContain('terrainop.slow: ticks');
    expect(p).toContain('no behaviour registered for "flight.missing"');
    expect(p).toContain('cell 1');

    const src = fixtureSource();
    src.packs[0]!.manifests[0]!.path = 'test/wrong/place/manifest.json';
    (src.packs[0]!.pack as { items: string[] }).items.push('weapon.ghost');
    const q = problems(() => resolveContent(src)).join('\n');
    expect(q).toContain('must live at <pack>/explosions/boom/manifest.json');
    expect(q).toContain('listed but missing: weapon.ghost');
  });

  it('rejects bad manifests and duplicates', () => {
    const src = fixtureSource();
    const m = src.packs[0]!.manifests;
    m.push({ path: 'test/x/manifest.json', data: [] });
    m.push({ path: 'test/y/manifest.json', data: { id: 'thing.bad' } });
    m.push({ ...m[0]! });
    src.packs.push({ pack: { name: 'Bad Name' }, manifests: [] });
    const p = problems(() => resolveContent(src)).join('\n');
    expect(p).toContain('must be an object with a string "id"');
    expect(p).toContain('unknown type prefix');
    expect(p).toContain('duplicate id');
    expect(p).toContain('pack.json');
  });

  it('checks mode references and behaviour kinds', () => {
    const p = problems(() =>
      resolveContent(
        fixtureSource({
          'modes/test': {
            map: { generator: 'gen.none', width: 100, height: 100 },
            loadout: [{ weapon: 'weapon.none', count: 1 }],
          },
          'weapons/shell': { flight: { behaviour: 'terrainop.hole' } },
        }),
      ),
    ).join('\n');
    expect(p).toContain('map.generator "gen.none"');
    expect(p).toContain('loadout weapon "weapon.none"');
    expect(p).toContain('is a terrainop, expected flight');
  });

  it('refuses a behaviour registered twice', () => {
    const src = fixtureSource();
    src.behaviours = [...src.behaviours, src.behaviours[0]!];
    expect(problems(() => resolveContent(src)).join()).toContain('registered twice');
  });
});
