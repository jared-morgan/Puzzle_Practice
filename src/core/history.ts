// A puzzle's past games in its side panel: how many were played with the current settings, and
// the most recent ones, newest first. The games come from Store.history / Store.addHistory.
import type { Panel } from './panel';
import type { GameRecord } from './storage';

export interface HistoryColumn {
  label: string;
  value: (game: GameRecord) => string;
}

/** How many recent games the table lists. */
const SHOWN = 10;

function when(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return time;
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

/**
 * Adds a History card. `games` returns the history for the settings in use (or null when the
 * current mode keeps none, which hides the card).
 */
export function historyGroup(panel: Panel, games: () => readonly GameRecord[] | null, columns: readonly HistoryColumn[], title = 'History'): void {
  const hidden = () => games() === null;
  panel
    .group(title, { hidden })
    .note(() => {
      const n = games()?.length ?? 0;
      return n ? `${n} game${n === 1 ? '' : 's'} with these settings` : 'No games yet with these settings';
    })
    .stats(['', ...columns.map((c) => c.label)], () =>
      (games() ?? [])
        .slice(-SHOWN)
        .reverse()
        .map((game) => [when(game.at), ...columns.map((c) => c.value(game))]),
    );
}
