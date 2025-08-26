# R2-REBUILD-000-DOCKER-FIRST: Container Setup Before Code

## AI Agent Prompt

**CRITICAL: Complete this BEFORE starting R2-REBUILD-001-FOUNDATION**

You are tasked with setting up a Docker-based development environment for a Django/React workload tracker application. This setup MUST be completed before writing any application code to ensure all development happens inside containers from day one.

## Phase 0: Docker Environment (Day 0 - 2 hours)

### Step 1: Create Project Structure
```bash
# AI Agent: Execute these commands to create the project structure

mkdir -p workload-tracker
cd workload-tracker

# Create all directories first
mkdir -p backend
mkdir -p frontend
mkdir -p docker/backend
mkdir -p docker/frontend
mkdir -p docker/postgres
mkdir -p docker/nginx

# Create initial backend structure
mkdir -p backend/config
mkdir -p backend/apps
mkdir -p backend/fixtures
mkdir -p backend/static
mkdir -p backend/media

# Create initial frontend structure  
mkdir -p frontend/src
mkdir -p frontend/public
```

### Step 2: Create Environment Configuration
```bash
# AI Agent: Create .env.example file with the following content
cat > .env.example << 'EOF'
# === Application Settings ===
APP_NAME=workload-tracker
DEBUG=true
SECRET_KEY=dev-secret-key-change-in-production
ALLOWED_HOSTS=localhost,127.0.0.1,backend,frontend

# === Database Settings ===
POSTGRES_DB=workload_tracker
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@db:5432/workload_tracker

# === Port Configuration ===
BACKEND_PORT=8000
FRONTEND_PORT=3000

# === API Settings ===
API_BASE_URL=http://localhost:8000/api
VITE_API_URL=http://localhost:8000/api

# === Default Admin (Dev Only) ===
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@example.com
DJANGO_SUPERUSER_PASSWORD=admin123

# === Docker Settings ===
COMPOSE_PROJECT_NAME=workload-tracker
DOCKER_BUILDKIT=1
EOF

# Copy to .env for local use
cp .env.example .env
echo ".env" >> .gitignore
```

### Step 3: Create Docker Compose Configuration
```yaml
# AI Agent: Create docker-compose.yml with the following content
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: workload-db
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - tracker-net

  backend:
    build:
      context: ./backend
      dockerfile: ../docker/backend/Dockerfile.dev
    container_name: workload-backend
    volumes:
      - ./backend:/app
      - static_volume:/app/static
    ports:
      - "${BACKEND_PORT}:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    networks:
      - tracker-net
    command: |
      sh -c "
      pip install -r requirements.txt &&
      python manage.py migrate &&
      python manage.py runserver 0.0.0.0:8000
      "

  frontend:
    build:
      context: ./frontend
      dockerfile: ../docker/frontend/Dockerfile.dev
    container_name: workload-frontend
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "${FRONTEND_PORT}:3000"
    environment:
      - VITE_API_URL=${VITE_API_URL}
    networks:
      - tracker-net
    command: npm run dev -- --host 0.0.0.0

volumes:
  postgres_data:
  static_volume:

networks:
  tracker-net:
    driver: bridge
EOF
```

### Step 4: Create Development Dockerfiles
```dockerfile
# AI Agent: Create docker/backend/Dockerfile.dev
cat > docker/backend/Dockerfile.dev << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages (will be overridden by volume mount)
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt || true

# Create entrypoint script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Waiting for database..."\n\
while ! nc -z db 5432; do sleep 1; done\n\
echo "Database ready!"\n\
exec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
EOF
```

```dockerfile
# AI Agent: Create docker/frontend/Dockerfile.dev
cat > docker/frontend/Dockerfile.dev << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Install dependencies (will be overridden by volume)
COPY package*.json /tmp/
RUN cd /tmp && npm ci || true

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
EOF
```

