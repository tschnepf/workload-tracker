##########
# Dev stage: full node environment for Vite dev server
##########
FROM node:20-alpine AS dev

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

##########
# Builder stage: install deps and build static assets
##########
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Prevent git hooks from running during CI/container installs
ENV HUSKY=0
RUN npm ci
COPY . .
# Allow passing Vite flags at build time
ARG VITE_API_URL
ARG VITE_OPENAPI_MIGRATION_ENABLED
ARG VITE_OPENAPI_PEOPLE
ARG VITE_OPENAPI_PROJECTS
ARG VITE_OPENAPI_DEPARTMENTS
ARG VITE_OPENAPI_DASHBOARD
ARG VITE_OPENAPI_ASSIGNMENTS
ARG VITE_OPENAPI_SKILLS
ARG VITE_OPENAPI_DELIVERABLES
ARG VITE_OPENAPI_DELIVERABLE_ASSIGNMENTS
ARG VITE_OPENAPI_AUTH
ENV VITE_API_URL=$VITE_API_URL \
    VITE_OPENAPI_MIGRATION_ENABLED=$VITE_OPENAPI_MIGRATION_ENABLED \
    VITE_OPENAPI_PEOPLE=$VITE_OPENAPI_PEOPLE \
    VITE_OPENAPI_PROJECTS=$VITE_OPENAPI_PROJECTS \
    VITE_OPENAPI_DEPARTMENTS=$VITE_OPENAPI_DEPARTMENTS \
    VITE_OPENAPI_DASHBOARD=$VITE_OPENAPI_DASHBOARD \
    VITE_OPENAPI_ASSIGNMENTS=$VITE_OPENAPI_ASSIGNMENTS \
    VITE_OPENAPI_SKILLS=$VITE_OPENAPI_SKILLS \
    VITE_OPENAPI_DELIVERABLES=$VITE_OPENAPI_DELIVERABLES \
    VITE_OPENAPI_DELIVERABLE_ASSIGNMENTS=$VITE_OPENAPI_DELIVERABLE_ASSIGNMENTS \
    VITE_OPENAPI_AUTH=$VITE_OPENAPI_AUTH
RUN npm run build

##########
# Production stage: minimal runtime to serve built assets (non-root)
##########
FROM node:20-alpine AS production
WORKDIR /app

# Copy built assets to a separate path baked into the image
COPY --from=builder /app/dist ./_built

# Ensure serve is available at runtime (already in deps, but keep lean)
RUN npm install --omit=dev serve@14.2.5

# Run as non-root user 'node'
USER node
EXPOSE 3000
# Serve prebuilt static assets directly from the read-only path
CMD ["npx", "serve", "-s", "/app/_built", "-l", "3000"]
