// What a puzzle uses to give its sessions duty reports: its rating scales (with the player's
// cut-offs on the Settings tab), the report for the session just ended, and the fields that
// keep a report with the game's history row.
import type { Panel } from '../panel';
import type { Store } from '../storage';
import { cutoffsFor, cutoffWords, performanceWord, rateOn, type RatingScale } from './ratings';
import { encodeReport, makeReport, type DutyReport, type ReportInput } from './report';

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
}

export function dutyDesk(panel: Panel, store: Store, puzzle: string, station: string, scales: readonly RatingScale[],
  options: { shown?: (scale: string) => boolean; disabled?: () => boolean } = {}): DutyDesk {
  for (const scale of scales) {
    const words = cutoffWords(scale);
    const group = panel.settings.group(`Ratings: ${scale.label}`, {
      columns: 5,
      hidden: options.shown ? () => !options.shown!(scale.id) : undefined,
      title: 'The least it takes for each duty report rating; anything lower gets the lowest',
    });
    words.forEach((word, i) => group.number(word, () => cutoffsFor(store, scale)[i], (value) => {
      const cutoffs = cutoffsFor(store, scale);
      cutoffs[i] = value;
      store.set(`ratingCutoffs:${scale.id}`, cutoffs);
    }, { step: scale.step ?? 1, disabled: options.disabled }));
    group.button('Defaults', () => store.set(`ratingCutoffs:${scale.id}`, [...scale.cutoffs]), { disabled: options.disabled });
  }
  let last: DutyReport | null = null;
  return {
    get last() { return last; },
    clear() { last = null; },
    rate(id, value) { return rateOn(store, scales.find((s) => s.id === id) ?? null, value); },
    end(input) { return (last = makeReport({ puzzle, station, ...input })); },
    fields(report) { return report ? { rating: performanceWord(report.performance), duty: encodeReport(report) } : {}; },
  };
}
