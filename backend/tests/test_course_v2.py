"""The v2 pilot must remain readable without JS and reject incomplete exercises."""
import copy
import json
from html import unescape
from pathlib import Path

import pytest

from course_contract import validate_pair, validate_v2

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
            assert choice['explanation'] in html
    check = next(b for b in lesson['widget_config']['blocks'] if b['type'] == 'check')
    for question in check['questions']:
        assert question['prompt'] in html
        for choice in question['choices']:
            assert choice['explanation'] in html
    assert lesson['widget_config']['goal'] in html
    assert lesson['widget_config']['today_action'] in html
    assert lesson['widget_config']['scope'] in html
    for source in lesson['widget_config']['sources']:
        assert source['url'] in html


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


@pytest.mark.parametrize('bad', [None, 'false', 0, 1])
def test_rejects_non_boolean_answer_flags(bad):
    cfg = copy.deepcopy(pilot('en')['widget_config'])
    practice = next(b for b in cfg['blocks'] if b['type'] == 'practice')
    practice['steps'][0]['choices'][0]['recommended'] = bad
    with pytest.raises(ValueError, match='recommended must be boolean'):
        validate_v2(cfg, 'pilot')
    cfg = copy.deepcopy(pilot('en')['widget_config'])
    check = next(b for b in cfg['blocks'] if b['type'] == 'check')
    check['questions'][0]['choices'][1]['correct'] = bad
    with pytest.raises(ValueError, match='correct must be boolean'):
        validate_v2(cfg, 'pilot')


@pytest.mark.parametrize('url', ['https://127.0.0.1/private', 'https://bad host.example/path',
                                  'https://localhost/private', 'https://user@official.example/path',
                                  'https://official.example\\@evil.example/path'])
def test_rejects_non_public_or_malformed_source_url(url):
    cfg = copy.deepcopy(pilot('en')['widget_config'])
    cfg['sources'][0]['url'] = url
    with pytest.raises(ValueError, match='public HTTPS'):
        validate_v2(cfg, 'pilot')


def test_rejects_bad_graph_and_locale_answer_drift():
    cfg = copy.deepcopy(pilot('en')['widget_config'])
    practice = next(b for b in cfg['blocks'] if b['type'] == 'practice')
    practice['steps'][0]['choices'][0]['next'] = 'nonexistent'
    with pytest.raises(ValueError, match='no step'):
        validate_v2(cfg, 'pilot')
    cfg = copy.deepcopy(pilot('en')['widget_config'])
    practice = next(b for b in cfg['blocks'] if b['type'] == 'practice')
    practice['steps'][-1]['choices'][0]['next'] = 'host'
    with pytest.raises(ValueError, match='cycle'):
        validate_v2(cfg, 'pilot')
    en, ru = pilot('en'), pilot('ru')
    validate_pair(en, ru, 'pilot')
    ru['widget_config']['blocks'][-1]['questions'][0]['choices'][0]['correct'] = False
    ru['widget_config']['blocks'][-1]['questions'][0]['choices'][1]['correct'] = True
    with pytest.raises(ValueError, match='differ'):
        validate_pair(en, ru, 'pilot')
