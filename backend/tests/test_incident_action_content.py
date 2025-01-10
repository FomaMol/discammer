"""Truth and fallback checks for the local incident-action guidance."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "backend" / "locales"

CLIENT_INCIDENT_KEYS = {
    "disclosure",
    "heading",
    "intro",
    "privacy",
    "legend",
    "impact_money",
    "impact_credentials",
    "impact_device",
    "impact_identity",
    "impact_received_only",
    "actions_heading",
    "action_stop",
    "action_trusted_channel",
    "action_money",
    "action_credentials",
    "action_device",
    "action_identity",
    "action_tell_trusted",
    "immediate_danger",
    "reset",
    "plan_status",
}

CHECK_INCIDENT_KEYS = {
    "incident_heading",
    "incident_intro",
    "incident_privacy",
    "incident_disclaimer",
    "incident_danger",
    *(f"incident_{number}" for number in range(1, 7)),
}


def _locale(language: str) -> dict:
    return json.loads((LOCALES / f"{language}.json").read_text(encoding="utf-8"))


def test_incident_action_copy_has_complete_authored_ru_en_contract():
    """The interactive prompt has every localized leaf in both languages."""
    for language in ("en", "ru"):
        incident = _locale(language)["client"]["incident"]
        assert CLIENT_INCIDENT_KEYS <= set(incident), language
        for key in CLIENT_INCIDENT_KEYS:
            assert isinstance(incident[key], str) and incident[key].strip(), (language, key)


def test_check_page_keeps_localized_incident_fallback_inside_analyzer_mount(client):
    """The island can fail closed to useful SSR action guidance, not a blank panel."""
    for language in ("en", "ru"):
        locale = _locale(language)["check"]
        response = client.get(f"/{language}/check")

        assert response.status_code == 200
        assert 'data-component="MessageAnalyzer"' in response.text
        assert response.text.count('id="check-incident-heading"') == 1
        assert "<noscript>" in response.text
        for key in CHECK_INCIDENT_KEYS:
            assert locale[key] in response.text, (language, key)
