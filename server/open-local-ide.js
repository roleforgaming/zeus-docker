/**
 * Open Local IDE Service Layer — bridges Session management and Host Agent client.
 *
 * This service:
 * - Validates the session and extracts the bearer token
 * - Calls the Host Agent client to launch the IDE
 * - Returns a standardized success/error response
 *
 * Used by Socket.IO event handler for "open-local-ide" events.
 */

import { HostAgentClient } from "./host-agent-client.js";

// Configuration from environment or defaults
const HOST_AGENT_URL =
  process.env.HOST_AGENT_URL || "http://host.docker.internal:3001";

/**
 * Open a local IDE with the specified workspace path.
 *
 * This service handles:
 * 1. Session validation (checking for valid sessionId/bearerToken)
 * 2. Creating a Host Agent client with the session's bearer token
 * 3. Calling the Host Agent's launch endpoint
 * 4. Returning a standardized response
 *
 * @param {Object} session - Session object containing sessionId and bearerToken
 * @param {string} ideType - IDE type identifier (e.g., "code", "cursor")
 * @param {string} workspacePath - Absolute path to the workspace directory
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
export async function openLocalIDE(session, ideType, workspacePath) {
  // Validate session
  if (!session) {
    return {
      success: false,
      message: "Session is required",
      error: "INVALID_SESSION",
    };
  }

  if (!session.bearerToken || typeof session.bearerToken !== "string") {
    return {
      success: false,
      message: "Session does not contain a valid bearerToken",
      error: "MISSING_BEARER_TOKEN",
    };
  }

  if (!session.sessionId || typeof session.sessionId !== "string") {
    return {
      success: false,
      message: "Session does not contain a valid sessionId",
      error: "MISSING_SESSION_ID",
    };
  }

  // Validate inputs
  if (!ideType || typeof ideType !== "string") {
    return {
      success: false,
      message: "ideType is required and must be a string",
      error: "INVALID_IDE_TYPE",
    };
  }

  if (!workspacePath || typeof workspacePath !== "string") {
    return {
      success: false,
      message: "workspacePath is required and must be a string",
      error: "INVALID_WORKSPACE_PATH",
    };
  }

  try {
    // Create Host Agent client with session's bearer token
    const client = new HostAgentClient(HOST_AGENT_URL, session.bearerToken);

    // Call Host Agent to launch IDE
    const result = await client.launch(ideType, workspacePath);

    // Return result directly from client
    return result;
  } catch (err) {
    // Catch initialization or unexpected errors
    return {
      success: false,
      message: `Service error: ${err.message}`,
      error: "SERVICE_ERROR",
    };
  }
}

export default openLocalIDE;
