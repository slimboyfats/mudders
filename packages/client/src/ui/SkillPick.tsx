import { BOT_SKILLS, type BotSkill } from '@mudders/shared';
import { SKILL_NAMES, isSkill } from '../game/setup';

/** A bot seat's difficulty: a picker for whoever may change it, else a badge. */
export function SkillPick({
  value,
  seat,
  onChange,
}: {
  value: string | undefined;
  seat: number;
  onChange?: ((skill: BotSkill) => void) | undefined;
}) {
  const skill: BotSkill = isSkill(value) ? value : 'normal';
  if (!onChange) {
    return (
      <span
        className={`skill-badge skill-${skill}`}
        aria-label={`Player ${seat + 1} difficulty`}
        data-testid="skill-badge"
      >
        {SKILL_NAMES[skill]}
      </span>
    );
  }
  return (
    <select
      className={`skill-pick skill-${skill}`}
      value={skill}
      onChange={(e) => {
        if (isSkill(e.target.value)) onChange(e.target.value);
      }}
      aria-label={`Player ${seat + 1} difficulty`}
      data-testid="skill-pick"
    >
      {BOT_SKILLS.map((k) => (
        <option key={k} value={k}>
          {SKILL_NAMES[k]}
        </option>
      ))}
    </select>
  );
}
