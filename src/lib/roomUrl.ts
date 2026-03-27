/** Query param name for the shareable room deep link. */
export const ROOM_QUERY_PARAM = 'room';

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64url: string): string | null {
  try {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Max decoded room name length (aligned with server). */
export const MAX_ROOM_NAME_LENGTH = 128;

/**
 * Encode a UTF-8 room name to base64url (no padding, URL-safe).
 */
export function encodeRoomName(name: string): string {
  return utf8ToBase64Url(name);
}

/**
 * Decode the `room` query value, or null if missing/invalid.
 */
export function decodeRoomParam(param: string | null): string | null {
  if (param == null || param === '') return null;
  const decoded = base64UrlToUtf8(param);
  if (decoded == null) return null;
  const trimmed = decoded.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_ROOM_NAME_LENGTH) return null;
  return trimmed;
}

/**
 * Build the current page URL with `?room=<encoded>` and apply it without reload.
 * Uses `history.replaceState` so the address bar is shareable.
 * @returns The new absolute URL string (same as `location.href` after update).
 */
export function buildRoomUrl(roomName: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_QUERY_PARAM, encodeRoomName(roomName.trim()));
  history.replaceState({}, '', url);
  return url.toString();
}
