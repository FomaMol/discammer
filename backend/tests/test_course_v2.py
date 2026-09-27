"""The v2 pilot must remain readable without JS and reject incomplete exercises."""
import copy
import json
from collections import Counter
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


@pytest.mark.parametrize(('slug', 'lang', 'example'), [
    ('email-anatomy', 'en', 'help@cloud-desk-alerts.example'),
    ('email-anatomy', 'ru', 'help@cloud-desk-alerts.example'),
    ('lookalike-domains', 'en', 'bank.example.com@signin.example.net'),
    ('lookalike-domains', 'ru', 'bank.example.com@signin.example.net'),
])
def test_no_js_examples_exempt_from_edge_email_rewrite(client, slug, lang, example):
    # Cloudflare otherwise replaces these synthetic email/userinfo examples
    # with [email protected] until its decoder JavaScript runs.
    response = client.get(f'/{lang}/course/phishing/{slug}')
    assert response.status_code == 200
    html = unescape(response.text)
    assert html.count('<!--email_off-->') == 1
    assert html.count('<!--/email_off-->') == 1
    protected = html.split('<!--email_off-->', 1)[1].split('<!--/email_off-->', 1)[0]
    assert 'data-course-fallback="2"' in protected
    assert example in protected


@pytest.mark.parametrize('lang', ['en', 'ru'])
def test_no_js_reporting_address_visible_in_authored_article(client, lang):
    response = client.get(f'/{lang}/course/phishing/reporting-suspicious')
    assert response.status_code == 200
    html = response.text
    assert html.count('<!--email_off-->') == 1
    assert html.count('<!--/email_off-->') == 1
    protected = html.split('<!--email_off-->', 1)[1].split('<!--/email_off-->', 1)[0]
    article = protected.split('<article class="prose mt-8">', 1)[1].split('</article>', 1)[0]
    assert 'report@phishing.gov.uk' in article
    assert 'data-course-fallback="2"' in protected


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
                                  'https://@publicsuffix.org/learn/', 'https://printer.local/private',
                                  'https://site.test/path', 'https://example.com/source',
                                  'https://node.alt/private', 'https://docs.example.com/source',
                                  'https://sub.example.net/source',
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


@pytest.mark.parametrize('lang', ['en', 'ru'])
def test_revision_manifest_matches_lesson_summary(client, lang):
    manifest = client.get(f'/api/course/lesson-manifest?lang={lang}')
    assert manifest.status_code == 200
    rows = manifest.json()
    assert len(rows) == 55
    pilot_row = next(r for r in rows if r['module_slug'] == 'phishing' and r['slug'] == 'lookalike-domains')
    assert pilot_row['content_revision'] == '2026-10-20'
    summary = client.get(f'/api/course/phishing/lessons?lang={lang}')
    assert summary.status_code == 200
    assert next(r for r in summary.json() if r['slug'] == 'lookalike-domains')['content_revision'] == pilot_row['content_revision']


@pytest.mark.parametrize('lang', ['en', 'ru'])
def test_exam_has_static_study_fallback(client, lang):
    response = client.get(f'/{lang}/course/final-assessment/final-exam')
    assert response.status_code == 200
    lesson = json.loads((ROOT / 'content/course/final-assessment' / f'final-exam.{lang}.json').read_text())
    html = unescape(response.text)
    assert 'data-exam-fallback' in html
    for question in lesson['widget_config']['questions']:
        assert question['question'] in html
        for choice in question['choices']:
            assert choice['text'] in html
            if choice.get('explanation'):
                assert choice['explanation'] in html


def test_complete_bilingual_course_contract_and_completion_requirements():
    course_dir = ROOT / 'content/course'
    en_paths = sorted(course_dir.glob('*/*.en.json'))
    assert len(en_paths) == 55
    counts = {'course_v2': 0, 'exam': 0, 'certificate': 0}
    all_keys = set()
    for en_path in en_paths:
        ru_path = en_path.with_name(en_path.name.replace('.en.', '.ru.'))
        assert ru_path.exists(), en_path
        en = json.loads(en_path.read_text())
        ru = json.loads(ru_path.read_text())
        key = (en_path.parent.name, en_path.name.removesuffix('.en.json'))
        all_keys.add(key)
        assert en['widget_type'] == ru['widget_type']
        counts[en['widget_type']] += 1
        validate_pair(en, ru, str(key))
        if en['widget_type'] == 'course_v2':
            validate_v2(en['widget_config'], str(en_path))
            validate_v2(ru['widget_config'], str(ru_path))
            assert en['widget_config']['checked_at'] == ru['widget_config']['checked_at']
            practices = [b for b in en['widget_config']['blocks'] if b['type'] == 'practice']
            checks = [b for b in en['widget_config']['blocks'] if b['type'] == 'check']
            practice_positions = [next(i for i, c in enumerate(step['choices']) if c['recommended'])
                                  for block in practices for step in block['steps']]
            check_positions = [next(i for i, c in enumerate(question['choices']) if c['correct'])
                               for block in checks for question in block['questions']]
            assert len(set(practice_positions)) >= 2, en_path
            assert len(set(check_positions)) >= 2, en_path
    assert counts == {'course_v2': 53, 'exam': 1, 'certificate': 1}

    exam = json.loads((course_dir / 'final-assessment/final-exam.en.json').read_text())['widget_config']
    exam_ru = json.loads((course_dir / 'final-assessment/final-exam.ru.json').read_text())['widget_config']
    assert len(exam['questions']) == 40
    assert len(exam_ru['questions']) == 40
    assert exam['passThreshold'] == exam_ru['passThreshold'] == 0.8
    assert sorted(Counter(q['module'] for q in exam['questions']).values()) == [5] * 8
    assert sorted(Counter(q['module'] for q in exam_ru['questions']).values()) == [5] * 8
    assert sum(1 for q in exam['questions'] if 3 <= len(q['choices']) <= 4
               and sum(choice.get('correct') is True for choice in q['choices']) == 1
               and all(choice.get('explanation') for choice in q['choices'])) == 40
    assert all([c.get('correct') for c in a['choices']] == [c.get('correct') for c in b['choices']] and
               len(b['choices']) == len(a['choices']) and all(c.get('explanation') for c in b['choices'])
               for a, b in zip(exam['questions'], exam_ru['questions']))
    cert = json.loads((course_dir / 'final-assessment/defender-certificate.en.json').read_text())['widget_config']
    cert_ru = json.loads((course_dir / 'final-assessment/defender-certificate.ru.json').read_text())['widget_config']
    required = {(req['module'], slug) for req in cert['requirements'] for slug in req['lessons']}
    assert required == all_keys - {('final-assessment', 'defender-certificate')}
    assert cert['examRevision'] == exam['revision']
    assert cert_ru['requirements'] == cert['requirements']
    assert cert_ru['examRevision'] == exam_ru['revision'] == exam['revision']
