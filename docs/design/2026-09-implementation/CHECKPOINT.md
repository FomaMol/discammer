# Implementation checkpoint — 2026-09-10

This is a locally verified redesign candidate, not a production release.

## Implemented

P1 imports the supplied Antifraud build byte-for-byte, verifies real LFS files and Brotli delivery, and retains the former game for rollback. P2–P5 preserve the existing composition and fonts with default soft-red and persisted graphite-silver roles, compact theme controls, responsive navigation, all authored RU/EN surfaces, SSR fallbacks, local message/link processing and progress. Assets, video controls, PDF/PNG exports, offline/PWA and all 67 OG PNGs follow the system.

Per the owner's final screenshot feedback, removed the WebGL-preview caption in both languages, decorative SYS status, and editorial TODO/owner-review copy. Unapproved first-person portfolio prose moved as a whole to `docs/portfolio/editorial-notes-2026-09.md`; actual attribution and educational/privacy limits remain.

## Local evidence

- Backend final: 285 passed; one upstream Starlette/httpx deprecation warning.
- Frontend: 199 passed; production build passed and repeated build has zero diff against committed `backend/static`.
- i18n: 1,020 matching leaves, zero missing/dead keys.
- Full Chromium run: 131 passed, one obsolete status-dot assertion failed after the requested footer removal; updated it to verify removal while retaining infinite-animation and static-canvas assertions, then that test passed. Total current scenarios: 132. 45 opt-in/environment-specific cases were skipped in the ordinary suite; separate captures below exercise visual/matrix cases.
- Full surface matrix: 280 route/theme/language/viewport combinations passed (320, 390, 768, 1366, 1440 widths), with no horizontal overflow or page errors. Screenshots in `evidence/`.
- Dedicated visual suite: 44 reviewed Darwin baselines regenerated and subsequent comparison 44 passed. Linux baselines remain unseeded; this does not claim a Linux visual gate.
- Real game launch/menu/tutorial and closure: Chromium, native Safari, mobile WebKit emulation. Physical Android/iOS hardware unavailable. See `../2026-09-redesign-plan/evidence/implementation/game-verification.md`.
- Print PDF: one page, complete synthetic Cyrillic name, white margins, explicit local/unverified record. OG repeat generation reproduced all 67 PNGs.
- Independent whole-branch review found and resolved invalid role-color alpha syntax and delayed mobile-hydration scroll lock; deterministic regression passed. No unresolved confirmed source defect. P6 also independently reviewed.
- Local performance sample: baseline LCP 172 ms / CLS .0241; redesign 132 ms / .0171. Decoded requested JS 176,996 vs 179,801 bytes (+1.6%, includes functional fallback improvements); appearance island is deferred to intent, no heavy appearance dependency. These are single unthrottled laboratory observations, not field INP or a demonstrated production speedup. No interaction crossed the 16 ms observer threshold in the final sample; this is not an INP claim.
- Local Docker daemon unavailable; image/CI checks still required remotely. Lighthouse run and remote CI status are tracked in the continuation below.

## Release prerequisites and continuation

Remote main was rechecked at `7167c9d7741e5926faf15752125c8d08cf9201ff`; candidate descends cleanly from it. Do not push main until the full release gate and operational prerequisites hold.

Current public production was observed at `8e8036e`, behind main. Existing CI deploy target requires reconciliation with the verified serving host; that host also lacks Git LFS. Concrete separate owner approval requested for correcting existing DEPLOY_HOST and installing only Ubuntu's git-lfs package. Neither action is authorized by the code-deploy grant alone. No new secrets, DNS, infrastructure, payment or production-data action performed.

P6 candidate: `../../ops/aws-migration-2026-09.md` and `../../../deploy/aws/`. Official price evidence, Terraform validate/mock safety test, synthetic SQLite WAL forward/reverse restore passed. Illustrative Frankfurt minimum $34.06/month excluding egress/tax; no authenticated AWS plan/apply. Account/access, region, budget and RPO/RTO remain unconfirmed. Real backup/media restore, final single-writer switch and reverse current-data recovery require approved execution. Beget paid-through date observed as 2026-09-11; media about 15 GiB are outside Git and the dated rescue ZIP.

## Final local Lighthouse and remote review

Lighthouse completed 12 runs (three per surface); all existing assertions passed. Median accessibility, best-practices and SEO are 100 for all four routes; performance 99/99/100/99 for home/check/inspect/guide. Median TBT is zero; CLS below .028. See `evidence/lighthouse-summary.json`. Local laboratory scores are not production measurements.

Draft PR: https://github.com/FomaMol/discammer/pull/6. Code and evidence pushed on `codex/september-redesign`. Main has not been updated and no release has been deployed. Current CI runs are visible on that PR; do not infer success from this checkpoint.
