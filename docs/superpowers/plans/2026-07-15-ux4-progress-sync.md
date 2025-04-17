# UX-4 Progress Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать опциональную синхронизацию прогресса курса между устройствами через 128-битный sync-код, где сервер хранит только клиент-шифрованный блоб и не может его прочитать.

**Architecture:** Клиент генерит 128-битный секрет, HKDF-SHA256 разделяет его на `blob_id` (виден серверу) и `enc_key` (не уходит никогда); полезная нагрузка — уже существующий `exportProgress()`, зашифрованный AES-GCM-256. Сервер — три POST-эндпоинта и одна таблица `sync_blob`, намеренно оставленная вне обоих деструктивных путей (seed-wipe и drift-DROP). Приём — `importProgress()`, уже реализующий недеструктивный best-of merge.

**Tech Stack:** Python 3.12 / FastAPI / aiosqlite / SQLite (WAL); TypeScript / React 18 / Vite / Tailwind; WebCrypto (без новых зависимостей); pytest / Vitest / Playwright.

**Спека:** [`docs/superpowers/specs/2026-07-15-ux4-progress-sync-design.md`](../specs/2026-07-15-ux4-progress-sync-design.md) — одобрена владельцем 2026-07-15.

## Global Constraints

Каждая задача обязана соблюдать всё нижеперечисленное.

- **Приватность чекера/инспектора не затрагивается.** Их ввод не покидает браузер; `assertNoNetworkLeak` в e2e остаётся зелёным. UX-4 — про прогресс курса, не про инструменты.
- **Сервер никогда не видит плейнтекст.** Любое решение, при котором сервер может расшифровать блоб, — провал задачи.
- **`blob_id` — только в теле POST, никогда в URL** (иначе попадёт в access-логи nginx, а он даёт право скачать и удалить блоб).
- **`sync_blob` не добавляется** ни в `DELETE FROM`-список `seed_data.py:1064-1075`, ни в кортеж `_*_REQUIRED_COLS` / цикл `database.py:171-182`. Стратегия там drop-based и для user-state недопустима.
- **RU/EN — только парой.** `.venv/bin/python scripts/i18n_audit.py` (из корня) зелёный.
- **`backend/static/`** пересобирается и коммитится вместе с любым изменением фронта: `export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"; cd frontend && npm run build`.
- **Курс = 9 модулей.**
- **Публичные формулировки** — только из `docs/portfolio/CLAIM_LEDGER.md`.
- **Никаких push / PR / деплоя** без явной авторизации владельца.
- **Статусы различны:** `implemented` (код+проверки в репо) ≠ `configured` (только конфиг/ранбук) ≠ `production verified` (датированная внешняя проверка). Ничего в этой ветке не задеплоено.
- **Никаких новых зависимостей** во `frontend/package.json`. Только WebCrypto.

**Команды:**
```bash
cd backend && ../.venv/bin/python -m pytest -q          # 157 зелёных до начала работ
.venv/bin/python scripts/i18n_audit.py                  # из корня
export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"
cd frontend && npm test                                 # 139 зелёных до начала работ
```

---

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `backend/database.py` | + `sync_blob` в `SQL_CREATE_TABLES`; функции доступа к блобу и свип |
| `backend/config.py` | + `SYNC_RATE_LIMIT`, `SYNC_BLOB_TTL_DAYS`, `SYNC_MAX_BODY` |
| `backend/main.py` | + три POST-хендлера, `_sync_limiter`, exempt-пути, свип в lifespan |
| `backend/tests/conftest.py` | + `_sync_limiter` в кортеж сброса |
| `backend/tests/test_sync.py` | новый — контракт эндпоинтов |
| `backend/tests/test_db_lifecycle.py` | + инвариант «reseed не трогает `sync_blob`» |
| `frontend/src/utils/sync-crypto.ts` | новый — base32, HKDF, AES-GCM. Чистая крипта, без сети |
| `frontend/src/utils/sync-client.ts` | новый — транспорт + состояние связки. Без крипто-примитивов |
| `frontend/src/components/ProgressSync.tsx` | новый — остров UI |
| `frontend/src/main.tsx` | + 24-я запись реестра |
| `backend/templates/course.html` | + точка монтирования |
| `frontend/sw-src.js` | обход `/api/sync/*` |

Крипта и транспорт намеренно разведены: `sync-crypto.ts` тестируется без сети и без моков `fetch`, а `sync-client.ts` — без реальной крипты.

---

## Task 1: Таблица `sync_blob` и инвариант выживания при reseed

Самая важная задача плана. Всё остальное бессмысленно, если таблицу вытирает старт.

**Files:**
- Modify: `backend/database.py:11-75` (`SQL_CREATE_TABLES`)
- Test: `backend/tests/test_db_lifecycle.py`

**Interfaces:**
- Consumes: ничего.
- Produces: таблица `sync_blob(blob_id TEXT PRIMARY KEY, ciphertext BLOB NOT NULL, updated_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`.

- [ ] **Step 1: Написать падающий тест**

В `backend/tests/test_db_lifecycle.py` рядом с `test_seed_on_startup_off_skips_wipe`. Сначала прочитай, как этот файл поднимает временную БД (фикстура `temp_seed_db`), и следуй её идиоме — не изобретай вторую.

```python
@pytest.mark.asyncio
async def test_reseed_does_not_touch_sync_blob(temp_seed_db):
    """UX-4 invariant: sync_blob holds durable USER state, so the startup
    wipe+reseed of derived content tables must never touch it. This is the
    promise seed_database()'s own docstring makes; this test is what makes it
    real rather than aspirational."""
    import aiosqlite
    import config
    from seed_data import seed_database

    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO sync_blob (blob_id, ciphertext, updated_at, last_seen_at)"
            " VALUES (?, ?, ?, ?)",
            ("a" * 64, b"opaque-ciphertext", "2026-07-15T00:00:00Z", "2026-07-15T00:00:00Z"),
        )
        await db.commit()

    await seed_database()

    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT ciphertext FROM sync_blob WHERE blob_id = ?", ("a" * 64,)
        )
        row = await cursor.fetchone()

    assert row is not None, "reseed wiped user state — the seed allowlist leaked"
    assert row[0] == b"opaque-ciphertext"
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_db_lifecycle.py::test_reseed_does_not_touch_sync_blob -v`
Expected: FAIL — `sqlite3.OperationalError: no such table: sync_blob`.

