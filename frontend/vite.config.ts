// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        // Exclude .ts files (HLS segments) from precaching by Workbox
        // These are handled by a custom route in service-worker.ts
        globIgnores: ['**/*.ts'],
      },
      devOptions: {
        enabled: true, // Enable PWA in development
      },
      manifest: {
        name: 'Your Application Name',
        short_name: 'AppShortName',
        description: 'Your application description',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
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
