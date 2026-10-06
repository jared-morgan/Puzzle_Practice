/** Replay payloads live in binary storage; listing runs only reads the small index. */
export interface ReplayMetadata {
  id: string;
  runId?: string;
  puzzle: string;
  at: number;
  duration: number;
  result: string;
  settingsVersion: number;
  simulatorVersion: number;
  bytes: number;
  checksum?: string;
}

export interface ReplayFile {
  metadata: ReplayMetadata;
  blob: Blob;
}

const DB_NAME = 'puzzle-practice-replays';
const FILES = 'files';
const INDEX = 'index';

export function replayId(puzzle: string, at: number, runId?: string): string { return `${puzzle}:${at}${runId ? `:${runId}` : ''}`; }

export function isReplayMetadata(value: unknown): value is ReplayMetadata {
  if (!value || typeof value !== 'object') return false;
  const m = value as ReplayMetadata;
  return typeof m.puzzle === 'string' && /^[a-z0-9-]+$/.test(m.puzzle) &&
    Number.isSafeInteger(m.at) && m.at >= 0 && m.id === replayId(m.puzzle, m.at, m.runId) &&
    (m.runId === undefined || /^[a-f0-9-]{36}$/.test(m.runId)) &&
    Number.isFinite(m.duration) && m.duration >= 0 && typeof m.result === 'string' &&
    Number.isInteger(m.settingsVersion) && m.settingsVersion >= 1 &&
    Number.isInteger(m.simulatorVersion) && m.simulatorVersion >= 1 &&
    Number.isSafeInteger(m.bytes) && m.bytes >= 0 &&
    (m.checksum === undefined || /^[a-f0-9]{64}$/.test(m.checksum));
}

export async function replayChecksum(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(FILES);
      const index = request.result.createObjectStore(INDEX, { keyPath: 'id' });
      index.createIndex('puzzle', 'puzzle');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Replay storage is blocked by another window.'));
  });
}

/** Payload and metadata commit together. Appending one run never overwrites another run. */
export async function saveReplayFile(file: ReplayFile): Promise<ReplayMetadata> {
  if (!isReplayMetadata(file.metadata) || file.blob.size !== file.metadata.bytes) throw new Error('Invalid replay file');
  const checksum = await replayChecksum(file.blob);
  if (file.metadata.checksum && file.metadata.checksum !== checksum) throw new Error('Damaged replay file');
  const metadata = { ...file.metadata, checksum };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([FILES, INDEX], 'readwrite');
      tx.objectStore(FILES).put(file.blob, file.metadata.id);
      tx.objectStore(INDEX).put(metadata);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('puzzle-practice-data-changed'));
  return metadata;
}

export async function listReplayFiles(puzzle?: string): Promise<ReplayMetadata[]> {
  const db = await openDb();
  try {
    const entries = await new Promise<unknown[]>((resolve, reject) => {
      const store = db.transaction(INDEX, 'readonly').objectStore(INDEX);
      const request = puzzle === undefined ? store.getAll() : store.index('puzzle').getAll(puzzle);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return entries.filter(isReplayMetadata).sort((a, b) => b.at - a.at);
  } finally { db.close(); }
}

export async function readReplayFile(metadata: ReplayMetadata): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(FILES, 'readonly').objectStore(FILES).get(metadata.id);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

/** One promise chain for saves, imports, exports and folder changes, including failed operations. */
export class OperationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }
  async idle(): Promise<void> { await this.tail; }
}

// Shared across puzzle instances, including saves pending during navigation.
export const replayWrites = new OperationQueue();
