/**
 * Centralized workspace path configuration and helpers.
 *
 * Unified container structure:
 * - Single container with Zeus server + Code-Server
 * - Workspace root: /home/coder/workspaces
 * - All components use the same path resolution
 */

import path from 'node:path'

export const WORKSPACES_ROOT = '/home/coder/workspaces'

/**
 * Get the absolute path to a workspace directory.
 *
 * @param {string} projectName
 * @returns {string} Absolute workspace path
 */
export function getWorkspacePath(projectName) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('projectName must be a non-empty string')
  }
  return path.join(WORKSPACES_ROOT, projectName)
}

/**
 * Extract project name from a workspace path.
 *
 * @param {string} workspacePath
 * @returns {string} Project name (basename of path)
 */
export function getProjectName(workspacePath) {
  if (!workspacePath || typeof workspacePath !== 'string') {
    throw new Error('workspacePath must be a non-empty string')
  }
  return path.basename(workspacePath)
}

/**
 * Debug helper: show workspace path resolution.
 *
 * @param {string} projectName
 * @returns {object} Path information for debugging
 */
export function debugPaths(projectName) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('projectName must be a non-empty string')
  }
  return {
    projectName,
    workspacesRoot: WORKSPACES_ROOT,
    workspacePath: getWorkspacePath(projectName),
  }
}
