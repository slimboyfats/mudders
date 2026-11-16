import type { RenderSnapshot, TankView } from '@mudders/shared';
import type { QuadBatch } from './batch';
import { drawText, glyphCells, place, textWidth } from './callouts';

/**
 * Bot chatter: bots say things in pixel speech bubbles over their tanks. A taunt when their turn
 * starts, a shrug when they miss, a yelp when hit, relief after a close call, last words on the
 * way out, a gloat after a kill, and a jeer when someone else misses them. Lines are picked by
 * personality (`ai.*` id from the snapshot) with a hash of the tick, so every client (hot-seat,
 * online, capture) shows the same bubble at the same moment. Renderer only: never touches the sim.
 */

export type SpeechKind = 'turn' | 'miss' | 'hurt' | 'phew' | 'dying' | 'gloat' | 'oops' | 'dodge';

/** Ticks a bubble stays up after it has finished typing. */
export const SPEECH_TICKS = 150;
/** Ticks per letter while a bubble types itself out. */
export const TYPE_TICKS = 2;
/** Most bubbles on screen at once; a stronger line pushes out the weakest. */
export const MAX_BUBBLES = 2;
/** Damage in one shot that makes a bot yelp. */
export const HURT = 8;
/** Health left (of 100) that makes surviving a hit a close call. */
export const PHEW = 15;
/** Damage to itself in one shot that makes a bot say oops. */
export const OOPS = 10;

/** Higher replaces lower on the same tank, and wins a seat when the screen is full. */
const RANK: Record<SpeechKind, number> = {
  turn: 1,
  dodge: 1,
  miss: 2,
  hurt: 3,
  oops: 4,
  phew: 4,
  gloat: 5,
  dying: 6,
};

/** Out of 256: how often a bot speaks up when the moment comes. */
const CHANCE: Record<SpeechKind, number> = {
  turn: 110,
  dodge: 100,
  miss: 140,
  hurt: 150,
  oops: 256,
  phew: 256,
  gloat: 210,
  dying: 200,
};

type Lines = Partial<Record<SpeechKind, readonly string[]>>;

/** Every bot can say these. */
const COMMON: Record<SpeechKind, readonly string[]> = {
  turn: ['INCOMING!', 'HOLD STILL', 'SAY CHEESE', 'FORE!', 'DUCK!', 'THIS ONE IS YOURS'],
  miss: ['WIND!', 'WARNING SHOT', 'SO CLOSE', 'NEXT TIME', 'MEANT THAT'],
  hurt: ['OUCH!', 'HEY!', 'RUDE!', 'THAT STINGS', 'MY PAINT!'],
  phew: ['PHEW!', 'TOO CLOSE', 'STILL HERE!', 'NOT TODAY'],
  dying: ['NOT LIKE THIS', 'AAARGH', 'BYE...', 'WORTH IT', 'TELL MY MUM...'],
  gloat: ['BOOM!', 'GOT YOU!', 'TOO EASY', 'SIT DOWN', 'NEXT!'],
  oops: ['OOPS', 'WHO DID THAT?', 'ME?!', 'MY BAD'],
  dodge: ['MISSED ME!', 'OVER HERE!', 'NICE DIRT', 'HA!', 'TRY AGAIN'],
};

/** Each personality's own voice, mixed in with the common lines. */
const VOICE: Record<string, Lines> = {
  'ai.moron': {
    turn: ['WHICH BUTTON?', 'BIG RED ONE!', 'IS LEFT UP?', 'WATCH THIS!'],
    miss: ['WAS THAT ME?', 'WHERE DID IT GO?'],
    hurt: ['WHY ME?', 'OW OW OW'],
    gloat: ['I MEANT THAT!', 'I DID A THING'],
    dying: ['WHEEE...'],
    oops: ['NOT AGAIN'],
  },
  'ai.cyborg': {
    turn: ['TARGET LOCKED', 'CALCULATING', 'YOU: 2 SECONDS'],
    miss: ['RECALIBRATING', 'DATA NOTED'],
    hurt: ['DAMAGE NOTED', 'ARMOR BREACH'],
    phew: ['CRITICAL. STILL UP'],
    gloat: ['TARGET DELETED', 'AS PREDICTED'],
    dying: ['SYSTEM DOWN...', 'REBOOT LATER'],
  },
  'ai.poolshark': {
    turn: ['CORNER POCKET', 'BANK SHOT', 'OFF THE HILL'],
    miss: ['BAD BOUNCE', 'TABLE IS TILTED'],
    hurt: ['LUCKY SHOT'],
    gloat: ['IN THE POCKET', 'CLEAN SHOT'],
    dying: ['SCRATCH...'],
  },
  'ai.tosser': {
    turn: ['UP IT GOES', 'SKY MAIL', 'LOOK UP!'],
    miss: ['WIND AGAIN!', 'TOO HIGH?'],
    gloat: ['SPECIAL DELIVERY', 'FROM ABOVE!'],
    dying: ['BAD LANDING'],
  },
  'ai.shooter': {
    turn: ['STRAIGHT AT YOU', 'NO TRICKS'],
    miss: ['AGAIN!', 'HOLD STILL!'],
    hurt: ['THAT ALL?'],
    gloat: ['DOWN YOU GO'],
    dying: ['GG...'],
  },
};