- [ ] **Step 3: Добавить таблицу**

В `backend/database.py`, в конец строки `SQL_CREATE_TABLES` (после блока `lesson`, перед закрывающими `"""`):

```sql
-- UX-4 · durable USER state. Deliberately absent from seed_database()'s
-- DELETE list and from init_db()'s column-drift DROP loop: both are hardcoded
-- allowlists over the four derived CONTENT tables, and this table is excluded
-- by staying out of them. Never add it to _*_REQUIRED_COLS — that path is
-- drop-based and would destroy user progress on any schema drift.
-- Contents are client-encrypted (AES-GCM); the server cannot read them.
CREATE TABLE IF NOT EXISTS sync_blob (
    blob_id TEXT PRIMARY KEY,
    ciphertext BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_blob_last_seen ON sync_blob (last_seen_at);
```

Индекс нужен для свипа из Task 3 (`WHERE last_seen_at < ?`).

- [ ] **Step 4: Тест зелёный**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_db_lifecycle.py -v`
Expected: PASS, включая существующие тесты жизненного цикла.

- [ ] **Step 5: Полный прогон + коммит**

Run: `cd backend && ../.venv/bin/python -m pytest -q` → 158 passed.

```bash
git add backend/database.py backend/tests/test_db_lifecycle.py
git commit -m "feat(sync): sync_blob table, excluded from wipe+reseed by invariant test"
```

---

## Task 2: Эндпоинты push / pull / delete

**Files:**
- Modify: `backend/config.py` (рядом с `API_RATE_LIMIT`, строка ~131)
- Modify: `backend/database.py` (функции доступа)
- Modify: `backend/main.py` (лимитер ~108-113; хендлеры — в конец, рядом с `/api/client-errors`)
- Modify: `backend/tests/conftest.py:49`
- Test: `backend/tests/test_sync.py` (новый)

**Interfaces:**
- Consumes: таблица `sync_blob` из Task 1.
- Produces:
  - `database.sync_put(blob_id: str, ciphertext: bytes) -> None`
  - `database.sync_get(blob_id: str) -> tuple[bytes, str] | None` → `(ciphertext, updated_at)`, продлевает `last_seen_at`
  - `database.sync_delete(blob_id: str) -> None`
  - `POST /api/sync/push` `{blob_id, blob}` → 204 · `POST /api/sync/pull` `{blob_id}` → 200 `{blob, updated_at}` / 404 · `POST /api/sync/delete` `{blob_id}` → 204

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_sync.py`:

```python
"""UX-4 · sync endpoint contract.

The server is assumed hostile in this design: it stores an opaque client-encrypted
blob under an id derived from a secret it never sees. These tests pin the parts
that make that true — the size cap, the id validation, the per-IP bucket, and
above all that no plaintext is recoverable from the DB file.
"""
import base64

import pytest

VALID_ID = "b" * 64
BLOB = base64.b64encode(b"iv-and-ciphertext-bytes").decode()


@pytest.fixture(autouse=True)
def _reset_sync_limiter():
    import main

    main._sync_limiter.clear()
    yield


def test_push_then_pull_round_trips(client):
    r = client.post("/api/sync/push", json={"blob_id": VALID_ID, "blob": BLOB})
    assert r.status_code == 204

    r = client.post("/api/sync/pull", json={"blob_id": VALID_ID})
    assert r.status_code == 200
    assert r.json()["blob"] == BLOB
    assert r.json()["updated_at"]


def test_pull_unknown_id_is_404(client):
    r = client.post("/api/sync/pull", json={"blob_id": "c" * 64})
    assert r.status_code == 404


def test_delete_is_idempotent_and_removes(client):
    client.post("/api/sync/push", json={"blob_id": "d" * 64, "blob": BLOB})
    assert client.post("/api/sync/delete", json={"blob_id": "d" * 64}).status_code == 204
    assert client.post("/api/sync/pull", json={"blob_id": "d" * 64}).status_code == 404
    # Deleting again must not 500 — the user may retry an erase.
    assert client.post("/api/sync/delete", json={"blob_id": "d" * 64}).status_code == 204


@pytest.mark.parametrize("bad", ["", "xyz", "A" * 63, "A" * 65, "g" * 64, 123, None])
def test_malformed_blob_id_is_400(client, bad):
    r = client.post("/api/sync/push", json={"blob_id": bad, "blob": BLOB})
    assert r.status_code == 400


def test_oversized_body_by_content_length_is_413(client):
    big = base64.b64encode(b"x" * 70_000).decode()
    r = client.post("/api/sync/push", json={"blob_id": VALID_ID, "blob": big})
    assert r.status_code == 413


def test_over_rate_limit_is_429(client):
    import config

    for _ in range(config.SYNC_RATE_LIMIT):
        client.post("/api/sync/pull", json={"blob_id": "e" * 64})
    r = client.post("/api/sync/pull", json={"blob_id": "e" * 64})
    assert r.status_code == 429
    assert r.headers.get("retry-after") == "60"


def test_database_file_holds_no_plaintext(client):
    """If the DB leaked wholesale, the blob must still be opaque. We push a blob
    whose *decoded* bytes carry a marker and assert the marker never lands in the
    file — proving we store what the client sent (ciphertext) and never decode,
    parse, or derive anything readable from it."""
    import config

    marker = b"PLAINTEXT-MARKER-SHOULD-NEVER-APPEAR"
    client.post(
        "/api/sync/push",
        json={"blob_id": "f" * 64, "blob": base64.b64encode(marker).decode()},
    )
    raw = config.DATABASE_PATH.read_bytes()
    assert marker not in raw, "server decoded the blob — it must stay opaque"
```

