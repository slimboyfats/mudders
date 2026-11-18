import { useEffect, useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import { sfx } from '../audio/bridge';
import type { Coaching } from '../game/coach';
import { LocalMatch } from '../game/match';
import type { Settings } from '../game/settings';
import {
  TRAINING_WINDS,
  TrainingRun,
  loadTrainingPrefs,
  saveTrainingPrefs,
  trainingRange,
  type RangeState,
  type TrainingPrefs,
} from '../game/training';
import { MatchView } from './MatchView';
import { TrainingOverlay } from './training-overlay';

interface Props {
  /** First range's seed; unset = a random one. */
  seed?: number | undefined;
  settings: Settings;
  onExit: () => void;
}

/** Ranges cleared and shots spent this visit (not saved). */
interface Tally {
  ranges: number;
  shots: number;
  direct: number;
}

/** Training mode: endless ranges with a coach after every shot. */
export function TrainingPlay({ seed: first, settings, onExit }: Props) {
  const [prefs, setPrefs] = useState<TrainingPrefs>(loadTrainingPrefs);
  const [seed, setSeed] = useState(() => first ?? 1 + Math.floor(Math.random() * 1e9));
  const [tally, setTally] = useState<Tally>({ ranges: 0, shots: 0, direct: 0 });
  const update = (p: TrainingPrefs) => {
    setPrefs(p);
    saveTrainingPrefs(p);
  };
  return (
    <Range
      key={`${seed}/${prefs.wind}`}
      seed={seed}
      prefs={prefs}
      setPrefs={update}
      tally={tally}
      settings={settings}
      onExit={onExit}
      onDone={(shots, direct, cleared) =>
        setTally((t) => ({
          ranges: t.ranges + (cleared ? 1 : 0),
          shots: t.shots + shots,
          direct: t.direct + direct,
        }))
      }
      onNext={() => setSeed((s) => (s * 1103515245 + 12345) >>> 0 || 1)}
    />
  );
}

interface RangeProps {
  seed: number;
  prefs: TrainingPrefs;
  setPrefs: (p: TrainingPrefs) => void;
  tally: Tally;
  settings: Settings;
  onExit: () => void;
  onDone: (shots: number, direct: number, cleared: boolean) => void;
  onNext: () => void;
}

/** One range: a local match, the coach card and the training bar. */
function Range({ seed, prefs, setPrefs, tally, settings, onExit, onDone, onNext }: RangeProps) {
  const [match] = useState(() => {
    const content = loadContent();
    return new LocalMatch(content, trainingRange(content, seed, prefs.wind).options);
  });
  const run = useMemo(() => new TrainingRun(), []);
  const overlay = useMemo(() => {
    const o = new TrainingOverlay();
    o.paths = run.paths;
    return o;
  }, [run]);
  useEffect(() => {
    overlay.setGrid(prefs.grid);
  }, [overlay, prefs.grid]);
  useEffect(() => () => overlay.dispose(), [overlay]);
  const [card, setCard] = useState<Coaching | null>(null);
  const [state, setState] = useState<RangeState>('playing');
  const [shots, setShots] = useState(0);
  const [folded, setFolded] = useState(!prefs.coach);

  useEffect(
    () =>
      match.subscribe(() => {
        const changed = run.observe(match.world);
        overlay.pathVersion = run.pathVersion;
        if (!changed) return;
        setCard(run.card);
        setShots(run.shots);
        if (run.state !== 'playing') {
          setState(run.state);
          const direct = run.history.filter((r) => r.result === 'hit').length;
          onDone(run.shots, direct, run.state === 'cleared');
          if (run.state === 'cleared') sfx('audio.round-end');
        }
      }),
    // onDone is a fresh closure each render; the run reports once per range
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [match, run, overlay],
  );

  const setAim = (a: { angle: number; power: number }) =>
    match.input(0, { type: 'aim', angle: a.angle, power: a.power });
  const fold = (f: boolean) => {
    setFolded(f);
    setPrefs({ ...prefs, coach: !f });
  };
  const over = state !== 'playing';
  const ranges = tally.ranges;

  const banner = (
    <>
      <div className="training-bar" data-testid="training-bar">
        <span className="training-label" id="training-wind">
          Wind
        </span>
        <div className="seg" role="group" aria-labelledby="training-wind">
          {TRAINING_WINDS.map((w) => (
            <button
              key={w.id}
              className={prefs.wind === w.id ? 'on' : ''}
              aria-pressed={prefs.wind === w.id}
              onClick={() => prefs.wind !== w.id && setPrefs({ ...prefs, wind: w.id })}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          className={prefs.grid ? 'on' : ''}
          aria-pressed={prefs.grid}
          onClick={() => setPrefs({ ...prefs, grid: !prefs.grid })}
          data-testid="training-grid"
        >
          ▦ Tank grid
        </button>
        <button onClick={onNext} data-testid="training-new">
          New range
        </button>
        <span className="training-tally" aria-live="polite">
          Shots {shots}
          {ranges > 0 && ` · ${ranges} cleared, ${(tally.shots / ranges).toFixed(1)} shots each`}
        </span>
      </div>

      {!over && !card && shots === 0 && !folded && (
        <div className="coach-card" role="status" data-testid="coach-card">
          <div className="coach-head">
            <strong>Training</strong>
            <button className="coach-fold" aria-label="Hide the coach" onClick={() => fold(true)}>
              ×
            </button>
          </div>
          <p>
            Knock out the target. After every shot the coach says what happened and what to try.
          </p>
          <p className="coach-tip">
            Angle picks the side and the arc (under 90° shoots right, over 90° left). Power picks
            how far. Watch the wind bar at the top.
          </p>
        </div>
      )}

      {card && (!folded || over) && (
        <div
          className={`coach-card ${card.tone}${over ? ' coach-final' : ''}`}
          role={over ? 'dialog' : 'status'}
          aria-live="polite"
          data-testid="coach-card"
        >
          <div className="coach-head">
            <strong>{card.headline}</strong>
            {!over && (
              <button className="coach-fold" aria-label="Hide the coach" onClick={() => fold(true)}>
                ×
              </button>
            )}
          </div>
          {card.why.length > 0 && (
            <ul className="coach-why">
              {card.why.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {!over && (
            <p className="coach-next">
              <span className="coach-label">Next</span> {card.next}
            </p>
          )}
          {over && state === 'cleared' && (
            <p className="coach-next">
              {shots} {shots === 1 ? 'shot' : 'shots'}. {card.next}
            </p>
          )}
          <p className="coach-tip">{card.tip}</p>
          <div className="row">
            {over ? (
              <>
                <button className="primary" onClick={onNext} data-testid="training-next">
                  {state === 'cleared' ? 'Next range' : 'New range'}
                </button>
                <button onClick={onExit}>Menu</button>
              </>
            ) : (
              card.suggest && (
                <button
                  onClick={() => card.suggest && setAim(card.suggest)}
                  data-testid="coach-set-aim"
                >
                  Set it for me ({card.suggest.angle}°, {card.suggest.power})
                </button>
              )
            )}
          </div>
        </div>
      )}

      {folded && !over && (
        <button className="coach-chip" onClick={() => fold(false)} data-testid="coach-chip">
          {card ? `Coach: ${card.headline}` : 'Coach'}
        </button>
      )}
    </>
  );

  return (
    <MatchView
      match={match}
      settings={settings}
      controls={(p) => p === 0 && !over}
      onExit={onExit}
      banner={banner}
      overlay={overlay}
      ownEnd
    />
  );
}
