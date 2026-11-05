import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { loadContent } from '@mudders/content';
import { MAX_PLAYERS, type LobbySeat, type RoomInfo } from '@mudders/shared';
import { SIGNAL_URL } from '../config';
import type { SimMatch } from '../game/match';
import type { Settings } from '../game/settings';
import { loadSetup, saveSetup } from '../game/setup';
import type { Link } from '../net/link';
import { localRegion, roomSummary } from '../net/listing';
import { directAnswer, directOffer, RoomNet } from '../net/rtc';
import { GuestSession, HostSession, PING_MS, TAKEOVER_MS, type LobbyRules } from '../net/session';
import { SignalClient, type SignalStatus } from '../net/signal';
import { BACKGROUND_CATCHUP_MS, startTicker } from '../net/ticker';
import { PLAYER_COLORS } from '../render/pixel/theme';
import { MatchView } from './MatchView';
import { Rules } from './Rules';

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const NAME_KEY = 'mudders.name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'Player';
  } catch {
    return 'Player';
  }
}
function saveName(n: string): void {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    // ignore
  }
}

/** Seat tokens survive a reload (§6.1), per room code. */
function loadToken(code: string): string | undefined {
  try {
    return sessionStorage.getItem(`mudders.seat.${code}`) ?? undefined;
  } catch {
    return undefined;
  }
}
function saveToken(code: string, token: string | undefined): void {
  try {
    if (token) sessionStorage.setItem(`mudders.seat.${code}`, token);
  } catch {
    // ignore
  }
}

/** Re-render when an external object says it changed. */
function useChanges(source: { subscribe: (fn: () => void) => () => void } | null): void {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => source?.subscribe(force), [source]);
}

function rulesOf(): LobbyRules {
  const s = loadSetup();
  return {
    size: s.size,
    scenery: s.scenery,
    rounds: s.rounds,
    turnTimer: s.turnTimer,
    wind: s.wind,
    suddenDeath: s.suddenDeath,
    startingCash: s.startingCash,
  };
}

const SIGNAL_TEXT: Record<SignalStatus, string> = {
  connecting: 'Connecting to the lobby server…',
  waking:
    'Waking up the lobby server… (a free server sleeps when idle; this can take up to a minute)',
  open: '',
  offline: 'The lobby server is unreachable. You can still play with “Direct (no server)”.',
  outdated: 'Your game is older than the lobby server. Reload the page to update.',
};

function NameField({ name, setName }: { name: string; setName: (n: string) => void }) {
  return (
    <label className="name-field">
      Your name
      <input
        value={name}
        maxLength={16}
        onChange={(e) => {
          setName(e.target.value);
          saveName(e.target.value);
        }}
        data-testid="name"
      />
    </label>
  );
}

