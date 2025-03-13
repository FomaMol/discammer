/**
 * Red-flag rule pack for the message analyzer (Task F2).
 *
 * Everything here is a pure, side-effect-free function. There is NO network
 * call, NO logging, NO analytics. The text the user pastes is matched against
 * these rules entirely in the browser and never leaves the page. Keep it that
 * way: a rule's `test` must read its argument and return a boolean, nothing
 * else.
 *
 * Each rule carries an i18n `flagKey` (resolved under `client.analyzer.flags.*`)
 * rather than human-readable copy, so the label + explanation are authored per
 * locale in backend/locales/{en,ru}.json. `guideSlug`, when present, points at a
 * seeded threat-guide slug so the analyzer can link a fired flag to the matching
 * dossier.
 *
 * Severity scale:
 *   3 = strong fraud signal on its own (OTP ask, "safe account", punycode,
 *       homograph domain, credential ask)
 *   2 = pressure / channel signals that are suspicious in context (urgency,
 *       impersonation, crypto / gift-card rails, account-suspension threat)
 *   1 = softer, easily-innocent signals (a bare shortened link, a secrecy ask,
 *       a QR-code mention)
 */

import { shortenerHostList } from './threat_feed';

export type RedFlag = {
  /** Stable id used by tests and React keys. Never localized. */
  id: string;
  severity: 1 | 2 | 3;
  /**
   * Pure predicate. Receives BOTH a lowercased copy and the raw text so a rule
   * can do case-sensitive work (e.g. detect the literal `xn--` punycode prefix,
   * or inspect mixed-script tokens) without re-lowercasing.
   */
  test: (lower: string, raw: string) => boolean;
  /** i18n key under `client.analyzer.flags.*` — `<flagKey>_label` + `<flagKey>_body`. */
  flagKey: string;
  /** Optional seeded guide slug to link the reader to the matching dossier. */
  guideSlug?: string;
};

// ---------------------------------------------------------------------------
// Small matching helpers (all pure)
// ---------------------------------------------------------------------------

/** Build a case-insensitive regex once at module load (rules reuse them). */
function re(pattern: string): RegExp {
  return new RegExp(pattern, 'iu');
}

/**
 * Split into "tokens" — contiguous runs of letters/digits plus the URL-ish
 * punctuation that holds a domain together (dot, hyphen, slash, colon). Used by
 * the homograph and shortener rules so they reason about whole domain-ish runs
 * rather than the whole message.
 */
