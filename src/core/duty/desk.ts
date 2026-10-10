// What a puzzle uses to give its sessions duty reports: its fixed rating scales, the report for the session just ended, and the fields that
// keep a report with the game's history row.
import type { Panel } from '../panel';
import type { GameRecord, Store } from '../storage';
import { displayedPerformance, extraRatings, LEARNING, performanceWord, rateOn, type RatingScale } from './ratings';
import { decodeReport, encodeReport, makeReport, type DutyReport, type ReportInput } from './report';

export interface AverageOptions {
  /** What the history's score is, e.g. 'Points a move'. */
  scoreLabel?: string;
  /** Fewer is better (e.g. moves to solve a puzzle). */
  lowerIsBetter?: boolean;
  /** Decimal places for the score. */
  digits?: number;
}

const round = (n: number, digits = 2) => String(Number(n.toFixed(digits)));

/**
 * The sessions kept with these settings, as rows for a report's Session averages: how many, the
 * average and best score, the usual rating, and the average of each thing cleared.
 */
export function sessionAverages(games: readonly GameRecord[], options: AverageOptions = {}): string[][] {
  if (!games.length) return [];
  const label = options.scoreLabel ?? 'Score';
  const scores = games.map((g) => Number(g.score)).filter(Number.isFinite);
  const rows: string[][] = [['Sessions', String(games.length)]];
  if (scores.length) {
    rows.push([`Average ${label.toLowerCase()}`, round(scores.reduce((a, b) => a + b, 0) / scores.length, options.digits)]);
    rows.push([`Best ${label.toLowerCase()}`, round(options.lowerIsBetter ? Math.min(...scores) : Math.max(...scores), options.digits)]);
  }
  const reports = games.map((g) => decodeReport(g.duty)).filter((r): r is DutyReport => !!r);
  const rated = reports.filter((r) => r.performance !== LEARNING);
  if (rated.length) {
    const gauntlet = rated.filter((r) => r.performance > LEARNING).length > rated.length / 2;
    const same = rated.filter((r) => (r.performance > LEARNING) === gauntlet);
    const mean = Math.round(same.reduce((a, r) => a + displayedPerformance(r.performance), 0) / same.length);
    rows.push(['Average rating', performanceWord(mean)]);
  }
  // Each kind cleared, averaged over the sessions that kept a report, in the latest report's order.
  const latest = reports.at(-1);
  for (const group of latest?.cleared ?? []) {
    if (latest?.puzzle === 'treasure-haul') continue;
    if (group.style === 'row') continue;
    const kinds = group.items.map((item) => item.label);
    const sums = kinds.map(() => 0);
    let n = 0;
    for (const report of reports) {
      const match = report.cleared.find((g) => g.label === group.label);
      if (!match) continue;
      n++;
      kinds.forEach((kind, i) => { sums[i] += match.items.find((item) => item.label === kind)?.count ?? 0; });
    }
    if (n) rows.push([`Average ${group.label.toLowerCase()}`, `[${sums.map((sum) => round(sum / n, 1)).join(', ')}]`]);
  }
  return rows;
}

export interface DutyDesk {
  /** The report for the session that just ended (also while a replay plays), or null. */
  readonly last: DutyReport | null;
  /** A new session started: the old report goes. */
  clear(): void;
  /** The rating a measure earns on one of the puzzle's scales; null scale or measure is Learning. */
  rate(scale: string | null, value: number | null): number;
  /** Makes the session's report and keeps it as `last`. */
  end(input: Omit<ReportInput, 'puzzle' | 'station'>): DutyReport;
  /** The fields that keep a report with a history row: the rating's word and the report itself. */
  fields(report: DutyReport | null | undefined): { rating?: string; duty?: string };
  /** Session averages for a history (worked out again only when it changes). */
  averages(games: readonly GameRecord[] | null | undefined, options?: AverageOptions): string[][];
}

export function dutyDesk(_panel: Panel, store: Store, puzzle: string, station: string, scales: readonly RatingScale[],
  _options: { shown?: (scale: string) => boolean; disabled?: () => boolean } = {}): DutyDesk {
  let last: DutyReport | null = null;
  let averaged: { games: readonly GameRecord[]; length: number; key: string; rows: string[][] } | null = null;
  return {
    get last() { return last; },
    clear() { last = null; },
    rate(id, value) { return rateOn(store, scales.find((s) => s.id === id) ?? null, value); },
    end(input) { return (last = makeReport({ puzzle, station, ...input })); },
    fields(report) { return report ? { rating: performanceWord(report.performance), duty: encodeReport(report) } : {}; },
    averages(games, opts = {}) {
      if (!games?.length) return [];
      const key = JSON.stringify([opts, extraRatings()]);
      if (!averaged || averaged.games !== games || averaged.length !== games.length || averaged.key !== key) {
        averaged = { games, length: games.length, key, rows: sessionAverages(games, opts) };
      }
      return averaged.rows;
    },
  };
}