### Step 5: Create Makefile for Easy Commands
```makefile
# AI Agent: Create Makefile with common commands
cat > Makefile << 'EOF'
.PHONY: help
help:
	@echo "Docker Environment Commands:"
	@echo "  make docker-setup   - Initial Docker setup (run this first!)"
	@echo "  make up            - Start containers"
	@echo "  make down          - Stop containers"
	@echo "  make logs          - View all logs"
	@echo "  make shell-backend - Enter backend container"
	@echo "  make shell-db      - Enter database"
	@echo "  make clean         - Remove everything and start fresh"
	@echo ""
	@echo "After Docker setup, continue with development:"
	@echo "  make django-init   - Initialize Django project"
	@echo "  make react-init    - Initialize React project"

.PHONY: docker-setup
docker-setup:
	@echo "🐳 Setting up Docker environment..."
	@cp -n .env.example .env || true
	@docker-compose build --no-cache
	@docker-compose up -d db
	@sleep 5
	@echo "✅ Docker environment ready!"
	@echo ""
	@echo "Next steps:"
	@echo "1. Run 'make django-init' to create Django project"
	@echo "2. Run 'make react-init' to create React project"
	@echo "3. Then follow R2-REBUILD-001-FOUNDATION.md"

.PHONY: up
up:
	docker-compose up -d

.PHONY: down
down:
	docker-compose down

.PHONY: logs
logs:
	docker-compose logs -f

.PHONY: shell-backend
shell-backend:
	docker-compose exec backend /bin/bash

.PHONY: shell-db
shell-db:
	docker-compose exec db psql -U postgres -d workload_tracker

.PHONY: clean
clean:
	docker-compose down -v
	docker system prune -f
	rm -rf backend/* frontend/* 

# Django initialization (run after docker-setup)
.PHONY: django-init
django-init:
	@echo "🎯 Initializing Django project in container..."
	@docker-compose run --rm backend django-admin startproject config .
	@echo "✅ Django project created!"
	@echo "Now run 'make up' to start development"

# React initialization (run after docker-setup)  
.PHONY: react-init
react-init:
	@echo "⚛️ Initializing React project in container..."
	@docker-compose run --rm frontend npm create vite@latest . -- --template react-ts
	@docker-compose run --rm frontend npm install
	@echo "✅ React project created!"
	@echo "Now run 'make up' to start development"
EOF
```

### Step 6: Create Initial Requirements Files
```txt
# AI Agent: Create backend/requirements.txt
cat > backend/requirements.txt << 'EOF'
# Core
Django==5.0.1
djangorestframework==3.14.0
django-cors-headers==4.3.1
djangorestframework-simplejwt==5.3.1

# Database
psycopg2-binary==2.9.9
dj-database-url==2.1.0

# Development
python-decouple==3.8

# Production (add later)
# gunicorn==21.2.0
# whitenoise==6.6.0
EOF
```

```json
# AI Agent: Create frontend/package.json
cat > frontend/package.json << 'EOF'
{
  "name": "workload-tracker-frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
EOF
```

### Step 7: Verify Docker Setup
```bash
# AI Agent: Run these commands to verify setup
echo "🧪 Verifying Docker setup..."

# Check Docker is installed
docker --version || echo "❌ Docker not installed"
docker-compose --version || echo "❌ Docker Compose not installed"

# Test environment file
if [ -f .env ]; then
    echo "✅ Environment file exists"
else
    echo "❌ Environment file missing - run: cp .env.example .env"
fi

# Test Docker build
docker-compose build || echo "❌ Docker build failed"

# Test database startup
docker-compose up -d db
sleep 5
docker-compose exec db psql -U postgres -c "SELECT 1" && echo "✅ Database working"

echo "✅ Docker verification complete!"
```

### Step 8: Create Development Instructions
```markdown
# AI Agent: Create DEVELOPMENT.md
cat > DEVELOPMENT.md << 'EOF'
# Development Setup

## Prerequisites
- Docker Desktop installed and running
- Git installed
- Code editor (VS Code recommended)

## Quick Start

1. **Setup Docker Environment** (one time only)
   ```bash
   make docker-setup
   ```

2. **Initialize Projects** (one time only)
   ```bash
   make django-init
   make react-init
   ```

3. **Start Development**
   ```bash
   make up
   ```

4. **Access Applications**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8000
   - Admin: http://localhost:8000/admin (admin/admin123)

## Daily Workflow

```bash
# Start your day
make up

# View logs
make logs

# Stop for the day
make down
```

## Troubleshooting

If containers won't start:
```bash
make clean
make docker-setup
```

## Important Notes

- **ALWAYS** develop inside Docker containers
- **NEVER** install Python/Node packages locally
- **USE** the Makefile commands instead of docker-compose directly
EOF
```

## Verification Checklist for AI Agent

After completing all steps above, verify:

- [ ] Directory structure created
- [ ] .env file exists with correct values
- [ ] docker-compose.yml created
- [ ] Dockerfiles created in docker/ directory
- [ ] Makefile created with all commands
- [ ] requirements.txt and package.json created
- [ ] Can run `make docker-setup` successfully
- [ ] Database container starts and accepts connections
- [ ] DEVELOPMENT.md created for future reference

## Success Criteria

The AI agent has successfully completed Phase 0 when:

1. `docker-compose ps` shows database running
2. `make shell-db` can connect to PostgreSQL
3. Directory structure is ready for Django/React code
4. All configuration files are in place

## Next Steps

After Phase 0 is complete:
1. Continue to **R2-REBUILD-001-FOUNDATION.md**
2. Use `make django-init` when ready to create Django project
3. Use `make react-init` when ready to create React project
4. All subsequent development happens inside containers

## Key Points for AI Agent

**IMPORTANT**: This phase must be 100% complete before writing any application code. The goal is to ensure that from the very first line of Django/React code, everything runs inside Docker containers with proper networking, environment variables, and database connectivity.

**Time Required**: 2 hours maximum
**Output**: Working Docker environment ready for application development
**Human Verification**: Run `make docker-setup` and see "✅ Docker environment ready!"