# DiScammer Wave 0–3 — Claim Ledger

**Status:** active source for the Wave 0 Product Truth Gate, Wave 1 evidence
work, Wave 2 message-action guidance, and Wave 3 link-action guidance
**Last reviewed:** 2026-07-13
**Scope:** public product, course, privacy, and portfolio claims audited during
Wave 0. This is not evidence of educational efficacy, security certification,
or institutional endorsement.

## How to read this ledger

| Status | Meaning |
| --- | --- |
| `corrected` | Public wording now matches an implemented capability and its limits. |
| `removed` | The claim has been removed because DiScammer cannot substantiate it. |
| `in progress` | A named Wave 0 owner must correct it before release. It is deliberately retained here rather than hidden. |
| `unresolved` | The claim needs evidence, a product decision, or removal in a later wave. |

### Evidence standard

A public claim is `corrected` only when its wording has been checked against
the current code or a named primary source. A local browser state is not an
issued credential; an internal review is not user research; and a visual
identifier is not a verifier. No claim below implies that users became harder
to scam, that a learner's identity was checked, or that a result was assessed
by DiScammer.

## Product-truth claims

| ID | Source location | Former phrasing or implication | Current wording / status | Evidence and limitation | Owner |
| --- | --- | --- | --- | --- | --- |
| PT-01 | `backend/seed_data.py`, `COURSE_MODULES[final-assessment].translations.en` | “Final Assessment & Certification”; “40-question **proctored** exam plus three scenario-based simulations.” | `corrected` — “Final Practice & Local Completion Record”; a 40-question self-assessment and one capstone scenario, completed at the learner's own pace. | The module has 40 questions and one `capstone-simulation` lesson. There is no timer, proctoring flow, identity check, server-side attempt record, or three separate scenario lessons. | Truth Gate / content lane |
| PT-02 | `backend/seed_data.py`, `COURSE_MODULES[final-assessment].translations.ru` | “Итоговая аттестация и сертификат”; “Экзамен … плюс три сценарных симуляции.” | `corrected` — Russian wording now matches the same self-assessment, one-scenario, local-record implementation. | RU and EN have the same module structure, topic count, objectives, and limitations. | Truth Gate / content lane |
| PT-03 | `backend/seed_data.py`, final-assessment objectives (EN/RU) | Passing within a time limit earns a DiScammer Defender certificate shareable to LinkedIn. | `removed` — the objectives describe a self-assessment, self-paced scenario practice, and a printable local record. | The application has no issuer identity, LinkedIn integration, verifier, signing service, or evidence that a learner completed work independently. | Truth Gate / content lane |
| PT-04 | `backend/seed_data.py`, final-assessment module body (EN/RU) | Passing “earned the certification.” | `corrected` — completing checkpoints can create a personal browser-local record; it is not a verified credential or proof of competence. | `ExamWidget` and `CertificateWidget` only read/write browser `localStorage`. | Truth Gate / content lane |
| PT-05 | `content/course/final-assessment/final-exam.en.json` | “Final exam”; knowledge applied “under timed conditions”; passing result “recorded” for a certificate. | `corrected` — “Final self-assessment”; untimed, unproctored, unmonitored, and not independently verified. | The component presents 40 sequential multiple-choice questions and has no clock or network request for results. A passing result is local browser state only. | Truth Gate / content lane |
| PT-06 | `content/course/final-assessment/final-exam.ru.json` | “Финальный экзамен”; the result is saved for a certificate page. | `corrected` — Russian self-assessment copy states the same no-proctor, no-external-record limitation. | RU questions are paired with EN questions; the shared widget has the same local-only behavior. | Truth Gate / content lane |
| PT-07 | `content/course/final-assessment/defender-certificate.en.json` | “DiScammer Defender certificate”; a result users could place on a CV or LinkedIn. | `corrected` — “DiScammer Defender local completion record.” The content explicitly says it is not a proctored result, verified credential, proof of identity, or proof of competence. | The record is produced in the browser from locally marked lessons and a local passing result. Clearing browser storage can remove it. | Truth Gate / content lane |
| PT-08 | `content/course/final-assessment/defender-certificate.ru.json` | “Сертификат DiScammer Defender”; a result suitable for a résumé or LinkedIn. | `corrected` — Russian local-completion-record copy has the same explicit limits. | RU/EN parity was checked at the source-file level; neither variant asserts external verification or shareability as a credential. | Truth Gate / content lane |
| PT-09 | `frontend/src/components/CertificateWidget.tsx` | A `DSC-…` “verification code”, “operator code”, issuing-officer signature, and DCM authority block made a local record look institutionally issued and verifiable. | `removed` — the component now displays only the learner-entered name, local assessment date, and local score. | Previous values were deterministic display strings made from `localStorage`, not signed or verifiable data. The revised component intentionally has no issuer, verifier, or authority marker. | Truth Gate / frontend lane |
| PT-10 | `frontend/src/components/ExamWidget.tsx` and `frontend/src/components/CertificateWidget.tsx` | “Recorded result” could be read as a persistent DiScammer result. | `corrected` — course copy specifies a browser-local passing result used for a personal record. | `ExamWidget` writes `{ passed, score, total, passedAt }` to `discammer:exam:v1` in `localStorage`; `CertificateWidget` reads that key and lesson progress. Neither component sends the result to an application API. | Truth Gate / frontend lane |
| PT-11 | `frontend/src/utils/progress.ts` | A browser-local record might be mistaken for a central account or permanent transcript. | `corrected` — public copy says “in this browser” and warns that clearing storage or changing device may remove the record. | The optional local dossier export/import is user-initiated browser data portability, not a DiScammer account or hosted transcript. | Truth Gate / frontend lane |
| PT-12 | `backend/locales/en.json`, `backend/locales/ru.json`, `client.cert` keys | “Clearance granted”, “certificate of clearance”, “issuing officer”, and “verification code” framed the local record as institutional certification. | `corrected` — the UI now calls it a local completion record, names its browser-local scope, and has no issuer, verifier, authority, or identifier fields. | `CertificateWidget` and both locale files were checked together. EN/RU locale-key parity passes. | Admissions case-study / locales lane |
| PT-13 | `content/provenance/guide-sources.json`, guide Markdown, guide API and template | Pseudo-precise operational facts and statistics could appear as researched threat intelligence without source, jurisdiction, or review date. | `corrected` — every guide has one to three named official primary-source links, authored RU/EN source labels and scope; unsupported named stories and pseudo-specific claims were removed or marked illustrative. | The 2026-07-13 static catalogue has 10 guide entries and 12 links from FTC, FBI, CISA, and Investor.gov; each source record displays its catalogue-entry date. It supports general safety guidance, not a live feed, a case record, a recurring review promise, or a check of a reader's particular message. | Wave 1 evidence lane |
| PT-14 | `backend/locales/en.json`, `backend/locales/ru.json`, privacy copy | “No data collection beyond language” read as an absolute guarantee. | `corrected` — copy distinguishes browser-local checker input from normal operational access and privacy-scrubbed error logging. | Analyzer input and course progress remain local-first; the wording no longer promises that no technical service data exists. | Admissions case-study / privacy lane |
| PT-15 | `backend/locales/en.json`, `backend/locales/ru.json`, course/home copy | “Six modules” or an equivalent stale course count. | `corrected` — public copy uses nine modules or derives the count from current course data. | `COURSE_MODULES` contains nine ordered modules, and the localized home route supplies its live total. | Admissions case-study / locales lane |
| PT-16 | `backend/locales/en.json`, `backend/locales/ru.json`, newsletter copy | An implied regular or weekly newsletter publication schedule. | `corrected` — cadence language was removed; the product describes briefings and a journal archive instead. | The repository contains a finite newsletter archive and no subscription/delivery system. | Admissions case-study / locales lane |
| PT-17 | `backend/templates/about.html`, `backend/templates/portfolio.html`, `backend/locales/{en,ru}.json` | “Built by the operators / DCM-OPS” obscured the author and could imply an organization that issued records. | `unresolved` — About identifies Foma Molchanov and links to a bilingual public dossier that separates implemented facts from the authorship and tooling account Foma must confirm. | The dossier intentionally asks Foma to confirm detailed personal-contribution and tool-use wording before an application submission; the repository cannot attest to those personal facts. | Admissions case-study / About lane |
| PT-18 | All public product and portfolio pages | A reader could infer user testing, improved scam-recognition outcomes, or educational efficacy. | `unresolved` — no such claim may be introduced in Wave 0. A future claim requires a documented study protocol, consent, participant context, and appropriately limited findings. | This repository contains technical tests, not a user-research study or outcome dataset. | Future Scenario Lab / research lane |
| PT-19 | `backend/templates/guide.html`, guide locale strings | Case-file labels, an “ACTIVE” status, “LAST_REVIEWED”, and investigator language could make a static educational page look like a current operational dossier. | `corrected` — guide pages show a stable guide reference, source count, catalogue date, educational pattern notes, and an editorial-scope footer. | The source catalogue date is a repository catalogue date, not a live-status timestamp or promise of ongoing review. The page states the limit next to its sources. | Wave 1 presentation lane |
| PT-20 | `frontend/src/components/{MessageAnalyzer,LinkInspector,IncidentActionWizard}.tsx`, `backend/templates/{check,inspect}.html`, locale copy | A post-check action panel could be mistaken for incident reporting, case verification, recovery service, or a reason to submit sensitive details. | `corrected` — Waves 2–3 provide only local, educational next steps on both message and link checks. The guide never receives a pasted message or link, hostname, finding, or risk result; it does not file a report, verify an incident, recover funds, promise an outcome, or ask for passwords, card details, or recovery codes. | The interactive guide accepts only locale plus a fixed surface label, keeps selections in page memory, and has no network or storage API. Each SSR fallback gives the same bounded guidance when JavaScript or an island fails: stop interacting, use a trusted channel, protect an affected account or payment path, do not open a downloaded file, and involve someone trusted. Browser tests cover clean and flagged results, keyboard use, fallback restoration, and non-transmission of fixture text or links; EN/RU locale parity is audited. | Waves 2–3 incident-action lane |

