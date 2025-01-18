"""Security response headers — CSP + the standard hardening set (SEC-1).

Applied to HTML document responses by the request middleware in ``main.py``.

Design choices:
- **CSP via per-request nonce.** Inline ``<script>`` blocks (the island i18n
  bootstrap, the guide ToC builder, and the JSON-LD data blocks) carry a
  ``nonce`` matching ``script-src 'nonce-…'`` so we never need ``'unsafe-inline'``
  for scripts. The nonce is generated per request in the middleware and exposed
  to templates as ``request.state.csp_nonce``.
- **``style-src 'unsafe-inline'``** is still required: the design uses many
  ``style="…"`` attributes plus the inline ``@font-face`` block, and inline style
  *attributes* cannot be nonce'd. This is the one remaining relaxation; hardening
  it (utility-only styles / hashed style block) is tracked as future work.
- **frame-src** is generated from the SAME iframe host allowlist the markdown
  sanitizer enforces (``markdown_renderer._ALLOWED_IFRAME_HOSTS``) so the embed
  policy has a single source of truth.
- **Report-Only by default.** Ship the strict policy as ``Content-Security-Policy-
  Report-Only`` first (it reports violations without blocking), collect reports at
  ``/api/csp-report`` for a week, then flip ``CSP_REPORT_ONLY=0`` to enforce.

Other document headers (X-Frame-Options, Referrer-Policy, X-Content-Type-Options,
Permissions-Policy, COOP) are also set here so the app is self-sufficient in dev
and under test. The repo nginx vhost no longer duplicates Referrer-Policy /
X-Content-Type-Options (single source = the app); HSTS stays at the TLS edge
(nginx + Cloudflare).
"""
from __future__ import annotations

import secrets

from config import (
    CSP_CONNECT_EXTRA,
    CSP_ENABLED,
    CSP_REPORT_ONLY,
    CSP_REPORT_URI,
)


def generate_nonce() -> str:
    """A fresh base64 CSP nonce per request (URL-safe, ~22 chars)."""
    return secrets.token_urlsafe(16)


def _frame_src_hosts() -> list[str]:
    """https:// sources for embeddable iframes, derived from the markdown
    sanitizer's allowlist so the two never drift. Each bare host yields both the
    apex and a wildcard (``https://h`` + ``https://*.h``) so subdomains like
    ``www.youtube.com`` / ``fast.wistia.net`` are covered."""
    try:
        from markdown_renderer import _ALLOWED_IFRAME_HOSTS as hosts
    except Exception:  # pragma: no cover - renderer always importable in app
        hosts = {
            "kinescope.io",
            "fast.wistia.net",
            "fast.wistia.com",
            "drive.google.com",
            "docs.google.com",
            "youtube.com",
            "youtube-nocookie.com",
            "player.vimeo.com",
        }
    out: list[str] = []
    for h in sorted(hosts):
        out.append(f"https://{h}")
        out.append(f"https://*.{h}")
    return out


def build_csp(nonce: str) -> str:
    """Assemble the Content-Security-Policy string for one request."""
    connect = ["'self'"]
    if CSP_CONNECT_EXTRA:
        connect.extend(CSP_CONNECT_EXTRA.split())

    directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        # Inline scripts are nonce-gated — no 'unsafe-inline' for script.
        f"script-src 'self' 'nonce-{nonce}'",
        # Inline style ATTRIBUTES + @font-face block need 'unsafe-inline'.
        "style-src 'self' 'unsafe-inline'",
        # OG/cover images can be remote https; data: for inline SVG/data URIs.
        "img-src 'self' data: https:",
        "font-src 'self'",
        # Local /media/ video is same-origin; blob: for client-built media.
        "media-src 'self' blob:",
        f"connect-src {' '.join(connect)}",
        # 'self' first: /{lang}/game frames the same-origin Unity bundle at
        # /play/ (GameLauncher island); without it, enforcing CSP would block
        # the game iframe from the parent side.
        f"frame-src 'self' {' '.join(_frame_src_hosts())}",
        "worker-src 'self'",
        "manifest-src 'self'",
    ]
    if CSP_REPORT_URI:
        directives.append(f"report-uri {CSP_REPORT_URI}")
    return "; ".join(directives)


# Static document headers that don't depend on the per-request nonce.
# X-Frame-Options is NOT here: it depends on the route (DENY everywhere except
# the /play/ game bundle, which the same-origin game page frames).
_STATIC_DOC_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    # interest-cohort=() opts out of FLoC/Topics; lock down powerful features.
    "Permissions-Policy": (
        "camera=(), microphone=(), geolocation=(), browsing-topics=(), "
        "interest-cohort=(), payment=(), usb=()"
    ),
}


def apply_security_headers(
    response,
    nonce: str,
    *,
    include_csp: bool = True,
    same_origin_framing: bool = False,
) -> None:
    """Add the security headers to an HTML document ``response`` in place.

    Only call for ``text/html`` responses — CSP/X-Frame-Options/etc. are
    document-level and pointless (waste) on JSON/asset responses.

    ``include_csp=False`` keeps the static hardening headers but omits the CSP —
    used for the Unity game (``/play/``), whose static, engine-generated
    index.html carries inline loader scripts we can't nonce and needs WASM
    eval; giving it the nonce-only policy would break it once enforced. The
    game bundle is otherwise self-contained.

    ``same_origin_framing=True`` answers ``X-Frame-Options: SAMEORIGIN`` instead
    of ``DENY`` — required for ``/play/``, which ``/{lang}/game`` embeds in an
    ``<iframe>`` (GameLauncher). DENY blocks even same-origin framing and the
    browser renders "refused to connect" inside the game dialog.
    """
    response.headers.setdefault(
        "X-Frame-Options", "SAMEORIGIN" if same_origin_framing else "DENY"
    )
    for name, value in _STATIC_DOC_HEADERS.items():
        response.headers.setdefault(name, value)
    if include_csp and CSP_ENABLED:
        header = (
            "Content-Security-Policy-Report-Only"
            if CSP_REPORT_ONLY
            else "Content-Security-Policy"
        )
        # setdefault so an explicit per-route override (rare) wins.
        response.headers.setdefault(header, build_csp(nonce))
