"""Seed the database with content from markdown files in content/ directory."""

import fcntl
import json
import logging
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import aiosqlite

import config
from course_contract import validate_pair, validate_v2
from config import CONTENT_DIR
from database import _apply_pragmas

log = logging.getLogger(__name__)

SUPPORTED_LOCALES = ("en", "ru")
GUIDE_PROVENANCE_PATH = CONTENT_DIR / "provenance" / "guide-sources.json"


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Parse YAML-like frontmatter from markdown text. Returns (metadata, body).

    Tolerant of a missing trailing newline after the closing ``---``.
    """
    match = re.match(r"^---\s*\n(.*?)\n---\s*(?:\n(.*))?\Z", text, re.DOTALL)
    if not match:
        return {}, text

    meta_str, body = match.group(1), match.group(2) or ""
    meta: dict = {}
    for line in meta_str.strip().split("\n"):
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        # Convert numeric values
        if val.isdigit():
            meta[key] = int(val)
        else:
            meta[key] = val
    return meta, body.strip()


def _locale_from_filename(stem: str) -> tuple[str, str]:
    """Split a stem like ``phishing.ru`` into ``("phishing", "ru")``.

    Bare stems without a recognised locale suffix default to English so legacy
    files keep loading until they are renamed.
    """
    for locale in SUPPORTED_LOCALES:
        suffix = f".{locale}"
        if stem.endswith(suffix):
            return stem[: -len(suffix)], locale
    return stem, "en"


def load_markdown_files(directory: Path) -> list[tuple[dict, str, str]]:
    """Load all .md files from ``directory``.

    Each entry is ``(metadata, body, locale)``. Locale is inferred from the
    filename suffix (``foo.ru.md`` -> ``ru``); frontmatter can override with a
    ``locale`` key, which lets a single translation table override the default.
    """
    results = []
    if not directory.exists():
        return results
    for md_file in sorted(directory.glob("*.md")):
        text = md_file.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        if not meta:
            log.warning("Skipping %s: missing or unparseable frontmatter", md_file)
            continue
        # Strip the trailing ".md" then split the locale off the stem.
        stem = md_file.stem
        base_stem, locale = _locale_from_filename(stem)
        locale = str(meta.get("locale", locale)).lower()
        if locale not in SUPPORTED_LOCALES:
            log.warning(
                "Skipping %s: unsupported locale %s", md_file, locale
            )
            continue
        # Default slug to the locale-stripped stem if frontmatter didn't set one.
        meta.setdefault("slug", base_stem)
        results.append((meta, body, locale))
    return results


def _localized_provenance_value(value: object, locale: str) -> str:
    """Return a catalogue value in ``locale`` without guessing a translation.

    Source titles and scope notes are authored in both languages.  An absent
    locale intentionally becomes an empty string rather than leaking English
    into the Russian surface or inventing an unofficial translation.
    """
    if isinstance(value, dict):
        localized = value.get(locale, "")
        return localized if isinstance(localized, str) else ""
    return value if isinstance(value, str) else ""


def _require_iso_date(value: object, location: str) -> str:
    """Validate a catalogue date without treating it as a live-status signal."""
    if not isinstance(value, str):
        raise ValueError(f"Guide provenance {location} must be an ISO date string")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(
            f"Guide provenance {location} must use YYYY-MM-DD"
        ) from exc
    return value


def _require_bilingual_text(value: object, location: str) -> dict[str, str]:
    """Require authored, non-empty EN/RU text rather than a fallback locale."""
    if not isinstance(value, dict) or set(value) != set(SUPPORTED_LOCALES):
        raise ValueError(f"Guide provenance {location} must contain exactly en and ru")
    if not all(isinstance(value[locale], str) and value[locale].strip() for locale in SUPPORTED_LOCALES):
        raise ValueError(f"Guide provenance {location} must contain non-empty EN/RU text")
    return value


def load_guide_provenance(expected_slugs: set[str]) -> tuple[str, dict[str, dict]]:
    """Load checked-in source metadata for the educational guide set.

    The catalogue is deliberately small and static: it provides provenance for
    general anti-scam guidance, not real-time intelligence or validation of a
    visitor's particular message. It is a release gate: malformed, incomplete,
    or locale-incomplete data aborts the reseed instead of silently erasing an
    apparently source-backed entry from the public page.
    """
    if not GUIDE_PROVENANCE_PATH.exists():
        raise ValueError(f"Guide provenance catalogue is missing: {GUIDE_PROVENANCE_PATH}")
    try:
        raw = json.loads(GUIDE_PROVENANCE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not load guide provenance catalogue: {exc}") from exc

    if not isinstance(raw, dict) or raw.get("version") != 1:
        raise ValueError("Guide provenance catalogue must declare version 1")
    guides = raw.get("guides")
    if not isinstance(guides, dict) or set(guides) != expected_slugs:
        missing = sorted(expected_slugs - set(guides or {}))
        extra = sorted(set(guides or {}) - expected_slugs)
        raise ValueError(
            "Guide provenance catalogue slugs do not match authored guides: "
            f"missing={missing}, extra={extra}"
        )
    catalogued_at = _require_iso_date(raw.get("catalogued_at"), "catalogued_at")

    for slug, entry in guides.items():
        if not isinstance(entry, dict):
            raise ValueError(f"Guide provenance guides.{slug} must be an object")
        _require_bilingual_text(entry.get("scope"), f"guides.{slug}.scope")
        sources = entry.get("sources")
        if not isinstance(sources, list) or not 1 <= len(sources) <= 3:
            raise ValueError(f"Guide provenance guides.{slug}.sources must contain 1–3 entries")
        for index, source in enumerate(sources):
            location = f"guides.{slug}.sources[{index}]"
            if not isinstance(source, dict):
                raise ValueError(f"Guide provenance {location} must be an object")
            publisher = source.get("publisher")
            if not isinstance(publisher, str) or not publisher.strip():
                raise ValueError(f"Guide provenance {location}.publisher must be non-empty")
            url = source.get("url")
            parsed = urlparse(url) if isinstance(url, str) else None
            if not parsed or parsed.scheme != "https" or not parsed.hostname:
                raise ValueError(f"Guide provenance {location}.url must be an HTTPS URL")
            _require_bilingual_text(source.get("title"), f"{location}.title")
            _require_bilingual_text(source.get("scope_note"), f"{location}.scope_note")
            _require_iso_date(source.get("recorded_at"), f"{location}.recorded_at")

    return catalogued_at, guides


def guide_provenance_for_locale(
    catalogue: dict[str, dict], catalogued_at: str, slug: str, locale: str
) -> tuple[str, str, str]:
    """Return locale-specific ``(scope, date, sources_json)`` for one guide."""
    entry = catalogue.get(slug)
    if not isinstance(entry, dict):
        return "", "", "[]"

    source_rows: list[dict[str, str]] = []
    for source in entry.get("sources", []):
        if not isinstance(source, dict):
            continue
        publisher = source.get("publisher", "")
        url = source.get("url", "")
        title = _localized_provenance_value(source.get("title"), locale)
        scope_note = _localized_provenance_value(source.get("scope_note"), locale)
        recorded_at = source.get("recorded_at", "")
        if all(isinstance(value, str) and value for value in (publisher, url, title)):
            source_rows.append(
                {
                    "publisher": publisher,
                    "url": url,
                    "title": title,
                    "scope_note": scope_note,
                    "recorded_at": recorded_at if isinstance(recorded_at, str) else "",
                }
            )

    scope = _localized_provenance_value(entry.get("scope"), locale)
    return scope, catalogued_at, json.dumps(source_rows, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Course modules — bilingual
# ---------------------------------------------------------------------------
# Each entry is one logical module. ``translations`` carries every
# locale-specific field; structural fields (slug, order, icon, accent,
# duration, etc.) are shared across languages so the curriculum stays in
# lockstep when the UI switches locale.

COURSE_MODULES = [
    {
        "slug": "threat-fundamentals",
        "order": 1,
        "is_locked": 0,
        # Module icon = single uppercase letter (rendered as a mono "category
        # code"). OS emoji were dropped to match the analyst-console voice and
        # avoid OS-dependent emoji rendering. See guide.html / game.html for the
        # same treatment in the threat-vector and related-guide cards.
        "icon": "T",
        "accent": "cyan",
        "duration": "45 min",
        "lessons": 6,
        "difficulty": "Beginner",
        "translations": {
            "en": {
                "title": "Online Threats: The Basics",
                "description": (
                    "See who is behind online scams and how they work, from a "
                    "single opportunist with a phishing kit to organized fraud "
                    "networks."
                ),
                "difficulty": "Beginner",
                "topics": [
                    "How the scam economy works",
                    "How scams reach you: email, SMS, voice, web",
                    "Who the attackers are and what they want",
                    "Glossary: malware, phishing, ransomware, RAT",
                    "Reading breach reports without panic",
                    "Case study: the 2024 deepfake CFO fraud",
                ],
                "objectives": [
                    "Name the four main ways scams reach you",
                    "Understand what scammers want from different targets",
                    "Learn the patterns scams repeat across channels",
                ],
                "content": (
                    "## Module 1 — Online Threats: The Basics\n\n"
                    "Before you can defend yourself, it helps to know who is attacking, "
                    "what they want and how they reach you. This module lays out that "
                    "picture, and the rest of the course builds on it."
                ),
            },
            "ru": {
                "title": "Киберугрозы: основы",
                "description": (
                    "Как устроено интернет-мошенничество и кто за ним стоит: "
                    "от одиночки с готовым фишинговым набором до организованных "
                    "преступных сетей."
                ),
                "difficulty": "Начальный",
                "topics": [
                    "Как устроена экономика современных афер",
                    "Каналы атак: email, SMS, звонки, сайты",
                    "Кто атакует и чего он хочет",
                    "Глоссарий: вредоносное ПО, фишинг, вымогатели, RAT",
                    "Как читать отчёты об утечках без паники",
                    "Кейс 2024 года: дипфейк «финансового директора»",
                ],
                "objectives": [
                    "Назвать четыре основных канала мошенничества",
                    "Понять, чего мошенники хотят от разных людей",
                    "Узнавать приёмы, которые повторяются в разных схемах",
                ],
                "content": (
                    "## Модуль 1 — Киберугрозы: основы\n\n"
                    "Чтобы защищаться, полезно знать, кто атакует, чего он хочет и как "
                    "до вас добирается. Этот модуль рисует общую картину, на которую "
                    "опирается весь остальной курс."
                ),
            },
        },
    },
    {
        "slug": "social-engineering",
        "order": 2,
        "is_locked": 1,
        "icon": "S",
        "accent": "green",
        "duration": "60 min",
        "lessons": 7,
        "difficulty": "Beginner",
        "translations": {
            "en": {
                "title": "Social Engineering & Human Hacking",
                "description": (
                    "Learn which psychological levers scammers pull (authority, "
                    "urgency, scarcity, reciprocity) and how to notice them in a "
                    "real conversation."
                ),
                "difficulty": "Beginner",
                "topics": [
                    "Cialdini's six principles of influence",
                    "Pretexting and impersonation scripts",
                    "Vishing, smishing, and voice deepfakes",
                    "Romance and pig-butchering long cons",
                    "Urgency, fear, and authority triggers",
                    "Verbal red flags in real conversations",
                    "Building a personal verification routine",
                ],
                "objectives": [
                    "Learn to spot urgency, fear and borrowed authority in a message",
                    "Use a two-step check before sending money or passwords: pause, then verify",
                    "Learn to end a suspicious call calmly and check the request another way",
                ],
                "content": (
                    "## Module 2 — Social Engineering & Human Hacking\n\n"
                    "Many scams need no software flaw at all. They work on attention: a "
                    "voice that sounds sure, a message that sounds urgent. This module "
                    "trains you to hear those patterns before they take hold."
                ),
            },
            "ru": {
                "title": "Социальная инженерия: как манипулируют людьми",
                "description": (
                    "Разбираем психологические рычаги, на которые давят мошенники "
                    "(авторитет, срочность, дефицит, взаимность), и учимся замечать "
                    "их в живом разговоре."
                ),
                "difficulty": "Начальный",
                "topics": [
                    "Шесть принципов влияния Чалдини",
                    "Претекстинг и сценарии «я из банка»",
                    "Вишинг, смишинг и голосовые дипфейки",
                    "Романтические разводы и pig butchering",
                    "Срочность, страх и авторитет как рычаги давления",
                    "Словесные красные флаги в разговоре",
                    "Личный порядок проверки собеседника",
                ],
                "objectives": [
                    "Научиться замечать в сообщении срочность, страх и ссылки на авторитет",
                    "Перед переводом денег или паролей проверять просьбу в два шага: пауза, затем другой канал",
                    "Научиться спокойно прервать подозрительный звонок и перепроверить просьбу",
                ],
                "content": (
                    "## Модуль 2 — Социальная инженерия: как манипулируют людьми\n\n"
                    "Многим мошенничествам не нужна ни одна уязвимость в программе. Они "
                    "бьют по вниманию: уверенный голос, срочное сообщение. Модуль учит "
                    "узнавать эти приёмы до того, как они сработают."
                ),
            },
        },
    },
    {
        "slug": "phishing",
        "order": 3,
        "is_locked": 1,
        "icon": "P",
        "accent": "cyan",
        "duration": "55 min",
        "lessons": 6,
        "difficulty": "Beginner",
        "translations": {
            "en": {
                "title": "Phishing & Malicious Links",
                "description": (
                    "Take apart typical phishing emails, SMS messages and fake pages. "
                    "Learn to spot lookalike domains, hidden redirects and pages built "
                    "to collect your passwords."
                ),
                "difficulty": "Beginner",
                "topics": [
                    "Anatomy of a phishing email",
                    "Lookalike domains: punycode, homoglyphs, subdomain tricks",
                    "Reading link previews before you click",
                    "Spotting fake login pages",
                    "QR-code phishing (quishing)",
                    "Reporting and quarantining suspicious mail",
                ],
                "objectives": [
                    "Learn a quick, repeatable way to read any link before you click",
                    "Learn three lookalike-domain tricks and how to catch them",
                    "Learn what email headers and sender-check signals can show, and where they stop short",
                ],
                "content": (
                    "## Module 3 — Phishing & Malicious Links\n\n"
                    "Phishing is among the most common ways an attack begins. The defense "
                    "is a habit: stop, read the address, check the request another way. "
                    "This module builds that habit."
                ),
            },
            "ru": {
                "title": "Фишинг и вредоносные ссылки",
                "description": (
                    "Разбираем типичные фишинговые письма, SMS и поддельные страницы. "
                    "Учимся замечать домены-двойники, скрытые перенаправления и "
                    "страницы, которые выманивают пароли."
                ),
                "difficulty": "Начальный",
                "topics": [
                    "Анатомия фишингового письма",
                    "Домены-двойники: punycode, гомоглифы, поддомены",
                    "Как читать предпросмотр ссылки до клика",
                    "Как распознать поддельную страницу входа",
                    "Фишинг через QR-коды (quishing)",
                    "Как сообщить о подозрительном письме и изолировать его",
                ],
                "objectives": [
                    "Освоить быструю проверку любой ссылки до клика",
                    "Узнать три приёма подделки доменов и как их заметить",
                    "Понять, что можно узнать из заголовков письма, а что нельзя",
                ],
                "content": (
                    "## Модуль 3 — Фишинг и вредоносные ссылки\n\n"
                    "Фишинг остаётся одним из самых частых способов начать атаку. Защита "
                    "здесь — привычка: остановиться, прочитать адрес, перепроверить "
                    "просьбу другим путём. Модуль её и тренирует."
                ),
            },
        },
    },
    {
        "slug": "passwords-mfa",
        "order": 4,
        "is_locked": 1,
        "icon": "A",
        "accent": "amber",
        "duration": "50 min",
        "lessons": 6,
        "difficulty": "Intermediate",
        "translations": {
            "en": {
                "title": "Passwords, MFA & Account Security",
                "description": (
                    "Build sign-in habits that limit the damage when a service you "
                    "use is breached. Compare password managers, MFA methods, and "
                    "ways to recover an account."
                ),
                "difficulty": "Intermediate",
                "topics": [
                    "How credentials get stolen and resold",
                    "Password manager basics",
                    "MFA options: SMS, TOTP codes, hardware keys",
                    "Passkeys and signing in without passwords",
                    "Account recovery without back doors",
                    "A personal credential audit",
                ],
                "objectives": [
                    "Set up a password manager and move your most important logins into it",
                    "Turn on MFA for important accounts, phishing-resistant where offered",
                    "Check your own accounts for exposure with a breach-check tool",
                ],
                "content": (
                    "## Module 4 — Passwords, MFA & Account Security\n\n"
                    "A password is the lock on the front door of an account, and many "
                    "people use one lock for every door. This module covers how to keep "
                    "passwords separate and strong, how to add a second check, and why an "
                    "SMS code is better than nothing but not the strongest choice."
                ),
            },
            "ru": {
                "title": "Пароли, 2FA и защита аккаунтов",
                "description": (
                    "Вырабатываем привычки входа в аккаунты, которые ограничивают "
                    "ущерб, если сервис взломают. Сравниваем менеджеры паролей, виды "
                    "двухфакторной защиты и порядок восстановления доступа."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Как ваши пароли крадут и перепродают",
                    "Менеджеры паролей: основы",
                    "Виды 2FA: SMS, TOTP, аппаратные ключи",
                    "Ключи доступа (passkeys) вместо паролей",
                    "Восстановление доступа без лазеек",
                    "Личная проверка паролей и утечек",
                ],
                "objectives": [
                    "Настроить менеджер паролей и перенести в него самые важные логины",
                    "Включить 2FA на важных аккаунтах, по возможности устойчивую к фишингу",
                    "Проверить свои аккаунты через сервис проверки утечек",
                ],
                "content": (
                    "## Модуль 4 — Пароли, 2FA и защита аккаунтов\n\n"
                    "Пароль — замок на двери аккаунта, и многие ставят один и тот же "
                    "замок на все двери. Модуль объясняет, как хранить пароли по "
                    "отдельности и надёжно, как добавить вторую проверку и почему "
                    "SMS-код лучше, чем ничего, но не лучший вариант."
                ),
            },
        },
    },
    {
        "slug": "financial-fraud",
        "order": 5,
        "is_locked": 1,
        "icon": "F",
        "accent": "red",
        "duration": "65 min",
        "lessons": 8,
        "difficulty": "Intermediate",
        "translations": {
            "en": {
                "title": "Financial Fraud & Payment Safety",
                "description": (
                    "Spot fake stores, investment scams and payment fraud before "
                    "money leaves your account, and learn what to do in the first "
                    "hours if it already has."
                ),
                "difficulty": "Intermediate",
                "topics": [
                    "Anatomy of a fake online store",
                    "Crypto and ICO investment scams",
                    "Romance-to-investment pig-butchering",
                    "Fake invoice and wire-redirection attacks",
                    "Card skimming and digital pickpocketing",
                    "Charity and disaster-relief fraud",
                    "What to do in the first 24 hours after fraud",
                    "How to dispute a charge and build a strong case",
                ],
                "objectives": [
                    "Learn a short purchase check to run on any online store before you pay",
                    "Learn how money moves in a pig-butchering scam",
                    "Learn the order of steps to take in the first 24 hours after fraud",
                ],
                "content": (
                    "## Module 5 — Financial Fraud & Payment Safety\n\n"
                    "Money lost to fraud is often hard to recover, so most of this module "
                    "is about stopping before you pay. The rest covers what to do in the "
                    "first hours if you already have."
                ),
            },
            "ru": {
                "title": "Финансовое мошенничество и безопасность платежей",
                "description": (
                    "Распознаём поддельные магазины, инвестиционные разводы и платёжное "
                    "мошенничество до того, как деньги ушли, и разбираем, что делать, "
                    "если они уже ушли."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Признаки поддельного интернет-магазина",
                    "Криптомошенничество и поддельные ICO",
                    "Pig butchering: от любви до инвестиций",
                    "Поддельные счета и подмена платёжных реквизитов",
                    "Скимминг и цифровые «карманники»",
                    "Поддельная благотворительность и сборы помощи",
                    "Первые 24 часа после мошенничества",
                    "Как оспорить списание: что повышает шансы",
                ],
                "objectives": [
                    "Освоить короткую проверку интернет-магазина перед оплатой",
                    "Понять, как в схеме pig butchering движутся деньги",
                    "Узнать, что делать в первые 24 часа после мошенничества и в каком порядке",
                ],
                "content": (
                    "## Модуль 5 — Финансовое мошенничество и безопасность платежей\n\n"
                    "Деньги, потерянные из-за мошенничества, часто трудно вернуть, поэтому "
                    "большая часть модуля — о том, как остановиться до платежа. Остальное "
                    "— о том, что делать в первые часы, если платёж уже прошёл."
                ),
            },
        },
    },
    {
        "slug": "ai-deepfakes",
        "order": 6,
        "is_locked": 1,
        "icon": "D",
        "accent": "cyan",
        "duration": "55 min",
        "lessons": 6,
        "difficulty": "Intermediate",
        "translations": {
            "en": {
                "title": "AI Scams & Deepfakes",
                "description": (
                    "Learn how scammers use AI-written messages, cloned voices and "
                    "faked video, and how to check a request when a voice or a face "
                    "is not proof."
                ),
                "difficulty": "Intermediate",
                "topics": [
                    "How AI tools produce text, voice, and video",
                    "Voice-cloning scams aimed at families and finances",
                    "Video deepfakes in business email compromise",
                    "AI-written messages: what gives them away",
                    "Provenance signals: C2PA, watermarks, metadata",
                    "Building a family verification routine",
                ],
                "objectives": [
                    "Learn what to look for in a suspicious video, and why a clean one still needs checking",
                    "Agree on a verification phrase with at least one person you trust",
                    "Learn what AI-written messages tend to give away, and why that is a weak test on its own",
                ],
                "content": (
                    "## Module 6 — AI Scams & Deepfakes\n\n"
                    "AI tools can write a fluent message in almost any language, and a "
                    "short clip posted online may be enough for a scammer to try to "
                    "imitate a voice. So a polished text, a familiar voice or a face on "
                    "a screen is not proof of who is asking. This module shows how these "
                    "scams work and how to check the request itself by another route."
                ),
            },
            "ru": {
                "title": "Мошенничество с ИИ и дипфейки",
                "description": (
                    "Разбираем, как мошенники используют сообщения, написанные ИИ, "
                    "клонированные голоса и поддельное видео, и как проверить просьбу, "
                    "если голос или лицо на экране ничего не доказывают."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Как ИИ создаёт текст, голос и видео",
                    "Атаки с клонированием голоса родственника или руководителя",
                    "Дипфейки на видеосвязи в схемах BEC (компрометации деловой почты)",
                    "Текст от ИИ: что его выдаёт и почему этого мало",
                    "Сигналы происхождения: C2PA, водяные знаки, метаданные",
                    "Семейный порядок проверки",
                ],
                "objectives": [
                    "Узнать, на что смотреть в подозрительном видео и почему «чистая» запись ещё ничего не доказывает",
                    "Договориться о кодовом слове хотя бы с одним близким человеком",
                    "Узнать, чем выдают себя тексты от ИИ и почему этого мало",
                ],
                "content": (
                    "## Модуль 6 — Мошенничество с ИИ и дипфейки\n\n"
                    "Нейросети пишут связный текст почти на любом языке, а короткой "
                    "записи голоса, выложенной в сеть, иногда хватает, чтобы мошенник "
                    "попытался его подделать. Поэтому гладкое сообщение, знакомый голос "
                    "или лицо на экране ещё не доказывают, кто вас просит. Модуль "
                    "показывает, как устроены такие схемы и как проверять саму просьбу "
                    "другим путём."
                ),
            },
        },
    },
    {
        "slug": "mobile-network",
        "order": 7,
        "is_locked": 1,
        "icon": "M",
        "accent": "green",
        "duration": "50 min",
        "lessons": 6,
        "difficulty": "Intermediate",
        "translations": {
            "en": {
                "title": "Mobile, Browser & Network Hygiene",
                "description": (
                    "Tighten the settings and habits on the phone, browser and Wi-Fi "
                    "you use every day."
                ),
                "difficulty": "Intermediate",
                "topics": [
                    "Mobile permissions and side-loaded apps",
                    "SIM swap defense",
                    "Browser settings, extensions and profiles",
                    "Public Wi-Fi and what a VPN really does",
                    "DNS filtering for your home network",
                    "Updates, patches, and end-of-life devices",
                ],
                "objectives": [
                    "Review and trim app permissions on your main phone",
                    "Set up a separate browser profile for banking",
                    "Ask your carrier about SIM-swap protection and turn it on if offered",
                ],
                "content": (
                    "## Module 7 — Mobile, Browser & Network Hygiene\n\n"
                    "Much of your digital life runs through a phone and a browser, and "
                    "their default settings are often tuned for convenience more than "
                    "safety. This module goes through the settings worth changing in both."
                ),
            },
            "ru": {
                "title": "Гигиена телефона, браузера и сети",
                "description": (
                    "Приводим в порядок телефон, браузер и Wi-Fi, которыми вы "
                    "пользуетесь каждый день: настройки, расширения, привычки."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Разрешения приложений и установка из неизвестных источников",
                    "Защита от SIM-swap",
                    "Настройки браузера, расширения и профили",
                    "Публичный Wi-Fi и что на самом деле даёт VPN",
                    "DNS-фильтрация для домашней сети",
                    "Обновления, патчи и устаревшие устройства",
                ],
                "objectives": [
                    "Проверить разрешения приложений на своём телефоне и убрать лишние",
                    "Завести отдельный профиль браузера для банковских сайтов",
                    "Узнать у оператора о защите от SIM-swap и включить её, если она есть",
                ],
                "content": (
                    "## Модуль 7 — Гигиена телефона, браузера и сети\n\n"
                    "Через телефон и браузер идёт большая часть цифровой жизни, а "
                    "настройки по умолчанию в них нередко рассчитаны больше на удобство, "
                    "чем на безопасность. Модуль показывает, какие из них стоит изменить."
                ),
            },
        },
    },
    {
        "slug": "incident-response",
        "order": 8,
        "is_locked": 1,
        "icon": "R",
        "accent": "amber",
        "duration": "60 min",
        "lessons": 7,
        "difficulty": "Advanced",
        "translations": {
            "en": {
                "title": "Incident Response & Recovery",
                "description": (
                    "What to do in the first hour after a breach: freezing accounts, "
                    "keeping evidence, reporting, and getting access back."
                ),
                "difficulty": "Advanced",
                "topics": [
                    "Recognizing you have been compromised",
                    "The first 60 minutes: triage and containment",
                    "Preserving evidence without tipping off the attacker",
                    "Who to contact: banks, carriers, platforms, law enforcement",
                    "Identity-theft recovery and credit freezes",
                    "Warning your contacts without spreading panic",
                    "A checklist to close the gaps afterward",
                ],
                "objectives": [
                    "Walk through a 60-minute containment plan from start to finish",
                    "Learn how to file a report with the FTC, IC3, or your local equivalent",
                    "Learn to regain a compromised account and check for leftover access",
                ],
                "content": (
                    "## Module 8 — Incident Response & Recovery\n\n"
                    "Anyone can click a link or take a call before they have had time to "
                    "think. What matters then is the next hour. This module covers how to "
                    "limit the damage, and how to close the gap so the same trick doesn't "
                    "work twice."
                ),
            },
            "ru": {
                "title": "Реакция на инциденты и восстановление",
                "description": (
                    "Что делать в первый час после взлома: заморозить счета, "
                    "сохранить улики, сообщить о случившемся, вернуть доступ."
                ),
                "difficulty": "Продвинутый",
                "topics": [
                    "Как понять, что вас взломали",
                    "Первые 60 минут: оценить ущерб и остановить его",
                    "Как сохранить улики и не спугнуть злоумышленника",
                    "Куда обращаться: банк, оператор, платформы, полиция",
                    "Кража личных данных: восстановление и заморозка кредитной истории",
                    "Как предупредить знакомых без паники",
                    "Чек-лист: как закрыть лазейки после случившегося",
                ],
                "objectives": [
                    "Пройти план первых 60 минут от начала до конца",
                    "Разобраться, куда и как подавать заявление о мошенничестве в вашей стране",
                    "Узнать, как вернуть взломанный аккаунт и проверить, не остался ли чужой доступ",
                ],
                "content": (
                    "## Модуль 8 — Реакция на инциденты и восстановление\n\n"
                    "Любой может нажать на ссылку или поддаться на звонок, не успев "
                    "подумать. Дальше многое зависит от первого часа. Модуль о том, как "
                    "ограничить ущерб и закрыть брешь, чтобы тот же приём не сработал дважды."
                ),
            },
        },
    },
    {
        "slug": "final-assessment",
        "order": 9,
        "is_locked": 1,
        "icon": "C",
        "accent": "green",
        "duration": "90 min",
        "lessons": 3,
        "difficulty": "Capstone",
        "translations": {
            "en": {
                "title": "Final Practice & Local Completion Record",
                "description": (
                    "A 40-question self-assessment and a capstone scenario to complete "
                    "at your own pace. Meet the threshold to create a local completion "
                    "record on this device."
                ),
                "difficulty": "Capstone",
                "topics": [
                    "40 multiple-choice questions covering Modules 1–8",
                    "Capstone scenario: a multi-stage fraud attempt",
                    "Review of answers and explanations",
                    "A browser-local completion record",
                ],
                "objectives": [
                    "Reach 80% or higher in the self-assessment",
                    "Work through the capstone scenario at your own pace",
                    "Create a printable local record of completed learning milestones",
                ],
                "content": (
                    "## Module 9 — Final Practice & Local Completion Record\n\n"
                    "Use this module to practise decisions you may face outside the "
                    "course: urgent, ambiguous requests that deserve a pause and an "
                    "independent check. The self-assessment is untimed and unproctored. "
                    "After completing the milestones, you can create a personal record "
                    "stored only in this browser. It is not a verified credential or "
                    "proof of competence."
                ),
            },
            "ru": {
                "title": "Финальная практика и локальная запись о прохождении",
                "description": (
                    "Самооценка из 40 вопросов и итоговый сценарий, которые можно "
                    "пройти в своём темпе. Если набрать проходной балл, на этом "
                    "устройстве можно создать локальную запись о прохождении."
                ),
                "difficulty": "Финал",
                "topics": [
                    "40 вопросов по материалам Модулей 1–8",
                    "Итоговый сценарий: многоэтапная попытка мошенничества",
                    "Разбор ответов с объяснениями",
                    "Локальная запись о завершённых этапах обучения",
                ],
                "objectives": [
                    "Набрать в самооценке не меньше 80%",
                    "Пройти итоговый сценарий в своём темпе",
                    "Создать локальную запись о пройденных этапах, которую можно распечатать",
                ],
                "content": (
                    "## Модуль 9 — Финальная практика и локальная запись о прохождении\n\n"
                    "Этот модуль помогает потренировать решения, с которыми можно "
                    "столкнуться вне курса: срочные и неоднозначные запросы, "
                    "при которых нужно остановиться и проверить всё независимым способом. "
                    "Самооценка проходит без таймера и прокторинга. После прохождения "
                    "этапов можно создать личную запись, которая хранится только в этом "
                    "браузере. Это не проверяемое удостоверение и не доказательство "
                    "компетентности."
                ),
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Scam-guide icon overrides
# ---------------------------------------------------------------------------
# Original markdown frontmatter shipped OS emoji (💔, 🛒, 🎰, etc.) in each
# guide's ``icon`` field. Those render unpredictably across operating systems
# and conflict with the analyst-console voice (DESIGN.md bans icon-set drift +
# the Lucide / Feather / OS-emoji reflex). Replace per-slug with a single
# uppercase mono letter that the templates render as a small bordered
# "category code". Letters are picked from the most-distinguishing word of
# each scam-pattern title, with no collisions across the ten guides.
SCAM_GUIDE_ICONS = {
    "phishing":                   "P",   # Phishing
    "nigerian-letters":           "N",   # Nigerian
    "investment-pyramids":        "I",   # Investment
    "fake-online-stores":         "F",   # Fake stores
    "abuse-on-dating-sites":      "D",   # Dating
    "sms-and-phone-scams":        "S",   # SMS / phone
    "fraud-with-lotteries":       "L",   # Lottery
    "scam-sites-working-at-home": "W",   # Work-at-home
    "false-charities":            "C",   # Charities
    "get-rich-quick-schemes":     "G",   # Get-rich-quick
}


# ---------------------------------------------------------------------------
# Lesson loader — JSON files in content/course/{module_slug}/{lesson}.{lang}.json
# ---------------------------------------------------------------------------

COURSE_CONTENT_DIR = CONTENT_DIR / "course"


def load_lessons() -> list[dict]:
    """Load every lesson JSON file under content/course/.

    Expected layout:
        content/course/{module_slug}/{lesson_slug}.{en|ru}.json

    Each file is a standalone lesson — module_slug, slug, locale, order, title
    and either body_md or a widget payload all live inside.
    """
    lessons: list[dict] = []
    if not COURSE_CONTENT_DIR.exists():
        return lessons

    for module_dir in sorted(COURSE_CONTENT_DIR.iterdir()):
        if not module_dir.is_dir():
            continue
        for lesson_file in sorted(module_dir.glob("*.json")):
            try:
                data = json.loads(lesson_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                log.warning("Skipping %s: %s", lesson_file, exc)
                continue

            # Derive locale from filename suffix if not set, e.g. "scam-economy.en.json".
            if "locale" not in data:
                parts = lesson_file.stem.rsplit(".", 1)
                if len(parts) == 2 and parts[1] in SUPPORTED_LOCALES:
                    data["locale"] = parts[1]
                else:
                    log.warning("Skipping %s: cannot determine locale", lesson_file)
                    continue

            if "module_slug" not in data:
                data["module_slug"] = module_dir.name
            if "slug" not in data:
                # Strip ".en"/".ru" suffix from filename
                stem = lesson_file.stem
                for suffix in (".en", ".ru"):
                    if stem.endswith(suffix):
                        stem = stem[: -len(suffix)]
                        break
                data["slug"] = stem

            if data.get("widget_type") == "course_v2":
                validate_v2(data.get("widget_config"), str(lesson_file))

            lessons.append(data)

    pairs: dict[tuple[str, str], dict[str, dict]] = {}
    for lesson in lessons:
        pairs.setdefault((lesson['module_slug'], lesson['slug']), {})[lesson['locale']] = lesson
    for key, translations in pairs.items():
        if any(item.get('widget_type') == 'course_v2' for item in translations.values()):
            if set(translations) != set(SUPPORTED_LOCALES):
                raise ValueError(f'course_v2 {key} needs EN/RU pair')
            validate_pair(translations['en'], translations['ru'], str(key))
    return lessons


# ---------------------------------------------------------------------------
# Full-text search index (Task F1)
# ---------------------------------------------------------------------------
# A FTS5 virtual table ``content_fts`` indexes posts + guides for both locales.
# It is dropped + recreated on every reseed (like the content tables) so the
# index never drifts from the source rows. ``database.search_content`` queries
# it; ``config.SEARCH_ENABLED`` is downgraded to False if this SQLite build
# lacks FTS5 (probed below), in which case search degrades to a LIKE scan.

_MD_STRIP_PATTERNS = [
    (re.compile(r"```.*?```", re.DOTALL), " "),      # fenced code blocks
    (re.compile(r"`([^`]*)`"), r"\1"),                # inline code
    (re.compile(r"!\[[^\]]*\]\([^)]*\)"), " "),       # images
    (re.compile(r"\[([^\]]*)\]\([^)]*\)"), r"\1"),    # links -> link text
    (re.compile(r"<[^>]+>"), " "),                     # raw HTML tags
    (re.compile(r"^#{1,6}\s*", re.MULTILINE), ""),    # heading markers
    (re.compile(r"^\s*>\s?", re.MULTILINE), ""),      # blockquote markers
    (re.compile(r"[*_~]{1,3}"), ""),                   # emphasis markers
    (re.compile(r"^\s*[-*+]\s+", re.MULTILINE), ""),  # bullet markers
    (re.compile(r"\s+"), " "),                          # collapse whitespace
]


def strip_markdown(text: str) -> str:
    """Reduce a markdown string to searchable plain text.

    Drops code fences, link/image syntax, raw HTML tags, heading/list/quote
    markers and emphasis punctuation, then collapses whitespace. The FTS body is
    indexed from this so the index holds words, not markup.
    """
    if not text:
        return ""
    out = text
    for pattern, repl in _MD_STRIP_PATTERNS:
        out = pattern.sub(repl, out)
    return out.strip()


async def build_search_index(db) -> None:
    """(Re)build the ``content_fts`` FTS5 index from posts + guides.

    Caller passes the open aiosqlite connection used by ``_reseed_content`` and
    holds the seed lock; this runs inside that same transaction so the index is
    rebuilt atomically with the content it mirrors. If FTS5 is unavailable the
    function sets ``config.SEARCH_ENABLED = False`` and leaves no virtual table.
    """
    # Probe FTS5 support in a scratch table; drop it immediately.
    try:
        await db.execute("DROP TABLE IF EXISTS _fts5_probe")
        await db.execute("CREATE VIRTUAL TABLE _fts5_probe USING fts5(x)")
        await db.execute("DROP TABLE _fts5_probe")
    except Exception as exc:  # noqa: BLE001 - any failure means no FTS5
        config.SEARCH_ENABLED = False
        log.warning(
            "FTS5 not available (%s) — site search degraded to LIKE scan", exc
        )
        await db.execute("DROP TABLE IF EXISTS content_fts")
        return

    config.SEARCH_ENABLED = True
    await db.execute("DROP TABLE IF EXISTS content_fts")
    await db.execute(
        "CREATE VIRTUAL TABLE content_fts USING fts5("
        "kind, slug, title, body, lang UNINDEXED, "
        "tokenize='unicode61 remove_diacritics 2')"
    )

    # Posts: body = title + subtitle + stripped markdown content.
    cursor = await db.execute(
        "SELECT slug, locale, title, subtitle, content FROM post"
    )
    for row in await cursor.fetchall():
        slug, locale, title, subtitle, content = row
        body = " ".join(
            part for part in (title, subtitle, strip_markdown(content or "")) if part
        )
        await db.execute(
            "INSERT INTO content_fts (kind, slug, title, body, lang) "
            "VALUES ('post', ?, ?, ?, ?)",
            (slug, title or "", body, locale),
        )

    # Guides: body = title + description + stripped markdown content.
    cursor = await db.execute(
        "SELECT slug, locale, title, description, content FROM scam_guide"
    )
    for row in await cursor.fetchall():
        slug, locale, title, description, content = row
        body = " ".join(
            part for part in (title, description, strip_markdown(content or "")) if part
        )
        await db.execute(
            "INSERT INTO content_fts (kind, slug, title, body, lang) "
            "VALUES ('guide', ?, ?, ?, ?)",
            (slug, title or "", body, locale),
        )


# ---------------------------------------------------------------------------
# Seed entry point
# ---------------------------------------------------------------------------

async def seed_database() -> None:
    """Refresh content tables from markdown files in content/.

    Wipes post, scam_guide, course_module, and lesson on every startup so edits
    to markdown frontmatter or body flow through on the next deploy. Safe
    because these tables hold derived content only — no user-generated state
    lives here. Future user-state tables (e.g. course progress) MUST live in
    separate tables so this wipe never touches them.

    Reads ``config.DATABASE_PATH`` / ``config.SEED_ON_STARTUP`` at call time
    (not import time) so test fixtures can swap them in by mutating the
    ``config`` module attributes.

    Skips entirely when ``SEED_ON_STARTUP`` is false. Otherwise the wipe+insert
    critical section is serialized across worker processes with an exclusive
    ``fcntl.flock`` on ``DATA_DIR/.seed.lock`` so concurrent workers do not race
    on the same DELETE/INSERT sequence (POSIX-only — prod is Linux, dev macOS).
    """
    if not config.SEED_ON_STARTUP:
        log.info("SEED_ON_STARTUP is off — skipping content reseed")
        return

    # The lock file lives next to the DB so the serialization scope follows the
    # configured data directory (tests swap DATA_DIR to a temp dir).
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = config.DATA_DIR / ".seed.lock"
    lock_fd = open(lock_path, "w")
    try:
        fcntl.flock(lock_fd.fileno(), fcntl.LOCK_EX)
        await _reseed_content()
    finally:
        fcntl.flock(lock_fd.fileno(), fcntl.LOCK_UN)
        lock_fd.close()


async def _reseed_content() -> None:
    """Wipe + reinsert all content tables. Caller holds the seed lock."""
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        # Share the same connection tuning as the rest of the app (WAL is already
        # persistent on the file from init_db; this also gives the busy_timeout
        # and synchronous=NORMAL settings to the single largest write txn).
        await _apply_pragmas(db)
        await db.execute("BEGIN")

        await db.execute("DELETE FROM post")
        await db.execute("DELETE FROM scam_guide")
        await db.execute("DELETE FROM course_module")
        await db.execute("DELETE FROM lesson")

        # Reset AUTOINCREMENT counters so IDs stay small and stable across reseeds.
        await db.execute(
            "DELETE FROM sqlite_sequence "
            "WHERE name IN ('post','scam_guide','course_module','lesson')"
        )

        guide_rows = load_markdown_files(CONTENT_DIR / "guides")
        expected_guide_slugs = {str(meta.get("slug", "")) for meta, _, _ in guide_rows}
        catalogued_at, provenance_catalogue = load_guide_provenance(expected_guide_slugs)
        for meta, content, locale in guide_rows:
            slug = meta.get("slug", "")
            # Per-slug override beats whatever the markdown frontmatter shipped
            # (those were OS emoji — see SCAM_GUIDE_ICONS docstring). Fall back
            # to the frontmatter value for any slug not yet in the table so a
            # newly-added guide still renders something until it's mapped.
            icon = SCAM_GUIDE_ICONS.get(slug, meta.get("icon", ""))
            source_scope, source_catalogued_at, sources_json = guide_provenance_for_locale(
                provenance_catalogue, catalogued_at, slug, locale
            )
            await db.execute(
                "INSERT INTO scam_guide "
                "(slug, locale, title, description, content, icon, threat_level, category, published_at, "
                "source_scope, source_catalogued_at, sources_json) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    slug,
                    locale,
                    meta.get("title", ""),
                    meta.get("description", ""),
                    content,
                    icon,
                    meta.get("threat_level", 3),
                    meta.get("category", ""),
                    meta.get("published_at", ""),
                    source_scope,
                    source_catalogued_at,
                    sources_json,
                ),
            )

        for subdir in ("interviews", "newsletters", "articles"):
            for meta, content, locale in load_markdown_files(CONTENT_DIR / subdir):
                post_type = meta.get("type", subdir.rstrip("s"))
                await db.execute(
                    "INSERT INTO post "
                    "(slug, locale, title, subtitle, type, content, cover_image, published_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        meta.get("slug", ""),
                        locale,
                        meta.get("title", ""),
                        meta.get("subtitle", ""),
                        post_type,
                        content,
                        meta.get("cover_image", ""),
                        meta.get("published_at", ""),
                    ),
                )

        # Course modules — one row per (module, locale).
        for module in COURSE_MODULES:
            for locale, tr in module["translations"].items():
                await db.execute(
                    'INSERT INTO course_module ('
                    'slug, locale, "order", title, description, content, is_locked, '
                    'icon, duration, lessons, difficulty, '
                    'topics_json, objectives_json, accent'
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        module["slug"],
                        locale,
                        module["order"],
                        tr["title"],
                        tr["description"],
                        tr["content"],
                        module["is_locked"],
                        module.get("icon", ""),
                        module.get("duration", ""),
                        module.get("lessons", 0),
                        tr.get("difficulty", module.get("difficulty", "")),
                        json.dumps(tr.get("topics", []), ensure_ascii=False),
                        json.dumps(tr.get("objectives", []), ensure_ascii=False),
                        module.get("accent", "cyan"),
                    ),
                )

        # Lessons — read from JSON files in content/course/.
        for lesson in load_lessons():
            widget_cfg = lesson.get("widget_config")
            await db.execute(
                "INSERT INTO lesson ("
                'module_slug, slug, locale, "order", title, body_md, '
                "widget_type, widget_config_json, est_minutes"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    lesson["module_slug"],
                    lesson["slug"],
                    lesson["locale"],
                    int(lesson.get("order", 0)),
                    lesson.get("title", ""),
                    lesson.get("body_md", ""),
                    lesson.get("widget_type"),
                    json.dumps(widget_cfg, ensure_ascii=False) if widget_cfg else None,
                    int(lesson.get("est_minutes", 5)),
                ),
            )

        # Build the full-text search index from the rows just inserted. Runs
        # inside this transaction so the index is atomic with its source content.
        await build_search_index(db)

        await db.commit()
