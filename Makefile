# ════════════════════════════════════════════
#  Report Studio — Developer Makefile
# ════════════════════════════════════════════

.PHONY: help up down build logs shell-backend shell-db reset clean frontend-build frontend-test backend-test release-check

help:
	@echo ""
	@echo "  make up          → Sobe todos os containers"
	@echo "  make down        → Para todos os containers"
	@echo "  make build       → Reconstrói imagens (sem cache)"
	@echo "  make logs        → Acompanha logs em tempo real"
	@echo "  make logs-api    → Logs só do backend"
	@echo "  make shell-api   → Shell no container do backend"
	@echo "  make shell-db    → psql no PostgreSQL"
	@echo "  make reset       → Para, remove volumes e sobe do zero"
	@echo "  make clean       → Remove containers, volumes e imagens"
	@echo "  make frontend-build → Build do frontend"
	@echo "  make frontend-test  → Playwright minimo para lancamento"
	@echo "  make backend-test   → Testes backend com pytest"
	@echo "  make release-check  → Checklist minimo automatizado de lancamento"
	@echo ""

up:
	docker compose up -d
	@echo "✅  Aplicação rodando em http://localhost"
	@echo "📚  API docs: http://localhost:8000/api/docs"

down:
	docker compose down

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f backend

shell-api:
	docker compose exec backend bash

shell-db:
	docker compose exec db psql -U rs_user -d reportstudio

reset:
	docker compose down -v
	docker compose up -d --build
	@echo "🔄  Sistema reiniciado do zero"

clean:
	docker compose down -v --rmi local
	@echo "🗑  Containers, volumes e imagens locais removidos"

dev-frontend:
	cd frontend && npm run dev

dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend-build:
	cd frontend && npm run build

frontend-test:
	cd frontend && npm run test:release-min

backend-test:
	cd backend && pytest -q

release-check:
	cd frontend && npm run build
	cd frontend && npm run test:release-min
	cd backend && pytest -q
