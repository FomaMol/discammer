import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markLessonComplete, recordGuideCheck } from '../utils/progress';
import { saveLinkedCode } from '../utils/sync-client';
import { encodeCode, formatCode, generateSecret } from '../utils/sync-crypto';
import ProgressSync, { UnlinkedPanel, pullStatus, startAutoPush } from './ProgressSync';

/**
 * UX-4 · the ProgressSync island.
 *
 * Environment note: the suite runs in `node` (vitest.config.ts) and there is no
 * jsdom or @testing-library — adding them would mean new frontend dependencies,
 * which UX-4 forbids. So the island is rendered with `renderToStaticMarkup`
 * (react-dom/server is already a dependency) and the auto-push effect is
 * exported as `startAutoPush` and driven directly. The split is not a
 * workaround dressed up as a design: SSR rendering runs render-time logic and
 * NOT effects, so an effect asserted "around" would pass vacuously. Exporting it
 * is what makes the opt-in gate actually testable.
 *
 * What is worth pinning here is not the layout. It is the two promises the UI
 * makes on the user's behalf: that nothing reaches the network before they opt
 * in, and that they are told a lost code is unrecoverable BEFORE they have one
 * to lose. A warning shown after generation is not a warning; it is an excuse.
 */

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

/**
 * A window with a REAL listener registry — subscribe() in progress.ts is the
 * thing startAutoPush hangs off, so a no-op addEventListener (as
 * sync-client.test.ts can afford) would make every debounce assertion below
 * pass without the code under test ever running.
 */
function makeWindow(storage: ReturnType<typeof makeStorage>) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    localStorage: storage,
    addEventListener: (type: string, handler: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: (event: { type: string }) => {
      listeners.get(event.type)?.forEach((h) => h());
      return true;
    },
    /**
     * Every lookup answers with the key itself. That keeps the markup free of
     * copy this test would otherwise have to duplicate (and re-duplicate on
     * every wording change), while still pinning WHICH key each slot reads —
     * and it keeps makeTranslator's miss-warning out of the output.
     */
    __DISCAMMER_I18N__: {
      lang: 'en',
      strings: { sync: new Proxy({}, { get: (_t, prop) => String(prop) }) },
    },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
  };
}

let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  class FakeCustomEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  }
  (globalThis as Record<string, unknown>).CustomEvent = FakeCustomEvent;
  (globalThis as Record<string, unknown>).window = makeWindow(storage);
  (globalThis as Record<string, unknown>).localStorage = storage;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

const markup = () => renderToStaticMarkup(<ProgressSync locale="en" />);

describe('feature detection', () => {
  it('renders nothing at all when WebCrypto is unavailable', () => {
    // crypto.subtle needs a secure context. Where there is none, sync cannot
    // work, and a course that has always worked without sync must keep working
    // — silently, with no broken half-UI offering a button that cannot fire.
    vi.stubGlobal('crypto', {});
    expect(markup()).toBe('');
  });

  it('renders the island when WebCrypto is present', () => {
    // Guard the guard: if the island rendered '' for some unrelated reason, the
    // test above would pass while proving nothing.
    expect(markup()).not.toBe('');
  });
});

