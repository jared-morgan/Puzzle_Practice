// The player's pirate: the name and face on every duty report. Kept with the site-wide settings,
// which storage never trims to make room (see storage.ts).
import { Store } from '../storage';
import { DEFAULT_FACE, sanitizeFace, type FaceSpec } from './face';

export interface PirateProfile {
  name: string;
  face: FaceSpec;
}

export const PROFILE_KEY = 'profile';
export const DEFAULT_NAME = 'Pirate';
export const NAME_LIMIT = 20;

/** Letters, spaces, apostrophes and hyphens, trimmed to the limit; anything else gives the default name. */
export function sanitizeName(value: unknown): string {
  const name = typeof value === 'string'
    ? value.replace(/[^\p{L}' -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT).trim()
    : '';
  return name || DEFAULT_NAME;
}

export function sanitizeProfile(value: unknown): PirateProfile {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof PirateProfile, unknown>>;
  return { name: sanitizeName(v.name), face: sanitizeFace(v.face) };
}

const store = new Store('global');

export function loadProfile(): PirateProfile {
  return sanitizeProfile(store.get<unknown>(PROFILE_KEY, { name: DEFAULT_NAME, face: DEFAULT_FACE }));
}

export function saveProfile(profile: PirateProfile): PirateProfile {
  const clean = sanitizeProfile(profile);
  store.set(PROFILE_KEY, clean);
  return clean;
}

/** While a replay plays, its reports show the pirate who played it rather than today's profile. */
let replayPirate: PirateProfile | null = null;

export function setReplayPirate(pirate: PirateProfile | null): void {
  replayPirate = pirate ? sanitizeProfile(pirate) : null;
}

/** The pirate a report being made now belongs to. */
export function currentPirate(): PirateProfile {
  return replayPirate ?? loadProfile();
}
