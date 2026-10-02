// Browser input translated into pygame-style events, queued until the puzzle's next frame.
//
// Mouse buttons use pygame's numbering: 1 left, 2 middle, 3 right, 4 wheel up, 5 wheel down.
// Keys use KeyboardEvent.key, lower-cased, with ' ' renamed to 'space' (so 'a', '1',
// 'escape', 'enter', 'backspace', 'arrowleft', ...).
import { unlockAudio } from './audio';
import { isTyping } from './panel';
import { type Screen, toScreen } from './screen';

export type Point = [number, number];

export type InputEvent =
  | { type: 'mousedown' | 'mouseup'; button: number; pos: Point }
  | { type: 'keydown' | 'keyup'; key: string };

export class Input {
  /** Latest mouse position in screen pixels (pygame.mouse.get_pos()). */
  mouse: Point = [-1, -1];
  private queue: InputEvent[] = [];
  private readonly cleanup: Array<() => void> = [];

  constructor(screen: Screen) {
    const canvas = screen.canvas;
    const listen = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K,
      handler: (event: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, handler as EventListener, options);
      this.cleanup.push(() => target.removeEventListener(type, handler as EventListener, options));
    };
    const pos = (event: MouseEvent): Point => (this.mouse = toScreen(screen, event.clientX, event.clientY));

    listen(canvas, 'mousedown', (event) => {
      event.preventDefault();
      canvas.focus();
      unlockAudio();
      this.queue.push({ type: 'mousedown', button: event.button + 1, pos: pos(event) });
    });
    listen(window, 'mouseup', (event) => {
      this.queue.push({ type: 'mouseup', button: event.button + 1, pos: pos(event) });
    });
    listen(window, 'mousemove', (event) => {
      pos(event);
    });
    let wheelDistance = 0;
    listen(
      canvas,
      'wheel',
      (event) => {
        event.preventDefault();
        // One pygame wheel event per notch; trackpads send many small deltas, so accumulate them.
        wheelDistance += event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 40;
        if (Math.abs(wheelDistance) >= 50) {
          const button = wheelDistance < 0 ? 4 : 5;
          const at = pos(event);
          this.queue.push({ type: 'mousedown', button, pos: at }, { type: 'mouseup', button, pos: at });
          wheelDistance = 0;
        }
      },
      { passive: false },
    );
    listen(canvas, 'contextmenu', (event) => event.preventDefault());
    listen(window, 'keydown', (event) => {
      // Typing in the settings panel isn't game input.
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      unlockAudio();
      if (event.repeat) return;
      const key = keyName(event);
      // Keep the page from scrolling while playing.
      if (key === 'space' || key.startsWith('arrow')) event.preventDefault();
      this.queue.push({ type: 'keydown', key });
    });
    listen(window, 'keyup', (event) => {
      if (isTyping(event.target)) return;
      this.queue.push({ type: 'keyup', key: keyName(event) });
    });
  }

  /** Returns and clears the events received since the last call (pygame.event.get()). */
  drain(): InputEvent[] {
    return this.queue.splice(0);
  }

  dispose(): void {
    for (const remove of this.cleanup.splice(0)) remove();
  }
}

function keyName(event: KeyboardEvent): string {
  // Digits from the number row or keypad both report as the digit.
  return event.key === ' ' ? 'space' : event.key.toLowerCase();
}

/** True if (x, y) lies inside the inclusive box, the comparison every pygame game here writes out by hand. */
export function within(pos: Point, x1: number, x2: number, y1: number, y2: number): boolean {
  return x1 <= pos[0] && pos[0] <= x2 && y1 <= pos[1] && pos[1] <= y2;
}
