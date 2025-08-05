"""Truth and fallback checks for the local incident-action guidance."""
from __future__ import annotations

import html
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

INSPECT_INCIDENT_KEYS = {
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


def test_inspect_page_keeps_localized_incident_fallback_inside_inspector_mount(client):
    """The link tool fails closed to local, useful next steps, not a blank panel."""
    for language in ("en", "ru"):
        locale = _locale(language)["inspect"]
        response = client.get(f"/{language}/inspect")

        assert response.status_code == 200
        assert 'data-component="LinkInspector"' in response.text
        assert response.text.count('id="inspect-incident-heading"') == 1
        assert "<noscript>" in response.text

        mount_index = response.text.index('data-component="LinkInspector"')
        fallback_index = response.text.index('id="inspect-incident-heading"')
        browser_note_index = response.text.index(locale["privacy_body"])
        assert mount_index < fallback_index < browser_note_index
        rendered_text = html.unescape(response.text)
        for key in INSPECT_INCIDENT_KEYS:
            assert locale[key] in rendered_text, (language, key)


def test_inspect_incident_copy_has_complete_authored_ru_en_contract():
    """Both languages carry every link-specific fallback action."""
    en_keys = set(_locale("en")["inspect"])
    ru_keys = set(_locale("ru")["inspect"])
    assert en_keys == ru_keys
    assert INSPECT_INCIDENT_KEYS <= en_keys

    for language in ("en", "ru"):
        inspect_locale = _locale(language)["inspect"]
        for key in INSPECT_INCIDENT_KEYS:
            assert isinstance(inspect_locale[key], str) and inspect_locale[key].strip(), (language, key)
