import { describe, expect, it } from 'vitest';
import { GUIDE_QUIZZES, OPTION_KEYS, scoreQuiz } from './quizzes';

/**
 * The quiz pack is pure data consumed by the KnowledgeCheck island. These tests
 * pin the two invariants that matter outside the browser: (1) every seeded guide
 * has a well-formed quiz, and (2) the scoring helper counts correct answers the
 * way the island and the dossier expect.
 */

// The 10 seeded guide slugs the orchestrator pinned — quizzes.ts must cover all.
const SEEDED_SLUGS = [
  'abuse-on-dating-sites',
  'fake-online-stores',
  'false-charities',
  'fraud-with-lotteries',
  'get-rich-quick-schemes',
  'investment-pyramids',
  'nigerian-letters',
  'phishing',
  'scam-sites-working-at-home',
  'sms-and-phone-scams',
];

describe('GUIDE_QUIZZES coverage + shape', () => {
  it('covers every seeded guide slug', () => {
    expect(Object.keys(GUIDE_QUIZZES).sort()).toEqual([...SEEDED_SLUGS].sort());
  });

  it('gives each guide 3–5 single-best-answer questions with a valid correct index', () => {
    for (const [slug, quiz] of Object.entries(GUIDE_QUIZZES)) {
      expect(quiz.slug).toBe(slug);
      expect(quiz.questions.length).toBeGreaterThanOrEqual(3);
      expect(quiz.questions.length).toBeLessThanOrEqual(5);
      const ids = new Set<string>();
      for (const q of quiz.questions) {
        // unique, non-empty id (used in the i18n key path + as a React key)
        expect(q.id).toBeTruthy();
        expect(ids.has(q.id)).toBe(false);
        ids.add(q.id);
        // correct index points at a real option slot
        expect(q.correct).toBeGreaterThanOrEqual(0);
        expect(q.correct).toBeLessThan(OPTION_KEYS.length);
      }
    }
  });
});

describe('scoreQuiz', () => {
  const fixture = {
    slug: 'fixture',
    questions: [
      { id: 'q1', correct: 0 },
      { id: 'q2', correct: 2 },
      { id: 'q3', correct: 1 },
    ],
  };

  it('scores a fully-correct attempt as bestOf', () => {
    expect(scoreQuiz(fixture, [0, 2, 1])).toBe(3);
  });

  it('scores a partially-correct attempt', () => {
    // q1 right, q2 wrong, q3 right → 2 of 3
    expect(scoreQuiz(fixture, [0, 0, 1])).toBe(2);
  });

  it('counts unanswered (null) questions as wrong', () => {
    expect(scoreQuiz(fixture, [0, null, null])).toBe(1);
  });

  it('scores a fully-wrong attempt as zero', () => {
    expect(scoreQuiz(fixture, [1, 1, 0])).toBe(0);
  });
});
