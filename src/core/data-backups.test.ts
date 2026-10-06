import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

/** Models file commits, missing files and failed reads without touching the user's filesystem. */
function directory() {
  const files = new Map<string, Blob>();
  const writes: string[] = [];
  let readFailure = false;
  const getDirectory = (prefix: string): FileSystemDirectoryHandle => ({
    name: 'test-backups',
    async getDirectoryHandle(name: string) { return getDirectory(prefix + name + '/'); },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      const key = prefix + name;
      if (readFailure && !options?.create) throw new DOMException('Cannot read backup', 'NotReadableError');
      if (!files.has(key) && !options?.create) throw new DOMException('Missing', 'NotFoundError');
      return {
        async getFile() { return files.get(key)!; },
        async createWritable() {
          let next: Blob;
          return {
            async write(data: string | Blob) { next = data instanceof Blob ? data : new Blob([data]); },
            async close() { files.set(key, next); writes.push(key); },
            async abort() {},
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle);
  return { root: getDirectory(''), files, writes, failReads: () => { readFailure = true; } };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const events = new EventTarget();
  Object.assign(events, { setTimeout, clearTimeout });
  vi.stubGlobal('window', events);
  vi.stubGlobal('navigator', { storage: {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function saveRun(at: number, puzzle = 'forage') {
  const { encodeReplayBlob, replayMetadata } = await import('./replay');
  const { saveReplayFile } = await import('./replay-storage');
  const tape = { format: 'puzzle-practice-replay' as const, version: 1 as const, puzzle,
    at, duration: 20, result: 'Score ' + at, settings: {}, seed: {}, steps: [10, 20], frames: [] };
  const blob = await encodeReplayBlob(tape);
  return { metadata: await saveReplayFile({ metadata: replayMetadata(tape, blob.size), blob }), blob };
}

describe('binary replay backups', () => {
  it('exports archived scores beyond the browser limit using only manifests, even without replay files', async () => {
    const folder = directory();
    const history = Array.from({ length: 1200 }, (_, at) => ({ at, score: at / 10,
      replayAt: at, replayId: '12345678-1234-1234-1234-123456789abc' }));
    folder.files.set('puzzle-practice-backup.json', new Blob([JSON.stringify({ puzzlePractice: 2,
      data: { 'puzzle-practice:distilling:history:Standard:off:50': history }, replays: [] })]));
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => folder.root } });
    const { Store } = await import('./storage');
    new Store('distilling').set('history:Standard:off:50', history.slice(-1000));
    new Store('forage').set('history:normal', [{ at: 1300, score: 7 }]);
    const dbOpen = vi.spyOn(indexedDB, 'open');
    const decompress = vi.fn(() => { throw new Error('Scores must not decompress replays'); });
    vi.stubGlobal('DecompressionStream', decompress);
    const { exportScoreHistory } = await import('./data-backups');
    const exported = JSON.parse(await exportScoreHistory());
    expect(exported.format).toBe('puzzle-practice-scores');
    expect(exported.scores).toHaveLength(1201);
    expect(exported.scores[0]).toMatchObject({ puzzle: 'distilling', at: 0, score: 0,
      replayFileId: 'distilling:0:12345678-1234-1234-1234-123456789abc' });
    expect(exported.scores.at(-1)).toMatchObject({ puzzle: 'forage', score: 7 });
    expect(exported.scores.at(-1).replayFileId).toBeUndefined();
    expect(dbOpen).not.toHaveBeenCalled();
    expect(decompress).not.toHaveBeenCalled();
    expect(folder.writes).toEqual([]);
  });

  it('round-trips every run through portable export/import without storing base64 in localStorage', async () => {
    const { exportCompleteBackup, importCompleteBackup } = await import('./data-backups');
    const { listReplayFiles, readReplayFile } = await import('./replay-storage');
    const { Store } = await import('./storage');
    const store = new Store('forage');
    store.set('settings', { mode: 'chaos' });
    for (let i = 1; i <= 12; i++) await saveRun(i);
    const backup = await exportCompleteBackup();
    const portable = JSON.parse(backup);
    expect(portable.puzzlePractice).toBe(2);
    expect(portable.replays).toHaveLength(12);
    expect(portable.data['puzzle-practice:forage:replays']).toBeUndefined();
    vi.stubGlobal('indexedDB', new IDBFactory());
    expect(await importCompleteBackup(backup)).toBe(13);
    await importCompleteBackup(backup);
    const restored = await listReplayFiles();
    expect(restored).toHaveLength(12);
    const { decodeReplayBlob } = await import('./replay');
    expect((await decodeReplayBlob((await readReplayFile(restored[11]))!))?.at).toBe(1);
    expect(store.get('settings', null)).toEqual({ mode: 'chaos' });
    expect(localStorage.getItem('puzzle-practice:forage:replays')).toBeNull();
  });

  it('serializes a pending replay save, backup import and export without dropping any runs', async () => {
    const { exportCompleteBackup, importCompleteBackup } = await import('./data-backups');
    const { replayWrites, listReplayFiles } = await import('./replay-storage');
    await saveRun(1);
    const original = await exportCompleteBackup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = replayWrites.run(async () => { await gate; await saveRun(2); });
    const imported = importCompleteBackup(original);
    const exported = exportCompleteBackup();
    release();
    await pending;
    await imported;
    expect(JSON.parse(await exported).replays.map((entry: { metadata: { at: number } }) => entry.metadata.at)).toEqual([2, 1]);
    expect(await listReplayFiles()).toHaveLength(2);
  });

  it('rejects corrupt payloads before changing settings or existing replay files', async () => {
    const { exportCompleteBackup, importCompleteBackup } = await import('./data-backups');
    const { Store } = await import('./storage');
    const store = new Store('forage');
    store.set('settings', { mode: 'normal' });
    await saveRun(1);
    const backup = JSON.parse(await exportCompleteBackup());
    backup.data['puzzle-practice:forage:settings'] = { mode: 'chaos' };
    backup.replays[0].data = btoa('\x1f\x8bcorrupt');
    backup.replays[0].metadata.bytes = 9;
    await expect(importCompleteBackup(JSON.stringify(backup))).rejects.toThrow();
    expect(store.get('settings', null)).toEqual({ mode: 'normal' });
    const { listReplayFiles } = await import('./replay-storage');
    expect(await listReplayFiles()).toHaveLength(1);
  });

  it('writes separate gzip files once, then changes only the small manifest on settings saves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fs = directory();
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => fs.root } });
    // Capture fake timers, since the browser window stub otherwise retains the real functions.
    Object.assign(window, { setTimeout, clearTimeout });
    const { initializeDataBackups, exportCompleteBackup } = await import('./data-backups');
    const { Store } = await import('./storage');
    const store = new Store('forage');
    await saveRun(1);
    await initializeDataBackups();
    await vi.advanceTimersByTimeAsync(350);
    await exportCompleteBackup(); // Waits for the same queue as autosave.
    expect(fs.writes.filter((name) => name.startsWith('replays/'))).toHaveLength(1);
    store.set('settings', { mode: 'chaos' });
    await vi.advanceTimersByTimeAsync(350);
    await exportCompleteBackup();
    expect(fs.writes.filter((name) => name.startsWith('replays/'))).toHaveLength(1);
    const manifest = JSON.parse(await fs.files.get('puzzle-practice-backup.json')!.text());
    expect(manifest.replays[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.data['puzzle-practice:forage:settings']).toEqual({ mode: 'chaos' });
    expect(manifest.replays[0].data).toBeUndefined();
  });

  it('does not overwrite an unreadable existing backup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fs = directory();
    fs.files.set('puzzle-practice-backup.json', new Blob(['original unreadable backup']));
    fs.failReads();
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => fs.root } });
    Object.assign(window, { setTimeout, clearTimeout });
    const { initializeDataBackups, exportCompleteBackup, readBackup } = await import('./data-backups');
    await expect(readBackup(fs.root)).rejects.toThrow('Cannot read backup');
    await initializeDataBackups();
    await vi.advanceTimersByTimeAsync(350);
    await exportCompleteBackup();
    expect(fs.writes).toEqual([]);
    expect(await fs.files.get('puzzle-practice-backup.json')!.text()).toBe('original unreadable backup');
  });
});