## Product decisions that leave a claim unchanged

A declined or deferred feature is not a claim change. This section records such
decisions so a later reader can see that the wording above was re-checked
against them and deliberately left alone.

| Date | Decision | Effect on this ledger |
| --- | --- | --- |
| 2026-07-15 | `FEATURE_PLAN.md` UX-6 — an opt-in, server-side LLM analysis of a pasted message — was **declined** by the owner, not deferred and not built. | **No claim changes, and no new claim.** PT-14 and PT-20 are recorded against a checker and inspector whose input is analyzed in the browser. Declining UX-6 means no server-side path for user message text is introduced, so both entries remain accurate exactly as written. Their wording is unchanged here — not weakened, not strengthened, and not extended into a broader privacy promise than PT-14 already permits. If an opt-in transmission feature is ever reconsidered, it requires a new ledger entry and corrected public wording **before** release, not a footnote to an existing claim. |

## Release checks for this ledger

- [x] The final module, self-assessment, and local-record lesson use matching
  EN/RU terminology and limitations.
- [x] The final module names one implemented capstone scenario, not three.
- [x] The local-record UI contains no fabricated verification identifier,
  issuing officer, or authority block.
- [x] PT-12 through PT-16 were independently checked after the other Wave 0
  lanes finished their files.
- [x] PT-13 is backed by a checked-in source catalogue that covers all ten
  public guide slugs and keeps its public source labels in RU/EN parity.
- [x] PT-19 removes static guide language that implied an active case or a
  recurring review process.
- [x] PT-20 keeps incident-action choices local to the current page on both
  message and link checks, and does not turn either checker into reporting,
  case verification, or a recovery service.
- [ ] PT-17 requires Foma's final review of his personal-contribution and
  tooling disclosure before an admissions submission.
- [x] A final repository search found no public claim of proctoring,
  third-party verification, shareable credential status, or a persistent
  DiScammer learner record. References to verification in learning examples
  describe a scam signal, not a DiScammer credential.

## Deferred evidence work

Wave 0–1 deliberately do **not** manufacture metrics, testimonials, research
results, security certification, institutional endorsement, or a live
intelligence service. Any future admissions case study should separate:

1. implemented technical facts (with files, tests, and dates);
2. Foma Molchanov's own design and engineering contribution (with his review);
3. user research or learning outcomes (only after a real, consented study).
