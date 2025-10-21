import { themeColor } from '../utils/theme-color';
import { useCallback, useState } from 'react';
import type { AnalysisResult } from '../data/redflags';
import { makeTranslator } from '../utils/i18n';

/**
 * VerdictCard — the F3 shareable verdict card.
 *
 * After a message check, the reader can generate a small branded image to send
 * back to whoever forwarded them the message: "DiScammer · 4 red flags found",
 * the flag categories, and the brand mark. It is a light teaching loop, not a
 * verdict stamp.
 *
 * PRIVACY INVARIANT (the crux of this feature):
 *   The pasted MESSAGE TEXT never reaches this component and never enters the
 *   generated image. `buildCardData` takes the analyzer's RESULT object only —
 *   counts, max severity, and flag *categories* — and returns ONLY those
 *   non-text aggregates. There is no parameter, no field, and no code path that
 *   carries a substring of the user's message onto the card. The image is drawn
 *   entirely client-side to an off-screen <canvas>; there are NO network calls.
 *
 * Testability: `buildCardData` and `FLAG_CATEGORY` are pure and exported so the
 * vitest suite can assert the privacy invariant (a distinctive token in the
 * message must be absent from the card data) and the category mapping directly,
 * with no DOM. The canvas drawing + Web Share / download path below is guarded
 * with `typeof` checks so importing this module under SSR/jsdom never touches a
 * missing DOM API.
 */

// ---------------------------------------------------------------------------
// Pure card-data builder (no DOM, no canvas, no message text)
// ---------------------------------------------------------------------------

/**
 * Map every red-flag rule id (from ../data/redflags) to a small, human-meaningful
 * category. The card shows category *labels*, not individual flag names, so a
 * dense phish reads as a handful of buckets ("pressure", "money", "links")
 * rather than a wall of rule names. Keep this exhaustive over the rule pack —
 * the vitest suite asserts every fired id maps to a known category.
 */
export const FLAG_CATEGORY: Record<string, string> = {
  // Pressure / urgency / threats
  urgency: 'pressure',
  deadline_clock: 'pressure',
  account_threat: 'pressure',
  // Asking for codes / credentials
  otp_ask: 'credentials',
  credential_ask: 'credentials',
  // Money rails / payoffs
  safe_account: 'money',
  crypto_rail: 'money',
  gift_card_rail: 'money',
  p2p_transfer: 'money',
  advance_fee: 'money',
  guaranteed_roi: 'money',
  // Pretending to be someone with authority
  impersonation: 'impersonation',
  // Too-good-to-be-true bait
  prize_win: 'bait',
  romance_money: 'bait',
  // Suspicious links / domains / scan-to-act
  url_shortener: 'links',
  punycode: 'links',
  homograph: 'links',
  login_link_bait: 'links',
  qr_code: 'links',
  // Asks to keep it secret
  secrecy: 'secrecy',
  // Unexpected attachments
  attachment_bait: 'attachment',
};

/** Stable category id ordering — gives a deterministic legend on the card. */
export const CATEGORY_ORDER: readonly string[] = [
  'pressure',
  'credentials',
  'money',
  'impersonation',
  'bait',
  'links',
  'secrecy',
  'attachment',
];

/**
 * The ONLY thing the canvas renders from. Deliberately a flat object of
 * non-text aggregates so there is structurally nowhere for message text to
 * hide. `categories` are stable ids (see FLAG_CATEGORY values), localized to
 * labels only at draw time.
 */
export type CardData = {
  /** How many red flags fired. */
  count: number;
  /** Highest fired severity (0 when nothing fired). */
  maxSeverity: 0 | 1 | 2 | 3;
  /** Distinct fired categories, in CATEGORY_ORDER, deduped. */
  categories: string[];
  /** Download filename, `discammer-check-YYYYMMDD.png`, from the given date. */
  filename: string;
};

/** Zero-pad to 2 digits for the filename date stamp. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Pure builder: result object (+ a date for the filename) -> card data.
 *
 * Takes the analyzer's `AnalysisResult` and NOTHING else — in particular, never
 * the raw message text. Returns only counts, severity, and category ids. The
 * date is injected so tests are deterministic; the live component passes
 * `new Date()` at click time.
 */
export function buildCardData(result: AnalysisResult, now: Date = new Date()): CardData {
  const fired = result?.fired ?? [];

  const count = fired.length;
  let maxSeverity: 0 | 1 | 2 | 3 = 0;
  for (const f of fired) {
    if (f.severity > maxSeverity) maxSeverity = f.severity;
  }

  // Distinct categories, ordered by CATEGORY_ORDER for a stable legend.
  const present = new Set<string>();
  for (const f of fired) {
    const cat = FLAG_CATEGORY[f.id];
    if (cat) present.add(cat);
  }
  const categories = CATEGORY_ORDER.filter((c) => present.has(c));

  const filename = `discammer-check-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(
    now.getDate(),
  )}.png`;

  return { count, maxSeverity, categories, filename };
}

// ---------------------------------------------------------------------------
// Canvas rendering (client-only; guarded for SSR/jsdom)
// ---------------------------------------------------------------------------

// A2 briefing-room palette — pulled from globals.css @theme. Canvas needs hex
// literals, so these are the live token values, not neon.
const palette = () => ({
  canvas: themeColor('canvas'),
  canvasSoft: themeColor('panel'),
  hairline: themeColor('border-strong'),
  ink: themeColor('text'),
  inkStrong: themeColor('text-strong'),
  muted: themeColor('muted'),
  cyan: themeColor('brand'),
  amber: themeColor('warning'),
  green: themeColor('success'),
  red: themeColor('danger'),
  threatMid: themeColor('threat-mid'),
});

const CARD_W = 1200;
const CARD_H = 630; // OG-card 1.91:1 share aspect

