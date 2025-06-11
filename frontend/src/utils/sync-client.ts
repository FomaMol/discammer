/**
 * UX-4 · sync transport + link state. Crypto lives in sync-crypto.ts; this file
 * only moves opaque blobs and remembers whether this device is linked. The split
 * is deliberate: sync-crypto.ts is testable with no fetch mock, and this half is
 * testable with no real cipher.
 *
 * The server is assumed hostile (see
 * docs/superpowers/specs/2026-07-15-ux4-progress-sync-design.md). Two things
 * must therefore never cross this boundary: the code itself — only its HKDF-
 * derived blobId does — and anything readable from the dossier.
 */
import { exportProgress, importProgress } from './progress';
import { decodeCode, decryptDossier, deriveKeys, encryptDossier } from './sync-crypto';

/**
 * Deliberately NOT part of the Dossier, and deliberately its own storage key
 * rather than a field in discammer:progress:v1 — the code must never ride inside
 * the ciphertext it unlocks, and unlinking a device must not touch progress.
 */
const LINK_KEY = 'discammer:sync:v1';

export function loadLinkedCode(): string | null {
  // Same guard as progress.ts: SSR has no window, and Safari private mode can
  // throw on access. Sync is a convenience — it degrades to off, never throws.
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LINK_KEY);
  } catch {
    return null;
  }
}

export function saveLinkedCode(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LINK_KEY, code);
  } catch {
    // Storage disabled — sync simply stays off for this session.
  }
}

export function clearLinkedCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LINK_KEY);
  } catch {
    // Nothing to do: if we cannot write, there is nothing stored to clear.
  }
}

/**
 * POST an opaque body. Returns null when the request never completed, which the
 * callers report as 'error' — a dropped sync is a status line, never an
 * exception thrown into a lesson page.
 *
 * `credentials: 'omit'` matches the threat-feed fetch: these endpoints identify
 * a blob by knowledge of blob_id and nothing else, so an ambient cookie could
 * only ever link a blob to a session.
 */
async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export async function pushProgress(code: string): Promise<'ok' | 'error'> {
  const secret = decodeCode(code);
  if (!secret) return 'error';
  const { blobId, encKey } = await deriveKeys(secret);
  const blob = await encryptDossier(encKey, JSON.stringify(exportProgress()));
  const res = await post('/api/sync/push', { blob_id: blobId, blob });
  return res?.ok ? 'ok' : 'error';
}

export async function pullProgress(
  code: string,
): Promise<'ok' | 'not-found' | 'bad-code' | 'error'> {
  const secret = decodeCode(code);
  if (!secret) return 'bad-code';
  const { blobId, encKey } = await deriveKeys(secret);
  const res = await post('/api/sync/pull', { blob_id: blobId });
  if (!res) return 'error';
  if (res.status === 404) return 'not-found';
  if (!res.ok) return 'error';

  let blob: unknown;
  try {
    blob = (await res.json())?.blob;
  } catch {
    return 'error';
  }
  if (typeof blob !== 'string') return 'error';

  const plaintext = await decryptDossier(encKey, blob);
  // Wrong code or tampered blob — indistinguishable to us, and both mean the
  // same thing to the user: this code does not open this data.
  if (plaintext === null) return 'bad-code';
  // importProgress is a non-destructive best-of merge, so a pull can only ever
  // add to what this device already earned.
  return importProgress(plaintext).ok ? 'ok' : 'error';
}

export async function deleteRemote(code: string): Promise<'ok' | 'error'> {
  const secret = decodeCode(code);
  if (!secret) return 'error';
  const { blobId } = await deriveKeys(secret);
  const res = await post('/api/sync/delete', { blob_id: blobId });
  return res?.ok ? 'ok' : 'error';
}
