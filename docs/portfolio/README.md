# DiScammer portfolio evidence guide

## Purpose

This directory makes the DiScammer admissions case study reviewable without
turning portfolio storytelling into untestable marketing. The public bilingual
dossier is available at `/en/portfolio` and `/ru/portfolio`; this directory is
the repository evidence behind it. Wave 1 also records the static primary
sources behind each public safety guide.

DiScammer is Foma Molchanov's university-portfolio project. The repository can
show what software exists and which technical checks ran. It cannot prove that
a visitor learned more, that a completion record is a credential, or that a
particular person performed a contribution unless that person reviews the
statement.

## What belongs where

| Artifact | Role | Audience |
| --- | --- | --- |
| Public Portfolio page | Concise problem, product, process, evidence, limits, and Foma-reviewed authorship/tooling disclosure | Admissions reader |
| `CLAIM_LEDGER.md` | Source locations, corrected wording, unresolved claims, and release checks | Contributors and reviewers |
| `WAVE0_BASELINE.md` | Initial revision, validation baseline, scope, and completion gate | Contributors and reviewers |
| `WAVE1_BASELINE.md` | Evidence-and-editorial-integrity scope, source-catalogue gate, and Foma's final draft-approval step | Contributors and reviewers |
| `content/provenance/guide-sources.json` | Static official source list, per-source catalogue-entry date, scope, and bilingual source notes for every public guide | Contributors, reviewers, and guide readers |
| `PROJECT.md` | Current technical overview, architecture, commands, status vocabulary, and documentation authority | Contributors and technical reviewers |
| `PRODUCT.md` / `DESIGN.md` | Current product and visual intent | Designers and contributors |

## Evidence standard

Every portfolio statement must be identifiable as one of the following:

| Statement type | Minimum evidence | Safe wording |
| --- | --- | --- |
| Implemented behavior | Source location plus an appropriate test or direct local check | "The repository implements ..." |
| Design decision | Foma's reviewed explanation plus a linked decision, prototype, or code change | "Foma chose ... because ..." |
| Technical validation | Named command, date, revision, and result | "On revision X, the test suite passed ..." |
| User research or outcome | Consent, protocol, participant context, method, raw/aggregated findings, and limits | "In a small exploratory study ..." |

Never substitute a code test for a user study, a visual identifier for a
verifier, a local browser value for a hosted record, or an internal review for
external validation.

## Author and tooling disclosure

Before an application is submitted, Foma should review the public dossier and
make each of these points specific in his own words:

1. The problem he chose to address and why it mattered to him.
2. The concrete product, design, engineering, writing, research, and QA work
   he personally performed.
3. The iterations, rejected approaches, mistakes, and trade-offs that changed
   the result.
4. Every material mentor, collaborator, library, design asset, AI-assisted
   tool, or generated artifact, together with how it was used and what Foma
   checked or changed himself.
5. The limits of the project: no user-outcome study yet, no verified
   credential, no claim of real-time threat intelligence, and no claim that
   browser-local progress is an account.

The public page should name assistance without pretending it did not exist, but
it must not list an assistant as the project author or hide Foma behind a
fictional organisation. Do not invent a biography, a motivation story,
contribution percentages, or research results to complete this checklist.

## Product-truth release checklist

- [ ] Review every changed public EN string against the claim ledger.
- [ ] Confirm the matching Russian wording and run the locale audit.
- [ ] Search for old credential, proctoring, verification, newsletter-cadence,
  six-module, or absolute no-data wording.
- [ ] Confirm every guide source resolves to a suitable primary source and that
  its source scope does not imply live intelligence or local legal coverage.
- [ ] Confirm that the Portfolio page distinguishes implementation evidence
  from Foma's reviewed first-person account; replace or approve the temporary
  first-person draft before an application uses it.
- [ ] Check desktop and mobile Portfolio, About, Course, and local-record flows
  in both languages.
- [ ] Record the exact revision and validation results in the release report.

## Authority and update rule

When the public dossier, a portfolio document, and code disagree, executable
code and tests win. `PRODUCT.md` and `DESIGN.md` then govern intent;
`CLAIM_LEDGER.md` governs public-claim limits. Historical design plans, old
screenshots, and prior PDFs provide context only.

Update this guide and regenerate `PROJECT.pdf` whenever the product surface,
claim ledger, architecture, or evidence status changes materially. A document
marked `implemented` describes code in the repository; it must not be promoted
to `production verified` without a dated check of the deployed site.
