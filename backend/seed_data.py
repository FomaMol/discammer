"""Seed the database with content from markdown files in content/ directory."""

import re
from pathlib import Path

import aiosqlite

from config import CONTENT_DIR, DATABASE_PATH


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Parse YAML-like frontmatter from markdown text. Returns (metadata, body)."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        return {}, text

    meta_str, body = match.group(1), match.group(2)
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
        if meta:
            results.append((meta, body))
    return results


COURSE_MODULES = [
    {
        "order": 1,
        "title": "Introduction to Cyber Threats",
        "description": "Learn the fundamentals of the modern threat landscape — from malware to social engineering.",
        "content": (
            "## Module 1: Introduction to Cyber Threats\n\n"
            "Welcome to the DiScammer Training Program. In this module, you will learn about the most common "
            "types of cyber threats facing individuals and organizations today.\n\n"
            "### Topics Covered\n\n"
            "- What is cybercrime and why it matters\n"
            "- The evolution of digital threats\n"
            "- Key terminology: malware, phishing, social engineering, ransomware\n"
            "- The anatomy of a cyber attack\n"
            "- Real-world case studies\n\n"
            "### Key Takeaway\n\n"
            "Understanding threats is the first step to defending against them. "
            "By the end of this module, you'll be able to identify the most common attack vectors."
        ),
        "is_locked": 0,
    },
    {
        "order": 2,
        "title": "Social Engineering 101",
        "description": "Understand how attackers exploit human psychology to bypass security.",
        "content": (
            "## Module 2: Social Engineering 101\n\n"
            "Social engineering attacks exploit trust, authority, urgency, and other psychological triggers.\n\n"
            "### Topics Covered\n\n"
            "- The six principles of influence (Cialdini)\n"
            "- Phishing, vishing, smishing, and pretexting\n"
            "- Baiting and quid pro quo attacks\n"
            "- Tailgating and physical social engineering\n"
            "- How to build a human firewall\n"
        ),
        "is_locked": 1,
    },
    {
        "order": 3,
        "title": "Password Security & MFA",
        "description": "Build strong authentication habits and understand multi-factor authentication.",
        "content": (
            "## Module 3: Password Security & MFA\n\n"
            "Passwords are the first line of defense, but they are often the weakest link.\n\n"
            "### Topics Covered\n\n"
            "- Why passwords get compromised\n"
            "- Creating strong, memorable passwords\n"
            "- Password managers: how they work and why you need one\n"
            "- Multi-factor authentication explained\n"
            "- Hardware keys vs. authenticator apps vs. SMS\n"
        ),
        "is_locked": 1,
    },
    {
        "order": 4,
        "title": "Safe Browsing & Email Hygiene",
        "description": "Navigate the web and your inbox without falling into traps.",
        "content": (
            "## Module 4: Safe Browsing & Email Hygiene\n\n"
            "Every link is a potential threat, every attachment a possible payload.\n\n"
            "### Topics Covered\n\n"
            "- Identifying malicious URLs\n"
            "- Browser security settings and extensions\n"
            "- Email header analysis\n"
            "- Safe download practices\n"
            "- VPNs and secure connections\n"
        ),
        "is_locked": 1,
    },
    {
        "order": 5,
        "title": "Financial Fraud Prevention",
        "description": "Protect yourself from investment scams, fake stores, and payment fraud.",
        "content": (
            "## Module 5: Financial Fraud Prevention\n\n"
            "Financial scams cause billions in losses annually. Learn to protect your assets.\n\n"
            "### Topics Covered\n\n"
            "- Common financial scam patterns\n"
            "- Cryptocurrency and ICO fraud\n"
            "- Fake online stores and payment gateways\n"
            "- Investment pyramid schemes\n"
            "- Reporting fraud and recovering funds\n"
        ),
        "is_locked": 1,
    },
    {
        "order": 6,
        "title": "Final Assessment",
        "description": "Test your knowledge and earn your DiScammer certification.",
        "content": (
            "## Module 6: Final Assessment\n\n"
            "Put everything you've learned to the test.\n\n"
            "### What to Expect\n\n"
            "- 30-question quiz covering all modules\n"
            "- Scenario-based challenges\n"
            "- Minimum 80% score to pass\n"
            "- DiScammer Certification on completion\n"
        ),
        "is_locked": 1,
    },
]


async def seed_database() -> None:
    """Refresh content tables from markdown files in content/.

    Wipes post, scam_guide and course_module on every startup so edits to
    markdown frontmatter or body flow through on the next deploy. Safe because
    these tables hold derived content only — no user-generated state lives here.
    """
    async with aiosqlite.connect(DATABASE_PATH) as db:
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
                'INSERT INTO course_module ("order", title, description, content, is_locked) '
                "VALUES (?, ?, ?, ?, ?)",
                (
                    module["order"],
                    module["title"],
                    module["description"],
                    module["content"],
                    module["is_locked"],
                ),
            )

        await db.commit()
