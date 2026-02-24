/**
 * Host Agent Express Server.
 * Handles IDE launch requests from the Zeus Docker container.
 */

import express, { Request, Response } from "express";
import { launchIDE } from "./ide-launcher.js";
import { authMiddleware, requireAuth, AuthRequest } from "./auth.js";

// ── Types ──────────────────────────────────────────────────────────────────

interface LaunchRequest {
  ideType: string;
  workspacePath: string;
}

interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.HOST_AGENT_PORT || "3001", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

// ── Setup ──────────────────────────────────────────────────────────────────

const app = express();

// Middleware
app.use(express.json());
app.use(authMiddleware);

// ── Health Check ───────────────────────────────────────────────────────────

/**
 * GET /health
 * Check if the Host Agent is running.
 */
app.get("/health", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ── IDE Launch Endpoint ────────────────────────────────────────────────────

/**
 * POST /launch
 * Launch an IDE on the host machine.
 *
 * Request body:
 * {
 *   "ideType": "code" | "cursor" | "windsurf" | ...,
 *   "workspacePath": "/absolute/path/to/workspace"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { "message": "IDE launched successfully" }
 * }
 *
 * or
 *
 * {
 *   "success": false,
 *   "error": "Error description"
 * }
 */
app.post("/launch", requireAuth, (req: AuthRequest, res: Response) => {
  const body = req.body as Partial<LaunchRequest>;

  // Validate request body
  if (!body.ideType) {
    res.status(400).json({
      success: false,
      error: "Missing required field: ideType",
    } as APIResponse);
    return;
  }

  if (!body.workspacePath) {
    res.status(400).json({
      success: false,
      error: "Missing required field: workspacePath",
    } as APIResponse);
    return;
  }

  // Log incoming request
  console.log("[host-agent] /launch request:", {
    ideType: body.ideType,
    workspacePath: body.workspacePath,
  });

  // Launch the IDE
  const result = launchIDE({
    ideType: body.ideType,
    workspacePath: body.workspacePath,
  });

  if (result.success) {
    res.json({
      success: true,
      data: { message: "IDE launched successfully" },
    } as APIResponse);
  } else {
    res.status(500).json({
      success: false,
      error: result.error,
    } as APIResponse);
  }
});

// ── Error Handling ────────────────────────────────────────────────────────

/**
 * 404 handler for unknown routes.
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Not found: ${req.method} ${req.path}`,
  } as APIResponse);
});

/**
 * Global error handler.
 */
app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: Error, req: Request, res: Response, _next: express.NextFunction) => {
    console.error("[server] Unhandled error:", err);

    res.status(500).json({
      success: false,
      error: "Internal server error",
    } as APIResponse);
  },
);

// ── Server Startup ────────────────────────────────────────────────────────

/**
 * Start the HTTP server.
 */
export function startServer(): void {
  app.listen(PORT, () => {
    console.log(
      `[host-agent] Server running on http://localhost:${PORT} (NODE_ENV=${NODE_ENV})`,
    );
    if (process.env.HOST_AGENT_TOKEN) {
      console.log("[host-agent] Authentication: enabled");
    } else {
      console.log(
        "[host-agent] Authentication: disabled (set HOST_AGENT_TOKEN to enable)",
      );
    }
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

// Enforce token in production
if (NODE_ENV === "production" && !process.env.HOST_AGENT_TOKEN) {
  throw new Error("[host-agent] HOST_AGENT_TOKEN must be set in production");
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

// Export for testing
export { app };