/** A small integer hash: the same inputs give the same line on every client. */
export function speechHash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f) ^ Math.imul(c + 0x165667b1, 0x9e3779b1);
  h ^= h >>> 13;
  h = Math.imul(h, 0x85ebca6b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The line `bot` says for `kind`, picked by `roll`. */
export function lineFor(bot: string, kind: SpeechKind, roll: number): string {
  const own = VOICE[bot]?.[kind] ?? [];
  const common = COMMON[kind];
  // own lines come up about half the time even though they're fewer
  if (own.length > 0 && roll % 2 === 0) return own[(roll >>> 1) % own.length]!;
  return common[(roll >>> 1) % common.length]!;
}

export interface Bubble {
  player: number;
  kind: SpeechKind;
  text: string;
  born: number;
  x: number;
  y: number;
}

/** Turns the snapshot stream into speech bubbles. Pure logic, no GL. */
export class SpeechTracker {
  readonly bubbles: Bubble[] = [];
  private prev = new Map<number, { health: number; alive: boolean }>();
  private round = -1;
  private lastTick = -1;
  /** Player who aimed last (the shot being resolved is theirs), or -1. */
  private shooter = -1;
  private aiming = false;
  /** Whether the current shooter's shot has left the barrel (aiming ended). */
  private fired = false;
  /** This shot: damage to others and to self by the shooter, kills by the shooter. */
  private dealt = 0;
  private self = 0;
  private kills = 0;
  /** Per player this shot: damage taken, and what it already said. */
  private taken = new Map<number, number>();
  private said = new Set<string>();

  reset(): void {
    this.bubbles.length = 0;
    this.prev.clear();
    this.shooter = -1;
    this.aiming = false;
    this.fired = false;
    this.newShot();
  }

  private newShot(): void {
    this.dealt = 0;
    this.self = 0;
    this.kills = 0;
    this.taken.clear();
    this.said.clear();
  }

  ingest(s: RenderSnapshot): void {
    const round = Math.floor(s.turn / 1000);
    if (s.tick < this.lastTick || round !== this.round) this.reset();
    this.round = round;
    this.lastTick = s.tick;

    let active: TankView | undefined;
    for (const e of s.entities) if (e.kind === 'tank' && e.active) active = e;
    if (active && (!this.aiming || active.player !== this.shooter)) {
      this.endShot(s);
      this.newShot();
      this.shooter = active.player;
      this.fired = false;
      if (active.bot !== undefined) this.say(s, active, 'turn');
    }
    if (!active && this.shooter >= 0) this.fired = true;
    this.aiming = active !== undefined;
    const resolving = !this.aiming && this.shooter >= 0;

    for (const e of s.entities) {
      if (e.kind !== 'tank') continue;
      const was = this.prev.get(e.player);
      this.prev.set(e.player, { health: e.health, alive: e.alive });
      if (!was || !resolving) continue;
      const d = Math.round(was.health) - Math.round(e.health);
      const own = e.player === this.shooter;
      if (d > 0) {
        if (own) this.self += d;
        else this.dealt += d;
        const total = (this.taken.get(e.player) ?? 0) + d;
        this.taken.set(e.player, total);
        if (e.bot !== undefined && e.alive) {
          if (own) {
            if (total >= OOPS) this.say(s, e, 'oops');
          } else if (e.health <= (PHEW * e.maxHealth) / 100) this.say(s, e, 'phew');
          else if (total >= HURT) this.say(s, e, 'hurt');
        }
      }
      if (was.alive && !e.alive) {
        if (own) {
          if (e.bot !== undefined) this.say(s, e, 'oops', true);
        } else {
          this.kills++;
          if (e.bot !== undefined) this.say(s, e, 'dying', true);
          const shooter = this.tankOf(s, this.shooter);
          if (shooter?.bot !== undefined && shooter.alive) this.say(s, shooter, 'gloat');
        }
      }
    }

    for (const b of this.bubbles) {
      const t = this.tankOf(s, b.player);
      if (t) {
        b.x = t.x;
        b.y = t.y;
      }
    }
    prune(this.bubbles, (b) => s.tick - b.born > lifeOf(b));
  }

  /** The shot is over (the next tank aims): a bot that hit nothing shrugs, or a target jeers. */
  private endShot(s: RenderSnapshot): void {
    if (this.shooter < 0 || !this.fired || this.dealt > 0 || this.kills > 0) return;
    const shooter = this.tankOf(s, this.shooter);
    if (!shooter) return;
    if (shooter.bot !== undefined) {
      if (shooter.alive && this.self === 0) this.say(s, shooter, 'miss');
      return;
    }
    // a human's shot that hurt nobody: one live bot rubs it in
    const bots: TankView[] = [];
    for (const e of s.entities)
      if (e.kind === 'tank' && e.alive && e.bot !== undefined) bots.push(e);
    if (bots.length === 0) return;
    const pick = bots[speechHash(s.tick, this.shooter, 7) % bots.length]!;
    this.say(s, pick, 'dodge');
  }

  /** `t` may speak `kind`: once per shot per kind, by chance, and only if it outranks what's up. */
  private say(s: RenderSnapshot, t: TankView, kind: SpeechKind, sure = false): void {
    const key = `${t.player}:${kind}`;
    if (this.said.has(key)) return;
    this.said.add(key);
    const roll = speechHash(s.tick, t.player, RANK[kind]);
    if (!sure && (roll & 255) >= CHANCE[kind]) return;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i]!;
      if (b.player !== t.player) continue;
      if (RANK[b.kind] > RANK[kind]) return;
      this.bubbles.splice(i, 1);
      break;
    }
    if (this.bubbles.length >= MAX_BUBBLES) {
      let weakest = 0;
      for (let i = 1; i < this.bubbles.length; i++)
        if (RANK[this.bubbles[i]!.kind] < RANK[this.bubbles[weakest]!.kind]) weakest = i;
      if (RANK[this.bubbles[weakest]!.kind] > RANK[kind]) return;
      this.bubbles.splice(weakest, 1);
    }
    const text = lineFor(t.bot ?? '', kind, roll >>> 8);
    this.bubbles.push({ player: t.player, kind, text, born: s.tick, x: t.x, y: t.y });
  }

  private tankOf(s: RenderSnapshot, player: number): TankView | undefined {
    for (const e of s.entities) if (e.kind === 'tank' && e.player === player) return e;
    return undefined;
  }
}

