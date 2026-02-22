/**
 * Centralized workspace path configuration and helpers.
 *
 * Path structure across containers:
 * - Host machine: ${HOME}/workspaces (or ${HOST_WORKSPACES_PATH})
 * - Zeus container: /workspace (bind-mounted from host)
 * - Code-Server container: /home/coder/workspaces (bind-mounted from host)
 */

import path from 'node:path'

export const ZEUS_WORKSPACES_ROOT = '/workspace'
export const CODESERVER_WORKSPACES_ROOT = '/home/coder/workspaces'

export function getZeusWorkspacePath(projectName) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('projectName must be a non-empty string')
  }
  return path.join(ZEUS_WORKSPACES_ROOT, projectName)
}

export function getCodeServerWorkspacePath(projectName) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('projectName must be a non-empty string')
  }
  return path.posix.join(CODESERVER_WORKSPACES_ROOT, projectName)
}

export function zeusPathToCodeServerPath(zeusPath) {
  if (!zeusPath || typeof zeusPath !== 'string') {
    throw new Error('zeusPath must be a non-empty string')
  }

  const normalizedPath = path.posix.normalize(zeusPath)

  if (normalizedPath.startsWith(ZEUS_WORKSPACES_ROOT)) {
    const relativePath = path.posix.relative(ZEUS_WORKSPACES_ROOT, normalizedPath)
    return path.posix.join(CODESERVER_WORKSPACES_ROOT, relativePath)
  }

  const basename = path.basename(normalizedPath)
  return path.posix.join(CODESERVER_WORKSPACES_ROOT, basename)
}

export function getProjectName(workspacePath) {
  if (!workspacePath || typeof workspacePath !== 'string') {
    throw new Error('workspacePath must be a non-empty string')
  }
  return path.basename(workspacePath)
}

export function debugPaths(projectName) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('projectName must be a non-empty string')
  }
  return {
    projectName,
    zeusRoot: ZEUS_WORKSPACES_ROOT,
    zeusPath: getZeusWorkspacePath(projectName),
    codeServerRoot: CODESERVER_WORKSPACES_ROOT,
    codeServerPath: getCodeServerWorkspacePath(projectName),
  }
}
