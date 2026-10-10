// What Distilling's duty report shows of a session.
import { SPACE, type ClearedItem } from '../../core/duty/report';
import type { ColumnResult } from './logic';

/**
 * The columns that went up, in order, as the report's orbs: white for a Crystal Clear, orange for
 * a spicy one, brown for any other column, with a gap between a run of Crystal Clears and the rest.
 * Burnt columns didn't go up, so they aren't shown.
 */
export function columnOrbs(columns: readonly ColumnResult[]): ClearedItem[] {
  const items: ClearedItem[] = [];
  let inChain = false;
  for (const column of columns) {
    if (!column.distilled) { inChain = false; continue; }
    const good = column.verdict === 'clear';
    const icon = !good ? 'orb-bad' : column.spice === 'spicy' ? 'orb-spicy' : 'orb-clear';
    if (items.length && !(inChain && good)) items.push({ icon: SPACE, label: '', count: 1 });
    inChain = good;
    const last = items.at(-1);
    if (last?.icon === icon) last.count++;
    else items.push({ icon, label: !good ? 'other columns' : icon === 'orb-spicy' ? 'spicy Crystal Clears' : 'Crystal Clears', count: 1 });
  }
  return items;
}
