import { useEffect, useMemo, useState } from 'react';
import { loadContent } from '@mudders/content';
import { sfx } from '../audio/bridge';
import { LocalMatch } from '../game/match';
import type { Settings } from '../game/settings';
import {
  TUTORIAL_CASH,
  TUTORIAL_STEPS,
  TutorialRun,
  markTutorialDone,
  tutorialOptions,
  type TutorialStep,
} from '../game/tutorial';
import { MatchView } from './MatchView';

interface Props {
  settings: Settings;
  onExit: () => void;
  /** After the last step: a real match, training. */
  onPlay: () => void;
  onTraining: () => void;
}

const COPY: Record<Exclude<TutorialStep, 'done'>, { title: string; text: string }> = {
  shop: {
    title: 'The shop',
    text: `Every round opens with the shop. You have $${TUTORIAL_CASH.toLocaleString('en')}: buy a weapon that sounds fun, then press Ready. Your Missiles never run out.`,
  },
  aim: {
    title: 'Aim',
    text: 'Slide the Angle and Power pills at the bottom, or tap their ends for small steps. Angle under 90° shoots right, over 90° left; Power is how far. With a mouse you can also drag on the map.',
  },
  wind: {
    title: 'Wind',
    text: 'The wind bar at the top pushes every shell while it flies. Wind towards the target carries it further, wind against it falls short.',
  },
  fire: {
    title: 'Fire',
    text: 'Pick a weapon with the Weapon button if you like, then press FIRE and watch where it lands.',
  },
  flying: {
    title: 'Watch it fly',
    text: 'Follow the shell. The ground it hits is blown away for good.',
  },
  drive: {
    title: 'Drive',
    text: 'Tanks can move a little each turn: hold ◀ or ▶ (A or D on a keyboard). Fuel lasts the whole match; buy more in the shop.',
  },
  finish: {
    title: 'Knock it out',
    text: 'Your last shot shows as faint dots and as marks on the Angle and Power pills. Change a little from there and fire again until the target is gone.',
  },
};

/** First-match tutorial: a guided match against a still target, a step card at the top. */
export function TutorialPlay({ settings, onExit, onPlay, onTraining }: Props) {
  const match = useMemo(() => new LocalMatch(loadContent(), tutorialOptions(loadContent())), []);
  const run = useMemo(() => new TutorialRun(), []);
  const [step, setStep] = useState<TutorialStep>(run.step);
  const [shots, setShots] = useState(0);

  useEffect(() => {
    // the target never shops: it is ready at once, so the shop waits only for you
    match.input(1, { type: 'ready' });
    return match.subscribe(() => {
      if (!run.observe(match.world)) return;
      setStep(run.step);
      setShots(run.shots);
      if (run.step === 'done') {
        markTutorialDone();
        sfx('audio.round-end');
      }
    });
  }, [match, run]);

  const next = () => {
    run.next();
    setStep(run.step);
  };
  const count = TUTORIAL_STEPS.indexOf(step === 'flying' ? 'fire' : step);

  const banner =
    step === 'done' ? (
      <div
        className="coach-card good coach-final tutorial-card"
        role="dialog"
        aria-label="Tutorial done"
        data-testid="tutorial-card"
      >
        <div className="coach-head">
          <strong>That's the game!</strong>
        </div>
        <p>
          Target down in {shots} {shots === 1 ? 'shot' : 'shots'}. A real match is the same, with
          rivals who shoot back, a shop between rounds and the last tank standing winning the round.
        </p>
        {!run.drove && (
          <p className="coach-tip">
            You never drove: hold ◀ or ▶ on your turn to move out of a hole or around a hill.
          </p>
        )}
        <div className="row">
          <button className="primary" onClick={onPlay} data-testid="tutorial-play">
            Play a match
          </button>
          <button onClick={onTraining}>Training</button>
          <button onClick={onExit}>Menu</button>
        </div>
      </div>
    ) : (
      <div
        className={`coach-card tutorial-card${step === 'shop' ? ' over-shop' : ''}`}
        role="status"
        aria-live="polite"
        data-testid="tutorial-card"
        data-step={step}
      >
        <div className="coach-head">
          <strong>{COPY[step].title}</strong>
          <span className="tutorial-count">
            {count + 1} / {TUTORIAL_STEPS.length}
          </span>
        </div>
        <p>{COPY[step].text}</p>
        {(step === 'wind' || step === 'drive') && (
          <div className="row">
            <button className="primary" onClick={next} data-testid="tutorial-next">
              {step === 'wind' ? 'Got it' : 'Skip'}
            </button>
          </div>
        )}
      </div>
    );

  return (
    <MatchView
      match={match}
      settings={settings}
      controls={(p) => p === 0 && step !== 'done'}
      onExit={onExit}
      banner={banner}
      ghost
      ownEnd
    />
  );
}
