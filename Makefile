.PHONY: help
help:
	@echo "Available commands:"
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
	@echo "  make test           - Run tests"
	@echo "  make clean          - Clean up containers and volumes"

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

.PHONY: test
test:
	docker-compose exec backend python manage.py test
	docker-compose exec frontend npm test

.PHONY: clean
clean:
	docker-compose down -v
	docker system prune -f