describe('the unlinked state', () => {
  it('warns that a lost code is unrecoverable BEFORE any code exists', () => {
    const html = markup();
    expect(html).toContain('data-testid="sync-loss-warning"');
    // "Before" is the whole point, and it is what makes this assertion mean
    // something: the warning must share the render that still only OFFERS to
    // generate. A user who reads "no recovery" next to a code they already own
    // was not warned — they were informed of a decision made for them.
    expect(html).toContain('data-testid="sync-create"');
    expect(html).not.toContain('data-testid="sync-code-reveal"');
  });

  it('shows no code and no linked controls until the user opts in', () => {
    const html = markup();

    // Not `not.toContain('DSCM-')`: the input placeholder is a DSCM- mask, and
    // legitimately so. What must be absent is a REAL code — so assert that every
    // code-shaped string on screen is the all-X mask. Any actual code carries
    // base32 symbols and fails this.
    for (const found of html.match(/DSCM(-[0-9A-Z•]+)+/g) ?? []) {
      expect(found).toMatch(/^DSCM(-X+)+$/);
    }
    expect(html).not.toContain('data-testid="sync-code-reveal"');
    expect(html).not.toContain('data-testid="sync-erase"');
    expect(html).not.toContain('data-testid="sync-unlink"');
  });

  it('shapes the code input placeholder exactly like a real code', () => {
    // Caught by running the thing, not by a test: the placeholder was copied
    // from the plan (Task 4) and the spec (§4.1), and BOTH write the mask out by
    // hand with a group missing — 21 and 24 symbols against a real code's 26.
    // A user comparing their code to a shorter placeholder concludes they
    // mistyped. Deriving it from formatCode is what makes it undriftable; this
    // pins that it stays derived.
    const shape = (s: string) => s.split('-').map((g) => g.length).join(',');
    const placeholder = markup().match(/placeholder="([^"]+)"/);

    expect(placeholder).not.toBeNull();
    expect(shape(placeholder![1])).toBe(shape(formatCode(encodeCode(generateSecret()))));
  });

  it('makes no network request while rendering', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    markup();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the linked state', () => {
  it('masks the stored code instead of reprinting it in full', () => {
    // The linked panel is shown on a course page the user may well have on a
    // screen someone else can see. It needs to say WHICH code this device is
    // on, not hand the code over again — the code is the decryption key.
    const code = encodeCode(generateSecret());
    saveLinkedCode(code);
    const html = markup();
    const groups = code.match(/.{1,5}/g) as string[];

    expect(html).toContain('data-testid="sync-linked"');
    // Guard the guard: a masked code must still show enough to identify itself.
    // Without this, every negative below would hold trivially for empty markup.
    expect(html).toContain(groups[0]);

    // Assert on the GROUPS, not on the raw 26-char code. `not.toContain(code)`
    // is what this test had first, and it was vacuous: formatCode() interleaves
    // dashes, so the contiguous code never appears in the markup even when the
    // panel prints the whole thing. It passed against a mutant that rendered
    // formatCode(code) — the exact leak it claimed to catch.
    for (const group of groups.slice(1, -1)) {
      expect(html).not.toContain(group);
    }
    expect(html).not.toContain(formatCode(code));
    expect(html).not.toContain(code);
  });

  it('keeps unlink and erase-from-server as two distinct actions', () => {
    // Different blast radius: one forgets a code on this device, the other
    // destroys the only copy of the blob for every device. Collapsing them into
    // one button is how a user loses data they meant to keep.
    saveLinkedCode(encodeCode(generateSecret()));
    const html = markup();
    expect(html).toContain('data-testid="sync-unlink"');
    expect(html).toContain('data-testid="sync-erase"');
  });
});

/**
 * Both pull call sites — PULL_FROM_SERVER on a linked device, and LINK_DEVICE on
 * an unlinked one — route their result through pullStatus. They used to each
 * hand-roll a ternary chain, and both chains forgot that pullProgress has a
 * fourth outcome.
 */
describe('pullStatus', () => {
  it('names a pull that never reached the server a failed pull', () => {
    // THE defect. 'error' is what pullProgress returns when the request did not
    // complete (offline: fetch rejects, post() returns null) or came back 429 /
    // 5xx (sync-client.ts:95-97) — all of which say nothing whatsoever about
    // the code. The refresh path used to fall through to 'bad_code' and tell a
    // LINKED device — whose code demonstrably opens the blob, because it either
    // created it or linked with it — that the code does not open this data.
    //
    // That is not a cosmetic mislabel. This product deliberately has no reset
    // and no recovery, so "your code is wrong" reads as "your code is dead",
    // and the rational response is to unlink and start over — orphaning the
    // real blob and stranding the synced copy behind a code just discarded.
    // The app ships a service worker; offline is a designed-for state.
    expect(pullStatus('error')).toBe('pull_failed');
  });

  it('does not call a failed pull a failed send', () => {
    // The link path's own version of the same bug, mapping 'error' to
    // 'push_failed' — a status whose text promises a retry "on your next
    // change". Two lies in one line: nothing was sent (this is a pull), and
    // nothing will retry (the link did not happen, so linkedCode stays null and
    // startAutoPush returns early on `if (!code)` — there is no retry path in
    // existence for it to mean).
    expect(pullStatus('error')).not.toBe('push_failed');
  });

  it('still tells a wrong code apart from an unknown one and from success', () => {
    // Guard the guard: 'pull_failed' must be a NEW branch, not a new default
    // that swallows the three outcomes that were already right.
    expect(pullStatus('ok')).toBe('pulled');
    expect(pullStatus('not-found')).toBe('not_found');
    expect(pullStatus('bad-code')).toBe('bad_code');
  });
});

