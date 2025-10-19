import { useCallback, useEffect, useRef, useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
import { subscribe } from '../utils/progress';
import {
  clearLinkedCode,
  deleteRemote,
  loadLinkedCode,
  pullProgress,
  pushProgress,
  saveLinkedCode,
} from '../utils/sync-client';
import { encodeCode, formatCode, generateSecret, isSyncSupported } from '../utils/sync-crypto';

/**
 * UX-4 · optional cross-device progress sync.
 *
 * Sits under CourseProgress on course.html — next to the progress it syncs.
 * Crypto is in utils/sync-crypto.ts, transport in utils/sync-client.ts; this
 * file is only the UI and the decision of WHEN to call them.
 *
 * The design constraint that shapes everything here: the server stores an opaque
 * blob under an id derived from the code, and has no idea who owns it. So there
 * is no "forgot my code" flow, and there never can be. The UI's whole job is to
 * make sure the user knows that BEFORE they have a code to lose, not after —
 * which is why the warning renders in the same view as the create button rather
 * than next to the generated code.
 *
 * Motion: nothing decorative here, only the border/colour hover transitions
 * globals.css's reduced-motion block deliberately keeps. Nothing to suppress.
 */

interface Props {
  locale?: Locale;
}

/**
 * Long enough to swallow the burst of writes one lesson completion produces,
 * short enough that closing the tab straight after rarely beats it.
 */
export const AUTO_PUSH_DEBOUNCE_MS = 2000;

/**
 * The auto-push effect body, exported so it can be tested. Returns its own
 * cleanup, so the caller is just `useEffect(() => startAutoPush(...), [...])`.
 *
 * `code === null` means the user has not opted in, and is handled by returning
 * before subscribing to anything at all: no code, no listeners, no traffic.
 */
export function startAutoPush(
  code: string | null,
  push: (code: string) => void,
  delayMs: number = AUTO_PUSH_DEBOUNCE_MS,
  shouldPush: () => boolean = () => true,
): () => void {
  if (!code || typeof window === 'undefined') return () => undefined;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    // Decide at FIRE time, not arm time. The debounce may be armed before the
    // user clicks Erase; by the time it fires an erase can be in flight, and
    // pushing then would re-UPSERT (sync_put) the blob they just deleted. So the
    // push re-checks whether it is still wanted the instant before it runs.
    timer = setTimeout(() => {
      if (shouldPush()) push(code);
    }, delayMs);
  };

  // subscribe() covers `discammer:progress` and the cross-tab `storage` event.
  // It does NOT cover the other two writers, which dispatch their own events:
  // ExamWidget (ExamWidget.tsx:33) and writeGuideChecks (progress.ts:227).
  // CertificateWidget already pairs subscribe() with a hand-rolled
  // `discammer:exam` listener for exactly this reason — same idiom here.
  //
  // This is not a detail. The exam is the LAST thing a user does; no tenth
  // module exists whose lesson would later fire `discammer:progress` and carry
  // the result up with it. On subscribe() alone, the exam result and the
  // certificate name — two of the four things the dossier carries — would never
  // be pushed at all.
  const unsubscribe = subscribe(schedule);
  window.addEventListener('discammer:exam', schedule);
  window.addEventListener('discammer:guidechecks', schedule);

  return () => {
    // Clear the armed timer too, not just the listeners: a push scheduled a
    // moment before unmount would otherwise still fire into a dead component.
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe();
    window.removeEventListener('discammer:exam', schedule);
    window.removeEventListener('discammer:guidechecks', schedule);
  };
}

/**
 * `DSCM-K7F2Q-•••••-•••••-•••••-C` — enough to tell two codes apart, not enough
 * to use one. The linked panel lives on a page the user may have open in front
 * of other people, and the code IS the decryption key.
 */
function maskCode(code: string): string {
  const groups = code.match(/.{1,5}/g) ?? [];
  const masked = groups
    .map((g, i) => (i === 0 || i === groups.length - 1 ? g : '•'.repeat(g.length)))
    .join('');
  // Re-use formatCode so the DSCM- marker has exactly one definition.
  return formatCode(masked);
}

type Stage =
  | { kind: 'unlinked' }
  | { kind: 'created'; code: string }
  | { kind: 'linked'; code: string };