function SeatRow({
  seat,
  i,
  you,
  bots,
  onSet,
}: {
  seat: LobbySeat;
  i: number;
  you: number;
  bots: { id: string; name: string }[];
  onSet?: ((v: string) => void) | undefined;
}) {
  const label =
    seat.kind === 'bot'
      ? `AI: ${bots.find((b) => b.id === seat.bot)?.name ?? seat.bot}`
      : seat.kind === 'open'
        ? 'Open'
        : seat.name;
  return (
    <li
      className={`seat ${seat.kind}${seat.kind === 'guest' && !seat.connected ? ' away' : ''}`}
      data-testid="seat"
    >
      <span className="swatch" style={{ background: css(PLAYER_COLORS[i] ?? 0xffffff) }} />
      <span className="seat-name">
        {label}
        {i === you && <em> (you)</em>}
        {seat.kind === 'host' && <em> host</em>}
      </span>
      {seat.standIn && (
        <span className="stand-in" data-testid="stand-in">
          AI playing for {i === you ? 'you' : 'them'}
        </span>
      )}
      {seat.kind === 'guest' && (
        <span className={`path ${seat.connected ? (seat.path ?? '') : 'away'}`}>
          {!seat.connected
            ? 'reconnecting…'
            : seat.path === 'relay'
              ? 'relay'
              : seat.path === 'p2p'
                ? 'direct'
                : ''}
          {seat.connected && seat.rtt !== undefined ? ` · ${seat.rtt} ms` : ''}
        </span>
      )}
      {onSet && (seat.kind === 'open' || seat.kind === 'bot') && (
        <select
          value={seat.kind === 'open' ? 'open' : (seat.bot ?? '')}
          onChange={(e) => onSet(e.target.value)}
          aria-label={`Seat ${i + 1}`}
        >
          <option value="open">Open for a player</option>
          {bots.map((b) => (
            <option key={b.id} value={b.id}>
              AI: {b.name}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

function useBots() {
  return useMemo(
    () =>
      loadContent()
        .list('ai')
        .map((a) => ({ id: a.id, name: a.meta.name })),
    [],
  );
}

function Copyable({ text, label, testid }: { text: string; label: string; testid: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copyable">
      <textarea readOnly value={text} rows={text.length > 80 ? 4 : 1} data-testid={testid} />
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        }}
      >
        {copied ? 'Copied' : label}
      </button>
    </div>
  );
}

interface NetGameProps {
  match: SimMatch;
  me: number;
  settings: Settings;
  onExit: () => void;
  banner: React.ReactNode;
  /** Extra hooks for the headless network test. */
  debug?: Record<string, () => unknown>;
}

/** The match view for an online player: only their own tank takes input. */
function NetGame({ match, me, settings, onExit, banner, debug }: NetGameProps) {
  useEffect(() => {
    // read by the headless network test (play:net); harmless otherwise
    Object.assign(window, {
      __muddersNet: {
        me,
        tick: () => match.world.tick,
        hash: () => match.world.hash(),
        phase: () => match.world.phase,
        active: () => match.world.activePlayer,
        bots: () => match.world.tanks.map((t) => t.bot),
        alive: () => match.world.tanks.map((t) => t.alive),
        ...debug,
      },
    });
  }, [match, me, debug]);
  return (
    <MatchView
      match={match}
      settings={settings}
      controls={(p) => p === me}
      onExit={onExit}
      banner={banner}
    />
  );
}

// ── host ────────────────────────────────────────────────────────────────────────────────────

interface HostProps {
  mode: 'online' | 'direct';
  settings: Settings;
  onExit: () => void;
}

/** Host a game: the lobby server (share a room code/link) or direct copy-paste invites. */
export function HostGame({ mode, settings, onExit }: HostProps) {
  const [name, setName] = useState(loadName);
  const session = useMemo(() => new HostSession(loadContent(), loadName(), rulesOf()), []);
  const [signal, setSignal] = useState<SignalClient | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [match, setMatch] = useState<SimMatch | null>(null);
  const bots = useBots();
  useChanges(session);
  useChanges(signal);

  const [isPublic, setPublic] = useState(false);

  // a worker timer, so a hidden host tab keeps pinging its guests (§6.1)
  useEffect(() => {
    const stop = startTicker(() => session.heartbeat(), PING_MS);
    return () => {
      stop();
      session.close();
    };
  }, [session]);

  // A hidden host tab gets no animation frames, which used to freeze the match for everyone. While
  // hidden, a worker tick advances the host's match instead, and after the takeover window an AI
  // plays the host's own turns until the tab is back.
  useEffect(() => {
    if (!match) return;
    let last = performance.now();
    const stop = startTicker(() => {
      const now = performance.now();
      let dt = Math.min(now - last, BACKGROUND_CATCHUP_MS);
      last = now;
      if (!document.hidden) return;
      while (dt > 0) {
        const step = Math.min(dt, 100);
        match.advance(step);
        dt -= step;
      }
    }, 50);
    const vis = () => session.setHostAway(document.hidden);
    vis();
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [match, session]);

  useEffect(() => {
    if (mode !== 'online') return;
    const s = new SignalClient(SIGNAL_URL);
    const net = new RoomNet(s, 'host');
    net.onLink = (link) => session.addLink(link);
    s.on('roomUpdate', (m) => setCode(m.code));
    s.on('error', (m) => setError(m.reason));
    // the socket is an external system; the component re-renders from its own subscription
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignal(s);
    void s.connect().then(() => {
      if (!s.room) {
        s.send({
          type: 'createRoom',
          name: `${loadName()}'s game`,
          public: false,
          maxPlayers: MAX_PLAYERS,
          summary: roomSummary(session.rules),
          region: localRegion(),
        });
      }
    });
    return () => {
      net.close();
      s.close();
    };
  }, [mode, session]);

  // keep the public listing in step with the lobby (§6.5): name, rules, seats left for humans
  const humanSeats = session.seats.filter((x) => x.kind !== 'bot').length;
  const listName = `${name.trim() || 'Player'}'s game`.slice(0, 32);
  const summary = roomSummary(session.rules);
  useEffect(() => {
    if (!signal || !code) return;
    signal.send({
      type: 'roomSettings',
      name: listName,
      public: isPublic,
      maxPlayers: humanSeats,
      summary,
    });
  }, [signal, code, listName, isPublic, humanSeats, summary]);

  const lobby = session.lobbyFor(0);
  const guestsAway = session.seats.some((s) => s.kind === 'guest' && !s.link?.open);
  const canStart = session.playerCount >= 2 && !guestsAway;
  const hostDebug = useMemo(
    () => ({
      desyncs: () => session.match?.desyncs ?? 0,
      paths: () => session.seats.map((s) => (s.link?.open ? s.path : null)),
    }),
    [session],
  );

  if (match) {
    const away = session.seats
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.kind === 'guest' && !s.link?.open);
    return (
      <NetGame
        match={match}
        me={0}
        settings={settings}
        onExit={onExit}
        debug={hostDebug}
        banner={
          <div className="net-banner" data-testid="net-banner">
            <span>Hosting{code ? ` · ${code}` : ''}</span>
            {away.map(({ s }) => (
              <span key={s.token} className="warn">
                {s.standIn ? `${s.name} is away · AI playing` : `${s.name} reconnecting…`}
              </span>
            ))}
          </div>
        }
      />
    );
  }

  const link = code ? `${location.origin}${location.pathname}#join/${code}` : '';
  return (
    <main className="setup online">
      <h2>{mode === 'online' ? 'Host an online game' : 'Host a direct game'}</h2>
      <NameField
        name={name}
        setName={(n) => {
          setName(n);
          session.rename(n);
        }}
      />
      {mode === 'online' && (
        <section className="invite" aria-label="Invite">
          {signal && signal.status !== 'open' && (
            <p className="note" data-testid="signal-status">
              {SIGNAL_TEXT[signal.status]}
            </p>
          )}
          <label className="toggle">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setPublic(e.target.checked)}
              data-testid="public"
            />
            Public: list this game so anyone can join
          </label>
          {code && (
            <>
              <p className="room-code" data-testid="room-code">
                {code}
              </p>
              <Copyable text={link} label="Copy link" testid="share-link" />
              {'share' in navigator && (
                <button
                  onClick={() =>
                    void navigator.share({ title: 'Mudders', text: 'Join my game', url: link })
                  }
                >
                  Share…
                </button>
              )}
            </>
          )}
          {error && <p className="error-text">{error}</p>}
        </section>
      )}
      {mode === 'direct' && <DirectInvite onLink={(l) => session.addLink(l)} />}
      <section className="slots" aria-label="Players">
        <ul className="seats">
          {lobby.seats.map((s, i) => (
            <SeatRow
              key={i}
              seat={s}
              i={i}
              you={0}
              bots={bots}
              onSet={(v) => session.setSeat(i, v)}
            />
          ))}
        </ul>
      </section>
      <label className="takeover-setting">
        If a player drops
        <select
          value={session.takeoverMs}
          onChange={(e) => session.setTakeover(Number(e.target.value))}
          data-testid="takeover"
        >
          <option value={10_000}>AI plays for them after 10 s</option>
          <option value={TAKEOVER_MS}>AI plays for them after 20 s</option>
          <option value={60_000}>AI plays for them after 60 s</option>
          <option value={0}>Wait for them (no AI)</option>
        </select>
      </label>
      <Rules
        value={session.rules}
        onChange={(r) => {
          const rules = { ...session.rules, ...r };
          session.setRules(rules);
          saveSetup({ ...loadSetup(), ...rules });
        }}
      />
      <div className="setup-actions">
        <button onClick={onExit}>Back</button>
        <button
          className="primary"
          disabled={!canStart}
          data-testid="start"
          onClick={() => {
            const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
            const m = session.start(seed);
            signal?.send({ type: 'startMatch' });
            setMatch(m);
          }}
        >
          {guestsAway ? 'Waiting for players…' : `Start (${session.playerCount} players)`}
        </button>
      </div>
    </main>
  );
}

/** Host side of the copy-paste mode: one invite code per guest, then paste their reply. */
function DirectInvite({ onLink }: { onLink: (l: Link) => void }) {
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof directOffer>> | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(0);
  return (
    <section className="invite direct" aria-label="Invite">
      <p className="note">
        No server needed: send each player an invite code over any chat, and paste back the reply
        code they send you.
      </p>
      {!offer ? (
        <button
          disabled={busy}
          data-testid="make-invite"
          onClick={() => {
            setBusy(true);
            setError('');
            directOffer()
              .then(setOffer)
              .catch((e: unknown) => setError((e as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Making a code…' : joined ? 'Invite another player' : 'Make an invite code'}
        </button>
      ) : (
        <>
          <Copyable text={offer.code} label="Copy invite" testid="invite-code" />
          <label>
            Their reply code
            <textarea
              value={reply}
              rows={3}
              onChange={(e) => setReply(e.target.value)}
              data-testid="reply-in"
            />
          </label>
          <button
            disabled={busy || !reply.trim()}
            data-testid="accept-reply"
            onClick={() => {
              setBusy(true);
              setError('');
              offer
                .accept(reply)
                .then((l) => {
                  onLink(l);
                  setOffer(null);
                  setReply('');
                  setJoined((n) => n + 1);
                })
                .catch((e: unknown) => setError((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

// ── guest ───────────────────────────────────────────────────────────────────────────────────

interface JoinProps {
  mode: 'online' | 'direct';
  code?: string | undefined;
  settings: Settings;
  onExit: () => void;
}

/** Join a game by room code / share link, or by pasting a direct invite code. */
export function JoinGame({ mode, code: initial, settings, onExit }: JoinProps) {
  const [name, setName] = useState(loadName);
  const [codeIn, setCodeIn] = useState(initial ?? '');
  const [joinCode, setJoinCode] = useState(mode === 'online' && initial ? initial : '');
  const [session, setSession] = useState<GuestSession | null>(null);
  const [signal, setSignal] = useState<SignalClient | null>(null);
  const [error, setError] = useState('');
  useChanges(session);
  useChanges(signal);

  // online: lobby server → host dials us (P2P or relay); re-ask whenever the link drops
  useEffect(() => {
    if (mode !== 'online' || !joinCode) return;
    const content = loadContent();
    const g = new GuestSession(content, loadName(), loadToken(joinCode));
    const s = new SignalClient(SIGNAL_URL);
    const net = new RoomNet(s, 'guest');
    let host = '';
    let asked = -Infinity;
    const ask = () => {
      if (!host || g.link || g.status === 'refused' || g.status === 'closed') return;
      if (performance.now() - asked < 3000) return;
      asked = performance.now();
      net.requestLink(host);
    };
    net.onLink = (link) => g.attach(link);
    g.onLost = () => {
      asked = -Infinity;
      setTimeout(ask, 300);
    };
    const offSave = g.subscribe(() => saveToken(joinCode, g.token));
    s.on('roomUpdate', (m) => {
      host = m.host;
      ask();
    });
    s.on('error', (m) => setError(m.reason));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external system (socket + session)
    setSession(g);
    setSignal(s);
    void s.connect().then(() => s.send({ type: 'joinRoom', code: joinCode }));
    const stopTicks = startTicker(() => {
      g.heartbeat();
      ask();
    }, PING_MS);
    // back from a screen lock or app switch: check the link at once (§6.1)
    const vis = () => {
      if (!document.hidden) {
        g.heartbeat();
        ask();
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      stopTicks();
      document.removeEventListener('visibilitychange', vis);
      offSave();
      g.leave();
      net.close();
      s.close();
    };
  }, [mode, joinCode]);

  const guestDebug = useMemo(
    () => ({
      rebuilds: () => session?.match?.rebuilds ?? 0,
      lag: () => session?.match?.lag ?? 0,
      status: () => session?.status,
      path: () => session?.link?.path ?? null,
      dropLink: () => session?.link?.close(),
    }),
    [session],
  );

  if (session?.match && (session.status === 'playing' || session.status === 'reconnecting')) {
    const reconnecting = session.status === 'reconnecting';
    return (
      <NetGame
        match={session.match}
        me={session.match.you}
        settings={settings}
        onExit={onExit}
        debug={guestDebug}
        banner={
          <div className={`net-banner${reconnecting ? ' lost' : ''}`} data-testid="net-banner">
            {reconnecting ? (
              <span className="warn">Connection lost, reconnecting…</span>
            ) : (
              <span>
                You are P{session.match.you + 1} ·{' '}
                {session.link?.path === 'relay' ? 'relay' : 'direct'}
                {session.rtt >= 0 ? ` · ${session.rtt} ms` : ''}
              </span>
            )}
          </div>
        }
      />
    );
  }

  const lobby = session?.lobby;
  return (
    <main className="setup online">
      <h2>{mode === 'online' ? 'Join an online game' : 'Join a direct game'}</h2>
      {!session && <NameField name={name} setName={setName} />}
      {mode === 'online' && !joinCode && (
        <section className="invite">
          <label>
            Room code
            <input
              value={codeIn}
              maxLength={6}
              autoCapitalize="characters"
              onChange={(e) => setCodeIn(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              data-testid="code-in"
            />
          </label>
          <button
            className="primary"
            disabled={codeIn.length !== 6}
            onClick={() => setJoinCode(codeIn)}
            data-testid="join"
          >
            Join
          </button>
        </section>
      )}
      {mode === 'direct' && !session && (
        <DirectJoin
          onLink={(l) => {
            const g = new GuestSession(loadContent(), loadName(), undefined);
            g.attach(l);
            setSession(g);
          }}
        />
      )}
      {signal && signal.status !== 'open' && (
        <p className="note" data-testid="signal-status">
          {SIGNAL_TEXT[signal.status]}
        </p>
      )}
      {session && (
        <p className="note" data-testid="guest-status">
          {session.status === 'connecting' && 'Connecting to the host…'}
          {session.status === 'lobby' && 'Waiting for the host to start the game.'}
          {session.status === 'reconnecting' && 'Connection lost, reconnecting…'}
          {session.status === 'refused' && `Couldn't join: ${session.reason}`}
          {session.status === 'closed' && `The game ended: ${session.reason}`}
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      {lobby && (
        <section className="slots" aria-label="Players">
          <ul className="seats">
            {lobby.seats.map((s, i) => (
              <SeatRow key={i} seat={s} i={i} you={lobby.you} bots={[]} />
            ))}
          </ul>
          <p className="note">
            {lobby.setup.size} map · {lobby.setup.rounds} round{lobby.setup.rounds > 1 ? 's' : ''} ·{' '}
            {lobby.setup.turnTimer ? `${lobby.setup.turnTimer} s turns` : 'no turn timer'} ·{' '}
            {lobby.setup.scenery}
          </p>
        </section>
      )}
      <div className="setup-actions">
        <button onClick={onExit}>Back</button>
      </div>
    </main>
  );
}

/** Guest side of the copy-paste mode: paste the invite, send back the reply. */
function DirectJoin({ onLink }: { onLink: (l: Link) => void }) {
  const [invite, setInvite] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const done = useRef(false);
  return (
    <section className="invite direct" aria-label="Join">
      <p className="note">Paste the invite code the host sent you.</p>
      <label>
        Invite code
        <textarea
          value={invite}
          rows={3}
          onChange={(e) => setInvite(e.target.value)}
          data-testid="invite-in"
          disabled={!!reply}
        />
      </label>
      {!reply ? (
        <button
          className="primary"
          disabled={busy || !invite.trim()}
          data-testid="make-reply"
          onClick={() => {
            setBusy(true);
            setError('');
            directAnswer(invite)
              .then(({ code, link }) => {
                setReply(code);
                link
                  .then((l) => {
                    if (done.current) return;
                    done.current = true;
                    onLink(l);
                  })
                  .catch((e: unknown) => setError((e as Error).message));
              })
              .catch((e: unknown) => setError((e as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Making a reply…' : 'Make my reply code'}
        </button>
      ) : (
        <>
          <p className="note">
            Send this reply code back to the host. You'll connect once they paste it.
          </p>
          <Copyable text={reply} label="Copy reply" testid="reply-code" />
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

// ── public games ────────────────────────────────────────────────────────────────────────────

/** How often the browse screen refreshes the public list. */
const BROWSE_EVERY_MS = 4000;

/** Browse public games (§6.1, §8): the lobby server's open public rooms; tap one to join. */
export function BrowseGames({ onExit }: { onExit: () => void }) {
  const [signal, setSignal] = useState<SignalClient | null>(null);
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  useChanges(signal);

  useEffect(() => {
    const s = new SignalClient(SIGNAL_URL);
    s.on('rooms', (m) => setRooms(m.rooms));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external system (socket)
    setSignal(s);
    const ask = () => {
      if (s.status === 'open') s.send({ type: 'listRooms' });
    };
    void s.connect().then(ask);
    const t = setInterval(ask, BROWSE_EVERY_MS);
    return () => {
      clearInterval(t);
      s.close();
    };
  }, []);

  return (
    <main className="setup online browse">
      <h2>Public games</h2>
      {signal && signal.status !== 'open' && (
        <p className="note" data-testid="signal-status">
          {SIGNAL_TEXT[signal.status]}
        </p>
      )}
      {rooms && rooms.length === 0 && (
        <p className="note" data-testid="no-rooms">
          No public games are waiting right now. Host one and tick “Public”, or check back soon.
        </p>
      )}
      {rooms && rooms.length > 0 && (
        <ul className="rooms" data-testid="rooms">
          {rooms.map((r) => (
            <li key={r.code} className="room" data-testid="room">
              <a href={`#join/${r.code}`} className="room-link">
                <span className="room-name">{r.name}</span>
                <span className="room-players">
                  {r.players}/{r.maxPlayers}
                </span>
                <span className="room-summary">{r.summary}</span>
                {r.region && <span className="room-region">{r.region}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="setup-actions">
        <button onClick={onExit}>Back</button>
        <a className="button" href="#host">
          Host a game
        </a>
      </div>
    </main>
  );
}
