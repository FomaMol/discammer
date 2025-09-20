"""The proxy-trust setting and the loopback-only port binding must travel together.

Production served every trailing-slash URL as a 307 to a **cleartext** location
(`https://discammer.com/en/course/` -> `Location: http://discammer.com/en/course`,
observed 2026-08-01, on a zone that sends no HSTS — so browsers really did dial
port 80 before bouncing back to https).

nginx was sending `X-Forwarded-Proto $scheme` all along. uvicorn discarded it:
proxy-header support only applies when the peer is inside `forwarded_allow_ips`,
which defaults to `127.0.0.1`. `docker-compose.prod.yml` publishes the app on
the HOST's loopback, but from inside the container the peer is the Docker bridge
gateway, so the default never matched. Starlette's `redirect_slashes` builds its
absolute `Location` from the ASGI scope scheme, and — unlike canonical, sitemap
and feed URLs, which `routers/seo.py` rewrites through `SITE_ORIGIN` — nothing
corrected it.

The fix is `FORWARDED_ALLOW_IPS=*` in the prod compose file. That wildcard is
only defensible while the app is unreachable from anywhere but the host's
nginx: on a service published to `0.0.0.0`, any client could assert its own
scheme and forged client IP. These tests pin that pairing so the two settings
cannot drift apart — a later "let's expose 8000 for debugging" edit has to
confront the trust setting sitting next to it.
"""
from __future__ import annotations

import ipaddress
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BASE_COMPOSE = _REPO_ROOT / "docker-compose.yml"
_PROD_COMPOSE = _REPO_ROOT / "docker-compose.prod.yml"


class _ComposeLoader(yaml.SafeLoader):
    """SafeLoader that tolerates Compose's own tags (e.g. `ports: !override`)."""


def _ignore_tag(loader, suffix, node):
    """Build the node from its shape, dropping the tag.

    Re-entering `construct_object` on the same node would just hit the unknown
    tag again, so dispatch on the node type instead.
    """
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node, deep=True)
    return loader.construct_scalar(node)


_ComposeLoader.add_multi_constructor("!", _ignore_tag)


def _web_service(path: Path) -> dict:
    if not path.exists():
        pytest.skip(f"{path.name} not found")
    data = yaml.load(path.read_text(encoding="utf-8"), Loader=_ComposeLoader)
    return data["services"]["web"]


def _env_map(service: dict) -> dict[str, str]:
    """Compose accepts both list and mapping form for `environment`."""
    env = service.get("environment") or {}
    if isinstance(env, dict):
        return {str(k): str(v) for k, v in env.items()}
    out: dict[str, str] = {}
    for item in env:
        key, _, value = str(item).partition("=")
        out[key] = value
    return out


def test_prod_trusts_proxy_headers():
    """Without this, every trailing-slash redirect leaves the site over http://."""
    env = _env_map(_web_service(_PROD_COMPOSE))
    assert env.get("FORWARDED_ALLOW_IPS"), (
        "docker-compose.prod.yml must set FORWARDED_ALLOW_IPS so uvicorn honours "
        "nginx's X-Forwarded-Proto; otherwise redirects downgrade to http://"
    )


def test_proxy_trust_is_never_the_wildcard():
    """`*` would make /api/metrics publicly readable. This is the whole point.

    uvicorn's `_TrustedHosts` treats `"*"` as `always_trust`, and
    `get_trusted_client_host()` then returns the LEFTMOST X-Forwarded-For entry.
    nginx appends with `$proxy_add_x_forwarded_for`, so the leftmost value is
    whatever the caller sent. A request carrying `X-Forwarded-For: 127.0.0.1`
    would therefore arrive with `request.client.host == "127.0.0.1"` and satisfy
    `_is_local_request` — the only guard on /api/metrics while METRICS_TOKEN is
    unset (backend/main.py:837-856).

    A concrete CIDR takes the other branch, which walks the chain in reverse and
    returns the first hop outside the trusted set: the address nginx appended,
    which a public client cannot forge.
    """
    value = _env_map(_web_service(_PROD_COMPOSE)).get("FORWARDED_ALLOW_IPS", "")
    assert value != "*", "FORWARDED_ALLOW_IPS=* makes X-Forwarded-For caller-controlled"

    entries = [item.strip() for item in value.split(",") if item.strip()]
    assert entries, "FORWARDED_ALLOW_IPS must not be empty"
    for entry in entries:
        network = ipaddress.ip_network(entry, strict=False)  # raises on a literal
        assert network.is_private, f"{entry} is not a private range"


def test_prod_publishes_the_app_loopback_only():
    """The justification for the wildcard above: nothing but the host can connect."""
    ports = _web_service(_PROD_COMPOSE).get("ports") or []
    assert ports, "docker-compose.prod.yml must pin the published port"
    for mapping in ports:
        assert str(mapping).startswith("127.0.0.1:"), (
            f"published port {mapping!r} is not loopback-only — FORWARDED_ALLOW_IPS=* "
            "would then let any client forge its own scheme and client IP"
        )


def test_base_compose_does_not_trust_arbitrary_proxies():
    """The base file binds 0.0.0.0 (CI e2e, local dev), so it must NOT opt in."""
    env = _env_map(_web_service(_BASE_COMPOSE))
    assert "FORWARDED_ALLOW_IPS" not in env, (
        "docker-compose.yml publishes on every interface; trusting forwarded "
        "headers there would let any client on the network spoof scheme/IP"
    )
