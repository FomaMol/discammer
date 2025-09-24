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

The fix is `FORWARDED_ALLOW_IPS` in the prod compose file — set to the Docker
bridge RANGE, never to `*`. The wildcard looks equivalent (the container is
loopback-published, so only nginx can reach it) but it also changes how uvicorn
reads X-Forwarded-For: `always_trust` makes it take the LEFTMOST entry, and
nginx APPENDS rather than replaces, so the leftmost value is whatever the caller
sent. That turned `X-Forwarded-For: 127.0.0.1` into a bypass of
`_is_local_request`, the only guard on /api/metrics while METRICS_TOKEN is
unset. Caught in review before it shipped.

These tests therefore work at two levels: the config assertions pin the setting
and the loopback-only binding together so they cannot drift apart, and the
behavioural ones drive uvicorn's real middleware and the real app — including
the worst-case wildcard configuration, which the app must now survive on its
own.
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
    """The justification for trusting the bridge at all: only the host can connect."""
    ports = _web_service(_PROD_COMPOSE).get("ports") or []
    assert ports, "docker-compose.prod.yml must pin the published port"
    for mapping in ports:
        assert str(mapping).startswith("127.0.0.1:"), (
            f"published port {mapping!r} is not loopback-only — trusting forwarded "
            "headers would then let any client on the network assert its own scheme"
        )


def test_base_compose_does_not_trust_arbitrary_proxies():
    """The base file binds 0.0.0.0 (CI e2e, local dev), so it must NOT opt in."""
    env = _env_map(_web_service(_BASE_COMPOSE))
    assert "FORWARDED_ALLOW_IPS" not in env, (
        "docker-compose.yml publishes on every interface; trusting forwarded "
        "headers there would let any client on the network spoof scheme/IP"
    )


# ---------------------------------------------------------------------------
# Behavioural half of this file: the config assertions above only read YAML.
# These drive uvicorn's real middleware, which is where the actual danger lives.
# ---------------------------------------------------------------------------


def _run_proxy_middleware(trusted_hosts: str, x_forwarded_for: str) -> tuple[str, str]:
    """Return (client_host, scheme) after uvicorn's ProxyHeadersMiddleware runs.

    The scope models production: the peer is the Docker bridge gateway, because
    nginx reaches the container through the published loopback port.
    """
    import asyncio

    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

    seen: dict = {}

    async def app(scope, receive, send):
        seen.update(scope)

    scope = {
        "type": "http",
        "client": ("172.18.0.1", 45678),
        "scheme": "http",
        "headers": [
            (b"x-forwarded-for", x_forwarded_for.encode()),
            (b"x-forwarded-proto", b"https"),
        ],
    }
    asyncio.run(ProxyHeadersMiddleware(app, trusted_hosts=trusted_hosts)(scope, None, None))
    return seen["client"][0], seen["scheme"]


# nginx APPENDS with $proxy_add_x_forwarded_for, so a caller who sends their own
# X-Forwarded-For ends up leftmost and the real address is appended after it.
_FORGED = "127.0.0.1, 203.0.113.9"


def test_wildcard_trust_would_hand_the_attacker_the_client_host():
    """Document the trap concretely, so nobody 'simplifies' the CIDR back to *."""
    host, scheme = _run_proxy_middleware("*", _FORGED)
    assert host == "127.0.0.1", "uvicorn takes the leftmost XFF entry when always_trust"
    assert scheme == "https"


def test_scoped_trust_returns_the_address_nginx_appended():
    """The configured range must resolve the real client, not the forged one."""
    host, scheme = _run_proxy_middleware("172.16.0.0/12", _FORGED)
    assert host == "203.0.113.9"
    # …while still honouring X-Forwarded-Proto, which is the point of the setting.
    assert scheme == "https"


def test_metrics_gate_holds_even_under_wildcard_trust(client):
    """Defence in depth: the gate must not rest on the deploy config alone.

    Wraps the real app in the worst-case middleware configuration and forges the
    header. /api/metrics must still refuse — it is documented as never public,
    and METRICS_TOKEN is unset in production.
    """
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

    from fastapi.testclient import TestClient

    import main

    wrapped = TestClient(ProxyHeadersMiddleware(main.app, trusted_hosts="*"))
    r = wrapped.get("/api/metrics", headers={"X-Forwarded-For": _FORGED})
    assert r.status_code == 404, f"metrics leaked under forged XFF: {r.status_code}"