> Последний тест намеренно тонкий: он проверяет, что **сервер не декодирует** блоб, а не что клиент его зашифровал. Настоящую крипту пинует Task 4. Здесь мы фиксируем ровно серверную половину контракта.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_sync.py -v`
Expected: FAIL — все 404/`AttributeError: module 'main' has no attribute '_sync_limiter'`.

- [ ] **Step 3: config.py**

Рядом с `API_RATE_LIMIT` (строка ~131):

```python
# UX-4 · sync endpoints. A write path deserves a stricter bucket than the 240/min
# general read budget. 20/min is far above a real user (auto-push is debounced)
# and far below anything useful for hammering the store.
SYNC_RATE_LIMIT = _env_int("SYNC_RATE_LIMIT", 20)
# Hard cap on the encrypted blob body. A Dossier is a few KB; 64 KB is headroom.
SYNC_MAX_BODY = _env_int("SYNC_MAX_BODY", 65536)
# Blobs untouched for this long are swept (owner decision 2026-07-15). Every
# push/pull refreshes last_seen_at, so an active user never loses anything.
SYNC_BLOB_TTL_DAYS = _env_int("SYNC_BLOB_TTL_DAYS", 365)
```

- [ ] **Step 4: database.py — доступ**

Добавить в `backend/database.py` (импортировать `datetime` сверху, если ещё нет):

```python
def _utc_now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def sync_put(blob_id: str, ciphertext: bytes) -> None:
    """Upsert an opaque client-encrypted blob. We never inspect ciphertext."""
    now = _utc_now_iso()
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await _apply_pragmas(db)
        await db.execute(
            "INSERT INTO sync_blob (blob_id, ciphertext, updated_at, last_seen_at)"
            " VALUES (?, ?, ?, ?)"
            " ON CONFLICT(blob_id) DO UPDATE SET"
            "   ciphertext = excluded.ciphertext,"
            "   updated_at = excluded.updated_at,"
            "   last_seen_at = excluded.last_seen_at",
            (blob_id, ciphertext, now, now),
        )
        await db.commit()


