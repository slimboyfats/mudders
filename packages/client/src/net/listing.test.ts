import { describe, expect, it } from 'vitest';
import { regionOf, roomSummary } from './listing';

describe('public listing', () => {
  it('maps a time zone to a rough region', () => {
    expect(regionOf('Europe/Stockholm')).toBe('Europe');
    expect(regionOf('America/Sao_Paulo')).toBe('Americas');
    expect(regionOf('Australia/Perth')).toBe('Oceania');
    expect(regionOf('UTC')).toBe('');
    expect(regionOf(undefined)).toBe('');
  });

  it('summarises the rules in one line', () => {
    const base = {
      size: 'small',
      scenery: 'village',
      rounds: 3,
      turnTimer: 30,
      wind: 'perTurn',
      suddenDeath: true,
      startingCash: 0,
      teams: null,
    } as const;
    expect(roomSummary(base)).toBe('Small map · 3 rounds · 30 s turns · village');
    expect(roomSummary({ ...base, teams: [0, 1, 0, 1] })).toBe(
      'Small map · 3 rounds · 30 s turns · village · teams',
    );
    expect(roomSummary({ ...base, rounds: 1, turnTimer: 0, scenery: 'none' })).toBe(
      'Small map · 1 round · no turn timer',
    );
  });
});
