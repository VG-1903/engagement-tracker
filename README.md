# Engagement Tracker

A task and engagement management tool for a CA / GST practice. Managers open client engagements, and tasks are generated from service templates. Members work those tasks through a review workflow, and recurring compliance work (for example, monthly GST) rolls forward idempotently.

- **Backend:** FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, PostgreSQL, JWT (bcrypt)
- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind. The UI is branded "Ledgerline": warm-neutral design tokens, a task drawer with a workflow stepper and activity timeline, toasts, skeleton loaders, and tables that turn into cards on phones. Any task can be shared as a deep link: `/tasks?task=ID` opens its drawer
- **Tests:** 92 pytest tests against a real PostgreSQL database, plus 25 Playwright end-to-end tests that drive the real UI and API
- **Design note:** [docs/DESIGN.md](docs/DESIGN.md) ([PDF](docs/DESIGN.pdf)) covers architecture, ERD, workflow, recurring generation, scaling and trade-offs
- **Project guide:** [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) is a detailed walkthrough of the project

| | URL |
|---|---|
| Web app | _add Vercel URL after deploy_ |
| API (OpenAPI docs at `/docs`) | _add Render URL after deploy_ |

## Demo logins (seed data)

| Role | Email | Password |
|---|---|---|
| Admin | admin@example.com | Admin@123 |
| Manager | priya.manager@example.com | Manager@123 |
| Manager | rahul.manager@example.com | Manager@123 |
| Member | anita@example.com | Member@123 |
| Member | karan@example.com / neha@example.com / vikram@example.com | Member@123 |

The seed contains 5 clients and 3 services: Monthly GST Compliance (recurring monthly), GST Registration and GST Refund (both one-time). It creates 54 tasks across every status, including overdue work, tasks due today and tasks waiting for review or for the client. Every seeded status is reached through the real workflow service, so each task has a genuine audit history. Dates are relative to the day you run the seed.

## Local setup

Prerequisites: Docker, Python 3.12+, Node 20+.

```bash
make setup      # starts Postgres, installs deps, runs migrations, seeds demo data
make api        # http://localhost:8000  (Swagger UI at /docs)
make web        # http://localhost:3000
```

<details>
<summary>Without make (e.g. Windows PowerShell)</summary>

```bash
docker compose up -d --wait db
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt      # macOS/Linux: .venv/bin/pip
cp .env.example .env
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.cli seed                  # --reset to wipe and re-seed
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000

cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```
</details>

### Environment variables

`backend/.env` (see [backend/.env.example](backend/.env.example)):

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres URL; `postgres://` URLs from Neon or Render are accepted | local docker DB |
| `TEST_DATABASE_URL` | Database for pytest; the name must end in `_test` | `…/engagement_test` |
| `JWT_SECRET` | HS256 signing key; **must be set in production** | dev-only value |
| `ACCESS_TOKEN_MINUTES` | Token lifetime | 480 |
| `CORS_ORIGINS` | Comma-separated allowed web origins | `http://localhost:3000` |
| `BUSINESS_TIMEZONE` | Time zone used for "today" (overdue, due today) | `Asia/Kolkata` |

`frontend/.env.local`: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

## Running tests

There are two suites: **92 backend tests** (pytest) and **25 end-to-end tests** (Playwright).

```bash
make test                       # or: cd backend && .venv/Scripts/python -m pytest -v
```

Backend tests build the schema by running the Alembic migrations against `TEST_DATABASE_URL`, and truncate between tests. The seven required scenarios are in [tests/test_workflow_rules.py](backend/tests/test_workflow_rules.py) and [tests/test_engagements.py](backend/tests/test_engagements.py) (search for `required test`).

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push: pytest against a Postgres service container, `npm run lint && npm run build` for the frontend, and the end-to-end suite.

### End-to-end tests

The Playwright specs in [frontend/e2e/](frontend/e2e) (`auth`, `member`, `manager`, `admin`, `resilience`) sign in as the seeded users and exercise the real UI against the real API: the member work cycle, review and self-approval rules, reassignment and audit history, duplicate-period and idempotent generation, admin CRUD, role-aware navigation, stale-version recovery and the phone layout.

```bash
createdb engagement_e2e          # once; docker compose creates it on a fresh volume (infra/init-test-db.sql)
cd frontend
npx playwright install chromium  # once
npx playwright test              # add --ui for the interactive runner
```

[playwright.config.ts](frontend/playwright.config.ts) uses its own database, `engagement_e2e` (override with `E2E_DATABASE_URL`), so your dev data is untouched. It runs the migrations and `seed --reset`, starts the API on port 8001 (from `backend/.venv`) and Next.js dev on port 3001, and runs with one worker because the tests share the seeded database. Ports 8001 and 3001 must be free.

## API overview

All list endpoints use keyset pagination (`?limit=&cursor=` → `{items, next_cursor}`). Every error has the shape `{"error": {"code", "message", "details?"}}`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` |
| Dashboard | `GET /dashboard`: counts and top items for open / overdue / due today / waiting for client / waiting for review, scoped to the caller |
| Engagements | `POST /engagements`, `GET /engagements`, `GET /engagements/{id}`, `POST /engagements/{id}/generate-next` (201 created / 200 already existed) |
| Tasks | `GET /tasks?status=&overdue=&due_today=&mine=`, `GET /tasks/{id}` (includes `allowed_actions`), `PATCH /tasks/{id}` (assignee / reviewer / due date + `version`), `POST /tasks/{id}/transitions` (`{action, note, version}`), `GET /tasks/{id}/history` |
| Admin | `/users`, `/clients`, `/service-types`, `/service-types/{id}/templates`, `/task-templates/{id}`, `POST /admin/recurring/generate {as_of}` |

Scheduler / CLI: `python -m app.cli generate-recurring --as-of 2026-10-01` is idempotent, so it is safe to run from cron.

## Deployment

1. **Database (Neon):** create a project and copy the connection string.
2. **API (Render):** New → Blueprint → select this repo (it uses [render.yaml](render.yaml)). Set `DATABASE_URL` to the Neon URL and `CORS_ORIGINS` to the Vercel URL. Migrations run on start. Seed once from the Render shell: `python -m app.cli seed`.
3. **Web (Vercel):** import the repo with root directory `frontend`, and set `NEXT_PUBLIC_API_URL` to the Render URL.

## Project layout

```
backend/
  app/
    routers/        HTTP layer only
    services/       use cases, transactions, permission checks (access.py = visibility rules)
    domain/         workflow.py (state machine), periods.py (period arithmetic), both pure
    models.py  schemas.py  errors.py  deps.py  security.py  seed.py  cli.py
  alembic/versions/0001_initial_schema.py
  tests/
frontend/
  app/(app)/        dashboard, tasks (?task=ID deep-links to a task), engagements, admin/*
  app/globals.css   design tokens
  components/       AppShell (role-aware nav, admin guard), TaskDrawer, TaskTable, toast, ui primitives
  lib/              api client, auth context, formatting
  e2e/              Playwright specs
docs/               DESIGN.md / DESIGN.pdf, PROJECT_GUIDE.md
infra/              init-test-db.sql (creates engagement_test and engagement_e2e)
```
