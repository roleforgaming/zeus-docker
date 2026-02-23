/**
 * IDE Service - Handles opening IDEs via Host Agent
 *
 * This service provides a Socket.IO client interface for opening IDEs on the host machine.
 * It communicates with the Host Agent running in the Zeus backend, which bridges IDE
 * launch requests to the local system.
 */

import type { Socket } from 'socket.io-client';

export interface OpenIDERequest {
  ideType: string;
  workspacePath: string;
}

export interface OpenIDEResponse {
  success: boolean;
  message?: string;
  error?: string;
  pid?: number;
  url?: string;
}

export interface IDEService {
  openLocalIDE(ideType: string, workspacePath: string): Promise<OpenIDEResponse>;
}

/**
 * Create an IDE service instance that communicates via Socket.IO
 *
 * @param socket - The Socket.IO client instance to use for communication
 * @returns An IDEService instance
 */
export function createIDEService(socket: Socket): IDEService {
  return {
    /**
     * Open an IDE in the local system (Host Agent feature)
     *
     * Emits the 'open-local-ide' Socket.IO event with the IDE type and workspace path,
     * waits for the 'open-local-ide-response' event with the result.
     *
     * @param ideType - The IDE identifier (e.g., 'vscode', 'cursor', 'windsurf')
     * @param workspacePath - Absolute path to the workspace to open
     * @returns Promise that resolves with the response from Host Agent
     * @throws If Socket.IO communication fails
     */
    openLocalIDE(ideType: string, workspacePath: string): Promise<OpenIDEResponse> {
      return new Promise((resolve, reject) => {
        // Set up a timeout to prevent hanging if no response is received
        const timeout = setTimeout(() => {
          socket.off(`open-local-ide-response-${ideType}`);
          reject(new Error(`Timeout waiting for IDE response (${ideType})`));
        }, 30000); // 30 second timeout

        // Listen for the response event (unique per IDE type to avoid conflicts)
        socket.once(`open-local-ide-response-${ideType}`, (response: OpenIDEResponse) => {
          clearTimeout(timeout);
          resolve(response);
        });

        // Emit the request to the Host Agent
        socket.emit('open-local-ide', {
          ideType,
          workspacePath,
        } as OpenIDERequest);
      });
    },
  };
}
