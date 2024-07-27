/**
 * Privacy-safe client error beacon (O1).
 *
 * When an island's ErrorBoundary catches a crash it calls `reportClientError`,
 * which sends a TINY, SCRUBBED, fire-and-forget signal to /api/client-errors so
 * we can see crash rates without log-scraping — and WITHOUT ever shipping user
 * content off the page.
 *
 * Privacy invariants (must hold no matter what the caller passes):
 *   - the raw `message` and `stack` NEVER leave the browser; only the error
 *     class name + a coarse "message class" bucket (name + a length band) + a
 *     coarse location go on the wire;
 *   - the payload is sampled (default 20%) so a crash loop can't flood;
 *   - it is sent with navigator.sendBeacon (no await, never blocks the UI) and
 *     is a no-op when sendBeacon is unavailable;
 *   - nothing is retained client-side.
 *
 * The server re-scrubs and rate-limits on its end (defense in depth) — this is
 * the client half of the contract.
 */

declare global {
  interface Window {
    __DISCAMMER_CONFIG__?: {
      clientErrorSampleRate?: number;
    };
  }
}

const DEFAULT_SAMPLE_RATE = 0.2;
const ENDPOINT = '/api/client-errors';
const MAX_NAME_LEN = 40;

interface ErrorLike {
  name?: string;
  message?: string;
  stack?: string;
}

interface BeaconPayload {
  /** Coarse JS error class, e.g. "TypeError". Sanitised to an identifier. */
  name: string;
  /** Non-identifying bucket: `${name}/${lengthBand}`. NEVER the message text. */
  messageClass: string;
  /** Coarse island/component name, never a URL or user content. */
  location: string;
}

/** True only for short identifier-ish error class names. */
function sanitizeName(raw: string | undefined): string {
  if (typeof raw === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(raw)) {
    return raw.slice(0, MAX_NAME_LEN);
  }
  return 'Error';
}

/** A non-identifying length band so we never put the message text on the wire. */
function lengthBand(message: string | undefined): string {
  const len = typeof message === 'string' ? message.length : 0;
  if (len === 0) return 'empty';
  if (len <= 32) return 'short';
  if (len <= 128) return 'medium';
  return 'long';
}

/** Coarse location bucket — strip anything that isn't a safe component token. */
function sanitizeLocation(raw: string | undefined): string {
  if (typeof raw === 'string' && /^[A-Za-z0-9_.\-]{1,60}$/.test(raw)) {
    return raw;
  }
  return 'unknown';
}

function readSampleRate(): number {
  const raw = window.__DISCAMMER_CONFIG__?.clientErrorSampleRate;
  if (typeof raw === 'number' && raw >= 0 && raw <= 1) {
    return raw;
  }
  return DEFAULT_SAMPLE_RATE;
}

/**
 * Report a caught client error. Fire-and-forget, sampled, scrubbed. Safe to
 * call from any error path — it never throws and never blocks.
 *
 * @param err   the caught error (or error-like object)
 * @param location optional coarse component/island name for the report
 */
export function reportClientError(err: ErrorLike, location?: string): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return; // no-op where sendBeacon is unavailable
    }
    if (Math.random() >= readSampleRate()) {
      return; // sampled out
    }

    const name = sanitizeName(err?.name);
    const payload: BeaconPayload = {
      name,
      // Coarse bucket only — NEVER the raw message string.
      messageClass: `${name}/${lengthBand(err?.message)}`,
      location: sanitizeLocation(location),
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(ENDPOINT, blob);
  } catch {
    // Reporting must never surface a new error to the user.
  }
}
