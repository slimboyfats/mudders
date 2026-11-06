import { TEAM_NAMES, teamName } from '../game/setup';

/** "Play in teams" switch for the setup screen and the online lobby (milestone 7). */
export function TeamsToggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check teams-toggle">
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid="teams"
      />
      Play in teams
    </label>
  );
}

/** Team picker for one seat; read-only badge when `onChange` is missing. */
export function TeamPick({
  team,
  seat,
  onChange,
}: {
  team: number;
  seat: number;
  onChange?: ((team: number) => void) | undefined;
}) {
  if (!onChange) {
    return (
      <span className={`team-badge team-${team}`} aria-label={`Team ${teamName(team)}`}>
        {teamName(team)}
      </span>
    );
  }
  return (
    <select
      className={`team-pick team-${team}`}
      value={team}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={`Player ${seat + 1} team`}
    >
      {TEAM_NAMES.map((n, t) => (
        <option key={n} value={t}>
          Team {n}
        </option>
      ))}
    </select>
  );
}
