"""Seed the database with content from markdown files in content/ directory."""

import json
import logging
import re
from pathlib import Path

import aiosqlite

import config
from config import CONTENT_DIR

log = logging.getLogger(__name__)

SUPPORTED_LOCALES = ("en", "ru")


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
                "title": "Threat Landscape Fundamentals",
                "description": (
                    "Map the modern threat landscape and learn how cybercriminals "
                    "actually operate — from opportunistic phishing kits to "
                    "organized fraud networks."
                ),
                "difficulty": "Beginner",
                "topics": [
                    "Anatomy of a modern scam economy",
                    "Attack vectors: email, SMS, voice, web",
                    "Threat actors and their motivations",
                    "Glossary: malware, phishing, ransomware, RAT",
                    "Reading recent breach reports",
                    "Case study: the 2024 deepfake CFO heist",
                ],
                "objectives": [
                    "Identify the four major scam delivery channels",
                    "Explain why certain demographics are targeted",
                    "Recognize the eight most common attack patterns",
                ],
                "content": (
                    "## Module 1 — Threat Landscape Fundamentals\n\n"
                    "Welcome to DiScammer. Before you can defend yourself, you need a clear "
                    "picture of who is attacking, what they want, and how they reach you. "
                    "This module sets the foundation for everything that follows."
                ),
            },
            "ru": {
                "title": "Основы ландшафта киберугроз",
                "description": (
                    "Разберись, как устроена индустрия современного мошенничества — "
                    "от штампованных фишинговых наборов до организованных сетей "
                    "финансового обмана."
                ),
                "difficulty": "Начальный",
                "topics": [
                    "Как устроена экономика современных афер",
                    "Каналы атак: email, SMS, голос, веб",
                    "Кто и зачем атакует — мотивы преступников",
                    "Глоссарий: malware, phishing, ransomware, RAT",
                    "Как читать отчёты о свежих утечках",
                    "Кейс: ограбление CFO с помощью дипфейка в 2024",
                ],
                "objectives": [
                    "Различать четыре основных канала атак",
                    "Объяснять, почему атакующие выбирают конкретные группы жертв",
                    "Узнавать восемь самых частых паттернов атаки",
                ],
                "content": (
                    "## Модуль 1 — Основы ландшафта киберугроз\n\n"
                    "Добро пожаловать в DiScammer. Чтобы защищаться, нужно понимать, кто и "
                    "зачем атакует, и какими каналами тебя достают. Этот модуль закладывает "
                    "фундамент под всё, что будет дальше."
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
                    "Understand the psychological levers attackers pull — authority, "
                    "urgency, scarcity, reciprocity — and how to spot them in real "
                    "conversations."
                ),
                "difficulty": "Beginner",
                "topics": [
                    "Cialdini's six principles of influence",
                    "Pretexting and impersonation scripts",
                    "Vishing, smishing, and voice deepfakes",
                    "Romance and pig-butchering long cons",
                    "Urgency, fear, and authority triggers",
                    "Verbal red flags and conversational tells",
                    "Building a personal verification routine",
                ],
                "objectives": [
                    "Detect at least five emotional manipulation patterns in a sample message",
                    "Apply a two-step verification routine before sending money or credentials",
                    "Disarm a vishing call without escalating the conversation",
                ],
                "content": (
                    "## Module 2 — Social Engineering & Human Hacking\n\n"
                    "Most successful attacks never touch a vulnerability in software. They "
                    "exploit a vulnerability in attention. This module trains your ear to "
                    "recognize the patterns of human manipulation before they take hold."
                ),
            },
            "ru": {
                "title": "Социальная инженерия и взлом человека",
                "description": (
                    "Разбираем психологические рычаги, которыми давят мошенники — "
                    "авторитет, срочность, дефицит, взаимность — и учимся ловить их "
                    "в реальных разговорах."
                ),
                "difficulty": "Начальный",
                "topics": [
                    "Шесть принципов влияния Чалдини",
                    "Претекстинг и сценарии «я из банка»",
                    "Вишинг, смишинг и голосовые дипфейки",
                    "Романтические разводы и pig butchering",
                    "Триггеры срочности, страха и авторитета",
                    "Словесные красные флаги в разговоре",
                    "Личный протокол подтверждения личности",
                ],
                "objectives": [
                    "Находить минимум пять манипулятивных паттернов в сообщении",
                    "Применять двухшаговую проверку перед переводом денег или паролей",
                    "Спокойно завершать подозрительный голосовой звонок",
                ],
                "content": (
                    "## Модуль 2 — Социальная инженерия и взлом человека\n\n"
                    "Большинство успешных атак не используют уязвимости в коде. Они "
                    "используют уязвимости во внимании. Этот модуль настраивает ухо "
                    "на узнавание паттернов манипуляции до того, как они сработают."
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
                    "Dissect real phishing emails, SMS, and landing pages. Learn to "
                    "spot lookalike domains, hidden redirects, and credential-harvest "
                    "traps in seconds."
                ),
                "difficulty": "Beginner",
                "topics": [
                    "Anatomy of a phishing email",
                    "Lookalike domains: punycode, homoglyphs, subdomain tricks",
                    "Reading link previews before you click",
                    "Spotting credential-harvest landing pages",
                    "QR-code phishing (quishing)",
                    "Reporting and quarantining suspicious mail",
                ],
                "objectives": [
                    "Inspect any URL and decide in under 10 seconds whether to click",
                    "Identify three lookalike-domain techniques used in the wild",
                    "Use email headers and message authentication signals to verify a sender",
                ],
                "content": (
                    "## Module 3 — Phishing & Malicious Links\n\n"
                    "Phishing is still the number-one entry point for cyber attacks. The "
                    "good news: a few seconds of habit will catch the overwhelming majority "
                    "of attempts. This module trains that habit."
                ),
            },
            "ru": {
                "title": "Фишинг и вредоносные ссылки",
                "description": (
                    "Разбираем реальные фишинговые письма, SMS и поддельные страницы. "
                    "Учимся за секунды замечать домены-клоны, скрытые редиректы и "
                    "ловушки сбора паролей."
                ),
                "difficulty": "Начальный",
                "topics": [
                    "Анатомия фишингового письма",
                    "Домены-клоны: punycode, гомоглифы, поддомены",
                    "Как читать предпросмотр ссылки до клика",
                    "Признаки страниц, ворующих пароли",
                    "Фишинг через QR-коды (quishing)",
                    "Как корректно сообщить о подозрительном письме",
                ],
                "objectives": [
                    "Оценивать любую ссылку за 10 секунд до клика",
                    "Узнавать три техники подделки доменов в живой природе",
                    "Проверять отправителя по заголовкам письма",
                ],
                "content": (
                    "## Модуль 3 — Фишинг и вредоносные ссылки\n\n"
                    "Фишинг остаётся каналом №1 для проникновения в системы. Хорошая "
                    "новость: пара секунд правильной привычки ловит подавляющее большинство "
                    "попыток. Этот модуль ставит эту привычку."
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
                    "Build authentication habits that survive a breach. Compare "
                    "password managers, MFA methods, and recovery strategies."
                ),
                "difficulty": "Intermediate",
                "topics": [
                    "How credentials get stolen and resold",
                    "Password manager fundamentals",
                    "MFA tiers: SMS vs. TOTP vs. hardware keys",
                    "Passkeys and the post-password future",
                    "Account recovery without back doors",
                    "Auditing your digital footprint",
                ],
                "objectives": [
                    "Set up a password manager and migrate at least 20 logins",
                    "Enable phishing-resistant MFA on every critical account",
                    "Run a personal credential audit using a breach-check tool",
                ],
                "content": (
                    "## Module 4 — Passwords, MFA & Account Security\n\n"
                    "Your password is the lock on the front door of every account you own. "
                    "This module turns that lock into a vault — and teaches you why SMS "
                    "codes are no longer enough."
                ),
            },
            "ru": {
                "title": "Пароли, 2FA и защита аккаунтов",
                "description": (
                    "Закладываем привычки аутентификации, которые переживут любую "
                    "утечку. Разбираем менеджеры паролей, виды MFA и план "
                    "восстановления доступа."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Как ваши пароли крадут и перепродают",
                    "Менеджеры паролей: основы",
                    "Уровни MFA: SMS, TOTP, аппаратные ключи",
                    "Passkeys и мир без паролей",
                    "Восстановление доступа без бэкдоров",
                    "Аудит своего цифрового следа",
                ],
                "objectives": [
                    "Настроить менеджер паролей и перенести минимум 20 логинов",
                    "Включить MFA, устойчивый к фишингу, на критичных аккаунтах",
                    "Провести персональный аудит утечек",
                ],
                "content": (
                    "## Модуль 4 — Пароли, 2FA и защита аккаунтов\n\n"
                    "Пароль — это замок на двери каждого вашего аккаунта. Этот модуль "
                    "превращает этот замок в сейф и объясняет, почему SMS-коды больше не "
                    "достаточны."
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
                    "Spot fake stores, investment scams, and payment fraud before "
                    "money leaves your account. Learn the recovery playbook when it does."
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
                    "How to dispute a charge that actually wins",
                ],
                "objectives": [
                    "Evaluate any online store and assign a trust score in under two minutes",
                    "Recognize the five-stage pig-butchering pipeline",
                    "Execute the first 24-hour fraud response playbook from memory",
                ],
                "content": (
                    "## Module 5 — Financial Fraud & Payment Safety\n\n"
                    "Scammers stole more than $10 billion from consumers last year, and the "
                    "average loss keeps rising. This module is about keeping your money, "
                    "and getting it back when you can't."
                ),
            },
            "ru": {
                "title": "Финансовый фрод и безопасность платежей",
                "description": (
                    "Распознаём фейковые магазины, инвестиционные разводы и платёжное "
                    "мошенничество до того, как деньги ушли. И что делать, если уже ушли."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Признаки поддельного интернет-магазина",
                    "Криптомошенничество и фейковые ICO",
                    "Pig butchering: от любви до инвестиций",
                    "Атаки через фейковые счета и подмену реквизитов",
                    "Скимминг и цифровые «карманники»",
                    "Фейковая благотворительность и сборы помощи",
                    "Первые 24 часа после мошенничества",
                    "Как оспорить списание и реально вернуть деньги",
                ],
                "objectives": [
                    "Оценивать интернет-магазин за две минуты",
                    "Узнавать пять этапов pig-butchering-операции",
                    "По памяти выполнять план первых 24 часов после мошенничества",
                ],
                "content": (
                    "## Модуль 5 — Финансовый фрод и безопасность платежей\n\n"
                    "Мошенники забирают у людей более $10 млрд в год, и средний размер "
                    "потерь растёт. Этот модуль про то, как сохранить свои деньги и как "
                    "вернуть их, если уже поздно."
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
                "title": "AI-Powered Threats & Deepfakes",
                "description": (
                    "Train your eye and ear for synthetic media. Voice clones, video "
                    "deepfakes, and AI-written scams are now mainstream — here is how to spot them."
                ),
                "difficulty": "Intermediate",
                "topics": [
                    "How modern generative models produce text, voice, and video",
                    "Voice cloning attacks targeting family and finance",
                    "Video deepfakes in business email compromise",
                    "Detecting AI-written messages",
                    "Provenance signals: C2PA, watermarks, metadata",
                    "Building family verification protocols",
                ],
                "objectives": [
                    "Identify three reliable visual artifacts in a deepfake video",
                    "Set up a shared verification phrase with at least one trusted contact",
                    "Distinguish AI-generated text from human writing with 80% accuracy",
                ],
                "content": (
                    "## Module 6 — AI-Powered Threats & Deepfakes\n\n"
                    "Generative AI has lowered the cost of personalized attacks to near zero. "
                    "A scammer can now clone a CEO's voice from a 30-second podcast clip and "
                    "use it to wire-transfer millions. This module teaches you how to fight back."
                ),
            },
            "ru": {
                "title": "Угрозы на базе ИИ и дипфейки",
                "description": (
                    "Тренируем глаз и ухо на синтетический контент. Клонированные "
                    "голоса, видео-дипфейки и тексты от ИИ стали массовыми — учимся их ловить."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Как современные модели генерят текст, голос и видео",
                    "Атаки с клонированием голоса родственника или руководителя",
                    "Видео-дипфейки в схемах BEC (business email compromise)",
                    "Как отличить текст, написанный ИИ",
                    "Сигналы происхождения: C2PA, водяные знаки, метаданные",
                    "Семейный протокол подтверждения личности",
                ],
                "objectives": [
                    "Находить три надёжных визуальных артефакта в дипфейк-видео",
                    "Договориться о кодовом слове минимум с одним близким",
                    "Отличать текст от ИИ с точностью 80%",
                ],
                "content": (
                    "## Модуль 6 — Угрозы на базе ИИ и дипфейки\n\n"
                    "Генеративный ИИ опустил стоимость персонализированной атаки почти до "
                    "нуля. За 30 секунд аудио мошенник клонирует голос CEO и заводит "
                    "перевод на миллионы. Этот модуль учит сопротивляться."
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
                    "Lock down the devices and connections you use every day. "
                    "Practical settings, extensions, and habits for phones, browsers, and Wi-Fi."
                ),
                "difficulty": "Intermediate",
                "topics": [
                    "Mobile permissions and side-loaded apps",
                    "SIM swap defense",
                    "Browser hardening: settings, extensions, profiles",
                    "Public Wi-Fi and the real role of VPNs",
                    "DNS-level filtering for households",
                    "Updates, patches, and end-of-life devices",
                ],
                "objectives": [
                    "Audit and reduce app permissions on your primary phone",
                    "Configure a hardened browser profile for banking",
                    "Enable SIM-swap protections with your mobile carrier",
                ],
                "content": (
                    "## Module 7 — Mobile, Browser & Network Hygiene\n\n"
                    "Most of your digital life happens on a phone and inside a browser. "
                    "This module fixes the defaults — the ones that ship optimized for "
                    "convenience, not safety — across both."
                ),
            },
            "ru": {
                "title": "Гигиена телефона, браузера и сети",
                "description": (
                    "Закрываем устройства и каналы связи, которыми вы пользуетесь "
                    "каждый день: настройки телефона и браузера, расширения, привычки."
                ),
                "difficulty": "Средний",
                "topics": [
                    "Разрешения приложений и установка из неизвестных источников",
                    "Защита от SIM-swap",
                    "Прокачка браузера: настройки, расширения, профили",
                    "Публичный Wi-Fi и роль VPN на самом деле",
                    "Фильтрация на уровне DNS для дома",
                    "Обновления, патчи и устаревшие устройства",
                ],
                "objectives": [
                    "Проверить и урезать разрешения приложений на телефоне",
                    "Настроить отдельный браузерный профиль для банкинга",
                    "Включить защиту от SIM-swap у мобильного оператора",
                ],
                "content": (
                    "## Модуль 7 — Гигиена телефона, браузера и сети\n\n"
                    "Большая часть цифровой жизни идёт через телефон и браузер. Этот "
                    "модуль чинит дефолты — те, что заточены под удобство, а не безопасность."
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
                    "What to do in the first hour after a breach — freezing accounts, "
                    "preserving evidence, reporting, and rebuilding trust."
                ),
                "difficulty": "Advanced",
                "topics": [
                    "Recognizing you have been compromised",
                    "The first 60 minutes: triage and containment",
                    "Preserving evidence without tipping off the attacker",
                    "Who to contact: banks, carriers, platforms, law enforcement",
                    "Identity-theft recovery and credit freezes",
                    "Telling your network without spreading panic",
                    "Post-incident hardening checklist",
                ],
                "objectives": [
                    "Execute a 60-minute containment playbook end to end",
                    "File a complete report with the FTC, IC3, or local equivalent",
                    "Restore a compromised account and verify no persistence remains",
                ],
                "content": (
                    "## Module 8 — Incident Response & Recovery\n\n"
                    "If you live online long enough, something will eventually get through. "
                    "This module is about minimizing the damage when it does, and making "
                    "sure you don't get hit twice through the same hole."
                ),
            },
            "ru": {
                "title": "Реакция на инциденты и восстановление",
                "description": (
                    "Что делать в первый час после взлома — заморозка счетов, "
                    "сохранение улик, обращения, восстановление доступа."
                ),
                "difficulty": "Продвинутый",
                "topics": [
                    "Как понять, что вас взломали",
                    "Первые 60 минут: сортировка и сдерживание",
                    "Как сохранить улики, не спугнув атакующего",
                    "К кому идти: банки, операторы, платформы, полиция",
                    "Кража личности и заморозка кредитной истории",
                    "Как сообщить близким без паники",
                    "Чек-лист пост-инцидентной защиты",
                ],
                "objectives": [
                    "Пройти 60-минутный план сдерживания целиком",
                    "Подать полноценное заявление в нужный орган",
                    "Восстановить взломанный аккаунт и убедиться, что чужого доступа нет",
                ],
                "content": (
                    "## Модуль 8 — Реакция на инциденты и восстановление\n\n"
                    "Если жить онлайн достаточно долго, что-то рано или поздно пробьётся. "
                    "Этот модуль про то, как минимизировать ущерб, когда это случится, и "
                    "как не схватить второй раз через ту же дыру."
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
                "title": "Final Assessment & Certification",
                "description": (
                    "A 40-question proctored exam plus three scenario-based "
                    "simulations. Pass with 80% to earn your DiScammer certificate."
                ),
                "difficulty": "Capstone",
                "topics": [
                    "40 multiple-choice questions covering Modules 1–8",
                    "Phishing-triage simulation",
                    "Voice-deepfake response simulation",
                    "Live incident-response simulation",
                ],
                "objectives": [
                    "Score 80% or higher on the written exam",
                    "Complete all three scenario simulations within the time limit",
                    "Receive the DiScammer Defender certificate (shareable to LinkedIn)",
                ],
                "content": (
                    "## Module 9 — Final Assessment & Certification\n\n"
                    "This is where it gets real. The assessment mirrors the kind of "
                    "decisions you will actually face — fast, ambiguous, with real "
                    "consequences. Pass it and you have earned the certification."
                ),
            },
            "ru": {
                "title": "Итоговая аттестация и сертификат",
                "description": (
                    "Экзамен из 40 вопросов плюс три сценарных симуляции. Сдай "
                    "минимум на 80% — и получи сертификат DiScammer."
                ),
                "difficulty": "Финал",
                "topics": [
                    "40 вопросов по материалам Модулей 1–8",
                    "Симуляция: разбор фишинга",
                    "Симуляция: реакция на голосовой дипфейк",
                    "Симуляция: реакция на инцидент в реальном времени",
                ],
                "objectives": [
                    "Набрать 80% и выше на письменном экзамене",
                    "Пройти все три симуляции в отведённое время",
                    "Получить сертификат DiScammer Defender для LinkedIn",
                ],
                "content": (
                    "## Модуль 9 — Итоговая аттестация и сертификат\n\n"
                    "Здесь начинается серьёзная игра. Аттестация повторяет реальные "
                    "решения, которые тебе придётся принимать — быстро, в условиях "
                    "неопределённости. Сдашь — заслужил сертификат."
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

            lessons.append(data)

    return lessons


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

    Reads ``config.DATABASE_PATH`` at call time (not import time) so test
    fixtures can swap it in by mutating the ``config`` module attribute.
    """
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
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

        for meta, content, locale in load_markdown_files(CONTENT_DIR / "guides"):
            slug = meta.get("slug", "")
            # Per-slug override beats whatever the markdown frontmatter shipped
            # (those were OS emoji — see SCAM_GUIDE_ICONS docstring). Fall back
            # to the frontmatter value for any slug not yet in the table so a
            # newly-added guide still renders something until it's mapped.
            icon = SCAM_GUIDE_ICONS.get(slug, meta.get("icon", ""))
            await db.execute(
                "INSERT INTO scam_guide "
                "(slug, locale, title, description, content, icon, threat_level, category, published_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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

        await db.commit()
