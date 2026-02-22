#!/bin/bash
set -e

echo "[zeus-entrypoint] Starting unified Zeus + code-server container..."

# Ensure workspace directory exists
mkdir -p /home/coder/workspaces

# Start Zeus in background
echo "[zeus-entrypoint] Starting Zeus server on port 3000..."
node /home/coder/zeus/server/index.js &
ZEUS_PID=$!
echo "[zeus-entrypoint] Zeus PID: $ZEUS_PID"

# Start code-server in background
echo "[zeus-entrypoint] Starting code-server on port 8080..."
code-server --bind-addr 0.0.0.0:8080 /home/coder/workspaces &
CODESERVER_PID=$!
echo "[zeus-entrypoint] code-server PID: $CODESERVER_PID"

# Trap signals and forward to children
trap "kill $ZEUS_PID $CODESERVER_PID 2>/dev/null || true" SIGTERM SIGINT

# Wait for both processes
echo "[zeus-entrypoint] Container ready. Waiting for services..."
wait

echo "[zeus-entrypoint] Services stopped."
exit $?
