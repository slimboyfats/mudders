import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { World } from '@mudders/sim';
import { suggestAim } from './coach';
import { RULE_SETS, decodeRules, encodeRules, matchingRuleSet, shareLink } from './rule-sets';
import { defaultSetup } from './setup';
import { ShotGhost } from './shot-ghost';
import { TutorialRun, tutorialOptions } from './tutorial';
import { favouritesFirst } from './weapon-prefs';

const content = loadContent();

describe('rule sets', () => {
  it('each set is recognised after it is applied, and differs from the others', () => {
    for (const set of RULE_SETS) {
      const r = { ...defaultSetup(), ...set.rules };
      expect(matchingRuleSet(r)?.id).toBe(set.id);
    }
    const codes = new Set(RULE_SETS.map((s) => encodeRules({ ...defaultSetup(), ...s.rules })));
    expect(codes.size).toBe(RULE_SETS.length);
  });

  it('a share code carries every rule there and back', () => {
    const set = RULE_SETS.find((s) => s.id === 'chaos')!;
    const r = { ...defaultSetup(), ...set.rules, rounds: 7 };
    const back = decodeRules(encodeRules(r));
    expect(back).toMatchObject({ ...set.rules, rounds: 7 });
    expect(matchingRuleSet({ ...defaultSetup(), ...back })).toBeNull();
    expect(shareLink(r, 'https://x.test/mudders/')).toMatch(
      /^https:\/\/x\.test\/mudders\/#setup\/rules\/[A-Za-z0-9_-]+$/,
    );
  });

  it('a broken or hostile code is turned away', () => {
    expect(decodeRules('not a code!')).toBeNull();
    expect(decodeRules(btoa(JSON.stringify({ rounds: 999 })))).toBeNull();
    expect(decodeRules(btoa(JSON.stringify({ slots: ['human'] })))).toBeNull();
    // unknown fields are dropped, known ones kept
    expect(decodeRules(btoa(JSON.stringify({ rounds: 2, evil: '<script>' })))).toEqual({
      rounds: 2,
    });
  });
});

describe('weapon favourites', () => {
  it('puts favourites first, each group in its own order', () => {
    const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    expect(favouritesFirst(list, ['d', 'b']).map((w) => w.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(favouritesFirst(list, []).map((w) => w.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

/** Steps until the phase is `phase` again (or throws). */
function until(w: World, done: () => boolean, each: () => void = () => undefined) {
  for (let i = 0; i < 6000; i++) {
    if (done()) return;
    w.step();
    each();
  }
  throw new Error('never got there');
}

describe('tutorial', () => {
  it('opens with the shop, walks the steps and ends when the target is down', () => {
    const w = new World(content, tutorialOptions(content));
    const run = new TutorialRun();
    const ghost = new ShotGhost();
    const shots: number[] = [];
    ghost.onShot = (p) => shots.push(p);
    const feed = () => {
      run.observe(w);
      ghost.observe(w);
    };
    expect(w.phase).toBe('shop');
    expect(w.tanks[0]!.money).toBeGreaterThan(0);
    w.applyInput(1, { type: 'ready' });
    w.applyInput(0, { type: 'ready' });
    until(w, () => w.phase === 'aim', feed);
    expect(run.step).toBe('aim');
    const me = w.tanks[0]!;
    // a miss first: the ghost keeps its path, the tutorial asks for the wind, then driving
    w.applyInput(0, { type: 'aim', angle: me.x < w.tanks[1]!.x ? 80 : 100, power: 300 });
    w.step();
    feed();
    expect(run.step).toBe('wind');
    run.next();
    expect(run.step).toBe('fire');
    w.applyInput(0, { type: 'fire' });
    until(w, () => w.phase === 'resolve', feed);
    expect(run.step).toBe('flying');
    until(w, () => w.phase === 'aim' && run.step !== 'flying', feed);
    expect(run.step).toBe('drive');
    expect(shots).toEqual([0]);
    expect(ghost.shots[0]?.power).toBe(300);
    expect(ghost.shots[0]!.path.length).toBeGreaterThan(8);
    run.next();
    expect(run.step).toBe('finish');
    // then the hit
    const aim = suggestAim(w, me, me.weapon, 1, { angle: 45, power: 600 });
    expect(aim).toBeTruthy();
    w.applyInput(0, { type: 'aim', ...aim! });
    w.applyInput(0, { type: 'fire' });
    until(w, () => run.step === 'done', feed);
    expect(run.shots).toBe(2);
    expect(run.drove).toBe(false);
  });
});
