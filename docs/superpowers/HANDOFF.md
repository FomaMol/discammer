# Handoff — v5 (hardening + comprehension features, сессия 2026-06-20)

> Состояние **после v5**. План с отметками по волнам, таблицей метрик и owner-actions:
> `docs/superpowers/plans/2026-06-19-v5-feature-plan.md`.
> **Прим.:** ветка `v5-features` срезана от `8145095` (v4 W4), ДО коммита, где обновлялся
> v4-handoff, поэтому ниже по этому файлу — сразу **v3**-handoff; контекст v4 — в
> `docs/superpowers/plans/2026-06-12-v4-feature-plan.md` (восстановится при reconcile с `main`).

## Состояние после v5

- Ветка **`v5-features`** — срезана от **`8145095`** (= v4-features HEAD, по явному решению владельца), **7 коммитов v5** (`76755c1` W0 → `adb9ccd` W1 → `33c0193` W2 → `ef8d4de` W3 → `50db31d` W4-QA → `1d667c8` R2). **Ничего не запушено. `git push` в `main` = деплой на прод (discammer.com).**
- Верификация G4: **pytest 94**, **vitest 101**, **e2e 71** (49 функциональных зелёные локально + 22 visual, прогоняются в CI), `tsc`+`build` чисто, `backend/static` без дрейфа, **i18n-audit чист** (en==ru parity, 0 dead / 0 missing, 300 allowlist), **axe 7/7 с ВКЛЮЧЁННЫМ `color-contrast`** (вкл. `/inspect`).

## Что добавилось в v5 (выжимка; детали — в плане)

1. **A1 non-root** — `scripts/docker-entrypoint.sh`: root → `chown /app/data` → `gosu` drop до uid 10001 → uvicorn. Образ **стартует от root by design**; процесс — non-root. CI e2e ассертит uid через `/proc/1`.
2. **A3 markdown off-loop** — thread-local `markdown.Markdown` + `run_in_threadpool` (был race на общем `_MD`); вывод байт-в-байт прежний.
3. **A2 WCAG-AA** — приглушённый текст → `#8b94a8` (≥4.86:1 на всех 4 поверхностях), новый `--color-ink-dim #6b7588` для не-текста; axe `color-contrast` теперь **включён** (+`/ru/`, `/journal`, `/inspect`).
4. **A4 supply-chain** — CI `audit` job (pip-audit 2.10.1 + npm audit, high/critical=fail), **в `deploy.needs`**; bleach 6.3→6.4 (реальный `clean()` a/href XSS-bypass).
5. **O1 client error beacon** — `beacon.ts` (браузер покидают только `{name, messageClass, location}`); `POST /api/client-errors` (413 stream-cap, 429 per-IP, хранит НИЧЕГО, лог только scrubbed).
6. **O2 RED metrics** — `GET /api/metrics` (token/loopback-gated, публике 404), `metrics.py` (route-template метки, без PII).
7. **F1 knowledge check** — остров `KnowledgeCheck` на гайдах, `quizzes.ts` (10 гайдов RU+EN), досье → **v:2** (back-compat импортёр).
8. **F2 link inspector** — `/{lang}/inspect`, `url_heuristics.ts` (11 эвристик; URL **не покидает браузер**).
9. **F3 verdict card** — `VerdictCard` (canvas PNG + Web Share), `buildCardData` доказуемо без текста сообщения.
10. **I1** — INSPECT в nav (6-й пункт; помещается на 768–900px в EN и RU).
11. **Q1/Q2/O3** — visual regression, Lighthouse budgets, post-deploy prod smoke.

## Новые гочи v5 (не «чинить» обратно!)

- **Образ контейнера стартует от ROOT by design** — entrypoint chown'ит `/app/data` и сбрасывает привилегии через gosu. НЕ добавлять bare `USER` (это и был баг v4); compose НЕ должен пинить `user:`.
- **A1 проверяется ТОЛЬКО в CI** (Docker локально нет): CI e2e ассертит uid через `/proc/1` (НЕ `docker compose exec ... id -u` — тот вернул бы root образа, т.к. USER нет).
- **`/api/metrics` закрыт по умолчанию**: token-gated (`METRICS_TOKEN`) или loopback; публике 404. За nginx `request.client.host` = прокси, так что loopback-исключение публику не пускает.
- **beacon: sampled + rate-limited + size-capped, хранит НИЧЕГО.** `_client_ip` берёт `X-Real-IP` (его ставит наш nginx) → лимит реально per-IP; `_client_error_buckets` ограничен 4096 с эвикцией.
- **Досье теперь `v:2`** (добавлено `guideChecks`); импортёр back-compat принимает `v:1`. Не ломать импортёр.
- **Visual baselines per-OS**: закоммичены `*-darwin`; CI (Linux) baselines надо засеять один раз через `--update-snapshots` (см. `docs/deploy/visual-regression.md`), пока CI visual-шаг `continue-on-error`.
- **Lighthouse floors — ratchet** (только ужесточать); правка в `lighthouserc.json`.
- **`#475064` retired для текста** (A2): приглушённый текст = `#8b94a8`/`text-ink-mute`; не-текст = `text-ink-dim`. Не вводить `text-[#6b7588]`/`text-[#475064]` литералы — axe contrast теперь гейтит.
- Плюс все v3-гочи ниже (и v4-гочи — в плане v4).

