# Stage 1: Build Svelte frontend
FROM node:20-slim AS builder
WORKDIR /app

# Install build deps for node-gyp (node-pty in root deps)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production server image
FROM node:20-slim
WORKDIR /app

# Install runtime deps + curl for Claude installer
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code using official native script
RUN curl -fsSL https://claude.ai/install.sh | bash

# Update PATH for Claude binary (~/.local/bin)
ENV PATH="/root/.local/bin:/usr/local/bin:${PATH}"

# Copy server deps
COPY server/package*.json ./server/
RUN cd server && npm ci --production

# Copy server source + built frontend
COPY server/ ./server/
COPY --from=builder /app/dist/renderer ./dist/renderer

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
