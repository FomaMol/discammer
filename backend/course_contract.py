"""Validation for authored multi-block course lessons (legacy widgets remain valid)."""
from datetime import date
from urllib.parse import urlparse


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
    try:
        date.fromisoformat(config["checked_at"])
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
        url = urlparse(source["url"])
        if url.scheme != "https" or not url.hostname or url.username or url.password:
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
            words(block.get("setup"), f"block {index}.setup")
            words(block.get("debrief"), f"block {index}.debrief")
            if block.get("synthetic") is not True:
                fail(f"block {index}.synthetic must be true")
            steps = block.get("steps")
            if not isinstance(steps, list) or not 3 <= len(steps) <= 7:
                fail(f"block {index}.steps requires 3-7 decisions")
            for n, step in enumerate(steps):
                if not isinstance(step, dict): fail(f"step {n} must be an object")
                words(step.get("prompt"), f"step {n}.prompt")
                choices = step.get("choices")
                if not isinstance(choices, list) or len(choices) < 2:
                    fail(f"step {n} needs at least two choices")
                if sum(c.get("recommended") is True for c in choices if isinstance(c, dict)) != 1:
                    fail(f"step {n} needs exactly one safer choice")
                for c in choices:
                    if not isinstance(c, dict): fail(f"step {n} has invalid choice")
                    for field in ("text", "consequence", "explanation"):
                        words(c.get(field), f"step {n}.{field}")
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