function lifeOf(b: Bubble): number {
  return b.text.length * TYPE_TICKS + SPEECH_TICKS;
}

function prune<T>(list: T[], gone: (v: T) => boolean): void {
  let j = 0;
  for (const v of list) if (!gone(v)) list[j++] = v;
  list.length = j;
}

const PAPER = 0xf4eedc;
const INK = 0x18161e;
const EDGE = 0x000000;
/** Last words are said on a darker, sooty paper. */
const SOOT = 0xb8b0a0;

/** Bubble bottom above the tank row: over the health bar and the player plate. */
const LIFT = 18;

/**
 * Draws the bubbles: paper box with a 1-cell black edge and a stepped tail down to the tank, the
 * text typing itself out a letter at a time, then blinking out in steps. Call after
 * `drawCallouts` in the same frame so bubbles stack above hit words instead of covering them.
 */
export function drawSpeech(
  b: QuadBatch,
  tracker: SpeechTracker,
  t: number,
  scale: number,
  mapWidth: number,
): void {
  const px = glyphCells(scale);
  for (const bub of tracker.bubbles) {
    const age = t - bub.born;
    if (age < 0) continue;
    const life = lifeOf(bub);
    const left = life - age;
    if (left <= 0) continue;
    // stepped close: the last 12 ticks blink, no soft fade
    if (left < 12 && Math.floor(left / 3) % 2 === 1) continue;
    const pad = px;
    const tw = textWidth(bub.text) * px;
    const w = tw + pad * 2;
    const h = 5 * px + pad * 2;
    const tail = 2 * px + 1;
    // kept inside the map, so a tank at the edge doesn't speak off-screen; the tail stays on it
    const cx = Math.max(w / 2 + 2, Math.min(mapWidth - w / 2 - 2, bub.x));
    const bottom = place(cx, Math.round(bub.y - LIFT), w, h + tail);
    const x0 = Math.round(cx - w / 2);
    const y0 = bottom - tail - h;
    // pops open over three ticks: a sliver, half height, full
    const open = Math.min(3, age + 1);
    const bh = open === 3 ? h : Math.max(2, Math.round((h * open) / 3));
    const by = y0 + h - bh;
    const paper = bub.kind === 'dying' ? SOOT : PAPER;
    b.rect(x0 - 1, by - 1, w + 2, bh + 2, EDGE, 1);
    b.rect(x0, by, w, bh, paper, 1);
    // stepped tail, offset left of centre, pointing at the tank
    const tx = Math.max(x0 + 1, Math.min(x0 + w - tail - 1, Math.round(bub.x) - px));
    for (let i = 0; i < tail; i++) {
      const tw2 = Math.max(1, tail - i);
      b.rect(tx - 1, y0 + h + i, tw2 + 2, 1, EDGE, 1);
      if (tw2 > 1) b.rect(tx, y0 + h + i, tw2, 1, paper, 1);
    }
    b.rect(tx, y0 + h - 1, Math.max(1, tail - 1), 2, paper, 1);
    if (open < 3) continue;
    const shown = Math.min(bub.text.length, Math.floor(age / TYPE_TICKS) + 1);
    // lay the typed part out from the left of the full line, so letters don't slide as they come
    const typed = bub.text.slice(0, shown);
    const tcx = x0 + pad + (textWidth(typed) * px) / 2;
    drawText(b, typed, tcx, y0 + pad + 5 * px, px, INK, 1, false);
  }
}
