import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173', // Assuming Vite dev server runs here
    supportFile: false, // Or 'cypress/support/e2e.ts' if you have one
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}', // Default pattern
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
})
