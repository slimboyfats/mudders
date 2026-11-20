import { NetSetupSchema } from '@mudders/shared';
import type { MatchSetup } from './setup';

/** Every rule on the setup screen: the setup without the seats. */
export type RulesValue = Omit<MatchSetup, 'slots' | 'tanks' | 'skills'>;

/** The rules a rule set or a share code sets (teams stay with the seats). */
export type RuleSetRules = Required<Omit<RulesValue, 'teams' | 'game'>>;

export interface RuleSet {
  id: string;
  name: string;
  /** One line under the name. */
  about: string;
  rules: RuleSetRules;
}

const BASE: RuleSetRules = {
  size: 'medium',
  scenery: 'village',
  rounds: 3,
  turnTimer: 15,
  shopTimer: 30,
  wind: 'perTurn',
  weather: 'clear',
  suddenDeath: true,
  suddenDeathFrom: 8,
  startingCash: 3000,
  drops: 'normal',
  roundBonus: 0,
  twists: false,
  deals: false,
  arsenal: false,
  bounty: true,
  ghost: true,
};

/**
 * Named rule sets for the setup screen (one tap sets every rule) and the online lobby. Like
 * Worms' schemes: a feel for the match instead of fifteen switches.
 */
export const RULE_SETS: readonly RuleSet[] = [
  {
    id: 'classic',
    name: 'Classic',
    about: 'Old-school: plain hills, wind each turn, no surprises',
    rules: {
      ...BASE,
      scenery: 'none',
      drops: 'off',
      bounty: false,
      ghost: false,
    },
  },
  {
    id: 'chaos',
    name: 'Chaos',
    about: 'Twists, deals, free weapons, crates, a new map each round',
    rules: {
      ...BASE,
      scenery: 'shuffle',
      rounds: 5,
      wind: 'gusty',
      weather: 'random',
      startingCash: 10000,
      drops: 'often',
      roundBonus: 5000,
      twists: true,
      deals: true,
      arsenal: true,
      suddenDeathFrom: 5,
    },
  },
  {
    id: 'sniper',
    name: 'Sniper duel',
    about: 'Big map, strong wind, time to think, no ghost to help',
    rules: {
      ...BASE,
      size: 'large',
      scenery: 'badlands',
      rounds: 5,
      turnTimer: 30,
      wind: 'perTurn',
      startingCash: 0,
      drops: 'off',
      bounty: false,
      ghost: false,
      suddenDeathFrom: 10,
    },
  },
  {
    id: 'mud',
    name: 'Mud bath',
    about: 'Marsh in the rain: soft ground that slides and squashes',
    rules: {
      ...BASE,
      scenery: 'marsh',
      weather: 'rain',
      wind: 'constant',
      startingCash: 10000,
      drops: 'rare',
    },
  },
  {
    id: 'phone',
    name: 'Quick phone match',
    about: 'One round on a small map, 10 s turns: done in a few minutes',
    rules: {
      ...BASE,
      size: 'small',
      rounds: 1,
      turnTimer: 10,
      shopTimer: 30,
      wind: 'constant',
      suddenDeathFrom: 5,
    },
  },
];

const KEYS = Object.keys(BASE) as (keyof RuleSetRules)[];

/** The rule set the rules match exactly, or null for a custom set. */
export function matchingRuleSet(r: RulesValue): RuleSet | null {
  return RULE_SETS.find((s) => KEYS.every((k) => (r[k] ?? BASE[k]) === s.rules[k])) ?? null;
}

/** The rules a share code carries: checked like a lobby's rules, unknown or bad fields dropped. */
const ShareSchema = NetSetupSchema.omit({ slots: true, tanks: true, skills: true, teams: true });

/** A short code for a set of rules (base64url of compact JSON), for a share link. */
export function encodeRules(r: RulesValue): string {
  const out: Record<string, unknown> = {};
  for (const k of KEYS) out[k] = r[k] ?? BASE[k];
  return btoa(JSON.stringify(out)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The rules in a share code, or null when it is not one. */
export function decodeRules(code: string): Partial<RuleSetRules> | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const json: unknown = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    if (!json || typeof json !== 'object') return null;
    const parsed = ShareSchema.partial().safeParse(json);
    if (!parsed.success) return null;
    const out: Partial<RuleSetRules> = {};
    for (const k of KEYS) {
      const v = parsed.data[k];
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** The page link that opens the setup screen with these rules. */
export function shareLink(r: RulesValue, base: string): string {
  return `${base}#setup/rules/${encodeRules(r)}`;
}
