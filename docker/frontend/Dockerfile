##########
# Dev stage: full node environment for Vite dev server
##########
FROM node:18-alpine AS dev

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

##########
# Builder stage: install deps and build static assets
##########
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

##########
# Production stage: minimal runtime to serve built assets (non-root)
##########
FROM node:18-alpine AS production
WORKDIR /app

# Copy built assets to a separate path baked into the image
COPY --from=builder /app/dist ./_built

# Ensure serve is available at runtime (already in deps, but keep lean)
RUN npm install --omit=dev serve@14.2.5

# Run as non-root user 'node'
USER node
EXPOSE 3000
CMD ["sh", "-lc", "cp -r /app/_built/* /app/dist/ 2>/dev/null || true; npx serve -s /app/dist -l 3000"]
