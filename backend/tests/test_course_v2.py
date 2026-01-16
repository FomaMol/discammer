"""The v2 pilot must remain readable without JS and reject incomplete exercises."""
import copy
import json
from html import unescape
from pathlib import Path

import pytest

from course_contract import validate_v2

ROOT = Path(__file__).resolve().parents[2]


def pilot(lang):
    return json.loads((ROOT / 'content/course/phishing' / f'lookalike-domains.{lang}.json').read_text())


@pytest.mark.parametrize('lang', ['en', 'ru'])
def test_pilot_contract_and_static_fallback(client, lang):
    lesson = pilot(lang)
    validate_v2(lesson['widget_config'], lang)
    response = client.get(f'/{lang}/course/phishing/lookalike-domains')
    assert response.status_code == 200
    html = unescape(response.text)
    assert 'data-course-fallback="2"' in html
    practice = next(b for b in lesson['widget_config']['blocks'] if b['type'] == 'practice')
    for step in practice['steps']:
        assert step['prompt'] in html
        for choice in step['choices']:
            assert choice['consequence'] in html
    assert lesson['widget_config']['goal'] in html
    assert lesson['widget_config']['today_action'] in html


def test_rejects_missing_consequence_and_non_https_source():
    cfg = copy.deepcopy(pilot('en')['widget_config'])
    practice = next(b for b in cfg['blocks'] if b['type'] == 'practice')
    del practice['steps'][1]['choices'][0]['consequence']
    with pytest.raises(ValueError, match='consequence'):
        validate_v2(cfg, 'pilot')
    practice['steps'][1]['choices'][0]['consequence'] = 'Consequence restored.'
    cfg['sources'][0]['url'] = 'javascript:alert(1)'
    with pytest.raises(ValueError, match='HTTPS'):
        validate_v2(cfg, 'pilot')
