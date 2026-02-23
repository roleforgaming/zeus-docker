# Zeus Host Agent

Host Agent for Zeus IDE Integration — an Express server running on the host machine to manage IDE launches outside of Docker.

## Overview

The Host Agent is a separate service that:
- Runs on the host machine (not in Docker)
- Receives IDE launch requests from the Zeus Docker container via HTTP
- Resolves IDE commands for the host OS (Windows, macOS, Linux)
- Authenticates requests using Bearer tokens
- Manages workspace path resolution with explicit override support

## Architecture

- **Port**: 3001 (configurable via `HOST_AGENT_PORT` environment variable)
- **Authentication**: Bearer token validation via `HOST_AGENT_TOKEN` environment variable
- **IDE Resolution**: OS-aware command resolution with support for .cmd files on Windows
- **Workspace Paths**: `ZEUS_HOST_PROJECT_ROOT` + workspace name configuration

## API Endpoints

### POST /launch

Launch an IDE on the host machine.

**Request Body:**
```json
{
  "ideType": "code",
  "workspacePath": "/path/to/workspace",
  "token": "bearer-token-here"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "IDE launched successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Description of error"
}
```

## Environment Variables

- `HOST_AGENT_PORT`: Port to listen on (default: 3001)
- `HOST_AGENT_TOKEN`: Bearer token for authentication
- `ZEUS_HOST_PROJECT_ROOT`: Base path for workspace resolution
- `ZEUS_DEFAULT_IDE_COMMAND`: Default IDE command (default: `code`)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test
npm run test:watch
```

## Production

```bash
npm run build
npm start
```
