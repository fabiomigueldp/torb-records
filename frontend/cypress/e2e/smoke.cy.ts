describe('Smoke Test', () => {
  it('visits the app root url', () => {
    cy.visit('/')
    cy.contains('h1', 'Vite + React') // Example assertion, adjust to your app's content
  })
})
