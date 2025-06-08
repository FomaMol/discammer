import { describe, expect, it } from 'vitest';

import {
  decodeCode,
  decryptDossier,
  deriveKeys,
  encodeCode,
  encryptDossier,
  formatCode,
  generateSecret,
  isSyncSupported,
} from './sync-crypto';

/**
 * UX-4 · sync-code cryptography. Pure crypto, no network — the transport half
 * lives in sync-client.ts, so nothing here needs a fetch mock.
 *
 * The suite runs in the `node` environment (vitest.config.ts). Node 20 exposes
 * `globalThis.crypto.subtle`, `btoa` and `atob`, so unlike progress.test.ts this
 * file needs no shims: the module under test uses no DOM beyond WebCrypto.
 */

describe('sync code', () => {
  it('round-trips a secret through the code', () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(16);
    const decoded = decodeCode(encodeCode(secret));
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!)).toEqual(Array.from(secret));
  });

  it('encodes 128 bits as 26 Crockford characters', () => {
    expect(encodeCode(new Uint8Array(16))).toHaveLength(26);
  });

  it('never emits the ambiguous letters I, L, O or U', () => {
    for (let i = 0; i < 50; i++) {
      expect(encodeCode(generateSecret())).not.toMatch(/[ILOU]/);
    }
  });

  it('accepts human-mangled input: case, dashes, spaces, I/L/O confusion', () => {
    const secret = generateSecret();
    const code = encodeCode(secret);
    const mangled = formatCode(code).toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
    expect(Array.from(decodeCode(mangled)!)).toEqual(Array.from(secret));
  });

  it('rejects codes of the wrong length or alphabet', () => {
    expect(decodeCode('')).toBeNull();
    expect(decodeCode('ABC')).toBeNull();
    expect(decodeCode('U'.repeat(26))).toBeNull();
  });

  it('does not mistake a bare code beginning with DSCM for a prefixed one', () => {
    // DSCM is a display marker, not data — but D, S, C and M are all real
    // Crockford symbols, so roughly one code in a million legitimately starts
    // with those four characters. Stripping the prefix unconditionally would
    // eat four bits of that user's secret and reject their valid code.
    const secret = new Uint8Array([0x6e, 0x59, 0x40, ...new Array(13).fill(0)]);
    const code = encodeCode(secret);
    expect(code.startsWith('DSCM')).toBe(true); // guards the fixture itself
    expect(Array.from(decodeCode(code)!)).toEqual(Array.from(secret));
  });
});

describe('key derivation', () => {
  it('derives a 64-hex blobId deterministically', async () => {
    const secret = generateSecret();
    const a = await deriveKeys(secret);
    const b = await deriveKeys(secret);
    expect(a.blobId).toMatch(/^[0-9a-f]{64}$/);
    expect(a.blobId).toBe(b.blobId);
  });

  it('gives different secrets different blobIds', async () => {
    const a = await deriveKeys(generateSecret());
    const b = await deriveKeys(generateSecret());
    expect(a.blobId).not.toBe(b.blobId);
  });

  it('does not let blobId decrypt the blob', async () => {
    // The server sees blobId. If enc_key were recoverable from it the whole
    // design collapses, so pin that they are independent HKDF outputs: a blob
    // encrypted under one secret must not decrypt under another whose blobId
    // we know.
    const s1 = generateSecret();
    const s2 = generateSecret();
    const k1 = await deriveKeys(s1);
    const k2 = await deriveKeys(s2);
    const blob = await encryptDossier(k1.encKey, '{"v":2}');
    expect(await decryptDossier(k2.encKey, blob)).toBeNull();
  });

  it('does not hand the server the key: blobId bytes must not decrypt the blob', async () => {
    // A mutant reusing one HKDF `info` label for both outputs would satisfy
    // every test above — blobId stays deterministic and distinct per secret —
    // while making enc_key literally equal to the value we hand the server.
    // This is the exact attack spec §4.2 rules out, so assert it directly
    // rather than inspecting encKey (which is non-extractable, by design).
    const { blobId, encKey } = await deriveKeys(generateSecret());
    const blob = await encryptDossier(encKey, '{"v":2}');

    const idBytes = Uint8Array.from(blobId.match(/../g)!.map((h) => parseInt(h, 16)));
    const attackerKey = await crypto.subtle.importKey('raw', idBytes, 'AES-GCM', false, [
      'decrypt',
    ]);
    expect(await decryptDossier(attackerKey, blob)).toBeNull();
  });
});

describe('encryption', () => {
  it('round-trips a dossier', async () => {
    const { encKey } = await deriveKeys(generateSecret());
    const plaintext = JSON.stringify({ v: 2, lessons: {}, exams: null });
    expect(await decryptDossier(encKey, await encryptDossier(encKey, plaintext))).toBe(plaintext);
  });

  it('uses a fresh IV per push', async () => {
    const { encKey } = await deriveKeys(generateSecret());
    expect(await encryptDossier(encKey, 'same')).not.toBe(await encryptDossier(encKey, 'same'));
  });

  it('returns null on tampered ciphertext rather than garbage', async () => {
    const { encKey } = await deriveKeys(generateSecret());
    const blob = await encryptDossier(encKey, '{"v":2}');
    const bytes = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = btoa(String.fromCharCode(...bytes));
    expect(await decryptDossier(encKey, tampered)).toBeNull();
  });

  it('returns null on a blob that is not base64 at all', async () => {
    // A wrong-code pull can hand us anything; decrypt must fail quietly rather
    // than throw into the caller's await.
    const { encKey } = await deriveKeys(generateSecret());
    expect(await decryptDossier(encKey, 'not base64 !!')).toBeNull();
    expect(await decryptDossier(encKey, '')).toBeNull();
  });

  it('round-trips a dossier the size of the server body cap', async () => {
    // config.SYNC_MAX_BODY is 64 KB, so a blob that large is reachable in
    // production. Encoding it must not blow the argument limit of a spread.
    const { encKey } = await deriveKeys(generateSecret());
    const plaintext = JSON.stringify({ v: 2, filler: 'x'.repeat(48_000) });
    expect(await decryptDossier(encKey, await encryptDossier(encKey, plaintext))).toBe(plaintext);
  });

  it('reports support when subtle crypto exists', () => {
    expect(isSyncSupported()).toBe(true);
  });
});
