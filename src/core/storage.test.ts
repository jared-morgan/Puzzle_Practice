import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAll, importAll, mergeBackupFiles, scoreRecords, Store } from './storage';
import { replayId } from './replay-storage';

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
  };
}

describe('full data backups', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('exports all puzzle data and merges score histories and replays without duplicates', () => {
    const store = new Store('forage');
    store.set('replays', [{ at: 10, result: 'Score 5' }]);
    store.set('history:normal', [{ at: 10, score: 5 }]);
    store.set('settings', { mode: 'normal' });
    const backup = exportAll();
    store.set('replays', [{ at: 11, result: 'Score 8' }]);
    store.set('history:normal', [{ at: 11, score: 8 }]);
    store.set('settings', { mode: 'chaos' });

    expect(importAll(backup)).toBe(3);
    expect(store.get('replays', [])).toHaveLength(2);
    expect(store.get<{ at: number }[]>('replays', []).map((item) => item.at)).toEqual([11, 10]);
    expect(store.history('normal')).toHaveLength(2);
    expect(store.history('normal').map((item) => item.at)).toEqual([10, 11]);
    expect(store.get('settings', {})).toEqual({ mode: 'normal' });
    importAll(backup);
    expect(store.get('replays', [])).toHaveLength(2);
    expect(store.history('normal')).toHaveLength(2);
  });

  it('rejects malformed backups and ignores keys outside this app', () => {
    expect(() => importAll('{bad json')).toThrow();
    expect(() => importAll(JSON.stringify({ puzzlePractice: 2, data: {} }))).toThrow();
    const count = importAll(JSON.stringify({ puzzlePractice: 1, data: { unrelated: 'value' } }));
    expect(count).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('keeps older replay archives in the backup file even though browser history is capped', () => {
    const latest = JSON.stringify({ puzzlePractice: 1, data: {
      'puzzle-practice:forage:replays': [{ at: 20, result: 'new' }],
    } });
    const archive = JSON.stringify({ puzzlePractice: 1, data: {
      'puzzle-practice:forage:replays': Array.from({ length: 12 }, (_, i) => ({ at: i + 1, result: 'old' })),
    } });
    const merged = JSON.parse(mergeBackupFiles(latest, archive)) as { data: Record<string, { at: number }[]> };
    expect(merged.data['puzzle-practice:forage:replays']).toHaveLength(13);
    expect(merged.data['puzzle-practice:forage:replays'][0].at).toBe(20);
  });

  it('can cap the retained replay archive to the five newest sessions', () => {
    const latest = JSON.stringify({ puzzlePractice: 1, data: {
      'puzzle-practice:forage:replays': [{ at: 20, result: 'new' }],
    } });
    const archive = JSON.stringify({ puzzlePractice: 1, data: {
      'puzzle-practice:forage:replays': Array.from({ length: 12 }, (_, i) => ({ at: i + 1, result: 'old' })),
    } });
    const merged = JSON.parse(mergeBackupFiles(latest, archive, 5)) as { data: Record<string, { at: number }[]> };
    expect(merged.data['puzzle-practice:forage:replays'].map((item) => item.at)).toEqual([20, 12, 11, 10, 9]);
  });

  it('restores the latest ten replays to browser storage while preserving the complete archive', () => {
    const backup = JSON.stringify({ puzzlePractice: 1, data: {
      'puzzle-practice:forage:replays': Array.from({ length: 12 }, (_, i) => ({ at: i + 1, result: String(i + 1) })),
    } });
    const store = new Store('forage');
    importAll(backup);
    expect(store.get<{ at: number }[]>('replays', []).map((item) => item.at)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('keeps the replay link attached to a past game through history storage', () => {
    const store = new Store('forage');
    store.addHistory('ci:test', { score: 12, replayAt: 456 });
    expect(store.history('ci:test')[0]).toMatchObject({ score: 12, replayAt: 456 });
  });

  it('reads numeric scores across settings and puzzles, with exact replay links and no payloads', () => {
    const runId = '12345678-1234-1234-1234-123456789abc';
    const data = {
      'puzzle-practice:distilling:history:Standard:off:50': [{ at: 20, score: 12.5, replayAt: 10, replayId: runId, columns: 12 }],
      'puzzle-practice:forage:history:normal': [{ at: 15, score: 9 }],
      'puzzle-practice:distilling:history:Practice:1-2': [{ at: 25, score: 8, replayAt: 10, replayId: '87654321-4321-4321-4321-cba987654321' }],
      'puzzle-practice:forage:replays': [{ at: 30, score: 100, data: 'not a replay' }],
    };
    const rows = scoreRecords(data);
    expect(rows.map((row) => row.score)).toEqual([9, 12.5, 8]);
    expect(rows[0].replayFileId).toBeUndefined();
    expect(rows[1]).toEqual({ puzzle: 'distilling', settingsKey: 'Standard:off:50', at: 20, score: 12.5,
      stats: { columns: 12 }, replayFileId: replayId('distilling', 10, runId) });
    expect(rows[2].replayFileId).not.toEqual(rows[1].replayFileId);
    expect(scoreRecords(data, 'distilling')).toHaveLength(2);
  });

  it('keeps read-only playback from mutating cached histories or saved settings', () => {
    const store = new Store('forage');
    store.set('settings', { mode: 'normal' });
    store.addHistory('test', { score: 1 });
    store.setReadOnly(true);
    store.addHistory('test', { score: 9 });
    expect(store.set('settings', { mode: 'chaos' })).toBe(false);
    expect(store.history('test').map((game) => game.score)).toEqual([1]);
    expect(store.get('settings', {})).toEqual({ mode: 'normal' });
    store.setReadOnly(false);
    store.addHistory('test', { score: 2 });
    expect(store.history('test').map((game) => game.score)).toEqual([1, 2]);
  });

  it('refreshes histories already cached before a backup is imported', () => {
    const store = new Store('forage');
    expect(store.history('test')).toEqual([]);
    importAll(JSON.stringify({ puzzlePractice: 1, data: {
      'puzzle-practice:forage:history:test': [{ at: 1, score: 3 }],
    } }));
    expect(store.history('test')).toEqual([{ at: 1, score: 3 }]);
  });
});