/** Accent color for the verdict, by max severity (calm green at 0). */
function verdictColor(maxSeverity: number): string {
  if (maxSeverity >= 3) return palette().red;
  if (maxSeverity === 2) return palette().amber;
  if (maxSeverity === 1) return palette().green;
  return palette().green;
}

/**
 * Draw the card to a 2D context. Pure pixels from `data` + localized strings —
 * never the message text. Caller owns the canvas lifecycle.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  strings: { title: string; verdict: string; calm: string; legend: string; noText: string; categoryLabels: string[] },
): void {
  const PALETTE = palette();
  const mono = "700 28px 'JetBrains Mono', ui-monospace, monospace";
  const accent = verdictColor(data.maxSeverity);

  // Background + subtle inner frame.
  ctx.fillStyle = PALETTE.canvas;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = PALETTE.hairline;
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, CARD_W - 64, CARD_H - 64);
  // Accent rail down the left edge.
  ctx.fillStyle = accent;
  ctx.fillRect(32, 32, 8, CARD_H - 64);

  const left = 88;

  // Brand mark.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.cyan;
  ctx.font = "800 40px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText('DiScammer', left, 132);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = "600 20px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText(strings.title.toUpperCase(), left, 168);

  // The headline verdict ("N red flags found" or the calm line).
  ctx.fillStyle = data.count === 0 ? PALETTE.ink : accent;
  ctx.font = "800 72px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText(data.count === 0 ? strings.calm : strings.verdict, left, 300);

  if (data.count > 0 && data.categories.length > 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "600 22px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillText(strings.legend.toUpperCase(), left, 372);

    // Category chips across one or two rows.
    ctx.font = mono;
    let x = left;
    let y = 430;
    const padX = 22;
    const gap = 16;
    const chipH = 52;
    for (const label of strings.categoryLabels) {
      const text = label.toUpperCase();
      const w = ctx.measureText(text).width + padX * 2;
      if (x + w > CARD_W - 88) {
        x = left;
        y += chipH + gap;
      }
      ctx.fillStyle = PALETTE.canvasSoft;
      ctx.strokeStyle = `${accent}`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const r = 6;
      ctx.roundRect(x, y, w, chipH, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.inkStrong;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + padX, y + chipH / 2);
      ctx.textBaseline = 'alphabetic';
      x += w + gap;
    }
  }

  // Footer: the "no message text on this card" reassurance.
  ctx.fillStyle = PALETTE.muted;
  ctx.font = "500 20px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText(strings.noText, left, CARD_H - 72);
}

/** True only in a real browser with a usable canvas. */
function canRenderCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

interface VerdictCardProps {
  result: AnalysisResult;
  lang?: string;
}

/**
 * The [SHARE_CARD] affordance. Renders nothing visual until pressed; on click it
 * draws the card to an off-screen canvas and offers Web Share (where available)
 * with a graceful fallback to a PNG download. No network calls.
 */
export default function VerdictCard({ result }: VerdictCardProps) {
  const tr = makeTranslator('analyzer');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'shared' | 'downloaded'>(null);
  const [error, setError] = useState(false);

  const categoryLabelFor = useCallback(
    (cat: string) => tr(`card.cat_${cat}`),
    [tr],
  );

  const render = useCallback(async () => {
    if (!canRenderCanvas()) return;
    setBusy(true);
    setError(false);
    setDone(null);
    try {
      const data = buildCardData(result, new Date());

      const canvas = document.createElement('canvas');
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError(true);
        return;
      }

      const strings = {
        title: tr('card.title'),
        verdict:
          data.count === 1
            ? tr('card.flag_one', { count: data.count })
            : tr('card.flags_count', { count: data.count }),
        calm: tr('card.calm_headline'),
        legend: tr('card.legend'),
        noText: tr('card.no_text_note'),
        categoryLabels: data.categories.map(categoryLabelFor),
      };

      drawCard(ctx, data, strings);

      // Prefer Web Share with a file, where the platform supports it.
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) {
        setError(true);
        return;
      }

      const file =
        typeof File !== 'undefined' ? new File([blob], data.filename, { type: 'image/png' }) : null;

      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      const canShareFiles =
        !!nav &&
        typeof nav.share === 'function' &&
        typeof nav.canShare === 'function' &&
        !!file &&
        nav.canShare({ files: [file] });

      if (canShareFiles && file && nav) {
        try {
          await nav.share({ files: [file], title: tr('card.share_title') });
          setDone('shared');
          return;
        } catch {
          // User cancelled or share failed — fall through to download.
        }
      }

      // Fallback: trigger a PNG download.
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setDone('downloaded');
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [result, tr, categoryLabelFor]);

  return (
    <div className="mt-7 border border-[var(--border)] bg-[var(--code)]/60 rounded-[4px] px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={render}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 uppercase text-[12px] tracking-[0.14em] font-bold border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10 transition-colors rounded-[4px] cursor-pointer disabled:opacity-60 disabled:cursor-default"
        >
          <span aria-hidden="true">[</span>
          {busy ? tr('card.button_busy') : tr('card.button')}
          <span aria-hidden="true">]</span>
        </button>
        {/* Reassurance — load-bearing: the card carries no message text. */}
        <p className="text-[11px] leading-[1.45] text-[var(--muted)] max-w-[52ch] font-sans">
          {tr('card.no_text_note')}
        </p>
      </div>
      <div aria-live="polite" className="mt-2 min-h-[1.1em]">
        {done === 'shared' && (
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--success)]">{tr('card.shared')}</p>
        )}
        {done === 'downloaded' && (
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--success)]">
            {tr('card.downloaded')}
          </p>
        )}
        {error && (
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--danger)]">{tr('card.error')}</p>
        )}
      </div>
    </div>
  );
}
