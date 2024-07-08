/**
 * Per-guide knowledge-check pack (Task F1).
 *
 * Each seeded threat-guide slug maps to a short, single-best-answer quiz drawn
 * FROM that guide's own content — recall beats re-reading. The structure here is
 * pure DATA: question ids, the index of the correct option, and how many options
 * each question has. NO copy lives here. The human-readable prompt, options, and
 * "tell" (the explanation shown for a missed question) are authored per locale in
 * backend/locales/{en,ru}.json under:
 *
 *   client.quiz.guides.<slug>.<qid>.{ prompt, opt_a, opt_b, opt_c, tell }
 *
 * The KnowledgeCheck island resolves those keys at render time via the translator,
 * so both languages are authored (not machine-translated) and stay in en==ru
 * parity. Because the full key is built dynamically from the slug + qid, the i18n
 * audit's literal scanner can't see them — every leaf key is listed in
 * scripts/i18n_allowlist.txt instead.
 *
 * Every question uses a fixed three-option layout (opt_a / opt_b / opt_c) so the
 * locale key tree is uniform across all guides. `correct` is the 0-based index of
 * the single best answer. No trick questions: each scenario has one clear tell.
 */

/** Fixed option slots — one set of i18n key suffixes for every question. */
export const OPTION_KEYS = ['opt_a', 'opt_b', 'opt_c'] as const;

export interface QuizQuestion {
  /** Stable id, used in the i18n key path and as a React key. */
  id: string;
  /** 0-based index into OPTION_KEYS of the single best answer. */
  correct: number;
}

export interface GuideQuiz {
  slug: string;
  questions: QuizQuestion[];
}

/**
 * The pack, keyed by seeded guide slug. All 10 seeded guides are covered with
 * 3–5 questions each. Keep `correct` in sync with the authored options in the
 * locale files (opt_a = 0, opt_b = 1, opt_c = 2).
 */
export const GUIDE_QUIZZES: Record<string, GuideQuiz> = {
  phishing: {
    slug: 'phishing',
    questions: [
      // "Urgent Security Update" bank email with a login link → don't click; go direct.
      { id: 'q1', correct: 1 },
      // Banks don't ask for personal details by email.
      { id: 'q2', correct: 2 },
      // Verifying a site: check https + the actual domain, not just the logo.
      { id: 'q3', correct: 0 },
    ],
  },
  'sms-and-phone-scams': {
    slug: 'sms-and-phone-scams',
    questions: [
      // Smishing "URGENT: suspicious transaction, verify here" → don't tap, call the bank.
      { id: 'q1', correct: 1 },
      // Caller ID can be spoofed — it is not proof of who is calling.
      { id: 'q2', correct: 0 },
      // One-ring callback → premium-rate trap; don't call back unknown numbers.
      { id: 'q3', correct: 2 },
    ],
  },
  'fake-online-stores': {
    slug: 'fake-online-stores',
    questions: [
      // 70%-off designer goods, bank-transfer-only, no tracking → fake store.
      { id: 'q1', correct: 0 },
      // Use a payment method with buyer protection (card), not irreversible transfer.
      { id: 'q2', correct: 1 },
      // HTTPS padlock alone doesn't prove the store is legitimate.
      { id: 'q3', correct: 2 },
    ],
  },
  'abuse-on-dating-sites': {
    slug: 'abuse-on-dating-sites',
    questions: [
      // Months of chat, never meets, then an "emergency" money ask → romance scam.
      { id: 'q1', correct: 1 },
      // The clearest red flag is a request for money from someone never met.
      { id: 'q2', correct: 0 },
      // Reverse-image search the profile photos to catch a reused fake identity.
      { id: 'q3', correct: 2 },
    ],
  },
  'investment-pyramids': {
    slug: 'investment-pyramids',
    questions: [
      // Returns come from new recruits, not real profit → Ponzi/pyramid.
      { id: 'q1', correct: 0 },
      // "Guaranteed" high returns far above market = a fraud signal.
      { id: 'q2', correct: 1 },
      // Pay depends on recruiting more people → pyramid structure.
      { id: 'q3', correct: 2 },
    ],
  },
  'get-rich-quick-schemes': {
    slug: 'get-rich-quick-schemes',
    questions: [
      // Double-your-money + limited-time pressure → classic get-rich-quick scam.
      { id: 'q1', correct: 1 },
      // Early small payouts funded by newer investors create a false sense of safety.
      { id: 'q2', correct: 0 },
      // If they can't explain how the profit is generated, walk away.
      { id: 'q3', correct: 2 },
    ],
  },
  'nigerian-letters': {
    slug: 'nigerian-letters',
    questions: [
      // Stranger needs help moving a fortune, offers a cut → 419 advance-fee scam.
      { id: 'q1', correct: 0 },
      // Never pay fees/taxes/bribes to "release" money you were promised.
      { id: 'q2', correct: 1 },
      // Official seals and documents are easy to fake; they prove nothing.
      { id: 'q3', correct: 2 },
    ],
  },
  'fraud-with-lotteries': {
    slug: 'fraud-with-lotteries',
    questions: [
      // "You won" a draw you never entered → unsolicited-win scam.
      { id: 'q1', correct: 1 },
      // A real prize never requires an upfront fee or tax to claim.
      { id: 'q2', correct: 0 },
      // Verify through the org's own official channel, not the number in the message.
      { id: 'q3', correct: 2 },
    ],
  },
  'false-charities': {
    slug: 'false-charities',
    questions: [
      // Disaster appeal, emotional urgency, untraceable rails → fake-charity warning.
      { id: 'q1', correct: 0 },
      // Verify the org in an official charity registry before donating.
      { id: 'q2', correct: 1 },
      // Real charities publish reports; refusal to say where money goes is the tell.
      { id: 'q3', correct: 2 },
    ],
  },
  'scam-sites-working-at-home': {
    slug: 'scam-sites-working-at-home',
    questions: [
      // "Pay a registration fee to access jobs" → work-from-home scam.
      { id: 'q1', correct: 1 },
      // A legitimate employer never charges you to start working.
      { id: 'q2', correct: 0 },
      // No verifiable address/contact + only an email → a major warning sign.
      { id: 'q3', correct: 2 },
    ],
  },
};

/** Every seeded guide slug, exported so the audit/tests can assert full coverage. */
export const QUIZ_GUIDE_SLUGS = Object.keys(GUIDE_QUIZZES);

/**
 * Score a guide quiz. `answers[i]` is the option index the user picked for
 * `quiz.questions[i]` (or null/undefined when unanswered). Returns the count of
 * correctly-answered questions. Pure, side-effect-free.
 */
export function scoreQuiz(quiz: GuideQuiz, answers: ReadonlyArray<number | null>): number {
  return quiz.questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0),
    0,
  );
}
