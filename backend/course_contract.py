"""Validation for authored multi-block course lessons (legacy widgets remain valid)."""
from datetime import date
import ipaddress
import re
from urllib.parse import urlsplit


def _public_https(url: str) -> bool:
    if any(c.isspace() or ord(c) < 32 or c == '\\' for c in url):
        return False
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        # Accessing .port detects malformed authorities such as :abc.
        parsed.port
    except ValueError:
        return False
    if parsed.scheme != 'https' or not host or '@' in parsed.netloc:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    try:
        labels = host.rstrip('.').encode('idna').decode('ascii').split('.')
    except UnicodeError:
        return False
    if len(labels) < 2 or not all(re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?', label) for label in labels):
        return False
    normalized = '.'.join(labels).lower()
    special_tlds = {'local', 'test', 'example', 'invalid', 'localhost', 'internal', 'onion', 'arpa'}
    reserved_examples = {'example.com', 'example.net', 'example.org'}
    return labels[-1].lower() not in special_tlds and normalized not in reserved_examples


def validate_v2(config: object, location: str) -> None:
    def fail(message: str) -> None:
        raise ValueError(f"{location}: {message}")
    def words(value: object, field: str) -> None:
        if not isinstance(value, str) or not value.strip():
            fail(f"{field} must be non-empty text")
    if not isinstance(config, dict) or config.get("version") != 2:
        fail("course_v2 requires version 2 object")
    for field in ("goal", "today_action", "scope"):
        words(config.get(field), field)
    revision = config.get('revision')
    if not isinstance(revision, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{2,40}', revision):
        fail('revision must be a stable authored version identifier')
    try:
        checked = config["checked_at"]
        if not isinstance(checked, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', checked):
            raise ValueError('not YYYY-MM-DD')
        date.fromisoformat(checked)
    except (KeyError, TypeError, ValueError):
        fail("checked_at must be ISO date")
    sources = config.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("sources must be a non-empty list")
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            fail(f"source {index} must be an object")
        for field in ("title", "scope", "url"):
            words(source.get(field), f"source {index}.{field}")
        if not _public_https(source["url"]):
            fail(f"source {index}.url must be a public HTTPS URL without userinfo")
    blocks = config.get("blocks")
    if not isinstance(blocks, list) or len(blocks) < 4:
        fail("blocks need two cases, practice and check")
    cases = [b for b in blocks if isinstance(b, dict) and b.get("type") == "case"]
    practices = [b for b in blocks if isinstance(b, dict) and b.get("type") == "practice"]
    checks = [b for b in blocks if isinstance(b, dict) and b.get("type") == "check"]
    if len(cases) < 2 or not any(b.get("legitimate") is True for b in cases):
        fail("at least two cases including a legitimate confusing case are required")
    if len(practices) != 1 or len(checks) != 1:
        fail("exactly one practice and one check block are required")
    for index, block in enumerate(blocks):
        if not isinstance(block, dict) or block.get("type") not in {"case", "practice", "check"}:
            fail(f"block {index} has unknown type")
        words(block.get("title"), f"block {index}.title")
        if block["type"] == "case":
            for field in ("situation", "analysis"):
                words(block.get(field), f"block {index}.{field}")
            if not isinstance(block.get("legitimate"), bool):
                fail(f"block {index}.legitimate must be boolean")
        elif block["type"] == "practice":
            mode = block.get('mode', 'sequence')
            if mode not in ('sequence', 'graph'):
                fail(f'block {index}.mode must be sequence or graph')
            words(block.get("setup"), f"block {index}.setup")
            words(block.get("debrief"), f"block {index}.debrief")
            if block.get("synthetic") is not True:
                fail(f"block {index}.synthetic must be true")
            steps = block.get("steps")
            if not isinstance(steps, list) or not 3 <= len(steps) <= 7:
                fail(f"block {index}.steps requires 3-7 decisions")
            ids = []
            for n, step in enumerate(steps):
                if not isinstance(step, dict): fail(f"step {n} must be an object")
                words(step.get("prompt"), f"step {n}.prompt")
                if mode == 'graph':
                    words(step.get('id'), f'step {n}.id')
                    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', step['id']):
                        fail(f'step {n}.id must be a stable slug')
                    ids.append(step['id'])
                choices = step.get("choices")
                if not isinstance(choices, list) or len(choices) < 2:
                    fail(f"step {n} needs at least two choices")
                if sum(c.get("recommended") is True for c in choices if isinstance(c, dict)) != 1:
                    fail(f"step {n} needs exactly one safer choice")
                for c in choices:
                    if not isinstance(c, dict): fail(f"step {n} has invalid choice")
                    for field in ("text", "consequence", "explanation"):
                        words(c.get(field), f"step {n}.{field}")
                    if not isinstance(c.get('recommended'), bool):
                        fail(f'step {n}.recommended must be boolean')
                    if mode == 'graph':
                        words(c.get('next'), f'step {n}.next')
                    elif 'next' in c:
                        fail(f'step {n}.next requires graph mode')
            if mode == 'graph':
                if len(set(ids)) != len(ids): fail('graph step IDs must be unique')
                by_id = {step['id']: step for step in steps}
                for step in steps:
                    for c in step['choices']:
                        if c['next'] != 'end' and c['next'] not in by_id:
                            fail(f"graph edge {c['next']} has no step")
                visited, visiting = set(), set()
                def walk(node):
                    if node == 'end': return 0
                    if node in visiting: fail('graph has a cycle')
                    visiting.add(node); visited.add(node)
                    lengths = [1 + walk(c['next']) for c in by_id[node]['choices']]
                    visiting.remove(node)
                    return min(lengths)
                shortest = walk(ids[0])
                if visited != set(ids): fail('graph has unreachable steps')
                if shortest < 3: fail('every graph route needs at least three decisions')
        else:
            questions = block.get("questions")
            if not isinstance(questions, list) or not 3 <= len(questions) <= 5:
                fail(f"block {index}.questions requires 3-5 questions")
            for n, question in enumerate(questions):
                if not isinstance(question, dict): fail(f"question {n} must be an object")
                words(question.get("prompt"), f"question {n}.prompt")
                choices = question.get("choices")
                if not isinstance(choices, list) or len(choices) < 2:
                    fail(f"question {n} needs at least two choices")
                if sum(c.get("correct") is True for c in choices if isinstance(c, dict)) != 1:
                    fail(f"question {n} needs exactly one correct choice")
                for c in choices:
                    if not isinstance(c, dict): fail(f"question {n} has invalid choice")
                    words(c.get("text"), f"question {n}.text")
                    words(c.get("explanation"), f"question {n}.explanation")
                    if not isinstance(c.get('correct'), bool):
                        fail(f'question {n}.correct must be boolean')


def validate_pair(en: dict, ru: dict, location: str) -> None:
    """Gate structural/answer parity; human reviewers still judge translation."""
    if en.get('widget_type') != ru.get('widget_type'):
        raise ValueError(f'{location}: EN/RU widget types differ')
    if en.get('widget_type') != 'course_v2':
        return
    def shape(data):
        cfg = data['widget_config']
        blocks = []
        for block in cfg['blocks']:
            if block['type'] == 'case': blocks.append(('case', block['legitimate']))
            elif block['type'] == 'practice':
                blocks.append(('practice', block.get('mode', 'sequence'), tuple(
                    (step.get('id'), tuple((choice['recommended'], choice.get('next')) for choice in step['choices']))
                    for step in block['steps'])))
            else:
                blocks.append(('check', tuple(tuple(choice['correct'] for choice in q['choices']) for q in block['questions'])))
        return (cfg['revision'], tuple(blocks), tuple(source['url'] for source in cfg['sources']))
    if shape(en) != shape(ru):
        raise ValueError(f'{location}: EN/RU course_v2 structure, answers or source URLs differ')
