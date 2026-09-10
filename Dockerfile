# cerevi-web dev image.
#
# Server layout: cerevi-manager/, cerevi-web/, and galavi/ are sibling
# directories, and cerevi-web depends on galavi via `file:../galavi`.
# The build context MUST be the parent directory containing both cerevi-web/
# and galavi/:
#
#   docker build -f cerevi-web/Dockerfile -t cerevi-web:latest .
#
# cerevi-manager/docker-compose.yml builds it with the same parent context
# via `docker compose build web`.
#
# Vite aliases the library to its `src/`, so no galavi build step is needed
# inside the image. Because `file:` dependencies are linked (their own
# dependencies are NOT installed automatically), galavi's dependencies are
# installed separately below.

FROM oven/bun:latest

WORKDIR /app

# Copy manifests first, for dependency-layer caching.
COPY galavi/package.json galavi/package.json
COPY cerevi-web/package.json cerevi-web/package.json

# Install galavi's deps (zarrita, wgpu-matrix) and cerevi-web's deps.
RUN cd galavi && bun install && cd ../cerevi-web && bun install

# Copy the sources the web app needs.
COPY galavi/ galavi/
COPY cerevi-web/ cerevi-web/

WORKDIR /app/cerevi-web

# Expose the Vite dev server port
EXPOSE 5173

# Ensure Bun keeps watching files in mounted volume
ENV BUN_WATCHER_USE_POLLING=1
ENV HOST=0.0.0.0
ENV PORT=5173

# Default command: run Vite dev server with hot reload
CMD ["bun", "run", "dev", "--host"]
