"""Public Umami configuration and authored page metadata; never user input.

The website ID is public (not an API key). Empty means completely disabled.
No remote JavaScript runs on the checker pages: our small, audited client sends
only the explicit payload documented in docs/analytics.md.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from jinja2 import pass_context

from config import SITE_ORIGIN

COLLECTOR = "https://cloud.umami.is/api/send"


def load_website_id():
    try:
        settings = json.loads(Path(__file__).with_name("analytics-settings.json").read_text())
        value = os.environ.get("UMAMI_WEBSITE_ID", settings.get("website_id", ""))
        return str(UUID(value)) if value else ""
    except (OSError, ValueError, TypeError, AttributeError):
        return ""


WEBSITE_ID = load_website_id()

# Names are deliberately language-independent for bilingual funnels.
STATIC_SURFACES = {
    "": "home", "journal": "journal", "course": "course", "game": "game",
    "about": "about", "portfolio": "portfolio", "check": "check",
    "inspect": "inspect", "search": "search",
}


@pass_context
def analytics_config(context):
    if not WEBSITE_ID:
        return None
    request = context.get("request")
    if request is None:
        return None
    lang = context.get("lang")
    if lang not in ("en", "ru"):
        return None
    path = request.url.path.rstrip("/")
    surface = STATIC_SURFACES.get(path.removeprefix(f"/{lang}").lstrip("/"))
    canonical = f"/{lang}/" if path == f"/{lang}" else path
    if surface is None:
        # Dynamic paths come from content records that successfully loaded,
        # never from the requested slug (which could be a secret on a 404).
        parts = []
        for key in ("post", "guide", "module", "lesson"):
            item = context.get(key)
            if item and isinstance(item, dict):
                slug = item.get("slug", "")
                if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,119}", slug):
                    return None
                parts.append((key, slug))
        if [key for key, _ in parts] == ["post"]:
            surface, canonical = "article", f"/{lang}/journal/{parts[0][1]}"
        elif [key for key, _ in parts] == ["guide"]:
            surface, canonical = "guide", f"/{lang}/guide/{parts[0][1]}"
        elif [key for key, _ in parts] == ["module"]:
            surface, canonical = "module", f"/{lang}/course/{parts[0][1]}"
        elif [key for key, _ in parts] == ["module", "lesson"]:
            surface, canonical = "lesson", f"/{lang}/course/{parts[0][1]}/{parts[1][1]}"
        else:
            return None
        if canonical != path:
            return None
    if not path.startswith(f"/{lang}"):
        return None
    return {
        "websiteId": WEBSITE_ID, "endpoint": COLLECTOR,
        "hostname": urlsplit(SITE_ORIGIN).hostname,
        "url": canonical, "surface": surface, "language": lang,
    }
