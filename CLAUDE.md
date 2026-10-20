# CLAUDE.md

## Project truth and design authority

DiScammer is a bilingual FastAPI/Jinja2 anti-scam learning product with React
islands. The current authorities are, in order:

1. executable code, tests, schemas, and the Vite build manifest;
2. [`PRODUCT.md`](PRODUCT.md) and [`DESIGN.md`](DESIGN.md);
3. [`docs/portfolio/CLAIM_LEDGER.md`](docs/portfolio/CLAIM_LEDGER.md) for
   public wording and known limitations;
4. [`FEATURE_PLAN.md`](FEATURE_PLAN.md) for planned work.

`DISCAMMER_REDESIGN_PLAN_v2.md` is a historical Tilda-migration record. Do not
use its routes, palette, fonts, island count, or implementation instructions as
the current specification.

## Commands

```bash
# Backend tests, from the repository root
python -m pip install -r requirements.txt pytest httpx
pytest -q

# Backend development, from backend/
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend checks, from frontend/
npm ci
npm test
npm run build

# Locale contract audit, from the repository root
python3 scripts/i18n_audit.py

# Full stack
docker compose up --build
```

`httpx` is required by FastAPI's test client but is not a production runtime
dependency. The explicit test install above avoids treating its absence from
`requirements.txt` as a product capability or deployment requirement.

Run `main:app` from `backend/`; that working directory is required for the
sibling imports used by the application. The full CI workflow additionally
runs dependency audits, Docker build, and Playwright E2E tests.

## Architecture

- `backend/main.py` creates the FastAPI app, mounts `/static`, registers Jinja
  globals, and includes the pages, API, game, and SEO routers.
- Pages are server-rendered and localized under `/en/...` and `/ru/...`; root
  and legacy paths redirect to those canonical routes.
- `frontend/src/main.tsx` contains 23 lazy React-island registrations. A mount
  needs a component, registry entry, and Jinja `[data-component]` element.
  Preserve its server-rendered fallback behavior.
- Vite emits content-hashed assets and `backend/static/.vite/manifest.json`.
  `backend/assets.py` resolves them in templates. Do not switch JavaScript or
  CSS back to query-string cache busting.
- `backend/static/` is committed output. `npm run build` removes and recreates
  the JavaScript, CSS, and Vite manifest directories; build and commit them
  with frontend or Tailwind-visible template changes.

## Content and data model

- Markdown under `content/{guides,interviews,newsletters,articles}/` is the
  source for journal and guide content.
- Module metadata is `COURSE_MODULES` in `backend/seed_data.py`; lesson JSON is
  file-driven under `content/course/` and has EN/RU pairs.
- SQLite stores derived `post`, `scam_guide`, `course_module`, `lesson`, and
  search-index data. Startup reseeding clears and repopulates derived content
  tables. Never add durable user state to this reseeded group.
- `scripts/i18n_audit.py` enforces locale-key parity and use. Keep RU and EN
  changes together.

## Product and privacy guardrails

- The course has nine modules. Do not reintroduce a stale count.
- The final assessment is self-paced, unproctored, unmonitored, and browser
  local. The completion record is not a verified credential or proof of
  identity or competence.
- The checker and inspector analyze text and URLs in the browser. Do not claim
  that this eliminates all operational logging or error telemetry; use the
  privacy wording approved in the claim ledger.
- The journal is an archive, not a demonstrated weekly publishing service.
- Do not imply user research, outcome metrics, external accreditation,
  institutional endorsement, or Foma Molchanov's personal contribution beyond
  the reviewed portfolio dossier.

## Operational terminology

`implemented` means source and repository checks exist. `configured` means a
config or runbook exists. Only a dated external check can be called `production
verified`. Keep these states distinct in documentation and public copy.

For the longer technical overview, contributor commands, and documentation map,
read [`PROJECT.md`](PROJECT.md). For admissions evidence and author-review
requirements, read [`docs/portfolio/README.md`](docs/portfolio/README.md).

## Production host (AWS, с октября 2026)

Прод работает на AWS. Beget (`203.0.113.10`) и латвийский VPS (`203.0.113.11`) — прошлые площадки,
выкладывать на них ничего не нужно.

- **Сервер:** EC2 `i-0a1b2c3d4e5f60718` (eu-central-1), Elastic IP `203.0.113.12`, вход по SSH
  как `ubuntu` с ключом `~/.ssh/discammer`. Домен проксирует Cloudflare.
- **Образ:** частный ECR `123456789012.dkr.ecr.eu-central-1.amazonaws.com/discammer-web`. Сервер
  тянет его по digest, а не по тегу. Профиль AWS на Маке — `slovo-admin`.
- **Конфигурация на сервере:** `/etc/discammer/deployment.env` (переменная `DISCAMMER_IMAGE`) и
  `/etc/discammer/compose.yaml`, проект compose `discammer-staging`. Перед сменой образа прежний
  `deployment.env` сохраняется как `deployment.env.prev`.
- **Версия на проде:** `GET https://discammer.com/api/health` показывает короткий SHA сборки.
  Сверяйте его с тем, что собирались выложить: зелёный статус 200 версию не доказывает.

### Как выкладывать

- **Единственный путь — прямая выкладка с Мака владельца**, так же, как 21 октября 2026. Скрипты и
  README лежат в папке `release-20261021/` в корне проекта (она в `.git/info/exclude`, в репозиторий не
  входит): `./deploy-direct.sh --preflight`, затем `./deploy-direct.sh` (спросит `DEPLOY`). Скрипт
  собирает образ под linux/amd64, пушит его в ECR и запускает на сервере `aws-host-deploy.sh`: pull по
  digest, смена контейнера, публикация текстов со снимками, проверки, автоматический откат.
- Скрипт берёт первый `discammer-release-*.tar.gz` рядом с собой и отказывается собирать, если вместо
  игровой сборки в архиве указатели Git LFS. Для нового релиза заведите новую папку с копиями скриптов
  и свежим архивом нужного коммита.
- **GitHub Actions для выкладки не используются.** GitHub не запускает jobs: бесплатные минуты Actions
  за месяц израсходованы, а платёжные данные аккаунта обновить нельзя (статус на 21 октября 2026).
  Пуш в `main` ничего не выкладывает. Не запускайте и не чините `.github/workflows/ci-cd.yml` ради
  выкладки. Коммиты, которые не должны запускать workflow, помечайте `[skip ci]`.
- После выкладки сбросьте кэш Cloudflare (Caching → Configuration → Purge Everything).

### Тексты в базе не обновляются вместе с образом

На проде `SEED_ON_STARTUP=false`: при старте контейнер не перезаписывает базу из `content/` и
`seed_data.py`. Поэтому уроки, руководства, модули и заголовки постов из базы меняются только
скриптами публикации, у каждого есть `--dry-run`, `--apply --snapshot`, `--status` и `--restore`:

- `backend/editorial_course_sync.py` — уроки курса (`content/course/**`);
- `backend/editorial_site_sync.py` — руководства, модули и заголовки постов
  (по умолчанию читает `backend/site-sync-20261021.json`).

Они пишут снимок прежних строк до изменения, так что откат возможен без пересборки образа.

### Что в репозитории устарело

`scripts/deploy.sh`, `docs/ops/runbook.md`, `docs/ops/staging.md` и `docs/ops/secrets.md` описывают
прежний сервер на Beget и выкладку через GitHub Actions (`--resolve
discammer.com:443:203.0.113.10`, nginx, `/opt/discammer`). К текущему проду они не относятся и
ждут отдельной переработки.
