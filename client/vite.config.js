import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite serves the client locally and forwards API calls to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
