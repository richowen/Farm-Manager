# syntax=docker/dockerfile:1.7

# ---- Build stage ------------------------------------------------------------
FROM node:20-slim AS build

# Build tools for native addons (argon2, etc.).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (including dev) for the build.
# Using npm install rather than npm ci so the lock file generated on a
# different Node version (e.g. Node 25 locally vs Node 20 in Docker) doesn't
# cause a version-mismatch failure. The git tag already pins the source.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=5000 \
      --fetch-retry-maxtimeout=60000

# Copy sources and build
COPY . .
RUN npm run build

# Prune to production deps only for the runtime stage
RUN npm prune --omit=dev

# ---- Runtime stage ----------------------------------------------------------
FROM node:20-slim AS runtime

# tini for proper PID 1 signal handling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    UPLOAD_DIR=/data/uploads

WORKDIR /app

# Drop to a non-root user
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/build ./build
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/db ./db

# Create the uploads dir owned by the app user. VOLUME so that bind-mounting
# a host folder at run time just works; otherwise photos land on the layer
# and disappear on container recreate.
RUN mkdir -p /data/uploads && chown -R app:app /data
VOLUME ["/data/uploads"]

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build/index.js"]
