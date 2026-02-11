import App from './App.svelte'
import { mount } from 'svelte'

// Global theme (CSS custom properties)
import './theme.css'

// Import xterm CSS through Vite's CSS pipeline (works in both dev and prod)
import '@xterm/xterm/css/xterm.css'

const app = mount(App, { target: document.getElementById('app')! })

export default app
