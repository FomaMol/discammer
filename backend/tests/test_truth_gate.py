"""Regression checks for Wave 0's public product-truth boundary.

These assertions intentionally cover the values admissions readers can infer
from the course and completion-record surfaces. They keep future copy or data
edits from quietly turning a local, self-guided learning flow into a claimed
credential or changing its stated scope without updating the dossier.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import database
import seed_data


ROOT = Path(__file__).resolve().parents[2]
COURSE = ROOT / "content" / "course" / "final-assessment"
LOCALES = ROOT / "backend" / "locales"
CLAIM_LEDGER = ROOT / "docs" / "portfolio" / "CLAIM_LEDGER.md"
BACKUPS_DOC = ROOT / "docs" / "ops" / "backups.md"
RUNBOOK_DOC = ROOT / "docs" / "ops" / "runbook.md"
SYNC_TESTS = Path(__file__).resolve().parent / "test_sync.py"
PROGRESS_SYNC = ROOT / "frontend" / "src" / "components" / "ProgressSync.tsx"

# The ledger row covering UX-4's optional progress sync.
SYNC_CLAIM_ID = "PT-21"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _ledger_row(claim_id: str) -> str:
    """Return the ledger's table row for a claim id, or '' when it has none."""
    for line in CLAIM_LEDGER.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"| {claim_id} |"):
            return line
    return ""


def test_final_self_assessment_has_matching_40_question_80_percent_contract():
    en = _load_json(COURSE / "final-exam.en.json")
    ru = _load_json(COURSE / "final-exam.ru.json")

    for lesson in (en, ru):
        config = lesson["widget_config"]
        assert lesson["widget_type"] == "exam"
        assert len(config["questions"]) == 40
        assert config["passThreshold"] == 0.8

    assert "not proctored" in en["body_md"].lower()
    assert "independently verified" in en["body_md"].lower()
    assert "не прокторится" in ru["body_md"].lower()
    assert "независимую проверку" in ru["body_md"].lower()

    assert [q["question"] for q in en["widget_config"]["questions"]] != [
        q["question"] for q in ru["widget_config"]["questions"]
    ], "RU must remain authored rather than copied EN text"


def test_course_and_completion_record_keep_the_nine_module_local_scope():
    assert len(seed_data.COURSE_MODULES) == 9
    assert seed_data.COURSE_MODULES[-1]["slug"] == "final-assessment"

    en_record = _load_json(COURSE / "defender-certificate.en.json")
    ru_record = _load_json(COURSE / "defender-certificate.ru.json")
    for record in (en_record, ru_record):
        requirements = record["widget_config"]["requirements"]
        assert len(requirements) == 9
        assert requirements[-1]["module"] == "final-assessment"


def test_localized_completion_copy_does_not_claim_a_proctored_or_verified_credential():
    for language in ("en", "ru"):
        locale = _load_json(LOCALES / f"{language}.json")
        course_progress = locale["client"]["courseProgress"]
        cert = locale["client"]["cert"]
        record_copy = " ".join(
            [
                cert["locked_body"],
                cert["description"],
                course_progress["cert_body"],
            ]
        ).lower()

        # The completion UI must retain both its local-storage boundary and a
        # clear non-credential limitation in each language.
        if language == "en":
            assert "this browser" in record_copy
            assert "not a verified credential" in record_copy
        else:
            assert "этом браузере" in record_copy
            assert "не является проверяемым удостоверением" in record_copy


def test_sync_endpoints_and_their_ledger_entry_ship_together():
    """UX-4 gave user progress a home on the server, and the ledger is the
    authority on what we may say about that publicly. Binding this to main.py's
    source rather than to a date means the coupling holds in both directions: a
    future sync endpoint cannot ship without a claim, and the claim cannot
    outlive the endpoints it describes.
    """
    main_src = (ROOT / "backend" / "main.py").read_text(encoding="utf-8")
    endpoints_exist = "/api/sync/push" in main_src
    claim_exists = bool(_ledger_row(SYNC_CLAIM_ID))

    assert endpoints_exist == claim_exists, (
        f"/api/sync present={endpoints_exist} but ledger {SYNC_CLAIM_ID} "
        f"present={claim_exists} — the code and the public wording disagree"
    )


def test_sync_claim_rests_on_encryption_not_on_denying_what_it_stores():
    """The synced Dossier carries certName: a name the user typed, which is real
    PII, and which really is on the server. The claim is honest only because the
    server cannot read it — so the wording must rest on the encryption. A denial
    that we collect the name would be plainly false, and is the specific error
    this test exists to catch.
    """
    row = _ledger_row(SYNC_CLAIM_ID).lower()
    assert row, f"{SYNC_CLAIM_ID} is missing from the ledger"

    assert "certname" in row, "the claim must name the PII the blob carries"
    assert "cannot read" in row, "the claim must rest on the server's inability to read"

    for false_comfort in (
        "we do not collect",
        "no name is collected",
        "no personal data is sent",
        "no pii is sent",
        "no pii is stored",
    ):
        assert false_comfort not in row, (
            f"{SYNC_CLAIM_ID} denies collecting data it demonstrably stores: "
            f"{false_comfort!r}"
        )


