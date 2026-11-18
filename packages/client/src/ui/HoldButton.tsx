import { useEffect, useRef, type ButtonHTMLAttributes, type PointerEvent } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  /** Runs once on press, then again every `every` ms while held (after a `delay` ms pause). */
  onPress: () => void;
  delay?: number;
  every?: number;
};

/**
 * A button that repeats while held, like the aim nudges: press runs the action at once, holding
 * repeats it. Keyboard Enter/Space still run it once per press (and native key repeat when held).
 */
export function HoldButton({ onPress, delay = 380, every = 110, ...rest }: Props) {
  const timer = useRef(0);
  const press = useRef(onPress);
  useEffect(() => {
    press.current = onPress;
  }, [onPress]);
  const stop = () => {
    window.clearTimeout(timer.current);
    timer.current = 0;
  };
  useEffect(() => stop, []);
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (rest.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic event without a live pointer
    }
    stop();
    const tick = (n: number) => {
      press.current();
      timer.current = window.setTimeout(() => tick(n + 1), n === 0 ? delay : every);
    };
    tick(0);
  };
  return (
    <button
      type="button"
      {...rest}
      className={rest.className ? `${rest.className} hold` : 'hold'}
      onPointerDown={down}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // a pointer press already ran on pointerdown; keyboard activation has detail 0
        if (e.detail === 0) press.current();
      }}
    />
  );
}