async def sync_get(blob_id: str) -> tuple[bytes, str] | None:
    """Fetch a blob and refresh its TTL. Returns (ciphertext, updated_at)."""
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await _apply_pragmas(db)
        cursor = await db.execute(
            "SELECT ciphertext, updated_at FROM sync_blob WHERE blob_id = ?",
            (blob_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        await db.execute(
            "UPDATE sync_blob SET last_seen_at = ? WHERE blob_id = ?",
            (_utc_now_iso(), blob_id),
        )
        await db.commit()
        return row[0], row[1]


async def sync_delete(blob_id: str) -> None:
    """Erase a blob. Idempotent — deleting an absent id is a no-op success."""
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await _apply_pragmas(db)
        await db.execute("DELETE FROM sync_blob WHERE blob_id = ?", (blob_id,))
        await db.commit()
```

- [ ] **Step 5: main.py — лимитер и exempt**

Заменить блок на строках ~108-113:

```python
_api_limiter = RateLimiter(API_RATE_LIMIT)
_csp_report_limiter = RateLimiter(CSP_REPORT_RATE_LIMIT)
# UX-4 · sync gets its own stricter bucket (it is the app's only write path).
_sync_limiter = RateLimiter(SYNC_RATE_LIMIT)
# Paths under /api/ the general limiter must NOT touch.
_API_RATE_LIMIT_EXEMPT = frozenset(
    {
        "/api/health",
        "/api/metrics",
        "/api/client-errors",
        "/api/csp-report",
        "/api/sync/push",
        "/api/sync/pull",
        "/api/sync/delete",
    }
)
```

Импорт: добавить `SYNC_RATE_LIMIT`, `SYNC_MAX_BODY`, `SYNC_BLOB_TTL_DAYS` в существующий импорт из `config`, и `sync_put`, `sync_get`, `sync_delete` — из `database`.

- [ ] **Step 6: main.py — хендлеры**

В конец файла, после блока `/api/client-errors`:

```python
# ---------------------------------------------------------------------------
# UX-4 — course progress sync (POST /api/sync/{push,pull,delete})
#
# Privacy model: the client derives blob_id and enc_key from one 128-bit secret
# via HKDF; only blob_id ever reaches us. The blob is AES-GCM ciphertext we
# cannot read and never decode. Design notes:
#   * blob_id travels in the BODY, never the URL — a path would land it in nginx
#     access logs, and blob_id grants read+delete on the blob;
#   * body-size-capped before parsing (same two-layer guard as the beacon);
#   * own per-IP bucket, stricter than the general read limiter;
#   * delete exists so a user can actually erase their data, not merely stop
#     sending it.
# ---------------------------------------------------------------------------

_SYNC_BLOB_ID_RE = _re.compile(r"^[0-9a-f]{64}$")


async def _read_capped_body(request: "Request") -> bytes | None:
    """Read the body, never buffering past SYNC_MAX_BODY. None => too large.

    Content-Length is a cheap early-out but only a hint (it can be spoofed small
    or absent under chunked encoding), so we cap the streaming read too.
    """
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > SYNC_MAX_BODY:
                return None
        except ValueError:
            return None
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > SYNC_MAX_BODY:
            return None
    return bytes(body)


def _sync_blob_id(payload) -> str | None:
    if not isinstance(payload, dict):
        return None
    blob_id = payload.get("blob_id")
    if isinstance(blob_id, str) and _SYNC_BLOB_ID_RE.match(blob_id):
        return blob_id
    return None


@app.post("/api/sync/push", include_in_schema=False)
async def sync_push(request: Request):
    body = await _read_capped_body(request)
    if body is None:
        return _Response(status_code=413)
    if not _sync_limiter.allow(_client_ip(request)):
        return _Response(status_code=429, headers={"Retry-After": "60"})
    try:
        payload = _json.loads(body)
    except ValueError:
        return _Response(status_code=400)
    blob_id = _sync_blob_id(payload)
    if blob_id is None:
        return _Response(status_code=400)
    blob = payload.get("blob")
    if not isinstance(blob, str) or not blob:
        return _Response(status_code=400)
    try:
        ciphertext = _b64.b64decode(blob, validate=True)
    except Exception:
        return _Response(status_code=400)
    await sync_put(blob_id, ciphertext)
    await _sync_sweep_if_due()
    return _Response(status_code=204)


@app.post("/api/sync/pull", include_in_schema=False)
async def sync_pull(request: Request):
    body = await _read_capped_body(request)
    if body is None:
        return _Response(status_code=413)
    if not _sync_limiter.allow(_client_ip(request)):
        return _Response(status_code=429, headers={"Retry-After": "60"})
    try:
        payload = _json.loads(body)
    except ValueError:
        return _Response(status_code=400)
    blob_id = _sync_blob_id(payload)
    if blob_id is None:
        return _Response(status_code=400)
    found = await sync_get(blob_id)
    if found is None:
        return _Response(status_code=404)
    ciphertext, updated_at = found
    return JSONResponse(
        {"blob": _b64.b64encode(ciphertext).decode(), "updated_at": updated_at},
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/sync/delete", include_in_schema=False)
async def sync_delete_endpoint(request: Request):
    body = await _read_capped_body(request)
    if body is None:
        return _Response(status_code=413)
    if not _sync_limiter.allow(_client_ip(request)):
        return _Response(status_code=429, headers={"Retry-After": "60"})
    try:
        payload = _json.loads(body)
    except ValueError:
        return _Response(status_code=400)
    blob_id = _sync_blob_id(payload)
    if blob_id is None:
        return _Response(status_code=400)
    await sync_delete(blob_id)
    return _Response(status_code=204)
```

Сверху файла добавить `import base64 as _b64` и `import json as _json`, если их ещё нет (проверь — `json` может быть уже импортирован; тогда используй существующее имя и не плоди алиас). `JSONResponse` уже используется в проекте — проверь импорт.

`_sync_sweep_if_due()` появится в Task 3. Пока Task 3 не сделан, добавь временную заглушку прямо здесь, чтобы Task 2 был самодостаточен и тесты проходили:

```python
async def _sync_sweep_if_due() -> None:
    """Replaced in Task 3 with the real interval-gated sweep."""
    return None
```

- [ ] **Step 7: conftest.py — сброс лимитера**

`backend/tests/conftest.py:49` — добавить `_sync_limiter` в кортеж:

```python
    for name in (
        "_api_limiter",
        "_csp_report_limiter",
        "_client_error_limiter",
        "_sync_limiter",
    ):
```

Без этого суита начнёт мигать: фикстура `client` session-scoped, TestClient всегда приходит с одного peer IP `testclient`, и счётчики протекут между тестами.

- [ ] **Step 8: Тесты зелёные**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_sync.py -v` → PASS.
Run: `cd backend && ../.venv/bin/python -m pytest -q` → все зелёные.

- [ ] **Step 9: Commit**

```bash
git add backend/config.py backend/database.py backend/main.py \
        backend/tests/conftest.py backend/tests/test_sync.py
git commit -m "feat(sync): push/pull/delete endpoints for opaque encrypted blobs"
```

---

## Task 3: Свип по TTL

**Files:**
- Modify: `backend/database.py`
- Modify: `backend/main.py` (lifespan ~46-50; замена заглушки из Task 2)
- Test: `backend/tests/test_sync_sweep.py` (новый)

**Interfaces:**
- Consumes: `sync_blob`, `config.SYNC_BLOB_TTL_DAYS`.
- Produces: `database.sync_sweep(ttl_days: int) -> int` (число удалённых); `main._sync_sweep_if_due()`.

- [ ] **Step 1: Написать падающий тест**

```python
"""UX-4 · TTL sweep. Owner decision 2026-07-15: 12 months, refreshed on access."""
import pytest


@pytest.mark.asyncio
async def test_sweep_removes_stale_keeps_fresh(client):
    import aiosqlite
    import config
    from database import sync_sweep

    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO sync_blob VALUES (?, ?, ?, ?)",
            ("1" * 64, b"stale", "2020-01-01T00:00:00+00:00", "2020-01-01T00:00:00+00:00"),
        )
        await db.execute(
            "INSERT OR REPLACE INTO sync_blob VALUES (?, ?, ?, ?)",
            ("2" * 64, b"fresh", "2026-07-15T00:00:00+00:00", "2026-07-15T00:00:00+00:00"),
        )
        await db.commit()

    removed = await sync_sweep(config.SYNC_BLOB_TTL_DAYS)

    assert removed >= 1
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        assert (await (await db.execute(
            "SELECT 1 FROM sync_blob WHERE blob_id = ?", ("1" * 64,))).fetchone()) is None
        assert (await (await db.execute(
            "SELECT 1 FROM sync_blob WHERE blob_id = ?", ("2" * 64,))).fetchone()) is not None


@pytest.mark.asyncio
async def test_pull_refreshes_ttl(client):
    """An active user must never age out: every access extends the lease."""
    import base64

    import aiosqlite
    import config

    blob_id = "3" * 64
    client.post(
        "/api/sync/push",
        json={"blob_id": blob_id, "blob": base64.b64encode(b"x").decode()},
    )

    # Backdate the lease so a successful pull has something to refresh.
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await db.execute(
            "UPDATE sync_blob SET last_seen_at = ? WHERE blob_id = ?",
            ("2020-01-01T00:00:00+00:00", blob_id),
        )
        await db.commit()

    assert client.post("/api/sync/pull", json={"blob_id": blob_id}).status_code == 200

    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        cursor = await db.execute(
            "SELECT last_seen_at FROM sync_blob WHERE blob_id = ?", (blob_id,)
        )
        last_seen = (await cursor.fetchone())[0]

    assert not last_seen.startswith("2020"), "pull must refresh the lease"
```

> `@pytest.mark.asyncio` здесь — предположение. **Сначала прочитай `test_db_lifecycle.py`** и посмотри, как этот проект реально запускает async-тесты (маркер, плагин, фикстура), и повтори его идиому дословно. Не добавляй новый пакет ради этого теста.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_sync_sweep.py -v`
Expected: FAIL — `ImportError: cannot import name 'sync_sweep'`.

- [ ] **Step 3: database.py — свип**

```python
async def sync_sweep(ttl_days: int) -> int:
    """Delete blobs untouched for ttl_days. Returns the number removed.

    Data-minimisation: without an email we cannot know a code is abandoned, so
    an unused blob must age out on its own rather than live forever on a 2 GB VPS.
    """
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=ttl_days)).isoformat(
        timespec="seconds"
    )
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        await _apply_pragmas(db)
        cursor = await db.execute(
            "DELETE FROM sync_blob WHERE last_seen_at < ?", (cutoff,)
        )
        await db.commit()
        return cursor.rowcount or 0
```

Сравнение строк корректно: `last_seen_at` всегда пишется через `_utc_now_iso()`, то есть ISO-8601 в UTC с фиксированной шириной полей — лексикографический порядок совпадает с хронологическим.

- [ ] **Step 4: main.py — заменить заглушку и включить в lifespan**

Заменить заглушку `_sync_sweep_if_due` из Task 2 на:

```python
# Sweep at most once per day. Startup alone is too rare for a long-lived process,
# and sweeping on every push would be pointless write amplification.
_SYNC_SWEEP_INTERVAL_SEC = 86400.0
_sync_last_sweep = 0.0


async def _sync_sweep_if_due() -> None:
    global _sync_last_sweep
    now = _time.monotonic()
    if now - _sync_last_sweep < _SYNC_SWEEP_INTERVAL_SEC:
        return
    _sync_last_sweep = now
    await sync_sweep(SYNC_BLOB_TTL_DAYS)
```

Добавить `import time as _time`, если его нет. В lifespan (строки ~46-50):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    await init_db()
    await seed_database()
    # UX-4: age out abandoned sync blobs. Cheap, and already serialized across
    # workers by init_db's flock having run first.
    await sync_sweep(SYNC_BLOB_TTL_DAYS)
    yield
```

- [ ] **Step 5: Тесты зелёные**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_sync_sweep.py tests/test_sync.py -v` → PASS.
Run: `cd backend && ../.venv/bin/python -m pytest -q` → все зелёные.

- [ ] **Step 6: Commit**

```bash
git add backend/database.py backend/main.py backend/tests/test_sync_sweep.py
git commit -m "feat(sync): 12-month TTL sweep, refreshed on every access"
```

---

## Task 4: Крипто-примитивы клиента

**Files:**
- Create: `frontend/src/utils/sync-crypto.ts`
- Test: `frontend/src/utils/sync-crypto.test.ts`

**Interfaces:**
- Consumes: ничего (чистая крипта, без сети).
- Produces:
  - `generateSecret(): Uint8Array` (16 байт)
  - `encodeCode(secret: Uint8Array): string` (26 символов Crockford base32)
  - `decodeCode(code: string): Uint8Array | null` (терпит дефисы/пробелы/регистр/`I`,`L`→`1`,`O`→`0`)
  - `formatCode(code: string): string` → `DSCM-XXXXX-XXXXX-XXXXX-XXXXX-X`
  - `deriveKeys(secret): Promise<{ blobId: string; encKey: CryptoKey }>`
  - `encryptDossier(encKey: CryptoKey, plaintext: string): Promise<string>` (base64 `iv||ct`)
  - `decryptDossier(encKey: CryptoKey, blob: string): Promise<string | null>` (`null` = не расшифровалось)
  - `isSyncSupported(): boolean`

- [ ] **Step 1: Написать падающие тесты**

```ts
import { describe, expect, it } from 'vitest';
import {
  decodeCode, decryptDossier, deriveKeys, encodeCode, encryptDossier,
  formatCode, generateSecret, isSyncSupported,
} from './sync-crypto';

describe('sync code', () => {
  it('round-trips a secret through the code', () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(16);
    const decoded = decodeCode(encodeCode(secret));
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!)).toEqual(Array.from(secret));
  });

  it('encodes 128 bits as 26 Crockford characters', () => {
    expect(encodeCode(new Uint8Array(16))).toHaveLength(26);
  });

  it('never emits the ambiguous letters I, L, O or U', () => {
    for (let i = 0; i < 50; i++) {
      expect(encodeCode(generateSecret())).not.toMatch(/[ILOU]/);
    }
  });

  it('accepts human-mangled input: case, dashes, spaces, I/L/O confusion', () => {
    const secret = generateSecret();
    const code = encodeCode(secret);
    const mangled = formatCode(code).toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
    expect(Array.from(decodeCode(mangled)!)).toEqual(Array.from(secret));
  });

  it('rejects codes of the wrong length or alphabet', () => {
    expect(decodeCode('')).toBeNull();
    expect(decodeCode('ABC')).toBeNull();
    expect(decodeCode('U'.repeat(26))).toBeNull();
  });
});

