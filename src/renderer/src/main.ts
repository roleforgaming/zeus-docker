import App from './App.svelte'
import { mount } from 'svelte'

// Inject xterm.css from preload-provided path
const link = document.createElement('link')
link.rel = 'stylesheet'
link.href = window.zeus.xtermCssPath
document.head.appendChild(link)

const app = mount(App, { target: document.getElementById('app')! })

export default app
