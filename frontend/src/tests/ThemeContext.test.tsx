import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext'; // Adjusted path for availableThemes
// availableThemes is exported from ThemeContext.tsx, so it should be included here or imported if needed separately.
// The test component itself defines buttons based on availableThemes from the context.

// Re-import availableThemes if it's used directly in test setup/assertions outside of component
// For now, assuming availableThemes from context is sufficient for the TestComponent.
// If availableThemes is needed directly in describe/test blocks, it should be:
import { availableThemes as staticAvailableThemes } from '../contexts/ThemeContext';


// Mock fetch
global.fetch = vi.fn();

const mockFetch = (themeData: any, ok = true) => {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: ok,
    json: async () => themeData,
  } as Response);
};

const TestComponent: React.FC = () => {
  const { theme, setTheme, availableThemes: contextAvailableThemes } = useTheme(); // Renamed to avoid conflict if static is used
  return (
    <div>
      <div data-testid="current-theme">{theme}</div>
      {contextAvailableThemes.map(t => (
        <button key={t} onClick={() => setTheme(t)}>{t}</button>
      ))}
    </div>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default mock for initial fetch in ThemeProvider
    mockFetch({ theme: 'synthwave', muted_uploaders: [] });
    // Reset data-theme attribute
    document.documentElement.removeAttribute('data-theme');
  });

  test('initializes with default theme and fetches preferences', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Check if fetch was called for initial preferences
    expect(fetch).toHaveBeenCalledWith('/api/preferences');

    // Wait for state update from fetch
    await waitFor(() => {
      expect(screen.getByTestId('current-theme').textContent).toBe('synthwave');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('synthwave');
  });

  test('initializes with fetched theme if API returns valid theme', async () => {
    mockFetch({ theme: 'neon', muted_uploaders: [] }); // Override default mock for this test
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('current-theme').textContent).toBe('neon');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('neon');
  });

  test('initializes with default theme if API returns invalid theme and updates backend', async () => {
    mockFetch({ theme: 'invalid-theme', muted_uploaders: [] }); // API returns a theme not in availableThemes
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // It should default to 'synthwave' (or the ThemeProvider's default)
    await waitFor(() => {
        expect(screen.getByTestId('current-theme').textContent).toBe('synthwave');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('synthwave');

    // It should also try to PUT the valid default theme to the backend
    // The ThemeProvider's useEffect has `theme` in its dependency array, which is 'synthwave' initially.
    // The logic is: fetch -> response not ok / invalid theme -> apply 'synthwave' (current `theme` state) -> call updateThemePreference('synthwave')
    // This means two fetches: GET, then PUT.
    await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/preferences'); // Initial GET
        expect(fetch).toHaveBeenCalledWith('/api/preferences', expect.objectContaining({ // PUT due to invalid fetched theme
            method: 'PUT',
            body: JSON.stringify({ theme: 'synthwave' }),
        }));
    }, { timeout: 2000 }); // Increased timeout just in case of multiple async operations
  });

  test('changes theme when setTheme is called and updates backend', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Wait for initial theme to be set
    await waitFor(() => {
      expect(screen.getByTestId('current-theme').textContent).toBe('synthwave');
    });

    // Mock fetch for the PUT request when setTheme is called
    // The initial GET is already mocked in beforeEach
    // We need a new mock for the PUT that happens after clicking a theme button
    (fetch as ReturnType<typeof vi.fn>).mockClear(); // Clear previous fetch calls to only check the PUT
    mockFetch({ theme: 'vaporwave', muted_uploaders: [] }); // For the PUT response

    const newTheme = 'vaporwave';
    // Ensure 'vaporwave' is one of the themes rendered by TestComponent (it is, as it's in staticAvailableThemes)
    const themeButton = screen.getByRole('button', { name: newTheme });

    await act(async () => {
      userEvent.click(themeButton);
    });

    expect(screen.getByTestId('current-theme').textContent).toBe(newTheme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(newTheme);

    // Check if PUT request was made
    expect(fetch).toHaveBeenCalledWith('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    });
  });

  test('does not change theme if unavailable theme is set', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // For this test, we need to ensure the TestConsumer is rendered within the *same* ThemeProvider
    // as the TestComponent if we want to observe its effects on TestComponent's display.
    // The original structure was rendering a new ThemeProvider for TestConsumer which isolates it.
    // Let's adjust to test the setTheme behavior from within the context.

    const ConsumerForInvalidSet: React.FC = () => {
        const { setTheme: actualSetTheme, theme: currentTheme } = useTheme();
        return (
            <>
                <div data-testid="current-theme-consumer">{currentTheme}</div>
                <button onClick={() => actualSetTheme('nonexistenttheme')}>Set Invalid</button>
            </>
        );
    };

    render(
      <ThemeProvider>
        <ConsumerForInvalidSet />
      </ThemeProvider>
    );

    // Wait for initial theme from default mock
    await waitFor(() => {
      expect(screen.getByTestId('current-theme-consumer').textContent).toBe('synthwave');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('synthwave');

    const invalidButton = screen.getByRole('button', {name: 'Set Invalid'});
    await act(async () => {
        userEvent.click(invalidButton);
    });

    // Theme should not change from what was set by ThemeProvider's useEffect
    expect(screen.getByTestId('current-theme-consumer').textContent).toBe('synthwave');
    expect(document.documentElement.getAttribute('data-theme')).toBe('synthwave');
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Attempted to set an unavailable theme: nonexistenttheme'));
    consoleWarnSpy.mockRestore();
  });


  test('simulates reload: fetches and applies theme on mount', async () => {
    // First render, set a theme
    // beforeEach already mocks initial fetch with synthwave. Let's override for this specific step.
    (fetch as ReturnType<typeof vi.fn>).mockClear();
    mockFetch({ theme: 'retrocrt', muted_uploaders: [] });
    const { unmount } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('retrocrt');
      expect(screen.getByTestId('current-theme').textContent).toBe('retrocrt');
    });

    // Unmount to simulate component being removed
    unmount();
    document.documentElement.removeAttribute('data-theme');
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    // Second render (simulating reload), ThemeProvider should fetch again
    mockFetch({ theme: 'retrocrt', muted_uploaders: [] });
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(fetch).toHaveBeenCalledWith('/api/preferences');
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('retrocrt');
    });
    expect(screen.getByTestId('current-theme').textContent).toBe('retrocrt');
  });
});
