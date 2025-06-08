/**
 * UX-4 · sync-code cryptography. No network here — transport lives in
 * sync-client.ts so this file stays testable without fetch mocks.
 *
 * Threat model (see docs/superpowers/specs/2026-07-15-ux4-progress-sync-design.md):
 * the server stores ciphertext under an id derived from the code, so anyone can
 * enumerate ids, fetch blobs and brute-force them OFFLINE. The code's entropy is
 * therefore the only real defence — it is 128 bits of machine randomness, never
 * user-chosen. That is also why no slow KDF is used: stretching defends weak
 * entropy, and there is none here to defend.
 */

/** Crockford base32: no I, L, O or U — they are misread when retyping a code. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_BYTES = 16; // 128 bits
const CODE_CHARS = 26; // ceil(128 / 5)
const HKDF_SALT = 'discammer-sync-v1';
/** Display marker only — never parsed as data. See decodeCode() for why the
 *  strip is length-guarded rather than unconditional. */
const CODE_PREFIX = 'DSCM';

/**
 * TS 5.7 made Uint8Array generic over its backing buffer, and WebCrypto's
 * `BufferSource` accepts only the ArrayBuffer-backed form — a plain
 * `Uint8Array` widens to `ArrayBufferLike`, which admits SharedArrayBuffer and
 * so fails to typecheck against subtle.importKey. Naming the narrow type once
 * keeps the crypto signatures honest instead of casting at each call site.
 */
type Bytes = Uint8Array<ArrayBuffer>;

const enc = (s: string) => new TextEncoder().encode(s);

export function isSyncSupported(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

export function generateSecret(): Bytes {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

export function encodeCode(secret: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of secret) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // 128 bits is not a multiple of 5, so the last symbol carries 3 real bits
  // plus 2 zero pads. decodeCode() drops them again.
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function decodeCode(code: string): Bytes | null {
  const stripped = code.toUpperCase().replace(/[\s-]/g, '');
  // Strip DSCM only when the length proves it is the display marker. D, S, C
  // and M are all real Crockford symbols, so roughly one code in a million
  // legitimately begins with them; an unconditional strip would eat four bits
  // of that user's secret and reject their perfectly valid code.
  const body =
    stripped.length === CODE_CHARS + CODE_PREFIX.length && stripped.startsWith(CODE_PREFIX)
      ? stripped.slice(CODE_PREFIX.length)
      : stripped;
  const cleaned = body
    // Crockford's forgiving reads: O is zero; I and L are one.
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== CODE_CHARS) return null;

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (out.length !== SECRET_BYTES) return null;
  return new Uint8Array(out);
}

/** Group for display: DSCM- then 26 characters in groups of five (the last
 *  group holds the odd 26th). Cosmetic only — decodeCode() ignores all of it. */
export function formatCode(code: string): string {
  return `${CODE_PREFIX}-${(code.match(/.{1,5}/g) ?? []).join('-')}`;
}

async function hkdf(secret: Bytes, info: string, bits: number): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc(HKDF_SALT), info: enc(info) },
    base,
    bits,
  );
}

/**
 * Split the one secret into two INDEPENDENT values. HKDF-Expand is a PRF, so
 * knowing blobId (which the server does) reveals nothing about encKey or the
 * secret itself. The two distinct `info` labels are what keep them independent
 * — never reuse a single label for both outputs.
 */
export async function deriveKeys(
  secret: Bytes,
): Promise<{ blobId: string; encKey: CryptoKey }> {
  const idBits = await hkdf(secret, 'id', 256);
  const blobId = Array.from(new Uint8Array(idBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const keyBits = await hkdf(secret, 'enc', 256);
  // Non-extractable: nothing in the app has any business reading these bytes.
  const encKey = await crypto.subtle.importKey('raw', keyBits, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return { blobId, encKey };
}

/**
 * Chunked rather than one `String.fromCharCode(...bytes)` spread. Not fixing a
 * live bug: SYNC_MAX_BODY's 64 KB body cap puts at most ~48 KB through here,
 * under both V8's limit (measured: OK at 100k, RangeError by 125k) and JSC's
 * stricter ~65k. But 1.36x is a thin margin against a hard RangeError, so buy
 * the cliff off for four lines.
 */
function toB64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptDossier(encKey: CryptoKey, plaintext: string): Promise<string> {
  // Fresh IV every push: reusing (key, iv) in GCM breaks both confidentiality
  // and authenticity.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, enc(plaintext)),
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return toB64(packed);
}

/** Returns null when the blob is not ours or was tampered with — GCM is AEAD, so
 *  a modified ciphertext fails loudly here rather than yielding garbage. Also
 *  swallows non-base64 input: a wrong-code pull can hand us anything, and that
 *  is an answer, not an exception. */
export async function decryptDossier(encKey: CryptoKey, blob: string): Promise<string | null> {
  try {
    const packed = fromB64(blob);
    const iv = packed.slice(0, 12);
    const ct = packed.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encKey, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
