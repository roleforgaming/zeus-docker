/**
 * Open Local IDE Service Layer — handles IDE launching via Host Agent or direct URL generation.
 *
 * This service:
 * - For code-server: Generates a URL to access the browser IDE running in the container
 * - For other IDEs: Delegates to Host Agent for local IDE launching
 * - Validates inputs and returns standardized success/error response
 *
 * Used by Socket.IO event handler for "open-local-ide" events.
 */

import { HostAgentClient } from "./host-agent-client.js";

// Configuration from environment or defaults
const HOST_AGENT_URL =
  process.env.HOST_AGENT_URL || "http://host.docker.internal:3001";
const CODE_SERVER_URL = process.env.CODE_SERVER_URL || "http://localhost:8081";

/**
 * Open a local IDE with the specified workspace path.
 *
 * This service handles:
 * 1. Input validation
 * 2. Special handling for code-server (browser IDE in container)
 * 3. Delegation to Host Agent for other IDEs
 * 4. Returns standardized response with URL for browser IDEs
 *
 * @param {Object} session - Session object containing sessionId and bearerToken
 * @param {string} ideType - IDE type identifier (e.g., "code", "cursor", "codeserver")
 * @param {string} workspacePath - Absolute path to the workspace directory
 * @returns {Promise<{success: boolean, message: string, error?: string, url?: string}>}
 */
export async function openLocalIDE(session, ideType, workspacePath) {
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

  // Special handling: code-server is the browser IDE running in the container
  if (ideType === "codeserver") {
    try {
      const url = `${CODE_SERVER_URL}/?folder=${encodeURIComponent(workspacePath)}`;
      return {
        success: true,
        message: "code-server URL generated",
        url,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to generate code-server URL: ${err.message}`,
        error: "URL_GENERATION_ERROR",
      };
    }
  }

  // For other IDEs, validate session and delegate to Host Agent
  if (!session) {
    return {
      success: false,
      message: "Session is required for launching desktop IDEs",
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
