import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { listReplayFiles, readReplayFile, replayId, saveReplayFile, type ReplayMetadata } from './replay-storage';

function file(at: number) {
  const blob = new Blob([new Uint8Array([0x1f, 0x8b, at])]);
  const metadata: ReplayMetadata = {
    id: replayId('forage', at), puzzle: 'forage', at, duration: 1, result: 'Score 1',
    settingsVersion: 1, simulatorVersion: 1, bytes: blob.size,
  };
  return { metadata, blob };
}

describe('replay files when the browser is out of room', () => {
  const put = IDBObjectStore.prototype.put;
  beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
  afterEach(() => {
    IDBObjectStore.prototype.put = put;
    vi.unstubAllGlobals();
  });

  it('removes the oldest replays to make room for a new one', async () => {
    for (const at of [10, 20, 30]) await saveReplayFile(file(at));
    // Room for three replays: a fourth only fits once another has gone.
    let stored = 3;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'files' && stored >= 3) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      if (this.name === 'files') stored++;
      return put.apply(this, args);
    } as IDBObjectStore['put'];
    const realDelete = IDBObjectStore.prototype.delete;
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key) {
      if (this.name === 'files') stored--;
      return realDelete.call(this, key);
    });
    await saveReplayFile(file(40));
    expect((await listReplayFiles()).map((entry) => entry.at)).toEqual([40, 30, 20]);
    expect(await readReplayFile(file(10).metadata)).toBeNull();
    expect(await readReplayFile(file(40).metadata)).not.toBeNull();
  });

  it('gives up when there is nothing older to remove', async () => {
    IDBObjectStore.prototype.put = function () {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    } as unknown as IDBObjectStore['put'];
    await expect(saveReplayFile(file(10))).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });
});
