import { useEffect, useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import { sfx } from '../audio/bridge';
import {
  ChallengeRun,
  challengeOptions,
  loadProgress,
  nextChallenge,
  recordStars,
  type Challenge,
  type ChallengeStatus,
} from '../game/challenges';
import { LocalMatch } from '../game/match';
import type { Settings } from '../game/settings';
import { MatchView } from './MatchView';
import { Stars, starGoal } from './Challenges';

interface Props {
  challenge: Challenge;
  settings: Settings;
  onNext: (id: string) => void;
  onList: () => void;
}

/** Misses before the hint shows. */
const HINT_AFTER = 2;

/** One solo challenge: a retry builds a fresh world on the same map. */
export function ChallengePlay(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Attempt
      key={`${props.challenge.id}/${attempt}`}
      {...props}
      onRetry={() => setAttempt((a) => a + 1)}
    />
  );
}

/** One go at a challenge: a local match, the objective banner and the result card. */
function Attempt({
  challenge: c,
  settings,
  onNext,
  onList,
  onRetry,
}: Props & { onRetry: () => void }) {
  const [match] = useState(() => {
    const content = loadContent();
    return new LocalMatch(content, challengeOptions(c, content));
  });
  const run = useMemo(() => new ChallengeRun(c, match.world), [c, match]);
  const [shots, setShots] = useState(0);
  const [status, setStatus] = useState<ChallengeStatus>({ state: 'playing' });
  // best result before this attempt
  const [best] = useState(() => loadProgress()[c.id] ?? 0);

  useEffect(
    () =>
      match.subscribe(() => {
        const changed = run.observe(match.world);
        setShots(run.shots);
        if (!changed) return;
        const st = run.status;
        setStatus(st);
        if (st.state === 'won') {
          recordStars(loadProgress(), c.id, st.stars);
          sfx('audio.round-end');
        }
      }),
    [match, run, c.id],
  );

  const next = nextChallenge(c.id);
  const left = run.shotsLeft;
  const over = status.state !== 'playing';
  const hint = c.hint && !over && shots >= HINT_AFTER ? c.hint : null;

  const banner = (
    <>
      {!over && (
        <div className="challenge-banner" data-testid="challenge-banner">
          <strong>{c.name}</strong>
          <span>{c.brief}</span>
          <span className="challenge-meta">
            Shots {shots}
            {left >= 0 && ` · ${left} left`} · {starGoal(c)}
          </span>
          {hint && <span className="challenge-hint">Hint: {hint}</span>}
        </div>
      )}
      {over && (
        <div className="round-over challenge-result" role="dialog" data-testid="challenge-result">
          {status.state === 'won' ? (
            <>
              <h2>Cleared</h2>
              <Stars n={status.stars} />
              <p>
                {shots} {shots === 1 ? 'shot' : 'shots'}
                {best > status.stars && ` · best ${'★'.repeat(best)}`}
              </p>
            </>
          ) : (
            <>
              <h2>Failed</h2>
              <p>{status.reason}</p>
            </>
          )}
          <div className="row">
            {status.state === 'won' && next && (
              <button className="primary" onClick={() => onNext(next.id)}>
                Next
              </button>
            )}
            <button onClick={onRetry}>Retry</button>
            <button onClick={onList}>Challenges</button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <MatchView
      match={match}
      settings={settings}
      // you are player 0; targets never take a turn and bots play themselves
      controls={(p) => p === 0 && !over}
      onExit={onList}
      banner={banner}
      ownEnd
    />
  );
}
