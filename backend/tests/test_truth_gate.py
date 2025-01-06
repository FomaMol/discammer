"""Regression checks for Wave 0's public product-truth boundary.

These assertions intentionally cover the values admissions readers can infer
from the course and completion-record surfaces. They keep future copy or data
edits from quietly turning a local, self-guided learning flow into a claimed
credential or changing its stated scope without updating the dossier.
"""
from __future__ import annotations

import json
from pathlib import Path

import seed_data


ROOT = Path(__file__).resolve().parents[2]
COURSE = ROOT / "content" / "course" / "final-assessment"
LOCALES = ROOT / "backend" / "locales"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


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
