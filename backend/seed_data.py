"""Seed the database with content from markdown files in content/ directory."""

import json
import logging
import re
from pathlib import Path

import aiosqlite

import config
from config import CONTENT_DIR

log = logging.getLogger(__name__)


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


def load_markdown_files(directory: Path) -> list[tuple[dict, str]]:
    """Load all .md files from a directory, returning list of (metadata, content)."""
    results = []
    if not directory.exists():
        return results
    for md_file in sorted(directory.glob("*.md")):
        text = md_file.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        if not meta:
            log.warning("Skipping %s: missing or unparseable frontmatter", md_file)
            continue
        results.append((meta, body))
    return results


COURSE_MODULES = [
    {
        "order": 1,
        "title": "Threat Landscape Fundamentals",
        "description": (
            "Map the modern threat landscape and learn how cybercriminals actually "
            "operate — from opportunistic phishing kits to organized fraud networks."
        ),
        "icon": "\U0001F310",
        "accent": "cyan",
        "duration": "45 min",
        "lessons": 6,
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
            "This module sets the foundation for everything that follows.\n\n"
            "### What you will learn\n\n"
            "- How the global scam economy is structured, from solo operators to industrialized fraud rings.\n"
            "- The four delivery channels attackers use to reach victims and the trade-offs of each.\n"
            "- A working vocabulary so you can read security news, breach reports, and advisories with confidence.\n\n"
            "### Key takeaway\n\n"
            "Cybercrime is a business. Understanding the economics behind a scam tells "
            "you exactly where to look for the weak link — and it is almost always human."
        ),
        "is_locked": 0,
    },
    {
        "order": 2,
        "title": "Social Engineering & Human Hacking",
        "description": (
            "Understand the psychological levers attackers pull — authority, urgency, "
            "scarcity, reciprocity — and how to spot them in real conversations."
        ),
        "icon": "\U0001F9E0",
        "accent": "green",
        "duration": "60 min",
        "lessons": 7,
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
            "recognize the patterns of human manipulation before they take hold.\n\n"
            "### What you will learn\n\n"
            "- The six principles of influence Cialdini documented — and how attackers weaponize each one.\n"
            "- How a pretext is built: cover story, urgency hook, plausible authority.\n"
            "- Why romance scams and pig-butchering work even on skeptical, intelligent victims.\n\n"
            "### Key takeaway\n\n"
            "Emotion is the payload. If a message makes you feel rushed, scared, "
            "flattered, or specially chosen, slow down — that feeling is the attack."
        ),
        "is_locked": 1,
    },
    {
        "order": 3,
        "title": "Phishing & Malicious Links",
        "description": (
            "Dissect real phishing emails, SMS, and landing pages. Learn to spot "
            "lookalike domains, hidden redirects, and credential-harvest traps in seconds."
        ),
        "icon": "\U0001F3A3",
        "accent": "cyan",
        "duration": "55 min",
        "lessons": 6,
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
            "of attempts. This module trains that habit.\n\n"
            "### What you will learn\n\n"
            "- The structure of a credential-harvest funnel, from inbox to fake login page.\n"
            "- The exact characters and tricks attackers use to make `paypa1.com` look like `paypal.com`.\n"
            "- How to read a link preview, decode shortened URLs, and verify domain ownership before you click.\n\n"
            "### Key takeaway\n\n"
            "Never trust the display text of a link. Always read the destination "
            "URL, character by character, and verify it against the brand you expect."
        ),
        "is_locked": 1,
    },
    {
        "order": 4,
        "title": "Passwords, MFA & Account Security",
        "description": (
            "Build authentication habits that survive a breach. Compare password "
            "managers, MFA methods, and recovery strategies."
        ),
        "icon": "\U0001F510",
        "accent": "amber",
        "duration": "50 min",
        "lessons": 6,
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
            "codes are no longer enough.\n\n"
            "### What you will learn\n\n"
            "- Where stolen credentials end up and how attackers stuff them across services.\n"
            "- Why a password manager is the single highest-leverage security tool you can adopt today.\n"
            "- The real differences between SMS one-time codes, authenticator apps, hardware keys, and passkeys.\n\n"
            "### Key takeaway\n\n"
            "A unique password per site plus phishing-resistant MFA blocks "
            "more than 99% of bulk account takeover attempts. Make it your default posture."
        ),
        "is_locked": 1,
    },
    {
        "order": 5,
        "title": "Financial Fraud & Payment Safety",
        "description": (
            "Spot fake stores, investment scams, and payment fraud before money leaves your "
            "account. Learn the recovery playbook when it does."
        ),
        "icon": "\U0001F4B3",
        "accent": "red",
        "duration": "65 min",
        "lessons": 8,
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
            "and getting it back when you can't.\n\n"
            "### What you will learn\n\n"
            "- The visual and structural tells of a fake e-commerce site: domain age, payment options, return policy, copy quality.\n"
            "- How long-con investment scams build trust over weeks before triggering the loss.\n"
            "- The step-by-step playbook for the first 24 hours after you realize money is missing.\n\n"
            "### Key takeaway\n\n"
            "Speed beats sophistication. The faster you freeze cards, file disputes, "
            "and document the timeline, the more money you recover."
        ),
        "is_locked": 1,
    },
    {
        "order": 6,
        "title": "AI-Powered Threats & Deepfakes",
        "description": (
            "Train your eye and ear for synthetic media. Voice clones, video "
            "deepfakes, and AI-written scams are now mainstream — here is how to spot them."
        ),
        "icon": "\U0001F916",
        "accent": "cyan",
        "duration": "55 min",
        "lessons": 6,
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
            "use it to wire-transfer millions. This module teaches you how to fight back.\n\n"
            "### What you will learn\n\n"
            "- A non-technical mental model for how text, voice, and video generation actually work.\n"
            "- The specific artifacts and behaviors that still betray synthetic media — and which ones are disappearing.\n"
            "- How to establish a family or team verification protocol that defeats voice cloning.\n\n"
            "### Key takeaway\n\n"
            "When AI makes any face or voice cheap to fake, identity must move out "
            "of the channel. A shared word or callback number is now critical infrastructure."
        ),
        "is_locked": 1,
    },
    {
        "order": 7,
        "title": "Mobile, Browser & Network Hygiene",
        "description": (
            "Lock down the devices and connections you use every day. Practical "
            "settings, extensions, and habits for phones, browsers, and Wi-Fi."
        ),
        "icon": "\U0001F4F1",
        "accent": "green",
        "duration": "50 min",
        "lessons": 6,
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
            "convenience, not safety — across both.\n\n"
            "### What you will learn\n\n"
            "- Which app permissions matter and which are quiet privacy leaks.\n"
            "- How SIM swap attacks work and the exact carrier controls that block them.\n"
            "- A browser configuration that resists tracking and credential phishing without breaking your workflow.\n\n"
            "### Key takeaway\n\n"
            "Defaults favor advertisers, not you. Ten minutes per device, once a "
            "year, eliminates the majority of passive attack surface."
        ),
        "is_locked": 1,
    },
    {
        "order": 8,
        "title": "Incident Response & Recovery",
        "description": (
            "What to do in the first hour after a breach — freezing accounts, "
            "preserving evidence, reporting, and rebuilding trust."
        ),
        "icon": "\U0001F6E1️",
        "accent": "amber",
        "duration": "60 min",
        "lessons": 7,
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
            "sure you don't get hit twice through the same hole.\n\n"
            "### What you will learn\n\n"
            "- The early warning signs of an active compromise — in your inbox, your bank app, and your phone.\n"
            "- A printable 60-minute playbook covering containment, communication, and evidence preservation.\n"
            "- The agencies, hotlines, and forms that actually get fraud investigated in your country.\n\n"
            "### Key takeaway\n\n"
            "Calm beats clever in an incident. Follow the playbook, document "
            "everything, and resist the urge to retaliate or improvise."
        ),
        "is_locked": 1,
    },
    {
        "order": 9,
        "title": "Final Assessment & Certification",
        "description": (
            "A 40-question proctored exam plus three scenario-based simulations. "
            "Pass with 80% to earn your DiScammer certificate."
        ),
        "icon": "\U0001F3C6",
        "accent": "green",
        "duration": "90 min",
        "lessons": 3,
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
            "consequences. Pass it and you have earned the certification.\n\n"
            "### What to expect\n\n"
            "- A 40-question written exam covering every topic from Modules 1 through 8.\n"
            "- Three interactive simulations: phishing triage, deepfake call response, and incident containment.\n"
            "- A minimum score of 80% across the exam and simulations to pass.\n"
            "- A signed, verifiable DiScammer Defender certificate on completion.\n\n"
            "### Why it matters\n\n"
            "Knowledge is only useful under pressure. The capstone proves you can "
            "apply what you have learned when the message is urgent, the caller "
            "sounds familiar, and the clock is running."
        ),
        "is_locked": 1,
    },
]


