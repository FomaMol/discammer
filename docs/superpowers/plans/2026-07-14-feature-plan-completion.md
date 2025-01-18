# FEATURE_PLAN Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести FEATURE_PLAN.md (план, составленный с ChatGPT) до полного завершения, починить прод-баг запуска игры на `/en/game` и провести ревью с исправлениями.

**Architecture:** FastAPI/Jinja2 SSR + React-острова (Vite → committed `backend/static/`). Исполнение — по superpowers: волны → задачи 2–5 минут → TDD (RED-GREEN) → свежий субагент на задачу → двухэтапное ревью (spec compliance + code quality) → финальное ревью всей ветки.

**Tech Stack:** Python 3 / FastAPI / Jinja2 / SQLite, TypeScript / React / Vite / Tailwind, pytest / Vitest / Playwright, Docker, Cloudflare.

**Дата:** 2026-07-14. **Ветка:** `codex/discammer-v6-wave3-link-action` (рабочее дерево чистое).

---

## Сводка аудита (сверка FEATURE_PLAN.md с кодом, 2026-07-14)

| Блок | Статус по коду |
| --- | --- |
| CF-5, CF-8 (purge, firewall) | сделано (код); применение — host-side |
| CF-1..4, 6, 7, 9 | внешнее (дашборд Cloudflare) — см. «Действия владельца» |
| SEC-1 CSP | **частично**: Report-Only; enforce заблокирован 17 inline-хендлерами (15 в `home.html`, 2 в `post.html`) |
| SEC-2, SEC-4, PERF-4, REL-1, REL-3, SEO-1 | сделано |
| AN-1, OBS-1, OBS-2, UX-3 (2.2) | не сделано / частично |
| PERF-1, PERF-2, PERF-3, SEO-3, UX-2, UX-5, REL-4 | не сделано |
| SEO-2 | почти сделано волной v6 (нет `SearchAction`, `FAQPage`) |
| UX-1 | закрыт иначе (VerdictCard share) — принять как done, deep-link `#flags` не делать (YAGNI) |
| UX-4, UX-6, UX-7 | backlog, требуют brainstorming |

**Прод-баг (скриншот):** `/en/game` → GameLauncher открывает `<iframe src="/play/">`, но `security.py` шлёт `X-Frame-Options: DENY` на **все** HTML-ответы, включая `/play/` → браузер показывает «discammer.com refused to connect» внутри iframe. Второй слой той же бомбы: `frame-src` в CSP не содержит `'self'` — при включении enforce iframe заблокирует уже родительская страница. Регрессия от Спринта 2 (SEC-1, коммит `24dc396`): e2e проверяет только ссылку на `/en/game`, но не реальную загрузку iframe.

---

## Волна 0 — HOTFIX: игра на `/en/game` (выполняется немедленно)

### Task 0.1: Разрешить same-origin фрейминг для `/play/`

**Files:**
- Modify: `backend/security.py`
- Modify: `backend/main.py` (middleware, ~строка 229)
- Test: `backend/tests/test_game_embed.py` (новый)

- [ ] **Step 1: Написать падающие тесты**

```python
"""Регрессия скриншота 2026-07-14: /en/game открывает игру в <iframe src="/play/">.

- /play/ должен отдавать X-Frame-Options: SAMEORIGIN (DENY блокирует same-origin
  iframe → Chrome рисует «refused to connect» внутри фрейма).
- frame-src в CSP страниц должен содержать 'self', иначе enforce CSP заблокирует
  iframe уже со стороны родительской страницы /{lang}/game.
"""


def test_play_index_allows_same_origin_framing(client):
    r = client.get("/play/")
    assert r.status_code == 200, "game build is committed in this repo"
    assert r.headers.get("x-frame-options") == "SAMEORIGIN"


def test_regular_pages_keep_deny(client):
    r = client.get("/en/game")
    assert r.headers.get("x-frame-options") == "DENY"


def test_csp_frame_src_includes_self(client):
    csp = client.get("/en/game").headers.get("content-security-policy-report-only", "")
    import re
    m = re.search(r"frame-src ([^;]*)", csp)
    assert m and "'self'" in m.group(1), "enforce CSP must not re-break the /play/ iframe"
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pytest backend/tests/test_game_embed.py -v`
Expected: FAIL (`x-frame-options == "DENY"` для `/play/`; `'self'` отсутствует в frame-src)