describe('key derivation', () => {
  it('derives a 64-hex blobId deterministically', async () => {
    const secret = generateSecret();
    const a = await deriveKeys(secret);
    const b = await deriveKeys(secret);
    expect(a.blobId).toMatch(/^[0-9a-f]{64}$/);
    expect(a.blobId).toBe(b.blobId);
  });

  it('gives different secrets different blobIds', async () => {
    const a = await deriveKeys(generateSecret());
    const b = await deriveKeys(generateSecret());
    expect(a.blobId).not.toBe(b.blobId);
  });

  it('does not let blobId decrypt the blob', async () => {
    // The server sees blobId. If enc_key were recoverable from it the whole
    // design collapses, so pin that they are independent HKDF outputs: a blob
    // encrypted under one secret must not decrypt under another whose blobId
    // we know.
    const s1 = generateSecret();
    const s2 = generateSecret();
    const k1 = await deriveKeys(s1);
    const k2 = await deriveKeys(s2);
    const blob = await encryptDossier(k1.encKey, '{"v":2}');
    expect(await decryptDossier(k2.encKey, blob)).toBeNull();
  });
});

describe('encryption', () => {
  it('round-trips a dossier', async () => {
    const { encKey } = await deriveKeys(generateSecret());
    const plaintext = JSON.stringify({ v: 2, lessons: {}, exams: null });
    expect(await decryptDossier(encKey, await encryptDossier(encKey, plaintext))).toBe(plaintext);
  });

  it('uses a fresh IV per push', async () => {
    const { encKey } = await deriveKeys(generateSecret());
    expect(await encryptDossier(encKey, 'same')).not.toBe(await encryptDossier(encKey, 'same'));
  });

  it('returns null on tampered ciphertext rather than garbage', async () => {
    const { encKey } = await deriveKeys(generateSecret());
    const blob = await encryptDossier(encKey, '{"v":2}');
    const bytes = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = btoa(String.fromCharCode(...bytes));
    expect(await decryptDossier(encKey, tampered)).toBeNull();
  });

  it('reports support when subtle crypto exists', () => {
    expect(isSyncSupported()).toBe(true);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"; cd frontend && npx vitest run src/utils/sync-crypto.test.ts`
Expected: FAIL — `Cannot find module './sync-crypto'`.

- [ ] **Step 3: Реализация**

Создать `frontend/src/utils/sync-crypto.ts`:

```ts
/**
 * UX-4 · sync-code cryptography. No network here — transport lives in
 * sync-client.ts so this file stays testable without fetch mocks.
 *
 * Threat model (see docs/superpowers/specs/2026-07-15-ux4-progress-sync-design.md):
 * the server stores ciphertext under an id derived from the code, so anyone can
 * enumerate ids, fetch blobs and brute-force them OFFLINE. The code's entropy is
 * therefore the only real defence — it is 128 bits of machine randomness, never
 * user-chosen. That is also why no slow KDF is used: stretching defends weak
 * entropy, and there is none here to defend.
 */

/** Crockford base32: no I, L, O or U — they are misread when retyping a code. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_BYTES = 16; // 128 bits
const CODE_CHARS = 26; // ceil(128 / 5)
const HKDF_SALT = 'discammer-sync-v1';

const enc = (s: string) => new TextEncoder().encode(s);

export function isSyncSupported(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

export function generateSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

export function encodeCode(secret: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of secret) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function decodeCode(code: string): Uint8Array | null {
  const cleaned = code
    .toUpperCase()
    .replace(/^DSCM/, '')
    .replace(/[\s-]/g, '')
    // Crockford's forgiving reads: O is zero; I and L are one.
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== CODE_CHARS) return null;

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (out.length !== SECRET_BYTES) return null;
  return new Uint8Array(out);
}

/** Group for display: DSCM-XXXXX-XXXXX-XXXXX-XXXXX-X. Cosmetic only. */
export function formatCode(code: string): string {
  return `DSCM-${(code.match(/.{1,5}/g) ?? []).join('-')}`;
}

async function hkdf(secret: Uint8Array, info: string, bits: number): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc(HKDF_SALT), info: enc(info) },
    base,
    bits,
  );
}

/**
 * Split the one secret into two INDEPENDENT values. HKDF-Expand is a PRF, so
 * knowing blobId (which the server does) reveals nothing about encKey or the
 * secret itself.
 */
export async function deriveKeys(
  secret: Uint8Array,
): Promise<{ blobId: string; encKey: CryptoKey }> {
  const idBits = await hkdf(secret, 'id', 256);
  const blobId = Array.from(new Uint8Array(idBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const keyBits = await hkdf(secret, 'enc', 256);
  const encKey = await crypto.subtle.importKey('raw', keyBits, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return { blobId, encKey };
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptDossier(encKey: CryptoKey, plaintext: string): Promise<string> {
  // Fresh IV every push: reusing (key, iv) in GCM breaks both confidentiality
  // and authenticity.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, enc(plaintext)),
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return toB64(packed);
}

/** Returns null when the blob is not ours or was tampered with — GCM is AEAD, so
 *  a modified ciphertext fails loudly here rather than yielding garbage. */
export async function decryptDossier(encKey: CryptoKey, blob: string): Promise<string | null> {
  try {
    const packed = fromB64(blob);
    const iv = packed.slice(0, 12);
    const ct = packed.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encKey, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"; cd frontend && npx vitest run src/utils/sync-crypto.test.ts`
Expected: PASS.

Если `crypto.subtle` не виден в тест-окружении, проверь `environment` в `vitest.config.*`: Node 20 отдаёт `globalThis.crypto.subtle`, а `jsdom` может его не пробрасывать. Решай настройкой окружения теста, **не** добавляя полифилл-зависимость.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sync-crypto.ts frontend/src/utils/sync-crypto.test.ts
git commit -m "feat(sync): client crypto — Crockford base32, HKDF split, AES-GCM"
```

---

## Task 5: Транспорт и состояние связки

**Files:**
- Create: `frontend/src/utils/sync-client.ts`
- Test: `frontend/src/utils/sync-client.test.ts`

**Interfaces:**
- Consumes: `sync-crypto.ts` (Task 4); `exportProgress()` / `importProgress()` из `frontend/src/utils/progress.ts:264,290`.
- Produces:
  - `loadLinkedCode(): string | null` / `saveLinkedCode(code): void` / `clearLinkedCode(): void` (ключ `discammer:sync:v1`)
  - `pushProgress(code: string): Promise<'ok' | 'error'>`
  - `pullProgress(code: string): Promise<'ok' | 'not-found' | 'bad-code' | 'error'>`
  - `deleteRemote(code: string): Promise<'ok' | 'error'>`

- [ ] **Step 1: Написать падающий тест**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLinkedCode, loadLinkedCode, pullProgress, pushProgress, saveLinkedCode } from './sync-client';
import { encodeCode, generateSecret } from './sync-crypto';

describe('link state', () => {
  beforeEach(() => localStorage.clear());

  it('persists and clears the linked code', () => {
    expect(loadLinkedCode()).toBeNull();
    saveLinkedCode('ABC');
    expect(loadLinkedCode()).toBe('ABC');
    clearLinkedCode();
    expect(loadLinkedCode()).toBeNull();
  });

  it('never puts the code inside the synced dossier', async () => {
    // The code must not ride inside its own ciphertext.
    const { exportProgress } = await import('./progress');
    saveLinkedCode('SECRET-CODE');
    expect(JSON.stringify(exportProgress())).not.toContain('SECRET-CODE');
  });
});

describe('transport', () => {
  beforeEach(() => localStorage.clear());

  it('sends only blob_id and ciphertext — never plaintext progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    const code = encodeCode(generateSecret());
    expect(await pushProgress(code)).toBe('ok');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/sync/push');
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['blob', 'blob_id']);
    expect(body.blob_id).toMatch(/^[0-9a-f]{64}$/);
    // The blob must be opaque: no dossier field names in the wire payload.
    expect(init.body).not.toContain('lessons');
    expect(init.body).not.toContain('certName');
  });

  it('rejects a malformed code without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await pullProgress('not-a-code')).toBe('bad-code');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 404 to not-found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await pullProgress(encodeCode(generateSecret()))).toBe('not-found');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"; cd frontend && npx vitest run src/utils/sync-client.test.ts`
Expected: FAIL — `Cannot find module './sync-client'`.

- [ ] **Step 3: Реализация**

```ts
/**
 * UX-4 · sync transport + link state. Crypto lives in sync-crypto.ts; this file
 * only moves opaque blobs and remembers whether this device is linked.
 */
import { exportProgress, importProgress } from './progress';
import { decodeCode, decryptDossier, deriveKeys, encryptDossier } from './sync-crypto';

/** Deliberately NOT part of the Dossier — the code must never ride inside its
 *  own ciphertext. */
const LINK_KEY = 'discammer:sync:v1';

export function loadLinkedCode(): string | null {
  try {
    return localStorage.getItem(LINK_KEY);
  } catch {
    return null;
  }
}

export function saveLinkedCode(code: string): void {
  try {
    localStorage.setItem(LINK_KEY, code);
  } catch {
    /* storage disabled — sync simply stays off for this session */
  }
}

export function clearLinkedCode(): void {
  try {
    localStorage.removeItem(LINK_KEY);
  } catch {
    /* no-op */
  }
}

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export async function pushProgress(code: string): Promise<'ok' | 'error'> {
  const secret = decodeCode(code);
  if (!secret) return 'error';
  const { blobId, encKey } = await deriveKeys(secret);
  const blob = await encryptDossier(encKey, JSON.stringify(exportProgress()));
  const res = await post('/api/sync/push', { blob_id: blobId, blob });
  return res && (res.status === 204 || res.ok) ? 'ok' : 'error';
}

export async function pullProgress(
  code: string,
): Promise<'ok' | 'not-found' | 'bad-code' | 'error'> {
  const secret = decodeCode(code);
  if (!secret) return 'bad-code';
  const { blobId, encKey } = await deriveKeys(secret);
  const res = await post('/api/sync/pull', { blob_id: blobId });
  if (!res) return 'error';
  if (res.status === 404) return 'not-found';
  if (!res.ok) return 'error';
  const { blob } = await res.json();
  const plaintext = await decryptDossier(encKey, blob);
  // Wrong code or tampered blob — indistinguishable to us, and both mean the
  // same thing to the user: this code does not open this data.
  if (plaintext === null) return 'bad-code';
  return importProgress(plaintext).ok ? 'ok' : 'error';
}

export async function deleteRemote(code: string): Promise<'ok' | 'error'> {
  const secret = decodeCode(code);
  if (!secret) return 'error';
  const { blobId } = await deriveKeys(secret);
  const res = await post('/api/sync/delete', { blob_id: blobId });
  return res && (res.status === 204 || res.ok) ? 'ok' : 'error';
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"; cd frontend && npx vitest run src/utils/sync-client.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sync-client.ts frontend/src/utils/sync-client.test.ts
git commit -m "feat(sync): transport + link state, opaque blobs only"
```

---

## Task 6: Остров ProgressSync

**Files:**
- Create: `frontend/src/components/ProgressSync.tsx`
- Modify: `frontend/src/main.tsx:17-41` (реестр)
- Modify: `backend/templates/course.html` (рядом с `CourseProgress`, строка ~127)
- Modify: локали EN/RU
- Test: `frontend/src/components/ProgressSync.test.tsx`

**Interfaces:**
- Consumes: всё из Task 5; `subscribe()` из `progress.ts:75`.
- Produces: остров `ProgressSync`, проп `{ locale: 'en' | 'ru' }`.

- [ ] **Step 1: Прочитать образцы**

Прежде чем писать: прочитай `frontend/src/components/CourseProgress.tsx` (соседний остров на той же странице) и `backend/templates/course.html:127`. Следуй их идиомам — именование, работа с локалью, SSR-фолбэк. Не изобретай второй стиль.

- [ ] **Step 2: Написать падающий тест**

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProgressSync from './ProgressSync';

describe('ProgressSync', () => {
  beforeEach(() => localStorage.clear());

  it('renders nothing when WebCrypto is unavailable', async () => {
    vi.doMock('../utils/sync-crypto', async (orig) => ({
      ...(await orig<typeof import('../utils/sync-crypto')>()),
      isSyncSupported: () => false,
    }));
    const { default: Fresh } = await import('./ProgressSync');
    const { container } = render(<Fresh locale="en" />);
    expect(container).toBeEmptyDOMElement();
    vi.doUnmock('../utils/sync-crypto');
  });

  it('warns that a lost code cannot be recovered BEFORE generating one', () => {
    render(<ProgressSync locale="en" />);
    expect(screen.getByTestId('sync-loss-warning')).toBeInTheDocument();
  });

  it('makes no network request before the user opts in', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProgressSync locale="en" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"; cd frontend && npx vitest run src/components/ProgressSync.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Реализация**

Требования к компоненту (следуй стилю `CourseProgress.tsx`):

1. `if (!isSyncSupported()) return null;` — первым делом. Курс без синка работает как сегодня.
2. **Не связан:** объяснение; кнопка «Создать код»; поле «Ввести существующий код». Предупреждение о невозвратности — с `data-testid="sync-loss-warning"`, видимое **до** генерации, не мелким шрифтом.
3. **После генерации:** код крупно через `formatCode()`, кнопки «Скопировать» и «Скачать». Связка сохраняется только после явного подтверждения «Я сохранил код».
4. **Связан:** замаскированный код (первая и последняя группы), время последнего push'а, кнопки «Обновить с сервера», «Отвязать» (только локально) и «Удалить с сервера» (стереть блоб). Отвязка и удаление обязаны быть визуально и текстово различимы — это разные операции с разными последствиями.
5. **Авто-push:** `subscribe()` (`progress.ts:75`) → дебаунс 2000 мс → `pushProgress()`. Подписка снимается в cleanup `useEffect`. Ошибка сети — тихий статус, без блокирующих модалок: урок важнее синка.
6. Все строки — через существующий механизм локалей, парой EN/RU.
7. `prefers-reduced-motion` — уважать (конвенция проекта).

- [ ] **Step 5: Реестр и шаблон**

`frontend/src/main.tsx`, в объект `components` (24-я запись, алфавитный порядок как у соседей):

```ts
  ProgressSync: React.lazy(() => import('./components/ProgressSync')),
```

`backend/templates/course.html`, рядом с блоком `CourseProgress` (~127):

```html
<div data-component="ProgressSync" data-props='{"locale":"{{ _lang }}"}'></div>
```

- [ ] **Step 6: Локали, тесты, сборка**

```bash
.venv/bin/python scripts/i18n_audit.py          # из корня, обязан быть зелёным
export PATH="/Users/dev/Projects/discammer/.nodeenv/bin:$PATH"
cd frontend && npm test && npm run build
```

`npm run build` пересоздаёт `backend/static/` — коммитить вместе с фронтом одним коммитом.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ProgressSync.tsx frontend/src/components/ProgressSync.test.tsx \
        frontend/src/main.tsx backend/templates/course.html backend/static/ \
        frontend/src/locales/ backend/locales/
git commit -m "feat(sync): ProgressSync island — opt-in linking, auto-push, erase"
```

> Точные пути локалей уточни по факту (`scripts/i18n_audit.py` покажет, какие файлы он читает).

---

## Task 7: Service worker обходит /api/sync/*

**Files:**
- Modify: `frontend/sw-src.js`
- Test: `frontend/src/utils/sw-sync.test.ts` или существующий SW-тест (сначала прочитай, как PERF-3 тестирует SW, и следуй той идиоме)

- [ ] **Step 1: Прочитать `frontend/sw-src.js`** и определить, попадают ли `/api/sync/*` под существующее правило для `/api/*`. Если network-first уже покрывает их — **не дублируй правило**; вместо этого добавь тест, пиннующий, что синк никогда не отдаётся из кэша, и на этом остановись.

- [ ] **Step 2: Написать падающий тест** — запрос к `/api/sync/pull` не должен обслуживаться из кэша ни при каких условиях.

- [ ] **Step 3: Реализация** — если нужно, явный network-only для `/api/sync/`.

- [ ] **Step 4:** `npm test && npm run build`.

- [ ] **Step 5: Commit**

```bash
git add frontend/sw-src.js backend/static/ frontend/src/utils/sw-sync.test.ts
git commit -m "fix(sync): service worker must never cache /api/sync/*"
```

---

## Task 8: Документация и клеймы

**Files:**
- Modify: `docs/portfolio/CLAIM_LEDGER.md`
- Modify: `docs/ops/backups.md`, `docs/ops/runbook.md`
- Modify: `FEATURE_PLAN.md` (секция UX-4 + сводная таблица)
- Modify: `PROJECT.md` (счётчики тестов)

- [ ] **Step 1: CLAIM_LEDGER** — заменить «прогресс только в браузере» на формулировку из спеки §7:

> прогресс локален по умолчанию; опциональная синхронизация хранит на сервере только клиент-шифрованные данные, которые сервер не может прочитать.

Про `certName` формулировать честно: **«сервер хранит шифротекст»**, а не «мы не собираем имя» — имя в блобе есть, просто сервер его прочитать не может. Гарантию чекера/инспектора не трогать: она не менялась.

- [ ] **Step 2: `docs/ops/backups.md` + `docs/ops/runbook.md`** — БД перестала быть «пересевается из git». Появилось durable-состояние пользователя: RPO/RTO теперь имеют смысл, потеря БД теперь теряет пользовательские данные. REL-1 бэкапит файл целиком, поэтому `sync_blob` покрыт — но это надо написать явно.

- [ ] **Step 3: FEATURE_PLAN.md** — UX-4 → `implemented` (код и тесты в репо). **Не** `production verified`: ничего не задеплоено.

- [ ] **Step 4: PROJECT.md** — пересчитать тесты фактическим прогоном, обновить дату сверки.

- [ ] **Step 5: Проверка и коммит**

```bash
cd backend && ../.venv/bin/python -m pytest -q
.venv/bin/python scripts/i18n_audit.py
git add docs/ FEATURE_PLAN.md PROJECT.md
git commit -m "docs(sync): UX-4 claims, backup/runbook reality, plan status"
```

---

## Task 9: E2E

**Files:**
- Create: `e2e/progress-sync.spec.ts`

- [ ] **Step 1:** Спека: контекст A проходит урок → создаёт код → чистый контекст B вводит код → прогресс на месте. Именно этот сценарий — DoD пункта UX-4 («прогресс переживает смену устройства через sync-код»).

- [ ] **Step 2:** Отдельная проверка: `assertNoNetworkLeak` для чекера/инспектора **не ослаблен**. UX-4 не должен был их коснуться, и тест обязан это доказать.

- [ ] **Step 3:** Прогон: `npx playwright test e2e/progress-sync.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add e2e/progress-sync.spec.ts
git commit -m "test(e2e): progress survives a device change via sync code"
```

---

## Финал волны

- [ ] `cd backend && ../.venv/bin/python -m pytest -q` — зелёный
- [ ] `cd frontend && npm test && npm run build` — зелёный, `git status` чист после сборки
- [ ] `.venv/bin/python scripts/i18n_audit.py` — паритет
- [ ] Финальное ревью всей ветки
- [ ] **Не пушить и не деплоить** без явной авторизации владельца
