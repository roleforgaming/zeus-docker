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

# Stage 2: Production server image based on code-server
FROM codercom/code-server:latest
WORKDIR /home/coder/zeus

# Switch to root for installation
USER root

# Install Node.js 20 and additional build tools
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Add NodeSource repository and install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Create workspaces directory
RUN mkdir -p /home/coder/workspaces && \
    chown -R coder:coder /home/coder/workspaces

# Install Claude Code using official native script
RUN curl -fsSL https://claude.ai/install.sh | bash

# Copy server package files and install dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --production

# Copy server source code
COPY server/ ./server/

# Copy built frontend from builder stage
# Mirrors dev layout: dist/ is a sibling of server/, so ../dist/renderer resolves correctly
COPY --from=builder /app/dist/renderer ./dist/renderer

# Copy entrypoint script if it exists
COPY entrypoint.sh /entrypoint.sh

# Fix ownership and permissions for coder user
RUN chown -R coder:coder /home/coder/zeus /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Switch to coder user (non-root)
USER coder

# Set environment variables
ENV PORT=3000 \
    NODE_ENV=production \
    PATH="/home/coder/.local/bin:${PATH}"

# Expose both Zeus backend (3000) and code-server (8080)
EXPOSE 3000 8080

# Run the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
