/**
 * Terminal factory — spawns PTY processes for terminal sessions.
 */

/**
 * Spawn a new PTY terminal process
 * @param {*} ptyModule - node-pty module
 * @param {string} workspacePath - working directory for the terminal
 * @returns {Object} { cwd, ptyProcess }
 */
export function spawnTerminal(ptyModule, workspacePath) {
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
  const ptyProcess = ptyModule.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: workspacePath
  })
  return { cwd: workspacePath, ptyProcess }
}