- [ ] **Step 3: Минимальная реализация**

`backend/security.py` — убрать XFO из статического набора, сделать параметром; добавить `'self'` в frame-src:

```python
_STATIC_DOC_HEADERS = {  # X-Frame-Options переезжает в apply_security_headers
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": (...без изменений...),
}

def apply_security_headers(response, nonce, *, include_csp=True,
                           same_origin_framing=False) -> None:
    response.headers.setdefault(
        "X-Frame-Options", "SAMEORIGIN" if same_origin_framing else "DENY"
    )
    ...
```

в `build_csp()`: `f"frame-src 'self' {' '.join(_frame_src_hosts())}"`.

`backend/main.py` middleware:

```python
_is_play = _path == "/play" or _path.startswith("/play/")
apply_security_headers(
    response, request.state.csp_nonce,
    include_csp=not _is_play,
    same_origin_framing=_is_play,
)
```

- [ ] **Step 4: Тесты зелёные**

Run: `pytest backend/tests/test_game_embed.py backend/tests/test_security_headers.py backend/tests/test_game_head.py -v`
Expected: PASS (существующий `test_html_has_hardening_headers` продолжает требовать DENY на страницах)

- [ ] **Step 5: Полный прогон + ревью субагентом + коммит**

Run: `pytest -q` → все зелёные. Двухэтапное ревью диффа. Затем:

```bash
git add backend/security.py backend/main.py backend/tests/test_game_embed.py
git commit -m "fix(game): allow same-origin framing of /play/ (SEC-1 regression)"
```

### Task 0.2: E2E-регрессия запуска игры

**Files:** Create: `e2e/game-launch.spec.ts`

- [ ] Спека: открыть `/en/game`, кликнуть кнопку GameLauncher, дождаться iframe, проверить что фрейм отдал HTTP 200 и в документе фрейма есть Unity-контейнер (не chrome-error). Проверить закрытие по Escape.
- [ ] Verify: `npx playwright test e2e/game-launch.spec.ts` (локально/CI; в CI — обязательный статус).
- [ ] Commit: `test(e2e): game launcher iframe actually renders /play/`.

### Действие владельца после Волны 0
- [ ] Деплой на прод (`scripts/deploy.sh`) — только руками Дмитрия/с явной авторизацией (правило AGENTS.md).
- [ ] Проверка на проде: `/en/game` → Launch simulation → игра рендерится; `curl -sI https://discammer.com/play/ | grep -i x-frame-options` → `SAMEORIGIN` (после этого можно писать «production verified» с датой).

---

## Волна 1 — SEC-1 finale: enforce CSP

Блокер зафиксирован в самом плане (строка 29) и в истории (`2600bed` почистил, `e44ac54` откатил конверсию, чтобы не разъезжался committed static).

### Task 1.1: Конвертировать inline-хендлеры в CSS `:hover`
**Files:** Modify: `backend/templates/home.html` (15 шт. `onmouseover/onmouseout`), `backend/templates/post.html` (2 шт.); Modify: `frontend/src/styles/*` (или Tailwind-утилиты в шаблонах).
- [ ] Для каждого хендлера: перенести мутацию style в CSS-класс с `:hover` (уважая `prefers-reduced-motion`, см. DESIGN.md). Никакого JS.
- [ ] `cd frontend && npm run build` — пересобрать и **закоммитить static + шаблоны одним коммитом** (урок `e44ac54`).
- [ ] Verify: `grep -rn "onmouseover" backend/templates/` → пусто; визуальная проверка hover на `/en/` и статье; `pytest -q`; e2e visual в CI.

### Task 1.2: Включить enforce
- [ ] Тест: при `CSP_REPORT_ONLY=0` заголовок — `Content-Security-Policy` (не Report-Only), политика та же.
- [ ] Прод-конфиг: `CSP_REPORT_ONLY=0` (env в docker-compose.prod.yml / host .env) — действие владельца.
- [ ] Мониторинг `/api/csp-report` 7 дней до и после флипа; откат = вернуть env.

---