/**
 * `busy` reaches the panel already; the create button just ignored it.
 */
describe('the unlinked panel while a pull is in flight', () => {
  const renderUnlinked = (busy: boolean) =>
    renderToStaticMarkup(
      <UnlinkedPanel
        tr={(key: string) => key}
        draft="DSCM-K7F2Q-ABCDE-FGHJK-MNPQR-S"
        setDraft={() => undefined}
        busy={busy}
        onCreate={() => undefined}
        onLink={() => undefined}
      />,
    );

  /**
   * Reads the rendered `disabled` ATTRIBUTE — deliberately not a substring test.
   * BTN_BASE carries the Tailwind variants `disabled:opacity-50` and
   * `disabled:cursor-not-allowed`, so a `toContain('disabled')` on the tag is
   * satisfied by the class list alone and passes against a button that is not
   * disabled at all. That is exactly what the first draft of this test did, and
   * only the idle case below exposed it. React SSR emits the boolean prop as
   * `disabled=""`, which the `disabled:` variants cannot spoof.
   */
  const isDisabled = (html: string, testid: string) => {
    const tag = html.match(new RegExp(`<button[^>]*data-testid="${testid}"[^>]*>`))?.[0];
    if (tag === undefined) throw new Error(`no <button data-testid="${testid}"> rendered`);
    return / disabled=""/.test(tag);
  };

  it('cannot mint a new code while an in-flight pull can still overwrite it', () => {
    // The interleaving: type a code → LINK_DEVICE → the pull is slow (mobile) →
    // give up → CREATE_SYNC_CODE → "I HAVE SAVED IT" writes a real blob under
    // the new code → the old pull NOW resolves 'ok' and calls saveLinkedCode
    // (ProgressSync.tsx:262-263), clobbering the code the user just wrote down.
    // The device ends up linked to the typed code while the code the user
    // physically saved points at a different, orphaned blob.
    //
    // On a component whose entire premise is that the code is the only key,
    // "the key on your paper is not the key in your browser" is the one outcome
    // that must be unreachable.
    expect(isDisabled(renderUnlinked(true), 'sync-create')).toBe(true);
  });

  it('leaves both ways in usable when nothing is in flight', () => {
    // Guard the guard: a button disabled unconditionally would satisfy the test
    // above while removing the feature it protects.
    const idle = renderUnlinked(false);
    expect(isDisabled(idle, 'sync-create')).toBe(false);
    expect(isDisabled(idle, 'sync-link')).toBe(false);
  });

  it('keeps the link button gated while a pull is in flight', () => {
    // Pre-existing and correct — pinned so the fix above cannot regress it.
    expect(isDisabled(renderUnlinked(true), 'sync-link')).toBe(true);
  });
});

