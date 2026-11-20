/**
 * Weapon list favourites (per device, saved in localStorage): starred weapons sit first in the
 * weapon list. A tiny store the picker reads with useSyncExternalStore.
 */
const KEY = 'mudders.weapons.v1';

let favs: readonly string[] = load();
const subs = new Set<() => void>();

function load(): string[] {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const list = p && typeof p === 'object' ? (p as { favourites?: unknown }).favourites : null;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function favourites(): readonly string[] {
  return favs;
}

export function subscribeFavourites(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function toggleFavourite(id: string): void {
  favs = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
  try {
    localStorage.setItem(KEY, JSON.stringify({ favourites: favs }));
  } catch {
    // private mode: kept for this visit only
  }
  for (const fn of subs) fn();
}

/** The list in picker order: favourites first, each group in its own order. */
export function favouritesFirst<T extends { id: string }>(
  list: readonly T[],
  fav: readonly string[],
): T[] {
  return [...list.filter((w) => fav.includes(w.id)), ...list.filter((w) => !fav.includes(w.id))];
}
