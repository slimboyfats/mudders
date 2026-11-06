import { useMemo } from 'react';
import { loadContent } from '@mudders/content';

export interface TankChoice {
  id: string;
  name: string;
  desc: string;
  /** One-line stats summary, e.g. "150% health · big body · drives ½". */
  stats: string;
}

/** The loaded tank types for pickers, Classic first. */
export function useTanks(): TankChoice[] {
  return useMemo(() => {
    const list = loadContent()
      .list('tank')
      .map((t) => ({ id: t.id, name: t.meta.name, desc: t.meta.description, stats: tankStats(t) }));
    return list.sort((a, b) => (a.id === 'tank.classic' ? -1 : b.id === 'tank.classic' ? 1 : 0));
  }, []);
}

/** A bot personality's favourite tank pick (`ai.*` `tank`), or undefined. */
export function useFavourites(): Record<string, string | undefined> {
  return useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const a of loadContent().list('ai')) out[a.id] = a.tank;
    return out;
  }, []);
}

function tankStats(t: {
  health: number;
  shield: number;
  body: { width: number; height: number };
  damage: number;
  muzzle: number;
  drive: number;
}): string {
  const out = [`${t.health}% health`];
  if (t.shield > 0) out.push(`${t.shield} shield`);
  out.push(`${t.body.width}×${t.body.height} body`);
  if (t.damage !== 100) out.push(`${t.damage}% damage`);
  if (t.muzzle !== 100) out.push(`${t.muzzle}% shell speed`);
  if (t.drive !== 100) out.push(`${t.drive}% drive`);
  return out.join(' · ');
}

/**
 * Tank picker for one seat (§3.2): every tank type, Random, and "auto" (the bot's favourite, or
 * the default tank for a human). A read-only badge when `onChange` is missing.
 */
export function TankPick({
  value,
  seat,
  bot,
  tanks,
  favourites,
  onChange,
}: {
  value: string;
  seat: number;
  /** `ai.*` id when the seat is a bot. */
  bot?: string | undefined;
  tanks: TankChoice[];
  favourites: Record<string, string | undefined>;
  onChange?: ((tank: string) => void) | undefined;
}) {
  const nameOf = (id: string | undefined) =>
    id === 'random' ? 'Random' : (tanks.find((t) => t.id === id)?.name ?? 'Classic');
  const auto = bot ? `Favourite (${nameOf(favourites[bot])})` : nameOf('tank.classic');
  const label = value === 'auto' ? auto : nameOf(value);
  if (!onChange) {
    return (
      <span className="tank-badge" aria-label={`Player ${seat + 1} tank`} data-testid="tank-badge">
        {label}
      </span>
    );
  }
  return (
    <select
      className="tank-pick"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Player ${seat + 1} tank`}
      data-testid="tank-pick"
    >
      <option value="auto">{auto}</option>
      {tanks
        .filter((t) => bot !== undefined || t.id !== 'tank.classic')
        .map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      <option value="random">Random</option>
    </select>
  );
}

/** "About the tanks": each type's stats and trade-off. */
export function TankAbout({ tanks }: { tanks: TankChoice[] }) {
  return (
    <ul className="about" data-testid="tank-about">
      {tanks.map((t) => (
        <li key={t.id}>
          <b>{t.name}</b> ({t.stats}): {t.desc}
        </li>
      ))}
    </ul>
  );
}
