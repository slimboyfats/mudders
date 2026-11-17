import { useState } from 'react';

/**
 * Frame-time overlay (Settings → Show performance) for checking the §9 budgets on real devices:
 * sim ≤ 2 ms average and ≤ 6 ms worst per tick, renderer ≤ 6 ms, 60 fps. Render time is CPU time
 * to build and submit the frame; GPU work shows up as a lower fps instead.
 *
 * Record in the overlay starts the performance recorder (`game/perf-log`); Stop saves its log as
 * a text file and offers to copy or share it.
 */

export interface PerfStats {
  fps: number;
  simAvg: number;
  simWorst: number;
  renderAvg: number;
  renderWorst: number;
  worstFrame: number;
}

/** Collects per-frame timings and reports once a second. */
export class PerfMeter {
  private start = -1;
  private frames = 0;
  private ticks = 0;
  private sim = 0;
  private simWorst = 0;
  private render = 0;
  private renderWorst = 0;
  private worstFrame = 0;

  /** Record one frame; returns the stats of the last second when one has passed. */
  frame(now: number, dt: number, ticks: number, simMs: number, renderMs: number): PerfStats | null {
    if (this.start < 0) this.start = now;
    this.frames++;
    this.ticks += ticks;
    this.sim += simMs;
    if (ticks > 0) this.simWorst = Math.max(this.simWorst, simMs / ticks);
    this.render += renderMs;
    this.renderWorst = Math.max(this.renderWorst, renderMs);
    this.worstFrame = Math.max(this.worstFrame, dt);
    const span = now - this.start;
    if (span < 1000) return null;
    const out: PerfStats = {
      fps: (this.frames * 1000) / span,
      simAvg: this.ticks > 0 ? this.sim / this.ticks : 0,
      simWorst: this.simWorst,
      renderAvg: this.render / this.frames,
      renderWorst: this.renderWorst,
      worstFrame: this.worstFrame,
    };
    this.start = now;
    this.frames = this.ticks = 0;
    this.sim = this.simWorst = this.render = this.renderWorst = this.worstFrame = 0;
    return out;
  }
}

const f = (v: number) => v.toFixed(1);

/** Over budget is marked with a word, not only a colour (§8 accessibility). */
function Row({ label, value, budget }: { label: string; value: string; budget: boolean }) {
  return (
    <div className={budget ? 'perf-row' : 'perf-row over'}>
      {label} {value}
      {budget ? '' : ' OVER'}
    </div>
  );
}

/** A finished recording: the file's name and its text. */
export interface PerfLog {
  name: string;
  text: string;
}

/** Save `text` as a file called `name` (the browser's downloads). */
export function saveText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function logFile(log: PerfLog): File {
  return new File([log.text], log.name, { type: 'text/plain' });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface OverlayProps {
  stats: PerfStats;
  /** Seconds recorded so far, or null when not recording. */
  recording: number | null;
  /** The last finished recording, until dismissed. */
  log: PerfLog | null;
  onRecord: () => void;
  onStop: () => void;
  /** The player says it feels slow right now. */
  onMark: () => void;
  onDismiss: () => void;
}

export function PerfOverlay({
  stats: s,
  recording,
  log,
  onRecord,
  onStop,
  onMark,
  onDismiss,
}: OverlayProps) {
  const [copied, setCopied] = useState(false);
  const [marks, setMarks] = useState(0);
  const canShare = log !== null && (navigator.canShare?.({ files: [logFile(log)] }) ?? false);
  return (
    // the buttons must not aim the tank or pan the map underneath
    <div
      className="perf"
      data-testid="perf"
      aria-label="Performance"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Row label="fps" value={f(s.fps)} budget={s.fps >= 55} />
      <Row
        label="sim ms/tick"
        value={`${f(s.simAvg)} avg · ${f(s.simWorst)} worst`}
        budget={s.simAvg <= 2 && s.simWorst <= 6}
      />
      <Row
        label="render ms"
        value={`${f(s.renderAvg)} avg · ${f(s.renderWorst)} worst`}
        budget={s.renderAvg <= 6}
      />
      <Row label="longest frame ms" value={f(s.worstFrame)} budget={s.worstFrame <= 34} />
      <div className="perf-rec">
        {recording !== null ? (
          <>
            <button onClick={onStop} data-testid="perf-stop">
              Stop and save · {clock(recording)}
            </button>
            <button
              onClick={() => {
                setMarks((n) => n + 1);
                onMark();
              }}
              data-testid="perf-mark"
            >
              Slow now{marks > 0 ? ` · ${marks}` : ''}
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setCopied(false);
              setMarks(0);
              onRecord();
            }}
            data-testid="perf-record"
          >
            Record
          </button>
        )}
      </div>
      {log && recording === null && (
        <div className="perf-rec" data-testid="perf-saved">
          <span>Saved {log.name}</span>
          <button
            onClick={() =>
              void navigator.clipboard?.writeText(log.text).then(() => setCopied(true))
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canShare && (
            <button
              onClick={() =>
                void navigator.share({ files: [logFile(log)], title: log.name }).catch(() => {})
              }
            >
              Share
            </button>
          )}
          <button onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
