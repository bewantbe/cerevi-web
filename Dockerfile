# cerevi-web dev image.
#
# The workspace ROOT is the single install root: cerevi-web depends on
# `galavi` and `@galavi/ome-zarr-adapter` via `workspace:*`, so the build
# context MUST be the workspace root (galavi-project/), not this directory.
# Vite aliases both libraries to their `src/`, so no library build step is
# needed inside the image.
#
# UNVERIFIED: no Docker daemon was available when this file was written, so
# this build has never been executed. Intended build command, from the
# workspace root:
#
#   docker build -f cerevi-project/cerevi-web/Dockerfile -t cerevi-web:latest .
#
# cerevi-project/cerevi-manager/docker-compose.yml builds it with the same
# root context via `docker compose build web`.

FROM oven/bun:latest

WORKDIR /app

# Copy workspace manifests first, for dependency-layer caching.
COPY package.json bun.lock ./
COPY galavi/package.json galavi/package.json
COPY galavi-ome-zarr-adapter/package.json galavi-ome-zarr-adapter/package.json
COPY cerevi-project/cerevi-web/package.json cerevi-project/cerevi-web/package.json

# Install all workspace deps from the authoritative root lockfile.
RUN bun install --frozen-lockfile

# Copy the sources the web app needs.
COPY galavi/ galavi/
COPY galavi-ome-zarr-adapter/ galavi-ome-zarr-adapter/
COPY cerevi-project/cerevi-web/ cerevi-project/cerevi-web/

WORKDIR /app/cerevi-project/cerevi-web

# Expose the Vite dev server port
EXPOSE 5173

# Ensure Bun keeps watching files in mounted volume
ENV BUN_WATCHER_USE_POLLING=1
ENV HOST=0.0.0.0
ENV PORT=5173

# Default command: run Vite dev server with hot reload
CMD ["bun", "run", "dev", "--host"]
