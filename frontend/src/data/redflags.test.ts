import { describe, expect, it } from 'vitest';
import { analyze, RED_FLAGS, type RedFlag } from './redflags';

/** Ids that fired for a given message. */
function firedIds(text: string): string[] {
  return analyze(text).fired.map((f) => f.id);
}

describe('rule pack integrity', () => {
  it('has 18–24 rules with unique ids', () => {
    expect(RED_FLAGS.length).toBeGreaterThanOrEqual(18);
    expect(RED_FLAGS.length).toBeLessThanOrEqual(24);
    const ids = RED_FLAGS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every flag has a flagKey and a valid severity', () => {
    for (const r of RED_FLAGS) {
      expect(r.flagKey).toBeTruthy();
      expect([1, 2, 3]).toContain(r.severity);
    }
  });

  it('every guideSlug points at a seeded guide slug', () => {
    const SEEDED = new Set([
      'phishing',
      'nigerian-letters',
      'get-rich-quick-schemes',
      'investment-pyramids',
      'false-charities',
      'fake-online-stores',
      'abuse-on-dating-sites',
      'sms-and-phone-scams',
      'fraud-with-lotteries',
      'scam-sites-working-at-home',
    ]);
    for (const r of RED_FLAGS) {
      if (r.guideSlug) expect(SEEDED.has(r.guideSlug)).toBe(true);
    }
  });
});

describe('empty / benign input', () => {
  it('empty string fires nothing and reads level 0', () => {
    const res = analyze('');
    expect(res.fired).toEqual([]);
    expect(res.level).toBe(0);
    expect(res.score).toBe(0);
  });

  it('whitespace-only input fires nothing', () => {
    expect(analyze('   \n\t  ').level).toBe(0);
  });

  it('a benign friendly message (EN) fires ZERO flags', () => {
    const benign =
      "Hey! Are we still on for lunch tomorrow at noon? I found a great little place near the office. Let me know what works for you.";
    expect(firedIds(benign)).toEqual([]);
  });

  it('a benign friendly message (RU) fires ZERO flags', () => {
    const benign =
      'Привет! Встречаемся завтра в час дня у входа в парк? Я возьму кофе. Дай знать, удобно ли тебе.';
    expect(firedIds(benign)).toEqual([]);
  });

  it('ordinary bilingual text does not trip the homograph rule', () => {
    // Latin and Cyrillic words, but never fused inside one token.
    const ru = 'Скинь, пожалуйста, ссылку на тот сайт про React и TypeScript.';
    expect(firedIds(ru)).not.toContain('homograph');
  });
});

describe('RU scam fixtures fire expected ids', () => {
  it('bank-impersonation OTP phish', () => {
    const msg =
      'Служба безопасности банка: зафиксирован подозрительный вход в ваш аккаунт. Срочно назовите код из СМС, иначе счёт будет заблокирован.';
    const ids = firedIds(msg);
    expect(ids).toContain('otp_ask');
    expect(ids).toContain('impersonation');
    expect(ids).toContain('urgency');
    expect(ids).toContain('account_threat');
  });

  it('safe-account transfer scam', () => {
    const msg =
      'Чтобы защитить ваши средства, немедленно переведите деньги на безопасный счёт. Никому не говорите об этом переводе.';
    const ids = firedIds(msg);
    expect(ids).toContain('safe_account');
    expect(ids).toContain('urgency');
    expect(ids).toContain('secrecy');
  });

  it('crypto guaranteed-return pyramid', () => {
    const msg =
      'Гарантированный доход 30% в месяц! Удвоим ваши деньги. Просто переведите USDT на этот кошелёк прямо сейчас.';
    const ids = firedIds(msg);
    expect(ids).toContain('guaranteed_roi');
    expect(ids).toContain('crypto_rail');
    expect(ids).toContain('urgency');
  });

  it('lottery prize with advance fee', () => {
    const msg =
      'Поздравляем, вы выиграли приз в нашей лотерее! Оплатите небольшой сбор, чтобы получить выигрыш.';
    const ids = firedIds(msg);
    expect(ids).toContain('prize_win');
    expect(ids).toContain('advance_fee');
  });
});

