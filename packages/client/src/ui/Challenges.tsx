import { useState } from 'react';
import {
  CHALLENGES,
  CHAPTERS,
  isUnlocked,
  loadProgress,
  totalStars,
  type Challenge,
} from '../game/challenges';

interface Props {
  onPick: (id: string) => void;
  onBack: () => void;
}

/** Stars as text (never colour alone): ★ earned, ☆ not yet. */
export function Stars({ n, label }: { n: number; label?: string }) {
  return (
    <span className="stars" aria-label={label ?? `${n} of 3 stars`}>
      {'★'.repeat(n)}
      <span className="stars-off">{'☆'.repeat(Math.max(0, 3 - n))}</span>
    </span>
  );
}

/** What the third star asks for, in a few words. */
export function starGoal(c: Challenge): string {
  const s = c.stars;
  if (s.by === 'shots') return s.three === 1 ? '★★★ in one shot' : `★★★ in ${s.three} shots`;
  return `★★★ with ${s.three}% health left`;
}

/** The solo ladder: chapters of challenges, each opening when the one before is cleared. */
export function Challenges({ onPick, onBack }: Props) {
  const [progress] = useState(loadProgress);
  const total = totalStars(progress);
  return (
    <main className="setup challenges" data-testid="challenges-list">
      <h2>Solo challenges</h2>
      <p className="challenges-total">
        Beat set pieces on fixed maps with the kit you are given. ★ {total} /{' '}
        {CHALLENGES.length * 3}
      </p>
      {CHAPTERS.map((title, ch) => {
        const list = CHALLENGES.map((c, i) => ({ c, i })).filter((x) => x.c.chapter === ch);
        if (list.length === 0) return null;
        return (
          <section key={title} className="challenge-chapter">
            <h3>{title}</h3>
            <ol>
              {list.map(({ c, i }) => {
                const open = isUnlocked(progress, i);
                const stars = progress[c.id] ?? 0;
                return (
                  <li key={c.id}>
                    <button
                      className={`challenge-card${open ? '' : ' locked'}${stars > 0 ? ' cleared' : ''}`}
                      disabled={!open}
                      onClick={() => onPick(c.id)}
                      data-testid={`challenge-${c.id}`}
                    >
                      <span className="challenge-num">{open ? i + 1 : '🔒'}</span>
                      <span className="challenge-text">
                        <strong>{c.name}</strong>
                        <small>{open ? c.brief : 'Clear the one before to open'}</small>
                      </span>
                      <Stars n={stars} />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <div className="setup-actions">
        <button className="primary" onClick={onBack}>
          Back
        </button>
      </div>
    </main>
  );
}
