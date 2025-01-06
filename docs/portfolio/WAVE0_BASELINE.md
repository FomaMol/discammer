# Wave 0 baseline: admissions dossier and product truth

**Recorded:** 2026-07-13
**Starting revision:** `e44ac54`
**Implementation branch:** `codex/discammer-v6-wave0-truth-foundation`

## Scope

Wave 0 makes the project legible and truthful before any new growth feature is
added. The deliverables are a public bilingual project dossier for Foma
Molchanov, an authorship and tooling disclosure, an auditable claim ledger,
honest course and completion-record language, and current contributor/project
documentation.

This wave does not add user accounts, server-side progress, external credential
verification, analytics, deployment changes, or invented user-study results.

## Working-tree protection

At the start of the wave, the branch had no tracked modifications. Two
untracked paths already existed:

- `.agents/`, a local skill collection. It is excluded from Wave 0 changes.
- `AGENTS.md`, an outdated contributor guide. It is in scope because the wave
  explicitly requires current contributor documentation; only that file is
  updated.

## Verified baseline

| Check | Result |
| --- | --- |
| Backend test suite | 104 passed, one Starlette deprecation warning |
| Frontend unit suite | 101 passed |
| Frontend production build | passed in an isolated copy of `frontend/` |
| Locale audit | 895 locale leaves, no dead or missing keys, EN/RU parity passed |
| Product design authority | `PRODUCT.md` and `DESIGN.md` |

The backend tests require `httpx` in addition to `requirements.txt` because
FastAPI's test client imports it. This is a test-environment dependency gap, not
a production runtime claim.

## Truth gaps addressed by this wave

1. The public product must identify Foma Molchanov and distinguish his work,
   mentor support, and tooling assistance.
2. A local completion record must not be described as proctored, externally
   verifiable, server-issued, or shareable as a credential.
3. The course has nine modules. Public copy must not say six modules.
4. The journal is an archive, not a demonstrated weekly publication service.
5. The product must not claim that no data exists beyond language preference
   when operational access logs and privacy-scrubbed error reporting exist.
6. Product and contributor documents must describe hashed frontend assets,
   actual tests, current routes, and the current Field Office design authority.

## Completion gate

Wave 0 is complete only when the public EN and RU dossier routes render, the
claim ledger names each changed or unresolved claim, the PDF and contributor
documents match current implementation, and the same validation set passes
again after independent review.