## Волна 2 — P1-хвосты: AN-1, OBS-1, UX-3

Для каждой задачи волны: субагент пишет детальный writing-plans-план (код в шагах), затем исполнение с TDD и двухэтапным ревью.

### Task 2.1: AN-1 — privacy-first аналитика
**Files:** `backend/metrics.py`, `backend/routers/api.py`, тесты `backend/tests/test_metrics*.py`; `docs/cloudflare/SETUP.md`.
- [ ] Расширить серверные RED-метрики разбивкой по типу поверхности (guide/journal/course/tools/game) без PII и без сырых URL чекера/инспектора (граница приватности из PRODUCT.md).
- [ ] CF Web Analytics (CF-9) — действие владельца в дашборде; в репо — только шаг ранбука.
- [ ] Acceptance: `/api/metrics` отдаёт новые счётчики; тест на отсутствие PII-меток; i18n не затронут.

### Task 2.2: OBS-1 — трекинг ошибок
**Files:** `docker-compose.prod.yml`, `backend/main.py` (exception hook), `frontend/src/utils/error-report.ts` (существующий privacy-scrubbed канал), `docs/ops/runbook.md`.
- [ ] Решение (brainstorm, 15 мин): self-hosted GlitchTip рядом с приложением vs расширение текущего `/api/client-errors` пайплайна. Критерий: не слать сырые пользовательские данные третьей стороне (claim ledger).
- [ ] Acceptance: необработанное исключение backend видно в трекере с release-тегом; клиентские ошибки семплируются и скрабятся (как сейчас); тест на скраббинг.

### Task 2.3: UX-3 — доводка до WCAG 2.2 AA
**Files:** шаблоны, `frontend/src/components/{MessageChecker,LinkInspector,...}.tsx`, `e2e/a11y.spec.ts`.
- [ ] Target Size (24×24), Focus Appearance для всех интерактивов; озвучка вердикта чекера через `aria-live`; аудит клавиатурных ловушек в GameLauncher-диалоге.
- [ ] Acceptance: axe-скан в e2e без новых нарушений; ручная проверка RU-раскладки (правило AGENTS.md).

---

## Волна 3 — Спринт 4 (P2)

| Task | Суть | Файлы/зона | Acceptance |
| --- | --- | --- | --- |
| 3.1 PERF-2 | WebP/AVIF + `<picture>`/srcset для контентных изображений; конвейер в `scripts/` | `scripts/`, шаблоны, `content/` | LCP-картинки ≤ бюджета lighthouserc; фолбэк PNG/JPEG |
| 3.2 PERF-3 | Service Worker: офлайн-кэш гайдов/уроков, stale-while-revalidate для статики; без кэширования чекера | `frontend/`, `backend/templates/base.html`, новый `sw` энтри в Vite | Повторный визит офлайн открывает прочитанный гайд; e2e |
| 3.3 PERF-1 | Edge-кэш HTML с микро-TTL | Cloudflare Cache Rules (внешнее) + `docs/cloudflare/SETUP.md` + purge-хук уже готов (CF-5) | документировано + дата проверки |
| 3.4 OBS-2 | Grafana+Prometheus compose-профиль, скрейп `/api/metrics` | `docker-compose.prod.yml`, `deploy/`, `docs/ops/` | дашборд RED; алерт на 5xx |
| 3.5 SEO-2 | Добить JSON-LD: `WebSite.SearchAction` (sitelinks searchbox), `FAQPage` на подходящих гайдах | `backend/templates/base.html`, `guide.html`, тесты `test_seo*.py` | Rich Results Test зелёный |
| 3.6 SEO-3 | IndexNow-пинг в `scripts/deploy.sh` + верификация GSC/Bing/Yandex (владелец) | `scripts/`, `docs/` | пинг в деплой-логе |
| 3.7 UX-2 | Онбординг: кнопка «Загрузить пример» в чекере/инспекторе, empty-states | `frontend/src/components/`, локали EN/RU, `scripts/i18n_audit.py` зелёный | e2e: пример подставляется, вердикт рендерится |
| 3.8 UX-5 | Обновляемый фид правил: `/api/threat-rules` из версионируемого JSON в `content/`, клиент мержит со статикой `redflags.ts` | `backend/routers/api.py`, `content/threat-rules/`, `frontend/src/data/` | правило добавляется без релиза фронта; reseed-safe (не user-state) |
| 3.9 REL-4 | Стейджинг: compose-профиль + отдельный порт/домен, smoke перед прод-деплоем | `docker-compose.staging.yml`, `scripts/deploy.sh`, CI job | `staging verified` перед каждым прод-деплоем |