async def seed_database() -> None:
    """Refresh content tables from markdown files in content/.

    Wipes post, scam_guide and course_module on every startup so edits to
    markdown frontmatter or body flow through on the next deploy. Safe because
    these tables hold derived content only — no user-generated state lives here.
    Future user-state tables (e.g. course progress) MUST live in separate
    tables so this wipe never touches them.

    Reads ``config.DATABASE_PATH`` at call time (not import time) so test
    fixtures can swap it in by mutating the ``config`` module attribute.
    """
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await db.execute("BEGIN")

        await db.execute("DELETE FROM post")
        await db.execute("DELETE FROM scam_guide")
        await db.execute("DELETE FROM course_module")

        # Reset AUTOINCREMENT counters so IDs stay small and stable across reseeds.
        await db.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('post','scam_guide','course_module')"
        )

        for meta, content in load_markdown_files(CONTENT_DIR / "guides"):
            await db.execute(
                "INSERT INTO scam_guide "
                "(slug, title, description, content, icon, threat_level, category, published_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    meta.get("slug", ""),
                    meta.get("title", ""),
                    meta.get("description", ""),
                    content,
                    meta.get("icon", ""),
                    meta.get("threat_level", 3),
                    meta.get("category", ""),
                    meta.get("published_at", ""),
                ),
            )

        for subdir in ("interviews", "newsletters", "articles"):
            for meta, content in load_markdown_files(CONTENT_DIR / subdir):
                post_type = meta.get("type", subdir.rstrip("s"))
                await db.execute(
                    "INSERT INTO post "
                    "(slug, title, subtitle, type, content, cover_image, published_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        meta.get("slug", ""),
                        meta.get("title", ""),
                        meta.get("subtitle", ""),
                        post_type,
                        content,
                        meta.get("cover_image", ""),
                        meta.get("published_at", ""),
                    ),
                )

        for module in COURSE_MODULES:
            await db.execute(
                'INSERT INTO course_module ('
                '"order", title, description, content, is_locked, '
                'icon, duration, lessons, difficulty, '
                'topics_json, objectives_json, accent'
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    module["order"],
                    module["title"],
                    module["description"],
                    module["content"],
                    module["is_locked"],
                    module.get("icon", ""),
                    module.get("duration", ""),
                    module.get("lessons", 0),
                    module.get("difficulty", ""),
                    json.dumps(module.get("topics", [])),
                    json.dumps(module.get("objectives", [])),
                    module.get("accent", "cyan"),
                ),
            )

        await db.commit()
