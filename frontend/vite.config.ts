// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Add this section for Vitest
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts', // Optional setup file
  },
  server: { // Required for proxying API requests from frontend to backend
    proxy: {
      '/api': 'http://127.0.0.1:8000'
    }
  }
})
