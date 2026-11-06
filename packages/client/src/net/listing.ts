import type { LobbyRules } from './session';

/**
 * How a room shows in the public list (§6.5): a rough host region and a one-line settings summary.
 * The region comes from the host's time zone, so no lookup service or IP geolocation is needed.
 */
const REGIONS: Record<string, string> = {
  Europe: 'Europe',
  America: 'Americas',
  Asia: 'Asia',
  Africa: 'Africa',
  Australia: 'Oceania',
  Pacific: 'Oceania',
  Atlantic: 'Atlantic',
  Indian: 'Asia',
  Antarctica: 'Antarctica',
};

export function regionOf(timeZone: string | undefined): string {
  const area = timeZone?.split('/')[0] ?? '';
  return REGIONS[area] ?? '';
}

export function localRegion(): string {
  try {
    return regionOf(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return '';
  }
}

const SIZE: Record<LobbyRules['size'], string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

export function roomSummary(r: LobbyRules): string {
  const parts = [
    `${SIZE[r.size]} map`,
    `${r.rounds} round${r.rounds === 1 ? '' : 's'}`,
    r.turnTimer ? `${r.turnTimer} s turns` : 'no turn timer',
  ];
  if (r.scenery !== 'none') parts.push(r.scenery);
  if (r.teams) parts.push('teams');
  return parts.join(' · ');
}