/**
 * Status is held as a code and translated at render. Two reasons: the async
 * callbacks stay free of a translator they would have to close over, and every
 * lookup in statusText below is a literal string argument, which is what
 * scripts/i18n_audit.py scans for. Building the key by interpolation instead
 * would read to the audit as a namespace full of dead keys.
 *
 * (Writing a translator call inline in a comment here would itself be harvested
 * as a reference to a key that does not exist — the audit does not know prose
 * from code. Hence the description rather than the example.)
 */
type Status =
  | null
  | 'pushing'
  | 'pushed'
  | 'push_failed'
  | 'pulling'
  | 'pulled'
  | 'not_found'
  | 'bad_code'
  | 'pull_failed'
  | 'erasing'
  | 'erased'
  | 'erase_failed'
  | 'copied'
  | 'copy_failed';

/**
 * The single mapping from a pullProgress outcome to what the user is told. Both
 * pull call sites — refresh on a linked device, link on an unlinked one — go
 * through here.
 *
 * They used to each hand-roll their own ternary chain over a four-outcome union,
 * and each chain covered three outcomes and let the fourth fall through to
 * whatever the last branch happened to be: refresh called a network failure a
 * wrong code, link called it a failed send. A `switch` over the union is what
 * makes that class of bug a compile error instead of a lie on screen.
 *
 * The distinction being drawn is the one the user cannot draw for themselves:
 * 'bad-code' / 'not-found' are facts ABOUT THE CODE, and in a product with no
 * recovery path they are terminal — a user who believes them will discard the
 * code. 'error' is a fact about the NETWORK and says nothing about the code at
 * all. Collapsing the second into the first tells someone their only key is
 * dead because their train went into a tunnel.
 */
export function pullStatus(result: 'ok' | 'not-found' | 'bad-code' | 'error'): Status {
  switch (result) {
    case 'ok':
      return 'pulled';
    case 'not-found':
      return 'not_found';
    case 'bad-code':
      return 'bad_code';
    case 'error':
      return 'pull_failed';
  }
}

const BUSY: Status[] = ['pushing', 'pulling', 'erasing'];
const BAD: Status[] = [
  'push_failed',
  'not_found',
  'bad_code',
  'pull_failed',
  'erase_failed',
  'copy_failed',
];

function statusText(tr: (key: string) => string, status: Status): string {
  switch (status) {
    case 'pushing':
      return tr('status_pushing');
    case 'pushed':
      return tr('status_pushed');
    case 'push_failed':
      return tr('status_push_failed');
    case 'pulling':
      return tr('status_pulling');
    case 'pulled':
      return tr('status_pulled');
    case 'not_found':
      return tr('status_not_found');
    case 'bad_code':
      return tr('status_bad_code');
    case 'pull_failed':
      return tr('status_pull_failed');
    case 'erasing':
      return tr('status_erasing');
    case 'erased':
      return tr('status_erased');
    case 'erase_failed':
      return tr('status_erase_failed');
    case 'copied':
      return tr('status_copied');
    case 'copy_failed':
      return tr('status_copy_failed');
    default:
      return '';
  }
}

/**
 * Derived from formatCode, never hand-written. Both the plan and the spec wrote
 * this mask out by hand and both got it wrong — `DSCM-XXXXX-XXXXX-XXXXX-XXXXX-X`
 * is 21 symbols where a real code is 26 (spec §4.1's example is 24). A
 * placeholder shorter than the thing it describes tells the user they mistyped
 * when they did not. Deriving it is what keeps it honest for free.
 *
 * It is also why this is not a locale key: it is a format mask, identical in
 * every language, and nothing about it is translatable.
 */
const CODE_PLACEHOLDER = formatCode('X'.repeat(26));

const BTN_BASE =
  'inline-flex items-center gap-2 px-4 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] transition rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:2px]';
const BTN_CYAN = `${BTN_BASE} bg-[var(--brand)]/5 border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10`;
const BTN_GHOST = `${BTN_BASE} text-[var(--text-soft)] border border-[var(--border)] hover:border-[var(--brand-dim)] hover:text-[var(--brand)]`;
const BTN_RED = `${BTN_BASE} text-[var(--danger)] border border-[var(--danger)]/40 hover:border-[var(--danger)] hover:bg-[var(--danger)]/8`;

