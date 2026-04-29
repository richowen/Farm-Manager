# syntax=docker/dockerfile:1.7

# ---- Build stage ------------------------------------------------------------
FROM node:20-alpine AS build

# argon2 needs a C toolchain to compile its native addon; sharp ships prebuilt
# binaries for both linux/amd64 musl and linux/arm64 musl so we don't need
# libvips-dev here.
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Install deps (including dev) for the build.
# Using npm install rather than npm ci so the lock file generated on a
# different Node version (e.g. Node 25 locally vs Node 20 in Docker) doesn't
# cause a version-mismatch failure. The git tag already pins the source.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy sources and build
COPY . .
RUN npm run build

# Prune to production deps only for the runtime stage
RUN npm prune --omit=dev

# ---- Runtime stage ----------------------------------------------------------
FROM node:20-alpine AS runtime

# argon2's prebuilt binaries need libc compatibility on alpine.
# `vips` is the runtime counterpart that sharp's prebuilt binary dlopen()s —
# including it ensures photo processing works on arm64-musl.
RUN apk add --no-cache libc6-compat tini curl vips

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    UPLOAD_DIR=/data/uploads

WORKDIR /app

# Drop to a non-root user
RUN addgroup -S app && adduser -S -G app app
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
