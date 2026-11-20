/**
 * Your-turn signals (presentation only): a buzz on phones that can (Android Chrome; iOS has no
 * vibration API), a flashing tab title and an optional system notification when your turn starts
 * while the game is in the background, and short buzzes when you fire and when you are hit.
 */
export class TurnSignals {
  vibrate = true;
  notify = false;
  private flash = 0;
  private title = '';
  private note: Notification | null = null;
  private readonly onVisible = (): void => {
    if (!document.hidden) this.stopFlash();
  };

  constructor() {
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** One of your players is up. */
  turn(): void {
    this.buzz([70, 50, 70]);
    if (!document.hidden) return;
    this.startFlash();
    if (this.notify) void this.show();
  }

  private async show(): Promise<void> {
    if (typeof Notification !== 'function' || Notification.permission !== 'granted') return;
    const title = 'Mudders: your turn';
    const opts: NotificationOptions = {
      body: 'Your tank is up. Aim and fire!',
      tag: 'mudders-turn',
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    };
    try {
      // Android Chrome shows notifications only through the service worker
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.showNotification(title, opts);
        return;
      }
      this.note?.close();
      this.note = new Notification(title, opts);
      this.note.onclick = () => {
        window.focus();
        this.note?.close();
      };
    } catch {
      // not allowed here: the title flash stays
    }
  }

  /** You fired. */
  fired(): void {
    this.buzz(25);
  }

  /** You took `damage` points. */
  hit(damage: number): void {
    this.buzz(Math.min(220, 50 + damage * 2));
  }

  dispose(): void {
    this.stopFlash();
    this.note?.close();
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private buzz(pattern: number | number[]): void {
    // Vibration is not Baseline (no iOS): a buzz where it exists, nothing elsewhere
    if (this.vibrate && 'vibrate' in navigator) navigator.vibrate(pattern);
  }

  private startFlash(): void {
    if (this.flash) return;
    this.title = document.title;
    let on = false;
    this.flash = window.setInterval(() => {
      on = !on;
      document.title = on ? '▶ Your turn!' : this.title;
    }, 900);
  }

  private stopFlash(): void {
    if (!this.flash) return;
    window.clearInterval(this.flash);
    this.flash = 0;
    document.title = this.title;
    this.note?.close();
    this.note = null;
    void navigator.serviceWorker
      ?.getRegistration()
      .then((r) => r?.getNotifications({ tag: 'mudders-turn' }))
      .then((list) => list?.forEach((n) => n.close()))
      .catch(() => undefined);
  }
}

/** Ask for notification permission (from a click); true if granted. */
export async function askNotify(): Promise<boolean> {
  if (typeof Notification !== 'function') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
