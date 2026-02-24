/**
 * Authentication Middleware — Bearer token validation for Host Agent.
 *
 * Validates incoming requests against a configured Bearer token.
 * Token is expected in the Authorization header: "Bearer <token>"
 */

import { Request, Response, NextFunction } from "express";

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Get the authentication token from the environment.
 * Returns null if not configured (disables authentication).
 */
export function getAuthToken(): string | null {
  return process.env.HOST_AGENT_TOKEN || null;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface LaunchRequestBody {
  ideType?: string;
  workspacePath?: string;
}

export interface AuthRequest extends Request {
  authenticated?: boolean;
  body: LaunchRequestBody;
}

export interface AuthError {
  message: string;
  code: string;
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Extract the Bearer token from the Authorization header.
 *
 * @param authHeader - The Authorization header value
 * @returns The token if valid, null if invalid or missing
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  // Expected format: "Bearer <token>"
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return null;
  }

  return match[1];
}

/**
 * Validate a Bearer token against the configured token.
 * If no token is configured, returns true (authentication disabled).
 *
 * @param providedToken - The token from the request
 * @returns true if valid, false otherwise
 */
export function validateToken(providedToken: string | null): boolean {
  const configuredToken = getAuthToken();

  // If no token is configured, authentication is disabled
  if (!configuredToken) {
    return true;
  }

  // If token is configured, provided token must match exactly
  if (!providedToken) {
    return false;
  }

  return providedToken === configuredToken;
}

// ── Middleware ─────────────────────────────────────────────────────────────

/**
 * Express middleware for Bearer token authentication.
 * Checks the Authorization header and validates the token.
 *
 * Sets req.authenticated to true/false based on validation.
 * Does NOT block the request; the handler can check req.authenticated.
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);
  const isValid = validateToken(token);

  req.authenticated = isValid;

  // Log authentication events in development
  if (process.env.NODE_ENV !== "production") {
    const status = isValid ? "✓ valid" : "✗ invalid";
    console.log(
      `[auth] Bearer token validation: ${status} (token present: ${!!token})`,
    );
  }

  next();
}

/**
 * Strict authentication middleware.
 * Returns 401 if the token is invalid.
 * Use this to protect sensitive endpoints.
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authenticated) {
    res.status(401).json({
      success: false,
      error: "Unauthorized: invalid or missing Bearer token",
    });
    return;
  }

  next();
}