describe('startAutoPush', () => {
  it('pushes nothing, ever, while the device is unlinked', () => {
    // The opt-in promise, structurally. Before linking there is no code, and
    // with no code there must be no traffic — not a failed push, not a probe.
    vi.useFakeTimers();
    const push = vi.fn();
    const stop = startAutoPush(null, push, 2000);

    markLessonComplete('mod-1', 'lesson-1');
    vi.advanceTimersByTime(60_000);

    expect(push).not.toHaveBeenCalled();
    stop();
  });

  it('coalesces a burst of progress events into a single push', () => {
    // Finishing a lesson can fire several writes in a row. Without the debounce
    // each one is its own encrypt + POST, and 20/min (SYNC_RATE_LIMIT) is not
    // as far away as it looks.
    vi.useFakeTimers();
    const push = vi.fn();
    const code = encodeCode(generateSecret());
    const stop = startAutoPush(code, push, 2000);

    markLessonComplete('mod-1', 'lesson-1');
    markLessonComplete('mod-1', 'lesson-2');
    markLessonComplete('mod-1', 'lesson-3');
    expect(push).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(code);
    stop();
  });

  it('pushes when the exam result lands, not only when a lesson does', () => {
    // The plan routed auto-push through subscribe() alone. subscribe() listens
    // to `discammer:progress` and `storage` — it does NOT hear
    // `discammer:exam`, which ExamWidget dispatches directly (ExamWidget.tsx:33)
    // and which CertificateWidget already has to listen for by hand.
    //
    // That gap is not cosmetic. The exam is the LAST thing a user does: there
    // is no tenth module whose lesson would later fire `discammer:progress` and
    // carry the result along. A subscribe()-only auto-push would therefore never
    // push the exam result at all — losing precisely the state UX-4 exists to
    // protect (spec §1: progress, exam result, certificate name).
    vi.useFakeTimers();
    const push = vi.fn();
    const stop = startAutoPush(encodeCode(generateSecret()), push, 2000);

    window.dispatchEvent(new CustomEvent('discammer:exam'));
    vi.advanceTimersByTime(2000);

    expect(push).toHaveBeenCalledTimes(1);
    stop();
  });

  it('pushes when a guide check is recorded', () => {
    // Same gap, same cause: writeGuideChecks fires `discammer:guidechecks`
    // (progress.ts:227), which subscribe() does not observe either. guideChecks
    // is a dossier field (v:2), so leaving it unsynced would quietly make the
    // synced dossier less complete than the exported one.
    vi.useFakeTimers();
    const push = vi.fn();
    const stop = startAutoPush(encodeCode(generateSecret()), push, 2000);

    recordGuideCheck('fake-online-stores', 3, 4);
    vi.advanceTimersByTime(2000);

    expect(push).toHaveBeenCalledTimes(1);
    stop();
  });

  it('suppresses a push that fires while an erase is in flight', () => {
    // The race the final review caught. sync_put is an UPSERT, so a debounced
    // push that fires during the erase's in-flight round trip re-creates the very
    // blob the user asked us to destroy — resurrecting it for the full 365-day
    // TTL while the UI reports "erased". A data-minimisation erase must win.
    //
    // The fix cannot be decided at arm time: the debounce is armed BEFORE the
    // user clicks Erase (e.g. Refresh dispatched `discammer:progress`, then they
    // click Erase within the 2s window). So the scheduled push re-checks, at FIRE
    // time, whether an erase has since begun.
    vi.useFakeTimers();
    const push = vi.fn();
    let erasing = false;
    const stop = startAutoPush(encodeCode(generateSecret()), push, 2000, () => !erasing);

    markLessonComplete('mod-1', 'lesson-1'); // arms the 2s debounce
    erasing = true; // user clicks Erase inside the window; delete is in flight
    vi.advanceTimersByTime(2000); // the armed timer now fires

    expect(push).not.toHaveBeenCalled();
    stop();
  });

  it('coalesces across event types, not just within one', () => {
    // A finished exam writes the record AND the lesson state. Three listeners
    // each arming their own timer would be three encrypt+POST round trips for
    // one user action.
    vi.useFakeTimers();
    const push = vi.fn();
    const stop = startAutoPush(encodeCode(generateSecret()), push, 2000);

    markLessonComplete('mod-9', 'final');
    window.dispatchEvent(new CustomEvent('discammer:exam'));
    recordGuideCheck('fake-online-stores', 4, 4);
    vi.advanceTimersByTime(2000);

    expect(push).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops pushing once cleaned up', () => {
    // The island unmounts on navigation. A subscription that outlives it keeps
    // encrypting and posting for a component nobody is looking at.
    vi.useFakeTimers();
    const push = vi.fn();
    const stop = startAutoPush(encodeCode(generateSecret()), push, 2000);
    stop();

    markLessonComplete('mod-1', 'lesson-1');
    vi.advanceTimersByTime(60_000);

    expect(push).not.toHaveBeenCalled();
  });

  it('drops a push already scheduled when cleanup lands mid-debounce', () => {
    // Unsubscribing is not enough on its own: a timer armed a moment before
    // unmount still fires into a dead component.
    vi.useFakeTimers();
    const push = vi.fn();
    const stop = startAutoPush(encodeCode(generateSecret()), push, 2000);

    markLessonComplete('mod-1', 'lesson-1');
    vi.advanceTimersByTime(500);
    stop();
    vi.advanceTimersByTime(60_000);

    expect(push).not.toHaveBeenCalled();
  });
});