## Owner actions (v5)

1. **Reconcile A1/A2 с прод `main`** — `v5-features` срезана от `8145095` и переделала A1/A2 начисто; прод `main` уже несёт ad-hoc A1/A2 (`e97cf6d`, `062d2a1`). Решить порядок слияния (вероятно — `v5-features` как канонические A1/A2, заменяющие ad-hoc).
2. **CI-only first-run** (нужен первый пуш владельца, локально не проверяемо без Docker): A1 non-root ассерт, Q1 Linux baseline seed (+ снять `continue-on-error`), Q2 lighthouse прогон, O3 prod smoke.
3. **`METRICS_TOKEN`** на проде, если скрейпить `/api/metrics` снаружи.
4. Перенесено из v4 (не блокирует): `git lfs migrate` + git-lfs на проде; nginx vhost reconcile.

---

# Handoff — редизайн v3 + ревью-фиксы (сессия 2026-06-12)

Документ для продолжения работы в новой сессии. Прочитай его целиком, затем
`docs/superpowers/specs/2026-06-12-redesign-v3-design.md` (спека) и
`docs/superpowers/plans/2026-06-12-redesign-v3.md` (план с отметками, что сделано).

## Состояние на момент handoff

- Ветка `main`, рабочее дерево чистое, **5 незапушенных коммитов** (`d70b60d..0cf1953`).
- **ВАЖНО: `git push` в main запускает CI-деплой на прод (discammer.com).** Пушить только по явному решению владельца.
- Верификация перед handoff: `pytest` 28/28 (было 20, добавлено 8 регрессионных), `npx tsc --noEmit` чисто, `npm run build` чисто, скриншотный обход всех страниц (RU/EN, десктоп/мобайл) без визуальных регрессий, консоль браузера без ошибок, ручные проверки SEO/a11y-фиксов через curl.

## Что сделано (выжимка; детали в плане)

1. `d70b60d` — спека + план v3 (аудит против DESIGN.md/PRODUCT.md и скиллов impeccable/taste/redesign; вывод: полировка, не перекраска).
2. `11038b2` — инфра: `.dockerignore`, пиннинг зависимостей, слои Dockerfile + HEALTHCHECK, deploy.sh с rollback-тегом `:prev` и health-пробой, CI-защита от рассинхрона `backend/static`, SHA-пиннинг ssh-action.
3. `16852a5` — бэкенд: 404 вместо 422 для `/de/...` и неизвестных путей; `SITE_ORIGIN` (config.py, env-переопределяемый) как единый источник абсолютных SEO-URL (base.html + seo.py); TTL-мемо для `asset_url`; allowlist `data-component/data-props` в санитайзере; `ValueError` в `i18n.t`; no-cache для `/play/index.html`; `page_image`/`page_description` для постов/гайдов; plaintext-404 для probe-путей (`/favicon.ico` и т.п.).
4. `0c7d53a` — шаблоны/локали: убран дубль `> >` (правило: стрелку рисует потребитель, строки локали чистые); абсолютные og/canonical/hreflang + x-default + PNG OG-карточка; локализованы skip-link/noscript/aria-labels/JSON-LD Home; aria-current в навигации; h1 на course/game/404; якоря `#modules`, `#threat-database`.
5. `0cf1953` — фронтенд (~17 островов): фикс размонтирующегося поля имени сертификата (confirm-кнопка); ErrorBoundary в main.tsx (восстанавливает SSR-фолбэк) + статические импорты вместо React.lazy; видео-фолбэк «// запись недоступна» (Plyr прячется, НЕ размонтируется — иначе removeChild-краш; error ловится и на `<source>`); цепочка разблокировки курса; reduced-motion везде; focus trap в GameLauncher; unicode-ids каруселей; fetch-cancellation; best-of в ExamWidget; чистка мёртвого кода/CSS; `overflow-x: clip`; Plyr-скин переведён с неонового `#00f0ff` на бренд-циан `#65def0`.

## Backlog для доработки плана (приоритезирован, всё verified-but-deferred)

