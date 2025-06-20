// frontend/src/tests/navigation.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App'; // Adjust if App is not the main router entry
import { AuthProvider } from '../contexts/AuthContext';

// Mock the fetch function for /api/me to simulate unauthenticated user
vi.mock('../contexts/AuthContext', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../contexts/AuthContext')>()
  return {
    ...mod,
    useAuth: () => ({
      user: null, // Simulate no user logged in
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    }),
  }
})

describe('Navigation', () => {
  test('unauthenticated access to /library redirects to /login', async () => {
    // Use MemoryRouter to control history
    render(
      <MemoryRouter initialEntries={['/library']}>
        <AuthProvider> {/* Ensure AuthProvider wraps App for context */}
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for the redirect to happen and the login page content to appear
    // The LoginPage should have a distinctive element, e.g., text "Login now!"
    await waitFor(() => {
      expect(screen.getByText(/Login now!/i)).toBeInTheDocument();
    });
  });
});
