import json
import re

import pytest

import analytics_config

TEST_ID = "b8eb4c16-67f2-413f-a5c9-9c2647439e2e"


def read_config(response):
    match = re.search(r'window\.__DISCAMMER_CONFIG__\.analytics = (.*?);', response.text)
    assert match
    return json.loads(match.group(1))


def test_disabled_does_not_expose_collector(client, monkeypatch):
    monkeypatch.setattr(analytics_config, "WEBSITE_ID", "")
    response = client.get('/en/')
    assert read_config(response) is None
    assert 'cloud.umami.is' not in response.headers.get('content-security-policy-report-only', '')
    assert 'data-analytics-opt-out' not in response.text


@pytest.mark.parametrize('lang', ['en', 'ru'])
@pytest.mark.parametrize('page', ['', 'portfolio', 'game', 'check', 'inspect', 'search', 'course'])
def test_safe_page_metadata_and_disclosure(client, monkeypatch, lang, page):
    monkeypatch.setattr(analytics_config, "WEBSITE_ID", TEST_ID)
    response = client.get(f'/{lang}/{page}?q=private-secret&token=do-not-send')
    assert response.status_code == 200
    cfg = read_config(response)
    assert cfg['url'] == f'/{lang}/{page}'
    assert cfg['surface'] == (page or 'home')
    assert cfg['language'] == lang
    assert 'private-secret' not in json.dumps(cfg)
    assert 'do-not-send' not in json.dumps(cfg)
    assert 'data-analytics-opt-out' in response.text
    csp = response.headers['content-security-policy-report-only']
    assert 'connect-src' in csp and 'https://cloud.umami.is' in csp
    assert 'https://cloud.umami.is' not in csp.split('script-src')[1].split(';')[0]


@pytest.mark.parametrize('path', ['/en/private-email-secret', '/en/journal/private-email-secret', '/ru/course/private-email-secret', '/en/course/private/secret'])
def test_unknown_content_never_enters_analytics(client, monkeypatch, path):
    monkeypatch.setattr(analytics_config, "WEBSITE_ID", TEST_ID)
    response = client.get(path)
    assert response.status_code == 404
    assert read_config(response) is None


def test_authored_content_path(client, monkeypatch):
    monkeypatch.setattr(analytics_config, "WEBSITE_ID", TEST_ID)
    response = client.get('/en/guide/phishing?url=https://private.example')
    assert response.status_code == 200
    cfg = read_config(response)
    assert cfg['surface'] == 'guide'
    assert cfg['url'] == '/en/guide/phishing'


@pytest.mark.parametrize('value', ['', 'not-an-id', '<script>bad</script>'])
def test_invalid_configuration_is_disabled(monkeypatch, value):
    monkeypatch.setenv('UMAMI_WEBSITE_ID', value)
    assert analytics_config.load_website_id() == ''
