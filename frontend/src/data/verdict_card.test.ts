import { describe, expect, it } from 'vitest';
import { analyze } from './redflags';
import { buildCardData, FLAG_CATEGORY, type CardData } from '../components/VerdictCard';

/**
 * Tests for the F3 verdict-card data builder.
 *
 * The single most important property under test is the PRIVACY INVARIANT: the
 * card-data object the canvas renders from must NEVER contain any substring of
 * the user's pasted message. We assert this with a fixture whose message embeds
 * a distinctive, unmistakable token and prove that token is absent from every
 * value reachable in the returned object.
 *
 * `buildCardData` is a pure function of the analyzer's RESULT object (plus an
 * injected date for deterministic filenames) — it never receives the raw text,
 * which is the structural guarantee behind the invariant. These tests pin that
 * down so a future refactor can't quietly thread the message through.
 */

// A token that could not plausibly appear in any localized card string.
const SECRET_TOKEN = 'ZZ_SECRET_MESSAGE_TOKEN_9173_QXWV';

/** Every string value reachable in the card-data object, flattened. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

const FIXED_DATE = new Date('2026-06-19T12:00:00Z');

describe('buildCardData — privacy invariant', () => {
  it('NEVER includes any substring of the original message', () => {
    // A real scam message with the distinctive token spliced in. It trips
    // several rules, so the card carries counts + categories — but never text.
    const message =
      `URGENT ${SECRET_TOKEN}: bank security here. Your account will be suspended. ` +
      `Tell us the one-time code from the SMS and move your funds to a safe account. ` +
      `Do not tell anyone. ${SECRET_TOKEN}`;
    const result = analyze(message);
    expect(result.fired.length).toBeGreaterThan(0); // sanity: the fixture really fires

    const card = buildCardData(result, FIXED_DATE);

    // The whole flattened object must not contain the token anywhere.
    const haystack = JSON.stringify(card);
    expect(haystack).not.toContain(SECRET_TOKEN);
    for (const s of allStrings(card)) {
      expect(s).not.toContain(SECRET_TOKEN);
    }
  });

  it('carries only non-text aggregates (count, severity, category ids)', () => {
    const result = analyze('Move your funds to a safe account and tell us the OTP code now.');
    const card = buildCardData(result, FIXED_DATE);
    expect(typeof card.count).toBe('number');
    expect([0, 1, 2, 3]).toContain(card.maxSeverity);
    expect(Array.isArray(card.categories)).toBe(true);
    // Category ids are stable identifiers, never localized copy or message text.
    for (const cat of card.categories) {
      expect(typeof cat).toBe('string');
      expect(FLAG_CATEGORY[cat as keyof typeof FLAG_CATEGORY] ?? cat).toBe(cat);
    }
    // The card object exposes no field that could hold the raw text.
    expect(Object.keys(card).sort()).toEqual(
      ['categories', 'count', 'filename', 'maxSeverity'].sort(),
    );
  });
});

describe('buildCardData — category mapping', () => {
  it('every red-flag id maps to a known category', () => {
    // FLAG_CATEGORY must cover the full rule pack so no fired flag is dropped.
    const ids = analyze(
      'urgent immediately password cvv otp verification code safe account bitcoin ' +
        'gift card wire transfer you won lottery guaranteed return scan qr expires ' +
        'today never tell anyone account blocked log in via the link pay a fee to ' +
        'release bit.ly/x open the attached invoice i love you send money for a flight',
    ).fired.map((f) => f.id);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) {
      expect(FLAG_CATEGORY[id]).toBeTruthy();
    }
  });

  it('collapses duplicate categories and preserves first-seen order', () => {
    // otp_ask + credential_ask both map to "credentials" — should appear once.
    const result = analyze(
      'Tell us the one-time code from the SMS. Also reply with your password and CVV.',
    );
    const card = buildCardData(result, FIXED_DATE);
    const unique = new Set(card.categories);
    expect(unique.size).toBe(card.categories.length);
    expect(card.categories).toContain('credentials');
  });

  it('maps the fired categories of a classic phish correctly', () => {
    const result = analyze(
      'Bank security: your account will be suspended. Move your funds to a safe account urgently.',
    );
    const card = buildCardData(result, FIXED_DATE);
    // impersonation -> impersonation, account_threat/urgency -> pressure, safe_account -> money
    expect(card.categories).toContain('impersonation');
    expect(card.categories).toContain('pressure');
    expect(card.categories).toContain('money');
  });
});

describe('buildCardData — zero-flags calm state', () => {
  it('renders a calm card (count 0, severity 0, no categories) — not a false all-clear', () => {
    const result = analyze('Hey, are we still on for lunch tomorrow at noon?');
    expect(result.fired).toEqual([]);
    const card: CardData = buildCardData(result, FIXED_DATE);
    expect(card.count).toBe(0);
    expect(card.maxSeverity).toBe(0);
    expect(card.categories).toEqual([]);
  });

  it('empty input also yields the calm zero state', () => {
    const card = buildCardData(analyze(''), FIXED_DATE);
    expect(card.count).toBe(0);
    expect(card.maxSeverity).toBe(0);
    expect(card.categories).toEqual([]);
  });
});

describe('buildCardData — filename', () => {
  it('builds a deterministic discammer-check-YYYYMMDD.png name from the injected date', () => {
    const card = buildCardData(analyze('You won the lottery!'), FIXED_DATE);
    expect(card.filename).toBe('discammer-check-20260619.png');
  });
});
