# ----------------------------
# Stage 1: Development image
# ----------------------------
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy dependency files first (for caching)
COPY package.json bun.lock ./

# Install dependencies (no cache bust unless package.json changes)
RUN bun install

# Copy the rest of the source code
COPY . .

# Expose the Vite dev server port
EXPOSE 5173

# Ensure Bun keeps watching files in mounted volume
ENV BUN_WATCHER_USE_POLLING=1
ENV HOST=0.0.0.0
ENV PORT=5173

# Default command: run Vite dev server with hot reload
CMD ["bun", "run", "dev", "--host"]