describe('EN scam fixtures fire expected ids', () => {
  it('bank suspension login-link phish', () => {
    const msg =
      'URGENT: your account has been suspended due to an unauthorized login attempt. Confirm your identity via the link to restore access.';
    const ids = firedIds(msg);
    expect(ids).toContain('urgency');
    expect(ids).toContain('account_threat');
    expect(ids).toContain('login_link_bait');
  });

  it('gift-card support scam', () => {
    const msg =
      'This is your IT department. Please buy a $200 gift card immediately and send us the verification code from the SMS we sent.';
    const ids = firedIds(msg);
    expect(ids).toContain('gift_card_rail');
    expect(ids).toContain('otp_ask');
    expect(ids).toContain('urgency');
  });

  it('credential ask with deadline', () => {
    const msg =
      'Verify your account here before the end of the day. Reply with your password and CVV to avoid suspension.';
    const ids = firedIds(msg);
    expect(ids).toContain('credential_ask');
    expect(ids).toContain('deadline_clock');
    expect(ids).toContain('account_threat');
  });

  it('advance-fee 419 letter', () => {
    const msg =
      'I am a barrister handling a large estate. Pay a small processing fee to receive your inheritance of $4.5 million via wire transfer.';
    const ids = firedIds(msg);
    expect(ids).toContain('advance_fee');
    expect(ids).toContain('p2p_transfer');
  });
});

describe('punycode and homograph detection', () => {
  it('punycode IDN lookalike fires the punycode flag', () => {
    const msg = 'Log in to your account at https://xn--80ak6aa92e.com to keep it active.';
    const ids = firedIds(msg);
    expect(ids).toContain('punycode');
  });

  it('a normal domain does NOT fire punycode', () => {
    const msg = 'Read more at https://example.com/security for details.';
    expect(firedIds(msg)).not.toContain('punycode');
  });

  it('mixed Latin/Cyrillic homograph domain fires the homograph flag', () => {
    // "аррӏе" — the leading "а" is Cyrillic, fused with Latin letters in one token.
    const msg = 'Confirm your details at аpple.com right away.';
    const ids = firedIds(msg);
    expect(ids).toContain('homograph');
  });

  it('a pure-Latin domain does NOT fire homograph', () => {
    const msg = 'Confirm your details at apple.com right away.';
    expect(firedIds(msg)).not.toContain('homograph');
  });
});

describe('url shortener detection', () => {
  it('a bit.ly link fires the shortener flag', () => {
    expect(firedIds('Check this out https://bit.ly/3xYz here')).toContain('url_shortener');
  });

  it('clck.ru fires the shortener flag', () => {
    expect(firedIds('Перейдите https://clck.ru/abc для входа')).toContain('url_shortener');
  });

  it('a regular domain that merely ends in a shortener-like string does not fire', () => {
    expect(firedIds('Visit our shop at mybit.lystore.com today')).not.toContain('url_shortener');
  });
});

describe('scoring → level mapping', () => {
  it('a single soft (severity-1) flag reads level 1', () => {
    // QR mention alone is severity 1.
    const res = analyze('Just scan this QR to continue.');
    expect(res.fired.map((f) => f.id)).toEqual(['qr_code']);
    expect(res.level).toBe(1);
  });

  it('a dense multi-signal phish saturates near the top of the meter', () => {
    const msg =
      'URGENT: bank security here. Your account will be suspended. Confirm your identity via the link and tell us the one-time code from the SMS. Move your funds to a safe account now. Do not tell anyone.';
    const res = analyze(msg);
    expect(res.level).toBeGreaterThanOrEqual(4);
  });

  it('level never exceeds 5', () => {
    const msg =
      'urgent immediately password cvv otp verification code safe account bitcoin gift card wire transfer you won lottery guaranteed return scan qr expires today never tell anyone account blocked log in via the link pay a fee to release bit.ly/x';
    expect(analyze(msg).level).toBe(5);
  });
});

describe('analysis is a pure read', () => {
  it('does not mutate the input string', () => {
    const input = 'Срочно назовите код из СМС';
    const copy = input;
    analyze(input);
    expect(input).toBe(copy);
  });

  it('fired flags are typed RedFlag objects with stable ids', () => {
    const fired: RedFlag[] = analyze('You won the lottery!').fired;
    expect(fired.every((f) => typeof f.id === 'string')).toBe(true);
  });
});
