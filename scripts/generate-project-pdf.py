#!/usr/bin/env python3
"""Build the admissions-oriented PROJECT.pdf overview.

The narrative is intentionally curated from PROJECT.md rather than being a
generic Markdown-to-PDF conversion: admissions readers need a short, accurate
technical story with explicit product limits. Keep the two files in sync and
render every generated page before committing the PDF.

Run with the bundled workspace Python when the host Python lacks ReportLab:

  /Users/dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
    scripts/generate-project-pdf.py
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

try:
    from reportlab.lib import colors
    from reportlab.lib.colors import HexColor
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        BaseDocTemplate,
        Frame,
        KeepTogether,
        PageBreak,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )
except ImportError as exc:  # pragma: no cover - environment failure path
    raise SystemExit(
        "ReportLab is required. Use the bundled workspace Python shown in "
        "this script's docstring."
    ) from exc


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "PROJECT.md"
OUTPUT = ROOT / "PROJECT.pdf"

INK = HexColor("#101828")
MUTED = HexColor("#475467")
LINE = HexColor("#D0D5DD")
PAPER = HexColor("#F8FAFC")
NAVY = HexColor("#102A43")
CYAN = HexColor("#0EA5A8")
BLUE = HexColor("#2563EB")
SOFT_CYAN = HexColor("#E6FFFB")
SOFT_BLUE = HexColor("#EFF6FF")
SOFT_AMBER = HexColor("#FFFAEB")
AMBER = HexColor("#B54708")


def source_is_current() -> None:
    """Prevent a PDF build when its required source overview is absent."""
    if not SOURCE.exists():
        raise SystemExit(f"Missing source overview: {SOURCE}")
    text = SOURCE.read_text(encoding="utf-8")
    required = ("What DiScammer is", "Architecture", "Product boundaries")
    missing = [heading for heading in required if heading not in text]
    if missing:
        raise SystemExit(
            "PROJECT.md no longer has the sections this curated overview relies on: "
            + ", ".join(missing)
        )


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=29,
            leading=34,
            textColor=INK,
            spaceAfter=9,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=18,
            textColor=MUTED,
        ),
        "eyebrow": ParagraphStyle(
            "eyebrow",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=CYAN,
            uppercase=True,
            tracking=1.4,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=23,
            textColor=INK,
            spaceBefore=0,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=15,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.6,
            leading=14.2,
            textColor=INK,
            spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.1,
            leading=11.2,
            textColor=MUTED,
        ),
        "stat": ParagraphStyle(
            "stat",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=19,
            leading=22,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
        "stat_label": ParagraphStyle(
            "stat_label",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.4,
            leading=10,
            textColor=MUTED,
            alignment=TA_CENTER,
            uppercase=True,
        ),
        "table_head": ParagraphStyle(
            "table_head",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.3,
            leading=10.5,
            textColor=NAVY,
        ),
        "table_cell": ParagraphStyle(
            "table_cell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.15,
            leading=10.8,
            textColor=INK,
        ),
    }


S = styles()


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, S[style])


def rule(width: float = 0) -> Table:
    width = width or 170 * mm
    table = Table([[""]], colWidths=[width], rowHeights=[1.2])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CYAN)]))
    return table


def panel(content: list, background=SOFT_BLUE, padding: float = 9) -> Table:
    table = Table([[content]], colWidths=[170 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), padding),
                ("RIGHTPADDING", (0, 0), (-1, -1), padding),
                ("TOPPADDING", (0, 0), (-1, -1), padding),
                ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
            ]
        )
    )
    return table


def stat(value: str, label: str) -> list:
    return [p(value, "stat"), p(label, "stat_label")]


def statistics() -> Table:
    cells = [
        stat("2", "authored languages"),
        stat("9", "course modules"),
        stat("55", "lesson pairs"),
        stat("23", "React islands"),
    ]
    table = Table([cells], colWidths=[42.5 * mm] * 4)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def table(rows: list[tuple[str, str]], widths: tuple[float, float] = (53, 117)) -> Table:
    data = [[p("Surface", "table_head"), p("What is implemented", "table_head")]]
    data += [[p(left, "table_cell"), p(right, "table_cell")] for left, right in rows]
    rendered = Table(data, colWidths=[widths[0] * mm, widths[1] * mm], repeatRows=1)
    rendered.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), SOFT_CYAN),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return rendered


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, height - 17 * mm, width - 20 * mm, height - 17 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.drawString(20 * mm, height - 12.5 * mm, "DiScammer | Technical and Portfolio Overview")
    canvas.setStrokeColor(LINE)
    canvas.line(20 * mm, 14 * mm, width - 20 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(20 * mm, 8.8 * mm, "Repository overview | Current source: PROJECT.md")
    canvas.drawRightString(width - 20 * mm, 8.8 * mm, f"{doc.page} | {date.today().isoformat()}")
    canvas.restoreState()


def build_story() -> list:
    story: list = []

    # Page 1 - identity and project shape
    story.extend(
        [
            Spacer(1, 27 * mm),
            p("UNIVERSITY PORTFOLIO PROJECT", "eyebrow"),
            Spacer(1, 5 * mm),
            p("DiScammer", "title"),
            p("A bilingual, privacy-conscious learning product for recognizing online scams.", "subtitle"),
            Spacer(1, 10 * mm),
            rule(),
            Spacer(1, 11 * mm),
            panel(
                [
                    p("Project author", "h2"),
                    p("Foma Molchanov", "body"),
                    p(
                        "DiScammer combines an accessible reading experience with hands-on checking tools. "
                        "Its product goal is practical: help a person pause before acting on a suspicious message, link, or request.",
                        "body",
                    ),
                ],
                background=SOFT_CYAN,
            ),
            Spacer(1, 10 * mm),
            statistics(),
            Spacer(1, 12 * mm),
            p("What the product contains", "h1"),
            p(
                "A Russian and English website with a journal archive, ten scam-type guides, a structured course, "
                "a local message checker, a local link inspector, and a separately served Unity WebGL learning game.",
                "body",
            ),
            p(
                "Public portfolio dossier: /en/portfolio and /ru/portfolio. The dossier separates implemented "
                "facts from the contribution and tooling account Foma must review before submission.",
                "small",
            ),
            Spacer(1, 8 * mm),
            panel(
                [
                    p("Honesty is a product requirement", "h2"),
                    p(
                        "The project does not present a browser-local completion record as a certificate, a verified credential, "
                        "or proof of competence. It does not claim measured learning outcomes without a real study.",
                        "body",
                    ),
                ],
                background=SOFT_AMBER,
            ),
            PageBreak(),
        ]
    )

    # Page 2 - real product surface and user boundaries
    story.extend(
        [
            p("Product intent and boundaries", "h1"),
            p(
                "DiScammer is designed for Russian- and English-speaking people who want to understand modern fraud patterns "
                "without being treated as security professionals. It aims to make a useful hesitation routine visible and repeatable.",
                "body",
            ),
            p("Implemented product surface", "h2"),
            table(
                [
                    ("Guides", "Ten authored EN/RU Markdown pairs with a static catalogue of 12 linked FTC, FBI, CISA, and Investor.gov primary-source entries. The sources support general guidance, not live alerts."),
                    ("Journal", "A finite archive of interviews, newsletters, and articles - not a demonstrated subscription or weekly publishing service."),
                    ("Course", "Nine modules and 55 EN/RU lesson pairs, combining reading, quizzes, and scenario practice."),
                    ("Check tools", "Message and link analysis performed in the browser, with no raw checker input sent to an analysis API."),
                    ("Learning record", "Browser-local progress, self-assessment result, and printable personal record. It can disappear if browser storage is cleared."),
                    ("Game", "The independent Unity WebGL build Antifraud Hero, served under /play/."),
                ]
            ),
            Spacer(1, 8 * mm),
            p("Trust boundaries", "h2"),
            panel(
                [
                    p("The final self-assessment is self-paced, untimed, unproctored, and unmonitored.", "body"),
                    p("A local record is not a verified credential, identity check, institutional issuance, or external transcript.", "body"),
                    p("Local analysis does not erase normal operational access logs or privacy-scrubbed, sampled client-error reporting.", "body"),
                ],
                background=SOFT_AMBER,
            ),
            Spacer(1, 8 * mm),
            p("Why this framing matters", "h2"),
            p(
                "An anti-scam product should show the same care with its own claims that it asks users to apply to suspicious messages. "
                "The repository's claim ledger is therefore a release gate, not a marketing checklist.",
                "body",
            ),
            PageBreak(),
        ]
    )

    # Page 3 - architecture
    story.extend(
        [
            p("Technical architecture", "h1"),
            p(
                "The site uses FastAPI and Jinja2 to send complete, localized HTML first. React enhances only interactive regions, "
                "so reading and navigation remain grounded in server-rendered pages.",
                "body",
            ),
            Spacer(1, 4 * mm),
            panel(
                [
                    p("Browser request", "h2"),
                    p("FastAPI router -> Jinja page -> optional React island -> content or local browser state", "body"),
                    p("SEO router -> robots, sitemap, RSS, and web manifest | Game router -> Unity WebGL", "small"),
                ],
                background=SOFT_BLUE,
            ),
            Spacer(1, 8 * mm),
            p("Key engineering decisions", "h2"),
            table(
                [
                    ("Server rendering", "FastAPI/Jinja2 renders the multilingual reading surfaces and compatibility redirects; page behavior is defined by the pages, API, game, and SEO routers."),
                    ("React islands", "23 lazy island registrations hydrate marked elements only. A captured server HTML fallback remains visible while a chunk loads or if an island fails."),
                    ("Asset delivery", "Vite writes content-hashed JS and CSS plus a manifest. The backend reads the manifest instead of depending on stable app.js or main.css filenames."),
                    ("Content pipeline", "Markdown sources feed the journal and guides. A checked-in provenance catalogue maps every guide to one to three dated, bilingual primary-source entries. Course module metadata is declared in code; lesson bodies and widget data are JSON files with paired locales."),
                    ("Runtime store", "SQLite keeps derived post, guide, module, lesson, and search data. Startup reseeding is file-locked and deliberately excludes durable user state."),
                ]
            ),
            Spacer(1, 8 * mm),
            p("Design principle", "h2"),
            p(
                "The game is the visual home for deeper cyberpunk immersion. The website is a calmer Field Office: specific, technically grounded, "
                "and readable on mobile in both Cyrillic and Latin scripts.",
                "body",
            ),
            PageBreak(),
        ]
    )

    # Page 4 - quality / governance
    story.extend(
        [
            p("Quality, privacy, and review", "h1"),
            p(
                "DiScammer's repository checks engineering behavior. They are valuable evidence of care, but they are not evidence that users learned more "
                "or that an external organisation certified the product.",
                "body",
            ),
            p("Repository quality gates", "h2"),
            table(
                [
                    ("Backend", "21 pytest modules cover routes, content lifecycle, security headers, search, localization, health, game handling, observability behavior, the Product Truth Gate, and guide provenance."),
                    ("Frontend", "5 Vitest files validate client-side utilities and interactive logic; the production build type-checks TypeScript and regenerates committed assets."),
                    ("End-to-end", "21 Playwright specifications exercise the composed product in CI, including the principal user flows and privacy-oriented checks."),
                    ("Localization", "The i18n audit verifies string use, missing/dead keys, and EN/RU key parity across server templates, Python, and React islands."),
                    ("Delivery", "CI runs dependency audits, backend tests, frontend tests/build, static-asset synchronization, Docker build, and E2E verification."),
                ]
            ),
            Spacer(1, 8 * mm),
            p("Claim governance", "h2"),
            panel(
                [
                    p("docs/portfolio/CLAIM_LEDGER.md tracks every changed, removed, in-progress, and unresolved public claim.", "body"),
                    p("A public claim must point to an implemented capability or a named primary source. A local browser value, internal review, or visual code never becomes external verification by wording alone.", "body"),
                ],
                background=SOFT_CYAN,
            ),
            Spacer(1, 8 * mm),
            p("What remains intentionally unclaimed", "h2"),
            p(
                "There is no user-outcome study, no institutional endorsement, no real-time threat-intelligence claim, no account-backed learning transcript, "
                "and no verified credential. Static source provenance now supports the guides; any impact claim still requires consented research with appropriately limited findings.",
                "body",
            ),
            Spacer(1, 9 * mm),
            p("Portfolio review note", "h2"),
            p(
                "A reviewer should be able to distinguish Foma's own decisions and work from mentoring, libraries, design assets, and AI-assisted tools. "
                "Those details require Foma's review; the repository deliberately does not invent them.",
                "body",
            ),
            PageBreak(),
        ]
    )

    # Page 5 - source map and conclusion
    story.extend(
        [
            p("Evidence map and next step", "h1"),
            p(
                "The project is strongest when its product story, technical implementation, and evidence limits agree. The following source order keeps those layers aligned.",
                "body",
            ),
            p("Authority order", "h2"),
            table(
                [
                    ("1. Executable evidence", "Code, schemas, tests, generated Vite manifest, and named local or deployed checks."),
                    ("2. Product intent", "PRODUCT.md and DESIGN.md define the current user need, language, interaction principles, and Field Office visual system."),
                    ("3. Public truth", "docs/portfolio/CLAIM_LEDGER.md defines the allowable wording and the claims still needing evidence or removal."),
                    ("4. Future work", "FEATURE_PLAN.md is a backlog. Its status is not proof of configuration, staging, or production operation."),
                    ("5. Historical context", "Earlier redesign plans, handoffs, old screenshots, and earlier PDFs explain decisions but do not override current evidence."),
                ]
            ),
            Spacer(1, 9 * mm),
            p("Status vocabulary", "h2"),
            panel(
                [
                    p("Implemented: source and repository checks exist. Locally verified: a named command or visual check passed on a stated revision.", "body"),
                    p("Configured: a configuration or runbook exists. Staging verified and production verified require dated checks against those environments.", "body"),
                ],
                background=SOFT_BLUE,
            ),
            Spacer(1, 9 * mm),
            p("Recommended continuation", "h2"),
            p(
                "Keep the source catalogue current only when its links and scope can be checked, and have Foma replace or approve the provisional first-person dossier before any application. "
                "Then test an incident-response flow with real, consented participants before making impact claims. That sequence strengthens both the product and the university portfolio without manufacturing evidence.",
                "body",
            ),
            Spacer(1, 14 * mm),
            rule(),
            Spacer(1, 6 * mm),
            p("Prepared from the current repository overview in PROJECT.md.", "small"),
        ]
    )
    return story


def build_pdf() -> None:
    source_is_current()
    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        title="DiScammer - Technical and Portfolio Overview",
        author="Foma Molchanov",
        subject="Admissions-oriented project overview",
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=23 * mm,
        bottomMargin=20 * mm,
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
        id="body",
    )
    doc.addPageTemplates([PageTemplate(id="overview", frames=[frame], onPage=header_footer)])
    doc.build(build_story())
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
