# Changelog

All notable changes to Zeus will be documented in this file.

## [Unreleased]

### Fixed
- **Docker plugin installation**: Resolved critical issue where plugins could not be installed inside Docker containers. Fixed marketplace URL (anthropic → anthropics) and moved registration from unreliable build-time to stable runtime (entrypoint.sh).

---

## [0.1.0] - 2026-02-25

### Added
- Initial Zeus release: High-performance web-based terminal for Claude Code
- Unified Docker container bundling Zeus backend, frontend, Claude Code CLI, and code-server IDE
- Workspace management with real-time synchronization
- Socket.IO-based communication between frontend and backend
- Terminal tab support with PTY integration
- MCP server discovery and management
- Plugin marketplace integration
- Svelte 5 frontend with reactive stores
- E2E test suite with Playwright

### Features
- Claude session management with streaming support
- Terminal emulation with xterm.js and WebGL rendering
- Code-server IDE integration for in-browser editing
- Markdown and documentation rendering
- Responsive UI with sidebar and modal panels

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/).
