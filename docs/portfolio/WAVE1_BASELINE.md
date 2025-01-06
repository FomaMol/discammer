# Wave 1 baseline: evidence and editorial integrity

**Recorded:** 2026-07-13
**Working branch:** `codex/discammer-v6-wave0-truth-foundation`
**Starting state:** Wave 0 is implemented in the working tree and locally
verified, but intentionally not committed or published.

## Purpose

Wave 1 makes DiScammer's safety guidance easier to inspect without pretending
that it is a live threat-intelligence service. Its output is a source catalogue
for the ten public scam guides, a source-backed guide presentation, a clear
scope note for educational material, and a reviewable data path from repository
content to the public page and API.

It also adds a provisional first-person admissions draft for Foma Molchanov.
The draft is a writing aid prepared while Foma is unavailable, not a signed
statement of authorship. It must be reviewed, corrected, and approved by Foma
before an application uses it.

## Non-goals

- No real-time fraud feed, claim of current operational intelligence, or
  invented review cadence.
- No user research, outcome metrics, external security audit, or credential.
- No server collection of checker input, user accounts, deployment, push, or
  pull request.
- No assertion that a source validates every historical example in a legacy
  guide. Unsupported examples are removed or clearly marked illustrative.

## Baseline carried forward from Wave 0

| Check | Result |
| --- | --- |
| Backend suite | 110 passed, one Starlette deprecation warning |
| Frontend suite | 101 passed |
| Production frontend build | passed |
| Locale audit | 929 leaves, 0 dead, 0 missing, EN/RU parity passed |
| Key visual routes | EN Portfolio and About desktop, RU Portfolio and Course mobile: 200, no console errors, no horizontal overflow |

## Completion gate

1. Every public guide has an inspectable, stable official source list with
   authored EN/RU labels and a scope note.
2. The data model fails safely for unknown or malformed catalogue entries.
3. Guide pages make the educational/source boundary understandable without
   changing the Field Office reading experience or accessibility baseline.
4. RU/EN parity, content checks, backend/frontend tests, production build, and
   visual checks pass after an independent review.
5. Foma reviews the first-person draft as a final external admissions step.

## Implementation record

Wave 1 adds a static source catalogue at
`content/provenance/guide-sources.json`. It covers all ten public guide slugs
with twelve dated, direct official primary-source entries from FTC, FBI, CISA,
and Investor.gov. Each source has authored EN/RU title and scope-note fields;
each guide has an authored EN/RU scope note. The source-entry date records when
DiScammer entered the link into its catalogue. It is not a claim that a source
or a guide is continuously verified.

The seeding path rejects a missing, malformed, incomplete, or locale-incomplete
catalogue before committing any reseed. The source list is then exposed through
the guide API and the server-rendered guide page. The public presentation now
uses guide references, a source count, a catalogue date, educational pattern
notes, and a source-and-scope section; it no longer frames a static guide as an
active case file or a periodically reviewed investigation.

All twenty guide Markdown files were edited to remove unsupported named
incidents, sums, regional attributions, and pseudo-statistics. The replacement
scenarios are explicitly labelled illustrative rather than reported cases.

The Portfolio page now includes a temporary first-person draft in Foma's voice.
It is visually and verbally labelled as a writing aid prepared while Foma was
unavailable. It remains a required final review/replacement step, not evidence
of Foma's approved testimony.

## Local completion evidence

| Check | Result |
| --- | --- |
| Backend suite | 113 passed; one Starlette/httpx deprecation warning |
| Frontend suite | 101 passed |
| Production frontend build | passed |
| Locale audit | 939 leaves, 0 dead, 0 missing, EN/RU parity passed |
| Provenance/content audit | 10 guide slugs, 12 dated source entries; no legacy pseudo-case markers |
| Visual review | EN guide and Portfolio desktop; RU guide and Portfolio mobile: 200, no console errors, no horizontal overflow |
| Independent review | One P2 gap (per-source date and strict validation) found, fixed, and re-reviewed with no remaining P0/P1/P2 findings |

## Final external step

Before an admissions submission, Foma must personally review, replace where
needed, and approve every first-person sentence in the public Portfolio dossier.
He must also make the personal motivation, exact contribution, mentor/tool/AI
disclosure, and any claimed iteration history specific in his own words.
