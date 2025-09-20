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

## Production host (переезд 30–31 июля 2026)

Прод переехал с латвийского VPS на российский — Beget закрывает Латвию.

- **Прод-сервер:** `203.0.113.10` (Diligent Mira, Beget, SPB, 2 vCPU / 2 GB / 30 GB NVMe, без swap)
- **Старый адрес `203.0.113.11` (Swift Kendal, Латвия) больше не использовать.** Он будет удалён.

> **Статус переезда на 2026-08-01 — не считать завершённым.** Прямая проверка обоих origin
> (`GET /api/health` с `Host: discammer.com`) показала: **обе машины живы и обе отдают `8e8036e`**.
> Из репозитория невозможно узнать, на какую из них указывает A-запись apex в Cloudflare и на какую
> направлен секрет `DEPLOY_HOST` в GitHub — и то и другое живёт в чужих дашбордах. Пока это не
> подтверждено вручную:
>
> - команды в `docs/ops/runbook.md` вида `--resolve discammer.com:443:203.0.113.10` могут опрашивать
>   **не ту** машину, что обслуживает посетителей, — сверяйтесь с обеими;
> - деплой может уехать на латвийскую коробку, и пайплайн отрапортует зелёным: health-check в
>   `deploy` job проверяет только 200 на `discammer.com` и **никогда не сравнивает SHA**.
>
> Способ различить после следующего пуша: если `https://discammer.com/api/health` остался на старом
> SHA, а прямой запрос к одному из IP отдаёт новый — деплой ушёл именно на него.
- Приложение крутится в docker (`discammer-web-1`), перед ним nginx, домен проксируется Cloudflare.
- Деплой: `scripts/deploy.sh` выполняется на самом сервере.
- Доступ по SSH — ключ, а не пароль. Root-пароль на новом сервере равен латвийскому: при переносе
  `/etc/shadow` приехал со старой машины.

Важно: `/var/log` при переносе не копировался, поэтому подкаталоги логов на новом сервере созданы
заново пустыми. Если добавляете сервис, который пишет в свой каталог в `/var/log`, — создавайте его
явно, иначе сервис не стартует.
