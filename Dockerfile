# syntax=docker/dockerfile:1.7

# ---- Build stage ------------------------------------------------------------
FROM node:20-alpine AS build

# argon2 needs a C toolchain to compile its native addon
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Install deps (including dev) for the build
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy sources and build
COPY . .
RUN npm run build

# Prune to production deps only for the runtime stage
RUN npm prune --omit=dev

# ---- Runtime stage ----------------------------------------------------------
FROM node:20-alpine AS runtime

# argon2's prebuilt binaries need libc compatibility on alpine
RUN apk add --no-cache libc6-compat tini curl

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# Drop to a non-root user
RUN addgroup -S app && adduser -S -G app app
COPY --from=build --chown=app:app /app/build ./build
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/db ./db

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build/index.js"]