def test_sync_claim_cites_evidence_that_exists_and_says_what_it_actually_pins():
    """The sibling test above checks the claim's *wording*; nothing checked its
    *evidence*, which is the column this ledger's own "How to read this ledger"
    makes the checkable basis for public copy. A citation to a test that does not
    exist is worse than no citation: it reads as verified and cannot be followed.

    Two failure modes, both of which the ledger had:
      * naming a test that no longer exists (the marker-grep test was dropped in
        f74726a as inverted — the marker IS in the DB by construction, so the
        only way to pass it was for the server to lose the user's data);
      * denying that the server decodes. It does: main.py b64decodes every push.
        What it never does is DECRYPT, and that distinction is the whole claim.
    """
    row = _ledger_row(SYNC_CLAIM_ID)
    assert row, f"{SYNC_CLAIM_ID} is missing from the ledger"

    sync_src = SYNC_TESTS.read_text(encoding="utf-8")
    # The (?!\.py) keeps the file the row names ("backend/tests/test_sync.py")
    # from being read as a citation of a test function called test_sync().
    cited = sorted(set(re.findall(r"\btest_[a-z0-9_]+\b(?!\.py)", row)))
    assert cited, (
        f"{SYNC_CLAIM_ID} cites no test by name — the evidence column has to be "
        "followable, not a gesture at a file"
    )
    for name in cited:
        assert f"def {name}(" in sync_src, (
            f"{SYNC_CLAIM_ID} cites {name}(), which does not exist in "
            f"{SYNC_TESTS.name}. The evidence column is the checkable basis for "
            "public wording; an unfollowable citation is a false one"
        )

    main_src = (ROOT / "backend" / "main.py").read_text(encoding="utf-8")
    assert "b64decode" in main_src, (
        "this test assumes the push handler base64-decodes the transport "
        "encoding; if that stopped being true, rewrite the claim, not the test"
    )
    lowered = row.lower()
    for false_denial in ("never decode", "does not decode", "cannot decode"):
        assert false_denial not in lowered, (
            f"{SYNC_CLAIM_ID} says the server {false_denial}s the blob, but "
            "main.py b64decodes every push. The server decodes the transport "
            "encoding and never DECRYPTS the payload — say that instead"
        )
    assert "decrypt" in lowered, (
        f"{SYNC_CLAIM_ID} must rest on what the server cannot do (decrypt), not "
        "on a denial of what it demonstrably does (decode)"
    )


def test_runbook_does_not_promise_a_recovery_push_the_ui_cannot_trigger():
    """A DB-loss incident sends an operator to this runbook, so what it says
    about recovery has to be true of the shipped UI, not of a plausible one.

    ProgressSync has no manual push control — spec §6.2 deliberately chose
    auto-push over a "save" button — so an already-linked learner cannot re-upload
    on demand: mount does not push, "Refresh from server" only pulls (404 after a
    loss), and re-entering the code cannot re-link because handleLinkExisting
    refuses to link on not-found. A re-push happens only as a side effect of new
    coursework, which the learner most likely to care about — one who finished —
    no longer has.
    """
    component = PROGRESS_SYNC.read_text(encoding="utf-8")
    has_manual_push = 'data-testid="sync-push"' in component
    runbook = RUNBOOK_DOC.read_text(encoding="utf-8").lower()

    if has_manual_push:
        return  # a push control now exists; the runbook may promise one

    assert "theirs to trigger" not in runbook, (
        "the runbook says a re-push is the learner's to trigger, but "
        "ProgressSync exposes no push control (testids: sync-refresh, "
        "sync-unlink, sync-erase). Nothing in the UI fires a push on demand"
    )
    assert "side effect" in runbook, (
        "the runbook must say a re-push happens only as a side effect of further "
        "coursework — that is the only thing that fires auto-push"
    )
    assert "re-link" in runbook, (
        "the runbook must say the re-link path is blocked once the blob is gone: "
        "handleLinkExisting refuses to link on not-found"
    )


def test_ops_docs_name_the_durable_user_state_the_database_now_holds():
    """Both ops docs described the DB as reseeded from git and therefore mostly
    disposable. With sync_blob in the schema that is no longer true: losing the
    file now loses user data. REL-1 snapshots the whole file, so the table is
    covered the moment it exists — but "covered automatically" is exactly the
    kind of fact that goes missing in a 03:00 restore decision, so each doc has
    to name it.
    """
    table_exists = "sync_blob" in database.SQL_CREATE_TABLES

    for doc in (BACKUPS_DOC, RUNBOOK_DOC):
        named = "sync_blob" in doc.read_text(encoding="utf-8")
        assert named == table_exists, (
            f"{doc.name} names sync_blob={named} but the schema creates it="
            f"{table_exists} — the DB is no longer disposable and the ops docs "
            "must not imply it is"
        )


def test_ux4_did_not_widen_into_the_checker_and_inspector_claim():
    """UX-4 syncs course progress and nothing else. The tempting error while
    adding a sync claim is to let "the server now holds some user data" bleed
    into PT-20, whose promise is that a pasted message or link never reaches the
    server at all. That promise did not change, and must not be softened by
    proximity to one that did.
    """
    assert "never receives a pasted message or link" in _ledger_row("PT-20")