function tokens(text: string): string[] {
  return text.split(/[\s"'<>()[\]{},;!?]+/u).filter(Boolean);
}

const LATIN_LOOKALIKE = /[a-z]/i;
const CYRILLIC_LOOKALIKE = /[а-яё]/i;

/**
 * Homograph / mixed-script detection. Fires when a SINGLE token that looks like
 * a word or domain (alphanumeric run, optionally with dots/hyphens) contains
 * BOTH a Latin and a Cyrillic letter. Scoped to single tokens so ordinary
 * bilingual sentences ("перевод на card") do NOT trip it — only a fused run
 * like `аpple.com` (Cyrillic а + Latin pple) does.
 */
function hasMixedScriptToken(raw: string): boolean {
  for (const tok of tokens(raw)) {
    // Only consider tokens made of letters/digits/dots/hyphens (word/domain
    // shapes). Anything with spaces is already split out by tokens().
    if (!/^[\p{L}\p{N}.\-_]+$/u.test(tok)) continue;
    // Need at least 2 letters to be a meaningful lookalike word.
    const letters = tok.replace(/[^\p{L}]/gu, '');
    if (letters.length < 2) continue;
    if (LATIN_LOOKALIKE.test(letters) && CYRILLIC_LOOKALIKE.test(letters)) {
      return true;
    }
  }
  return false;
}

/** A token containing the punycode `xn--` label prefix (ASCII, case-sensitive-ish). */
function hasPunycode(raw: string): boolean {
  // Real IDN labels are `xn--...`. Match it at a label boundary so it isn't
  // caught mid-word (e.g. an English word that merely contains "xn--" is
  // implausible, but anchor to start-or-dot for precision).
  return /(^|[.\/@])xn--[a-z0-9-]+/i.test(raw);
}

function hasShortener(lower: string): boolean {
  // Word-bounded host match so "abit.ly" or an email domain don't false-fire.
  // The host list comes from threat_feed.ts (built-in seeds ∪ any UX-5 feed
  // entries); every entry is validated to `[a-z0-9.-]` there, so building a
  // regex from it here can't inject a metacharacter.
  return shortenerHostList().some((host) => {
    const escaped = host.replace(/\./g, '\\.');
    return new RegExp(`(^|[\\s/@])${escaped}([\\s/?#]|$)`, 'i').test(lower);
  });
}

// ---------------------------------------------------------------------------
// The rule pack (21 rules)
// ---------------------------------------------------------------------------

export const RED_FLAGS: RedFlag[] = [
  // 1 — Urgency lexicon
  {
    id: 'urgency',
    severity: 2,
    flagKey: 'urgency',
    test: (l) =>
      re(
        '\\b(urgent|urgently|immediately|right now|as soon as possible|asap|within \\d+ ?(min|minute|minutes|hour|hours))\\b',
      ).test(l) ||
      re('(сроч|неотлож|немедленн|сейчас же|прямо сейчас|в течение \\d+ ?(минут|час))').test(l),
  },

  // 2 — One-time / verification code ask
  {
    id: 'otp_ask',
    severity: 3,
    flagKey: 'otp_ask',
    guideSlug: 'sms-and-phone-scams',
    test: (l) =>
      re('\\b(otp|one[- ]?time (code|password|pin)|verification code|security code|the code we sent|code from (the )?(sms|text|message))\\b').test(l) ||
      re('(код из (смс|сообщения)|одноразов[\\p{L}]* (код|пароль)|назовите код|код подтвержд|проверочн[\\p{L}]* код|код безопасности)').test(l),
  },

  // 3 — Credential ask (password / PIN / CVV / login)
  {
    id: 'credential_ask',
    severity: 3,
    flagKey: 'credential_ask',
    guideSlug: 'phishing',
    test: (l) =>
      re('\\b(password|passcode|pin code|\\bpin\\b|cvv|cvc|card number|login details|account credentials|seed phrase|recovery phrase)\\b').test(l) ||
      re('(парол|пин[- ]?код|\\bпин\\b|\\bcvv\\b|\\bcvc\\b|номер карты|логин и пароль|данные карты|сид[- ]?фраз|seed[- ]?фраз)').test(l),
  },

  // 4 — "Safe account" / move money to protect it
  {
    id: 'safe_account',
    severity: 3,
    flagKey: 'safe_account',
    guideSlug: 'sms-and-phone-scams',
    test: (l) =>
      re('\\b(safe account|secure account|reserve account|protect(ed)? account|move (your )?(money|funds) to|transfer .* to (keep|protect))\\b').test(l) ||
      re('(безопасн[\\p{L}]* (счёт|счет)|резервн[\\p{L}]* (счёт|счет)|защищённ[\\p{L}]* (счёт|счет)|переведите .* (чтобы|для) (сохран|защит)|перевести деньги на (безопасн|резервн))').test(l),
  },

  // 5 — Impersonation of an authority
  {
    id: 'impersonation',
    severity: 2,
    flagKey: 'impersonation',
    guideSlug: 'phishing',
    test: (l) =>
      re('\\b(bank security|security (department|service|team)|fraud department|police|court|prosecutor|tax (office|authority)|government agency|your (boss|manager|ceo|director))\\b').test(l) ||
      re('(служб[\\p{L}]* безопасности (банка)?|сотрудник банка|полици|следовател|прокурор|суд[\\p{L}]*|налогов[\\p{L}]* (служб|инспекц)|руководител|ваш начальник|ваш директор)').test(l),
  },

  // 6 — Crypto payment rail
  {
    id: 'crypto_rail',
    severity: 2,
    flagKey: 'crypto_rail',
    guideSlug: 'investment-pyramids',
    test: (l) =>
      re('\\b(bitcoin|btc|usdt|tether|ethereum|crypto( ?wallet)?|cryptocurrency|to (this|the) wallet)\\b').test(l) ||
      re('(биткоин|крипт[\\p{L}]*|usdt|тезер|эфириум|на (этот )?(крипто)?кошел)').test(l),
  },

  // 7 — Gift-card / voucher payment rail
  {
    id: 'gift_card_rail',
    severity: 2,
    flagKey: 'gift_card_rail',
    guideSlug: 'get-rich-quick-schemes',
    test: (l) =>
      re('\\b(gift ?card|itunes card|google play card|steam (card|wallet)|voucher code|prepaid card)\\b').test(l) ||
      re('(подарочн[\\p{L}]* карт|карт[\\p{L}]* (itunes|google play|steam)|ваучер|предоплаченн[\\p{L}]* карт)').test(l),
  },

  // 8 — Card-to-card / money-transfer rail
  {
    id: 'p2p_transfer',
    severity: 2,
    flagKey: 'p2p_transfer',
    guideSlug: 'nigerian-letters',
    test: (l) =>
      re('\\b(western union|moneygram|wire transfer|money transfer|send (the )?money to|transfer to (this|the) card)\\b').test(l) ||
      re('(перевод на карту|переведите на карту|вестерн юнион|western union|денежн[\\p{L}]* перевод|закиньте на карту|кинь(те)? на карту)').test(l),
  },

  // 9 — URL shortener
  {
    id: 'url_shortener',
    severity: 1,
    flagKey: 'url_shortener',
    test: (l) => hasShortener(l),
  },

  // 10 — Punycode IDN
  {
    id: 'punycode',
    severity: 3,
    flagKey: 'punycode',
    guideSlug: 'fake-online-stores',
    test: (_l, raw) => hasPunycode(raw),
  },

  // 11 — Mixed-script homograph
  {
    id: 'homograph',
    severity: 3,
    flagKey: 'homograph',
    guideSlug: 'fake-online-stores',
    test: (_l, raw) => hasMixedScriptToken(raw),
  },

  // 12 — Prize / lottery / "you won"
  {
    id: 'prize_win',
    severity: 2,
    flagKey: 'prize_win',
    guideSlug: 'fraud-with-lotteries',
    test: (l) =>
      re('\\b(you (have )?won|congratulations.{0,30}(won|winner|prize)|claim your prize|lottery|sweepstake|lucky winner)\\b').test(l) ||
      re('(вы выиграли|поздравляем.{0,30}(выигр|приз|победител)|заберите приз|лотере|разыгрыва[\\p{L}]* приз|вы стали победител)').test(l),
  },

  // 13 — Guaranteed return / get-rich
  {
    id: 'guaranteed_roi',
    severity: 2,
    flagKey: 'guaranteed_roi',
    guideSlug: 'investment-pyramids',
    test: (l) =>
      re('\\b(guaranteed (return|profit|income)|double your money|\\d{2,}% (in|per|a|profit|return|daily|weekly|monthly)|risk[- ]?free (invest|return)|passive income guaranteed)\\b').test(l) ||
      re('(гарантированн[\\p{L}]* (доход|прибыл|return)|удвоить деньги|удвоим? (ваши )?деньги|\\d{2,}% (в день|в неделю|в месяц|годовых|прибыл)|без риска)').test(l),
  },

  // 14 — QR-code instruction
  {
    id: 'qr_code',
    severity: 1,
    flagKey: 'qr_code',
    test: (l) =>
      re('\\b(scan (this|the) qr|qr[- ]?code|scan to (pay|verify|confirm|login))\\b').test(l) ||
      re('(отсканируй[\\p{L}]* qr|qr[- ]?код|сканируй[\\p{L}]* (для|чтобы))').test(l),
  },

  // 15 — Deadline / clock pressure
  {
    id: 'deadline_clock',
    severity: 2,
    flagKey: 'deadline_clock',
    guideSlug: 'sms-and-phone-scams',
    test: (l) =>
      re('\\b(within \\d+ ?(hours|minutes)|before (the )?(end of (the )?day|midnight|\\d+[: ]?\\d*\\s?(am|pm))|expires? (today|in \\d+|soon)|offer ends|last chance)\\b').test(l) ||
      re('(в течение \\d+ ?(час|минут)|до конца дня|истека[\\p{L}]* (сегодня|через|срок)|счёт заблокир[\\p{L}]* через|последн[\\p{L}]* (шанс|возможност)|осталось \\d+ ?(час|минут))').test(l),
  },

  // 16 — Secrecy ask
  {
    id: 'secrecy',
    severity: 1,
    flagKey: 'secrecy',
    guideSlug: 'abuse-on-dating-sites',
    test: (l) =>
      re("\\b(don'?t tell (anyone|anybody|the bank|your family)|keep (this|it) (secret|between us|confidential)|this is confidential|do not share this)\\b").test(l) ||
      re('(никому не (говори|рассказыва|сообща)|это (наш[\\p{L}]* )?секрет|держи(те)? в секрете|это конфиденциальн|не сообщай[\\p{L}]* никому)').test(l),
  },

  // 17 — Account suspension / block threat
  {
    id: 'account_threat',
    severity: 2,
    flagKey: 'account_threat',
    guideSlug: 'phishing',
    test: (l) =>
      re('\\b(account (has been |will be )?(blocked|suspended|locked|frozen|deactivated)|we will close your account|to avoid (account )?(suspension|being (blocked|suspended|locked))|avoid (suspension|deactivation)|unauthori[sz]ed (login|access|transaction) (detected|attempt))\\b').test(l) ||
      re('(аккаунт[\\p{L}]* (заблокир|приостановл|заморож)|(счёт|счет) (будет )?заблокир|карта заблокир[\\p{L}]*|чтобы (избежать|не допустить) блокировк|зафиксир[\\p{L}]* подозрительн[\\p{L}]* (вход|операц|транзакц))').test(l),
  },

  // 18 — "Log in / confirm via this link" bait
  {
    id: 'login_link_bait',
    severity: 2,
    flagKey: 'login_link_bait',
    guideSlug: 'phishing',
    test: (l) =>
      re('\\b(log ?in (via|through|using|at|here)? ?(this|the)? ?link|confirm (your )?(details|identity|account) (via|by|through|at|using) (the |this )?link|verify (your account|here) (via|by) (the |this )?link|click (here|the link) to (verify|log ?in|confirm|unlock))\\b').test(l) ||
      re('(войдите по ссылке|перейдите по ссылке (чтобы|для)|подтвердите (данные|личность|вход) по ссылке|нажмите (на )?ссылку чтобы|кликните по ссылке чтобы)').test(l),
  },

  // 19 — Advance-fee ("pay a small fee to release a larger sum")
  {
    id: 'advance_fee',
    severity: 2,
    flagKey: 'advance_fee',
    guideSlug: 'nigerian-letters',
    test: (l) =>
      re('\\b((small|processing|release|customs|courier|administrative|transfer) fee.{0,40}(release|receive|unlock|transfer)|pay .{0,20}(fee|tax|charge) to (receive|unlock|release|claim))\\b').test(l) ||
      re('(неболь[\\p{L}]* (комисси|сбор|плат).{0,40}(получ|разблок|перевод)|оплати[\\p{L}]* (комисси|сбор|пошлин|налог) (чтобы|для) (получ|разблок))').test(l),
  },

  // 20 — Unexpected attachment / file ask
  {
    id: 'attachment_bait',
    severity: 1,
    flagKey: 'attachment_bait',
    test: (l) =>
      re('\\b(open (the )?attach(ed|ment)|see (the )?attached (invoice|document|file)|download (the )?(attached|file).{0,20}(invoice|document|receipt))\\b').test(l) ||
      re('(откройте (вложение|прикреплённ[\\p{L}]* файл)|во вложении (счёт|документ|файл)|скачайте (вложенн|прикреплённ)[\\p{L}]* (файл|счёт|документ))').test(l),
  },

  // 21 — Romance / relationship-secrecy framing leading to money
  {
    id: 'romance_money',
    severity: 1,
    flagKey: 'romance_money',
    guideSlug: 'abuse-on-dating-sites',
    test: (l) =>
      re('\\b(i love you.{0,60}(money|help|send|emergency|stuck|hospital)|never met.{0,40}(send|money|gift)|need (money|help) (for|to) (a |the )?(flight|ticket|visa|hospital|emergency))\\b').test(l) ||
      re('(я (тебя )?люблю.{0,60}(деньг|помоч|перевед|срочно|больниц)|никогда не встречались.{0,40}(перевед|деньг|подар)|нужн[\\p{L}]* (деньг|помощь) (на|для) (билет|визу|больниц|лечение))').test(l),
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type AnalysisResult = {
  /** Flags that fired, in declaration order, deduped by id. */
  fired: RedFlag[];
  /** Severity-weighted raw score (sum of fired severities). */
  score: number;
  /** Meter level 0..5 (0 = nothing fired / empty input). */
  level: 0 | 1 | 2 | 3 | 4 | 5;
};

/**
 * Map a severity-weighted score to a 0..5 meter level.
 *
 * Each fired flag contributes its severity (1, 2, or 3) to the score. The
 * thresholds below are deliberately gentle at the low end (a single soft flag
 * shouldn't max the meter) and saturate once several strong signals stack:
 *
 *   score 0        -> 0   (nothing fired)
 *   score 1        -> 1   (one soft signal)
 *   score 2-3      -> 2
 *   score 4-5      -> 3
 *   score 6-8      -> 4
 *   score 9+       -> 5
 *
 * Empty / whitespace-only input is handled before scoring and returns level 0.
 */
function scoreToLevel(score: number): AnalysisResult['level'] {
  if (score <= 0) return 0;
  if (score <= 1) return 1;
  if (score <= 3) return 2;
  if (score <= 5) return 3;
  if (score <= 8) return 4;
  return 5;
}

/**
 * Pure analysis entry point. Runs every rule against a normalized copy of the
 * text and returns the fired flags, a severity-weighted score, and a 0..5 meter
 * level. No network, no logging, no mutation of the input.
 */
export function analyze(text: string): AnalysisResult {
  const raw = text ?? '';
  if (raw.trim().length === 0) {
    return { fired: [], score: 0, level: 0 };
  }
  const lower = raw.toLowerCase();

  const fired: RedFlag[] = [];
  for (const flag of RED_FLAGS) {
    try {
      if (flag.test(lower, raw)) fired.push(flag);
    } catch {
      // A malformed input must never throw out of analysis — skip the rule.
    }
  }

  const score = fired.reduce((sum, f) => sum + f.severity, 0);
  return { fired, score, level: scoreToLevel(score) };
}
