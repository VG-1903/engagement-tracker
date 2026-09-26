# One-command local setup:  make setup   (then: make api  /  make web)
PY := backend/.venv/bin/python
ifeq ($(OS),Windows_NT)
PY := backend/.venv/Scripts/python
endif

.PHONY: setup db venv migrate seed api web test reset generate-recurring

setup: db venv migrate seed web-install

db:
	docker compose up -d --wait db

venv:
	cd backend && python -m venv .venv
	$(PY) -m pip install -q -r backend/requirements-dev.txt
	test -f backend/.env || cp backend/.env.example backend/.env

migrate:
	cd backend && ../$(PY) -m alembic upgrade head

seed:
	cd backend && ../$(PY) -m app.cli seed

reset:
	cd backend && ../$(PY) -m app.cli seed --reset

generate-recurring:
	cd backend && ../$(PY) -m app.cli generate-recurring

api:
	cd backend && ../$(PY) -m uvicorn app.main:app --reload --port 8000

test:
	cd backend && ../$(PY) -m pytest

web-install:
	cd frontend && npm install
	test -f frontend/.env.local || cp frontend/.env.example frontend/.env.local

web:
	cd frontend && npm run dev
