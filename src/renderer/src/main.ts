import App from './App.svelte'
import { mount } from 'svelte'

// Import xterm CSS through Vite's CSS pipeline (works in both dev and prod)
import '@xterm/xterm/css/xterm.css'

const app = mount(App, { target: document.getElementById('app')! })

export default app
