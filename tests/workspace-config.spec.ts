import { test, expect } from '@playwright/test'
import {
  ZEUS_WORKSPACES_ROOT,
  CODESERVER_WORKSPACES_ROOT,
  getZeusWorkspacePath,
  getCodeServerWorkspacePath,
  zeusPathToCodeServerPath,
  getProjectName,
  debugPaths,
} from '../server/workspace-config.js'

test('exports correct constants', () => {
  expect(ZEUS_WORKSPACES_ROOT).toBe('/workspace')
  expect(CODESERVER_WORKSPACES_ROOT).toBe('/home/coder/workspaces')
})

test('getZeusWorkspacePath constructs correct path', () => {
  expect(getZeusWorkspacePath('my-project')).toBe('/workspace/my-project')
})

test('getCodeServerWorkspacePath constructs correct path', () => {
  expect(getCodeServerWorkspacePath('my-project')).toBe('/home/coder/workspaces/my-project')
})

test('zeusPathToCodeServerPath converts correctly', () => {
  expect(zeusPathToCodeServerPath('/workspace/my-project')).toBe('/home/coder/workspaces/my-project')
  expect(zeusPathToCodeServerPath('/workspace/my-project/nested')).toBe('/home/coder/workspaces/my-project/nested')
})

test('getProjectName extracts basename', () => {
  expect(getProjectName('/workspace/my-project')).toBe('my-project')
  expect(getProjectName('/home/coder/workspaces/other-project')).toBe('other-project')
})

test('debugPaths returns all variants', () => {
  const result = debugPaths('test-proj')
  expect(result.projectName).toBe('test-proj')
  expect(result.zeusRoot).toBe('/workspace')
  expect(result.zeusPath).toBe('/workspace/test-proj')
  expect(result.codeServerRoot).toBe('/home/coder/workspaces')
  expect(result.codeServerPath).toBe('/home/coder/workspaces/test-proj')
})

test('throws on invalid input - empty string', () => {
  expect(() => getZeusWorkspacePath('')).toThrow('projectName must be a non-empty string')
  expect(() => getCodeServerWorkspacePath('')).toThrow('projectName must be a non-empty string')
  expect(() => zeusPathToCodeServerPath('')).toThrow('zeusPath must be a non-empty string')
  expect(() => getProjectName('')).toThrow('workspacePath must be a non-empty string')
  expect(() => debugPaths('')).toThrow('projectName must be a non-empty string')
})

test('throws on invalid input - null', () => {
  expect(() => getZeusWorkspacePath(null as any)).toThrow('projectName must be a non-empty string')
  expect(() => getCodeServerWorkspacePath(null as any)).toThrow('projectName must be a non-empty string')
  expect(() => zeusPathToCodeServerPath(null as any)).toThrow('zeusPath must be a non-empty string')
  expect(() => getProjectName(null as any)).toThrow('workspacePath must be a non-empty string')
  expect(() => debugPaths(null as any)).toThrow('projectName must be a non-empty string')
})

test('throws on invalid input - non-string', () => {
  expect(() => getZeusWorkspacePath(123 as any)).toThrow('projectName must be a non-empty string')
  expect(() => getCodeServerWorkspacePath({ name: 'test' } as any)).toThrow('projectName must be a non-empty string')
  expect(() => zeusPathToCodeServerPath(['test'] as any)).toThrow('zeusPath must be a non-empty string')
  expect(() => getProjectName(undefined as any)).toThrow('workspacePath must be a non-empty string')
  expect(() => debugPaths(false as any)).toThrow('projectName must be a non-empty string')
})

test('zeusPathToCodeServerPath handles partial paths', () => {
  // Path without ZEUS_WORKSPACES_ROOT prefix should extract basename
  expect(zeusPathToCodeServerPath('/some/other/path/project-name')).toBe('/home/coder/workspaces/project-name')
  expect(zeusPathToCodeServerPath('project-name')).toBe('/home/coder/workspaces/project-name')
})

test('getProjectName extracts correct basename from various paths', () => {
  expect(getProjectName('/workspace/foo')).toBe('foo')
  expect(getProjectName('/workspace/my-project-123')).toBe('my-project-123')
  expect(getProjectName('/workspace/my-project/src')).toBe('src')
  expect(getProjectName('simple-name')).toBe('simple-name')
})

test('path construction handles special characters', () => {
  expect(getZeusWorkspacePath('my-project_v1')).toBe('/workspace/my-project_v1')
  expect(getCodeServerWorkspacePath('my-project_v1')).toBe('/home/coder/workspaces/my-project_v1')
})
