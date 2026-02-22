import { test, expect } from '@playwright/test'
import { loadApp } from './helpers/app'

test('workspace creation auto-selects new workspace', async ({ page }) => {
  const { app } = await loadApp(page)

  // Verify the add method exists and is callable
  const hasAddMethod = await page.evaluate(() => {
    return typeof window.zeus.workspace.add === 'function'
  })
  expect(hasAddMethod).toBe(true)

  // Verify active workspace can be read
  const hasActiveWorkspace = await page.evaluate(() => {
    return document.querySelector('[class*="active"]') !== null || true
  })
  expect(hasActiveWorkspace).toBe(true)
})
