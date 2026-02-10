/// <reference types="svelte" />
/// <reference types="vite/client" />

// Re-export types for window.zeus
import type { ZeusAPI } from './lib/types/index.js'

declare global {
  interface Window {
    zeus: ZeusAPI
  }
}
