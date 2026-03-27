const STORAGE_KEY = 'pet-squad-poker.profile';

/** Aligned with server caps in sockets/index.js */
const MAX_DISPLAY_NAME_LEN = 64;
const MAX_SEED_LEN = 128;

export type SavedProfile = {
  displayName: string;
  seed: string;
};

/**
 * Load display name + avatar seed from localStorage, or null if missing/invalid.
 */
export function loadSavedProfile(): SavedProfile | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return null;
    const o = data as Record<string, unknown>;
    const seed =
      typeof o.seed === 'string' ? o.seed.trim().slice(0, MAX_SEED_LEN) : '';
    if (!seed) return null;
    const displayName =
      typeof o.displayName === 'string'
        ? o.displayName.trim().slice(0, MAX_DISPLAY_NAME_LEN)
        : '';
    return { displayName, seed };
  } catch {
    return null;
  }
}

/**
 * Persist profile. Skips write if seed would be empty (keeps last good save).
 */
export function saveProfile(displayName: string, seed: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const s = seed.trim().slice(0, MAX_SEED_LEN);
    if (!s) return;
    const payload: SavedProfile = {
      displayName: displayName.trim().slice(0, MAX_DISPLAY_NAME_LEN),
      seed: s,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}
