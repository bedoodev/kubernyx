import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Wails on macOS serves the app over a secure local origin. Vite's HMR
    // websocket is noisy and unreliable in that environment, and the desktop
    // app does not need it for terminal debugging.
    hmr: false,
  },
})
