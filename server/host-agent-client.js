/**
 * Host Agent Client — HTTP client utility for communicating with the Host Agent.
 *
 * The Host Agent runs on the host machine (reachable via http://host.docker.internal:3001)
 * and provides an endpoint to launch IDEs with workspace paths.
 *
 * This client handles:
 * - HTTP POST requests to the /launch endpoint
 * - Bearer token authentication
 * - Error handling for network issues, auth failures, invalid IDE types
 */

/**
 * HostAgentClient — HTTP client for Host Agent IDE launch requests.
 *
 * @param {string} hostAgentUrl - Base URL of the Host Agent (e.g., "http://host.docker.internal:3001")
 * @param {string} bearerToken - Bearer token for authentication
 */
export class HostAgentClient {
  /**
   * @param {string} hostAgentUrl
   * @param {string} bearerToken
   */
  constructor(hostAgentUrl, bearerToken) {
    this.hostAgentUrl = hostAgentUrl;
    this.bearerToken = bearerToken;

    // Validate initialization
    if (!hostAgentUrl || typeof hostAgentUrl !== "string") {
      throw new Error("hostAgentUrl must be a non-empty string");
    }
    if (!bearerToken || typeof bearerToken !== "string") {
      throw new Error("bearerToken must be a non-empty string");
    }
  }

  /**
   * Launch an IDE with the specified workspace path.
   *
   * Sends a POST request to the Host Agent's /launch endpoint with:
   * - ideType: the type of IDE to launch (e.g., "code", "cursor", "windsurf")
   * - workspacePath: absolute path to the workspace directory
   *
   * @param {string} ideType - IDE type identifier (e.g., "code", "cursor")
   * @param {string} workspacePath - Absolute path to the workspace directory
   * @returns {Promise<{success: boolean, message: string, error?: string}>}
   */
  async launch(ideType, workspacePath) {
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

    const launchUrl = `${this.hostAgentUrl}/launch`;
    const payload = {
      ideType,
      workspacePath,
    };

    try {
      const response = await fetch(launchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify(payload),
      });

      // Handle authentication failures
      if (response.status === 401) {
        return {
          success: false,
          message: "Authentication failed: invalid or expired bearer token",
          error: "AUTH_FAILED",
        };
      }

      // Handle not found (invalid endpoint)
      if (response.status === 404) {
        return {
          success: false,
          message:
            "Host Agent endpoint not found. Verify Host Agent is running.",
          error: "ENDPOINT_NOT_FOUND",
        };
      }

      // Handle server errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          message:
            errorData.message ||
            `Host Agent returned status ${response.status}`,
          error: errorData.error || "HOST_AGENT_ERROR",
        };
      }

      // Parse successful response
      const data = await response.json();
      return {
        success: true,
        message: data.message || "IDE launched successfully",
      };
    } catch (networkError) {
      // Handle network-level errors (connection refused, timeout, DNS failure, etc.)
      if (networkError instanceof TypeError) {
        // Includes fetch network errors
        return {
          success: false,
          message: `Network error: ${networkError.message}. Verify Host Agent is running at ${this.hostAgentUrl}`,
          error: "NETWORK_ERROR",
        };
      }

      // Catch-all for unexpected errors
      return {
        success: false,
        message: `Unexpected error: ${networkError.message}`,
        error: "UNKNOWN_ERROR",
      };
    }
  }
}

export default HostAgentClient;
