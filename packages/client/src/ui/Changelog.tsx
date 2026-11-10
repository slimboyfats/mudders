import { useEffect } from 'react';
import { CHANGELOG, markSeen } from '../changelog';

interface Props {
  onBack: () => void;
}

const DATE = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });
const fmt = (iso: string) => DATE.format(new Date(`${iso}T12:00:00Z`));

/** What shipped, newest first (`changelog.ts`). */
export function Changelog({ onBack }: Props) {
  useEffect(markSeen, []);
  return (
    <main className="setup changelog" data-testid="changelog">
      <h2>What&apos;s new</h2>
      {CHANGELOG.map((e, i) => (
        <section key={e.date} className="log-entry">
          <header>
            <time dateTime={e.date}>{fmt(e.date)}</time>
            {i === 0 && <span className="new-badge">New</span>}
            {e.pack && <small>{e.pack}</small>}
          </header>
          <h3>{e.title}</h3>
          <ul>
            {e.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </section>
      ))}
      <div className="setup-actions">
        <button className="primary" onClick={onBack}>
          Back
        </button>
      </div>
    </main>
  );
}