Порядок: 3.5 → 3.1 → 3.7 → 3.8 → 3.2 → 3.4 → 3.9 → 3.6 → 3.3 (от дешёвых/ценных к инфраструктурным; 3.3/3.6 частично внешние).

---

## Волна 4 — Backlog (через superpowers:brainstorming, отдельные спеки)

- **UX-7 RU-слаги:** двуязычные slug-маппинги + 301 со старых; риск SEO — нужен спек-док с матрицей редиректов. Отдельный plan-файл.
- **UX-4 Аккаунты/sync прогресса:** конфликтует с privacy-обещанием и reseed-моделью БД — нужна отдельная writable-схема, приватность-ревью, claim-ledger правки. Только после brainstorming-сессии с Дмитрием.
- **UX-6 Opt-in LLM-разбор:** ломает «текст не покидает браузер» → требует явного согласия в UI, отдельного эндпоинта, обновления клейм-леджера. Brainstorming + юридическая формулировка.

Каждый пункт: спек → план → subagent-driven исполнение, как отдельная волна.

---

## Действия владельца (вне репозитория)

- [ ] Деплой Волны 0 сразу после мержа; прод-проверка `/en/game` (см. выше).
- [ ] Cloudflare: CF-3 origin-cert, CF-4 HSTS, CF-6 WAF/rate-limit, CF-7 redirect rules, CF-9 Web Analytics, PERF-1 cache rules — по `docs/cloudflare/SETUP.md`, фиксировать даты проверок.
- [ ] Хост: `scripts/cf-firewall.sh` (ufw), cron `scripts/backup-db.sh`, UptimeRobot/CF-алерты (REL-2).
- [ ] `CSP_REPORT_ONLY=0` после чистой недели отчётов (Волна 1).
- [ ] GSC/Bing/Yandex верификация (SEO-3).

---

## Процесс исполнения (superpowers + мультиагентность)

1. **Контроллер** (эта сессия) держит план и ledger прогресса; сам код не пишет.
2. На задачу — **свежий implementer-субагент**: получает только свой task brief, интерфейсы от предыдущих задач и глобальные ограничения (ниже). TDD обязателен: RED → GREEN → рефакторинг → коммит.
3. После каждой задачи — **reviewer-субагент** (два вердикта: spec compliance и code quality). Critical/Important — fix-субагент → повторное ревью. Minor — в ledger.
4. Конец волны — **финальное ревью всей ветки** самым сильным доступным агентом + прогон: `pytest -q`, `cd frontend && npm test && npm run build`, `python3 scripts/i18n_audit.py`, e2e в CI.
5. Параллелизм только для непересекающихся зон (docs vs backend vs e2e); два implementer'а в один файл — никогда.

**Глобальные ограничения (копировать в каждый brief):**
- Приватность: ввод чекера/инспектора не покидает браузер; телеметрия без сырых сообщений/URL.
- RU/EN изменения — только парой; `scripts/i18n_audit.py` зелёный.
- `backend/static/` — коммитить вместе с изменением фронта (`npm run build`).
- Курс = 9 модулей; формулировки публичных клеймов — только из CLAIM_LEDGER.md.
- Не деплоить/пушить/открывать PR без явной авторизации Дмитрия.
- Статусные слова: implemented / configured / production verified — строго по PROJECT.md.

## Ревью с исправлением (сквозная дорожка)

- [ ] R1: Ревью непроверенных коммитов волны v6 (`3a985a6`, `9297ee0`, `67a8419`) — security/privacy/i18n-чеклист; находки → fix-субагент.
- [ ] R2: Двухэтапное ревью каждой задачи волн 0–3 (встроено в процесс).
- [ ] R3: Финальное whole-branch ревью перед каждым мержем + обновление статус-шапки FEATURE_PLAN.md и CLAIM_LEDGER.md при изменении публичных клеймов.