export default function ProgressSync({ locale }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator('sync');

  // Read the link synchronously so the first paint is already the right panel —
  // a linked device must never flash the "create a code" pitch at its owner.
  const [stage, setStage] = useState<Stage>(() => {
    const stored = loadLinkedCode();
    return stored ? { kind: 'linked', code: stored } : { kind: 'unlinked' };
  });
  const [status, setStatus] = useState<Status>(null);
  const [draft, setDraft] = useState('');
  const [lastPush, setLastPush] = useState<Date | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  const linkedCode = stage.kind === 'linked' ? stage.code : null;

  // True from the instant Erase is clicked until the delete resolves (or fails).
  // A ref, not state: the armed auto-push timer reads it at fire time and must
  // see the latest value without waiting for a re-render.
  const erasing = useRef(false);

  const runPush = useCallback((code: string) => {
    setStatus('pushing');
    void pushProgress(code).then((result) => {
      if (result === 'ok') {
        setLastPush(new Date());
        setStatus('pushed');
      } else {
        // A dropped push is a status line, never a modal. The next progress
        // event re-arms the debounce and tries again; the lesson matters more
        // than the sync.
        setStatus('push_failed');
      }
    });
  }, []);

  useEffect(
    () => startAutoPush(linkedCode, runPush, AUTO_PUSH_DEBOUNCE_MS, () => !erasing.current),
    [linkedCode, runPush],
  );

  function handleCreate() {
    // Local only. Nothing is stored and nothing is sent until the user confirms
    // they have saved it — generating a code must not be the act that commits
    // them to it.
    setStatus(null);
    setStage({ kind: 'created', code: encodeCode(generateSecret()) });
  }

  function handleConfirmSaved(code: string) {
    saveLinkedCode(code);
    setStage({ kind: 'linked', code });
    runPush(code);
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(formatCode(code));
      setStatus('copied');
    } catch {
      // Clipboard needs a secure context and can be refused outright. The code
      // is on screen and downloadable, so this is a nuisance, not a failure.
      setStatus('copy_failed');
    }
  }

  function handleDownload(code: string) {
    // Same handoff as DossierFooter's export, so the two feel like one product.
    const blob = new Blob([`${formatCode(code)}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discammer-sync-code.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleLinkExisting() {
    setStatus('pulling');
    const result = await pullProgress(draft);
    if (result === 'ok') {
      // decodeCode tolerates spacing/case, so store what the user typed only
      // after the server round trip proved it opens something.
      saveLinkedCode(draft);
      setStage({ kind: 'linked', code: draft });
      setDraft('');
      setStatus('pulled');
      return;
    }
    // Deliberately do NOT link on not-found, bad-code or error: a typo would
    // otherwise leave the device silently pushing to a blob nobody will ever
    // pull, and a network failure proves nothing about the code either way.
    setStatus(pullStatus(result));
  }

  async function handleRefresh(code: string) {
    setStatus('pulling');
    setStatus(pullStatus(await pullProgress(code)));
  }

  function handleUnlink() {
    // Local only — the blob stays, so another device (or this one, with the
    // code) can still reach it. That is the whole difference from erase.
    clearLinkedCode();
    setStage({ kind: 'unlinked' });
    setConfirmErase(false);
    setStatus(null);
  }

  async function handleErase(code: string) {
    // Set the guard BEFORE the await: an auto-push armed during the erase window
    // reads erasing.current at fire time (see startAutoPush) and stands down, so
    // it cannot re-UPSERT the blob mid-delete and resurrect it for the full TTL.
    erasing.current = true;
    setStatus('erasing');
    const result = await deleteRemote(code);
    if (result === 'ok') {
      // The device is now unlinked, so nothing should push again — leave the
      // guard set; the effect teardown on the stage change cancels the timer too.
      clearLinkedCode();
      setStage({ kind: 'unlinked' });
      setConfirmErase(false);
      setStatus('erased');
    } else {
      // Keep the link: the blob may still exist, and pretending otherwise would
      // leave data on the server the user believes they deleted. Let auto-push
      // resume so the still-linked device keeps syncing.
      erasing.current = false;
      setStatus('erase_failed');
    }
  }

  // Feature-detect first. crypto.subtle needs a secure context; where there is
  // none, sync cannot work and the course must behave exactly as it always has
  // — so render nothing rather than a panel whose buttons would throw.
  if (!isSyncSupported()) return null;

  return (
    <section className="border-t border-[var(--border)] pt-6" data-testid="sync-root">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {tr('tag')}
      </div>

      {stage.kind === 'unlinked' && (
        <UnlinkedPanel
          tr={tr}
          draft={draft}
          setDraft={setDraft}
          busy={BUSY.includes(status)}
          onCreate={handleCreate}
          onLink={handleLinkExisting}
        />
      )}

      {stage.kind === 'created' && (
        <CreatedPanel
          tr={tr}
          code={stage.code}
          onCopy={() => void handleCopy(stage.code)}
          onDownload={() => handleDownload(stage.code)}
          onConfirm={() => handleConfirmSaved(stage.code)}
        />
      )}

      {stage.kind === 'linked' && (
        <LinkedPanel
          tr={tr}
          lang={lang}
          code={stage.code}
          lastPush={lastPush}
          busy={BUSY.includes(status)}
          confirmErase={confirmErase}
          setConfirmErase={setConfirmErase}
          onRefresh={() => void handleRefresh(stage.code)}
          onUnlink={handleUnlink}
          onErase={() => void handleErase(stage.code)}
        />
      )}

      <div aria-live="polite" className="min-h-0">
        {status && (
          <p
            data-testid="sync-status"
            className={`mt-4 font-mono text-[12px] leading-relaxed ${
              BAD.includes(status)
                ? 'text-[var(--danger)]'
                : BUSY.includes(status)
                  ? 'text-[var(--muted)]'
                  : 'text-[var(--success)]'
            }`}
          >
            {statusText(tr, status)}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The pitch, the warning, and the two ways in. The warning is rendered here —
 * in the view that only OFFERS to generate — because a warning a user reads
 * after they already hold a code is not a warning, it is a disclaimer.
 */
export function UnlinkedPanel({
  tr,
  draft,
  setDraft,
  busy,
  onCreate,
  onLink,
}: {
  tr: (key: string) => string;
  draft: string;
  setDraft: (v: string) => void;
  busy: boolean;
  onCreate: () => void;
  onLink: () => void;
}) {
  return (
    <div className="mt-2">
      <p className="font-sans text-[13px] text-[var(--muted)] leading-relaxed max-w-[62ch]">
        {tr('intro')}
      </p>

      <p
        data-testid="sync-loss-warning"
        className="mt-4 flex items-start gap-2.5 px-3.5 py-3 border border-[var(--warning)]/40 bg-[var(--warning)]/8 rounded-[3px] font-sans text-[13px] leading-relaxed text-[var(--warning)] max-w-[62ch]"
      >
        <span aria-hidden="true" className="font-mono shrink-0">
          !
        </span>
        <span>{tr('loss_warning')}</span>
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="sync-create"
          onClick={onCreate}
          // Gated on the same `busy` as the link button. Without this, a user
          // who tires of a slow LINK_DEVICE pull can mint and confirm a second
          // code, and the pull — still in flight — then resolves 'ok' and
          // relinks the device to the TYPED code, silently orphaning the one
          // the user just wrote down. The code is the only key; the key on the
          // paper and the key in the browser must never diverge.
          disabled={busy}
          className={BTN_CYAN}
        >
          <span aria-hidden="true">▸</span> {tr('create_action')}
        </button>
      </div>

      <div className="mt-6 border-t border-[var(--border)] pt-5">
        <label
          htmlFor="sync-code-input"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]"
        >
          {tr('have_code_label')}
        </label>
        <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            id="sync-code-input"
            data-testid="sync-code-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={CODE_PLACEHOLDER}
            autoComplete="off"
            spellCheck={false}
            className="w-full sm:max-w-[24rem] px-3.5 py-2.5 bg-[var(--canvas)] border border-[var(--border)] rounded-[3px] font-mono text-[13px] tracking-[0.08em] text-[var(--text)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--brand-dim)]"
          />
          <button
            type="button"
            data-testid="sync-link"
            onClick={onLink}
            disabled={busy || draft.trim() === ''}
            className={`${BTN_GHOST} shrink-0`}
          >
            <span aria-hidden="true">▴</span> {tr('link_action')}
          </button>
        </div>
        <p className="mt-2.5 font-sans text-[12px] text-[var(--muted)] leading-relaxed max-w-[62ch]">
          {tr('link_hint')}
        </p>
      </div>
    </div>
  );
}

/**
 * The one and only time the full code is on screen. Nothing has been stored or
 * sent yet — the link is committed by the explicit confirm below, not by having
 * generated the code.
 */
function CreatedPanel({
  tr,
  code,
  onCopy,
  onDownload,
  onConfirm,
}: {
  tr: (key: string) => string;
  code: string;
  onCopy: () => void;
  onDownload: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-2">
      <h3 className="font-mono font-bold text-[var(--text)] text-[15px] uppercase tracking-[-0.01em]">
        {tr('created_heading')}
      </h3>

      <p
        data-testid="sync-code-reveal"
        className="mt-3 px-4 py-4 border border-[var(--brand)]/50 bg-[var(--canvas)] rounded-[4px] font-mono font-bold text-[var(--brand)] text-[clamp(0.95rem,0.7rem+1.1vw,1.35rem)] tracking-[0.08em] break-all select-all"
      >
        {formatCode(code)}
      </p>

      <p
        data-testid="sync-loss-warning-repeat"
        className="mt-3 font-sans text-[13px] leading-relaxed text-[var(--warning)] max-w-[62ch]"
      >
        {tr('created_warning')}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" data-testid="sync-copy" onClick={onCopy} className={BTN_GHOST}>
          {tr('copy_action')}
        </button>
        <button
          type="button"
          data-testid="sync-download"
          onClick={onDownload}
          className={BTN_GHOST}
        >
          {tr('download_action')}
        </button>
        <button
          type="button"
          data-testid="sync-confirm-saved"
          onClick={onConfirm}
          className={BTN_CYAN}
        >
          <span aria-hidden="true">▸</span> {tr('confirm_saved_action')}
        </button>
      </div>
    </div>
  );
}

/**
 * The linked panel. Unlink and erase sit apart, look different, and say
 * different things on purpose: one forgets a code on this device, the other
 * destroys the only copy of the blob for every device the user owns.
 */
function LinkedPanel({
  tr,
  lang,
  code,
  lastPush,
  busy,
  confirmErase,
  setConfirmErase,
  onRefresh,
  onUnlink,
  onErase,
}: {
  tr: (key: string) => string;
  lang: Locale;
  code: string;
  lastPush: Date | null;
  busy: boolean;
  confirmErase: boolean;
  setConfirmErase: (v: boolean) => void;
  onRefresh: () => void;
  onUnlink: () => void;
  onErase: () => void;
}) {
  return (
    <div className="mt-2" data-testid="sync-linked">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {tr('linked_code_label')}
          </div>
          <p className="mt-1 font-mono font-bold text-[var(--brand)] text-[15px] tracking-[0.08em] break-all">
            {maskCode(code)}
          </p>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] shrink-0 tabular-nums">
          {lastPush
            ? `${tr('last_push_label')} ${lastPush.toLocaleTimeString(lang)}`
            : tr('auto_push_hint')}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="sync-refresh"
          onClick={onRefresh}
          disabled={busy}
          className={BTN_CYAN}
        >
          <span aria-hidden="true">▴</span> {tr('refresh_action')}
        </button>
        <button
          type="button"
          data-testid="sync-unlink"
          onClick={onUnlink}
          disabled={busy}
          className={BTN_GHOST}
        >
          {tr('unlink_action')}
        </button>
      </div>
      <p className="mt-2.5 font-sans text-[12px] text-[var(--muted)] leading-relaxed max-w-[62ch]">
        {tr('unlink_hint')}
      </p>

      <div className="mt-5 border-t border-[var(--border)] pt-5">
        {confirmErase ? (
          <div className="flex flex-col gap-3">
            <p className="font-sans text-[13px] leading-relaxed text-[var(--danger)] max-w-[62ch]">
              {tr('erase_confirm_question')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="sync-erase"
                onClick={onErase}
                disabled={busy}
                className={BTN_RED}
              >
                {tr('erase_confirm_yes')}
              </button>
              <button
                type="button"
                data-testid="sync-erase-cancel"
                onClick={() => setConfirmErase(false)}
                className={BTN_GHOST}
              >
                {tr('erase_confirm_no')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              data-testid="sync-erase"
              onClick={() => setConfirmErase(true)}
              disabled={busy}
              className={BTN_RED}
            >
              {tr('erase_action')}
            </button>
            <p className="mt-2.5 font-sans text-[12px] text-[var(--muted)] leading-relaxed max-w-[62ch]">
              {tr('erase_hint')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
