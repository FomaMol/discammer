# Handoff — v4 features (сессия 2026-06-12, поверх v3)

> Это состояние **после v4**. План v4 с отметками: `docs/superpowers/plans/2026-06-12-v4-feature-plan.md`
> (там же — лог по волнам W0→G4, таблица метрик и **owner actions перед пушем**).
> v3-история — ниже по этому файлу.

## Состояние после v4

- Ветка **`v4-features`** (создана от `main`@`56a2bef`), рабочее дерево чистое, **4 коммита v4** (`e13324a` W1, `3289b8b` W2, `eff727e` W3, `8145095` W4) поверх 6 v3-коммитов. **Ничего не запушено.**
- **`git push` = деплой на прод.** Перед пушем выполни owner actions из плана (git-lfs на проде, `chown 10001` на `/opt/discammer/data`, сверка nginx-vhost). deploy.sh теперь fail-safe (git-lfs lines под guard'ом; APP_UID=10001 экспортится сам), но пункты всё равно нужны.
- Верификация G4: **pytest 69**, **vitest 36**, **e2e 44** (chromium), `tsc`+`build` чисто, `backend/static` без дрейфа, i18n-audit чист (en==ru parity, 0 dead/0 missing). Скриншот-свипы RU/EN×desktop/mobile без визуальных регрессий (диффы — только фаза анимации typewriter + новые nav-ссылки + новые страницы).

## Что добавилось в v4 (выжимка; детали — в плане)

1. **Бандл-сплит** (`e13324a`): хэшированные чанки + `.vite/manifest.json` (`backend/assets.py` → Jinja-global `vite_entry`), `React.lazy` вернулся. **Plyr грузится только на пост-страницах с видео, не на главной.** `base:'/static/'` в vite.config — иначе preload-хелпер 404-ит чанки.
2. **БД на запрос**: `get_conn` (Depends), CRUD-хелперы берут опциональный `conn` (fallback открывает свой — чтобы `seo.py` работал). Главная = 1 коннект (было 4). Seed под `fcntl.flock` + `SEED_ON_STARTUP`.
3. **Наблюдаемость**: middleware с `X-Request-ID` + структурный лог (`LOG_FORMAT=json|text`), `GET /api/health` (503 при отказе БД, `version=GIT_SHA`, счётчики). Dockerfile HEALTHCHECK / deploy.sh probe / CI — на `/api/health`.
4. **RSS**: фид уже жил в `seo.py` (`/feed.xml`) — его **расширили** (30 постов, `_cdata()` экранирует `]]>`), НЕ создавали `routers/feeds.py` (была бы коллизия маршрута).
5. **i18n унификация**: все островные `BUNDLES` → `client.*` в локалях (22 неймспейса), `get_client_bundle(lang)` инжектится в `window.__DISCAMMER_I18N__.strings`, `makeTranslator('ns')` читает его и **ходит по точечным ключам** (`flags.x_label`). Удалено ~114 мёртвых ключей. `scripts/i18n_audit.py` + аллоулист = CI-гард (dead + missing-backend + en/ru parity).
6. **OG-карточки** (F4): `scripts/og_generate.py`+`og_template.html` → 66 PNG (пост/гайд × en/ru) в `static/images/og/`; `pages.py` ставит `page_image` через import-time set.
7. **Поиск** (F1): FTS5 `content_fts` в сиде (LIKE-fallback), `/api/search` (per-term `"term"*`, snippet escape-then-mark = единственный санкционированный `dangerouslySetInnerHTML`), SSR `/{lang}/search` + остров `SearchConsole`.
8. **Анализатор сообщений** (F2, флагман): `frontend/src/data/redflags.ts` (21 правило RU+EN, чистый `analyze()`), остров `MessageAnalyzer` (текст **не покидает браузер**), SSR `/{lang}/check`. **Гочи** см. ниже.
9. **Экспорт/импорт прогресса** (F5): `progress.ts` `exportProgress`/`importProgress` (версионируемое досье, merge best-of), футер в `CourseProgress`.
10. **Nav**: добавлены CHECK + SEARCH (не теснятся на 768–900px), `aria-current` расширен, RSS-`<link>` стал абсолютным.
11. **E2E** (Q1): `e2e/` (10 спеков, `@playwright/test`+`@axe-core/playwright`), `scripts/e2e.sh`, CI-джоб `e2e` (compose + `/api/health`), `deploy` зависит от него. `npm test` (vitest) добавлен в CI.

## Новые гочи v4 (не «чинить» обратно!)

- **`forceescape` НЕЛЬЗЯ внутри `<script>`** — он HTML-экранирует JSON и ломает литерал. Инжект бандла в base.html — `... | tojson` (без forceescape). В `data-props`-атрибутах `tojson | forceescape` остаётся (это атрибут).
- **Вложенные i18n-группы** (`client.analyzer.flags.*`): `get_client_bundle` мерджит рекурсивно (НЕ `str()`-ит вложенные dict'ы), `makeTranslator` ходит по точкам. Тест парности/аудит ждут вложенность.
- **Тернарные ключи невидимы аудиту**: `tr(cond?'a':'b')` прячет оба ключа от литерального сканера — пиши литеральные `tr('a')`/`tr('b')` по веткам (см. SearchConsole счётчик результатов).
- **`base:'/static/'`** в vite.config обязателен (serve-путь бандла) — без него двойной фетч чанков (404 + реальный).
- **git-lfs ещё не мигрирован**: `.br`-бинари закоммичены обычными блобами; `.gitattributes`/CI/deploy.sh готовы, но `git lfs migrate` — owner action (`docs/deploy/git-lfs.md`). deploy.sh пропускает lfs-строки, если git-lfs нет.
- **`.gitignore`: `/data/`** (с якорем) — без него bare `data/` глотал `frontend/src/data/`.
- **WCAG AA контраст**: приглушённая серая палитра (`#475064`/`#6b7588` на тёмном холсте) не проходит AA — это design-token-долг, a11y-e2e гейтит только structural-нарушения. См. v5.
- Плюс все v3-гочи ниже (медиа на проде, коммит `backend/static`, правило стрелок, OG-PNG, Jinja `cache_size=0`, Plyr не размонтировать).

## Отложено в v5

- Реальная `git lfs migrate` бинарей + установка git-lfs на проде (owner).
- Подъём контраста приглушённого текста до WCAG AA (смена токенов).
- Аккаунты/синк прогресса, аналитика, client error beacon, markdown в threadpool — см. «Deferred to v5» в плане.

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