### Высокая ценность
1. **Re-splitting бандла** (`frontend/vite.config.ts`). Сейчас `inlineDynamicImports: true` — Plyr и все курс-виджеты грузятся на каждой странице (377 KB). Путь: хэшированные имена чанков + manifest, `asset_url`/шаблоны читают manifest вместо стабильных имён с `?v=`. Осторожно: исторический баг React #321 (двойной инстанс React) возник именно из-за cache-bust-query на lazy-чанках — решается хэшами в именах, но требует аккуратной правки `base.html` и Dockerfile-конвейера. После этого можно вернуть lazy в `main.tsx`.
2. **Unify island translations.** Два источника правды: `backend/locales/*.json` и per-component `BUNDLES` в островах (+`STRINGS` в `utils/i18n.ts`). Они уже дрейфуют (пример в ревью: `mark_complete`). ~119 ключей локалей мертвы. Путь: либо прокидывать нужные строки через data-props, либо инжектить срез локали в `window.__DISCAMMER_I18N__`. После унификации — чистка мёртвых ключей.
3. **Соединение с БД на запрос** (`backend/database.py`): сейчас каждый CRUD-хелпер открывает свой aiosqlite-коннект (домашняя страница = 4 коннекта/запрос). Путь: dependency-injected соединение на запрос или маленький пул.

### Средняя ценность
4. **git-LFS для Unity-бинарей** (`backend/game_build/Build/*.br`, ~25 MB на версию, история растёт линейно) или раздача с сервера как `/media`.
5. **nginx vhost в репо** (`deploy/nginx/`): сейчас конфиг (TLS, `/media/` alias, proxy на :8000) живёт только на сервере — пересоздание сервера его теряет.
6. **Non-root в контейнере**: отложено из-за владельца bind-mount `./data` (uid хоста неизвестен). Путь: `USER app` + uid-маппинг или том с выставленным chown.
7. **Guard от multi-worker seed**: `seed_database()` чистит и перезаливает таблицы на старте; безопасно только при 1 воркере. Файл-лок или вынос сида в отдельный init-шаг перед масштабированием.

### Низкая ценность / косметика
8. `HEAD`-запросы на `/play/*` дают 405 (роуты объявлены только GET) — добавить `methods=["GET","HEAD"]` или игнорировать.
9. Legacy-имена сертификата: имя, сохранённое старым багованным кодом (на каждый кейстрок), при наличии пройденного экзамена авто-показывает сертификат без подтверждения. Pre-existing данные, не регрессия; при желании — миграция «считать неподтверждённым, если длина < 2».
10. `docker-compose.prod.yml`: при необходимости переопределить origin — `environment: SITE_ORIGIN=...` (дефолт уже `https://discammer.com` в `backend/config.py`).
11. Markdown-рендер синхронный в async-хендлерах — при росте контента вынести в `run_in_threadpool` или предрендер на этапе сида.

### Не установлено (просил пользователь, вызвать нечем)
Скиллы по ссылкам пользователя, отсутствующие локально: 21st.dev, stitch.withgoogle.com, ui-ux-pro-max-skill, npxskillui, awesome-design-md. Если появятся в `.claude/skills/` — прогнать дополнительный дизайн-проход с ними.

## Гочи (не «исправлять» обратно!)

- `/media/...` (видео/постеры) раздаёт **prod nginx** из `/opt/discammer/media` — локальные 404 ожидаемы; VideoPlayer показывает фолбэк.
- `backend/static/` — коммитнутый Vite-артефакт; после правки `frontend/src` обязательно `npm run build` + коммит (CI теперь падает при дрейфе).
- Правило стрелок: строки локалей секционных заголовков — чистый текст, стилизованный `>` рисует потребитель; в строках терминала `>` остаётся внутри строки. Никогда оба сразу.
- OG PNG (`backend/static/images/og/discammer-og.png`) генерируется скриншотом соседнего SVG во вьюпорте 1200×630 (playwright) — перегенерировать так же при изменении SVG.
- Python 3.14 локально: Jinja2 `Environment` собирается вручную с `cache_size=0` (main.py) — не «упрощать».
- Plyr нельзя размонтировать после инициализации (removeChild-краш) — только прятать.

## Как продолжить

```bash
# сервер (предпочтительно через preview-тулзу: launch.json уже настроен, имя discammer-backend)
backend/.venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000

# тесты / типчек / сборка
backend/.venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit && npm run build
```

Скриншоты-эталоны этой сессии лежали в `/tmp/dcm-audit` (до) и `/tmp/dcm-after` (после) — каталоги эфемерные; при необходимости пересними playwright-cli (`page.screenshot({fullPage: true})`).
