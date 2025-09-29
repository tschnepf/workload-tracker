.PHONY: help
help:
	@echo "Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  make setup          - Initial project setup"
	@echo "  make up             - Start all containers"
	@echo "  make down           - Stop all containers"
	@echo "  make rebuild        - Rebuild containers"
	@echo "  make logs           - View container logs"
	@echo "  make shell-backend  - Enter backend container"
	@echo "  make shell-db       - Enter database container"
	@echo "  make migrate        - Run database migrations"
	@echo "  make validate-naming - Check naming consistency"
	@echo "  make generate-types  - Generate TypeScript interfaces"
	@echo "  make openapi-schema  - Dump OpenAPI schema to backend/openapi.json"
	@echo "  make openapi-client  - Generate frontend OpenAPI TS types"
	@echo "  make test           - Run tests"
	@echo "  make clean          - Clean up containers and volumes"
	@echo ""
	@echo "Production:"
	@echo "  make build-prod     - Build production images"
	@echo "  make up-prod        - Start production stack"
	@echo "  make down-prod      - Stop production stack"
	@echo "  make logs-prod      - View production logs"
	@echo "  make backup-db      - Create database backup"
	@echo "  make restore-latest - Restore latest backup (dev)"
	@echo "  make reset-throttles - Clear DRF throttle counters (dev)"

.PHONY: setup
setup:
	@echo "Setting up environment..."
	@cp -n .env.example .env || true
	@echo "Building containers..."
	@docker-compose build
	@echo "Starting services..."
	@docker-compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 10
	@echo "Running initial setup..."
	@make migrate
	@make generate-types
	@echo "Setup complete!"
	@echo "Access the application at:"
	@echo "  - Frontend: http://localhost:3000"
	@echo "  - Backend:  http://localhost:8000"
	@echo "  - Admin:    http://localhost:8000/admin"
	@echo "  - Login:    admin / admin123"

.PHONY: up
up:
	docker-compose up -d

.PHONY: down
down:
	docker-compose down

.PHONY: rebuild
rebuild:
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d

.PHONY: logs
logs:
	docker-compose logs -f

.PHONY: logs-backend
logs-backend:
	docker-compose logs -f backend

.PHONY: logs-frontend
logs-frontend:
	docker-compose logs -f frontend

.PHONY: shell-backend
shell-backend:
	docker-compose exec backend /bin/bash

.PHONY: shell-db
shell-db:
	docker-compose exec db psql -U postgres -d workload_tracker

.PHONY: migrate
migrate:
	docker-compose exec backend python manage.py makemigrations
	docker-compose exec backend python manage.py migrate

.PHONY: validate-naming
validate-naming:
	@echo "Checking naming consistency..."
	@docker-compose exec backend python manage.py shell -c "from core.validation import validate_naming_consistency; errors = validate_naming_consistency(); print('All names consistent' if not errors else f'Errors: {errors}')"

.PHONY: generate-types
generate-types:
	@echo "Generating TypeScript interfaces..."
	@docker-compose exec backend python manage.py generate_types
	@echo "Types generated"

.PHONY: openapi-schema
openapi-schema:
	@echo "Generating OpenAPI schema (backend/openapi.json)..."
	@docker-compose exec backend python manage.py spectacular --file openapi.json --format openapi-json
	@echo "OpenAPI schema written to backend/openapi.json"

.PHONY: openapi-client
openapi-client:
	@echo "Generating frontend OpenAPI TypeScript types..."
	@docker-compose exec frontend npx openapi-typescript ../backend/openapi.json -o src/api/schema.ts
	@echo "Types written to frontend/src/api/schema.ts"

.PHONY: test
test:
	docker-compose exec backend python manage.py test
	docker-compose exec frontend npm test

.PHONY: clean
clean:
	docker-compose down -v
	docker system prune -f

# Production targets
.PHONY: build-prod
build-prod:
	@echo "Building production images..."
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml build --no-cache
	@echo "Production images built successfully"

.PHONY: up-prod
up-prod:
	@echo "Starting production stack..."
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml up -d
	@echo "Waiting for services to be ready..."
	@sleep 15
	@echo "Production stack started successfully"
	@echo "Access the application at:"
	@echo "  - Application: http://localhost (via nginx)"
	@echo "  - Admin:       http://localhost/admin"

.PHONY: down-prod
down-prod:
	@echo "Stopping production stack..."
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml down

.PHONY: logs-prod
logs-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml logs -f

.PHONY: backup-db
backup-db:
	@echo "Creating database backup..."
	@mkdir -p backups
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml exec -T db pg_dump -U postgres -d workload_tracker > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "Database backup created in backups/ directory"

.PHONY: restore-latest
restore-latest:
	@echo "Restoring latest backup into dev DB (PG17)..."
	@latest=$$(ls -t backups/*.(pgcustom|sql.gz) 2>/dev/null | head -n1); \
	if [ -z "$$latest" ]; then echo "No backup found in ./backups"; exit 1; fi; \
	confirm="I understand this will irreversibly overwrite data"; \
	docker-compose exec backend python manage.py restore_database --path /$$latest --jobs 2 --confirm "$$confirm" --migrate

.PHONY: reset-throttles
reset-throttles:
	@echo "Clearing DRF throttle keys from Redis (DB 1)..."
	@docker-compose exec redis sh -lc 'for k in $$(redis-cli -n 1 --scan --pattern "*throttle*" | sort -u); do redis-cli -n 1 DEL "$$k" >/dev/null; done; echo done'
