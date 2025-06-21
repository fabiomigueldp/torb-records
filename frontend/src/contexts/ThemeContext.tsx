import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  availableThemes: string[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Define the available themes, including the new ones
const availableThemes = [
  "light", "dark", "cupcake", // Assuming these might be defaults or pre-existing
  "neon", "retrocrt", "synthwave", "vaporwave", "midnight"
];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<string>('synthwave'); // Default theme

  // Effect to fetch initial theme and set data-theme attribute
  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const response = await fetch('/api/preferences');
        if (response.ok) {
          const data = await response.json();
          if (data.theme && availableThemes.includes(data.theme)) {
            setThemeState(data.theme);
            document.documentElement.setAttribute('data-theme', data.theme);
          } else {
            // If fetched theme is invalid or not in availableThemes, apply default and update backend
            document.documentElement.setAttribute('data-theme', theme); // theme is 'synthwave' here
            await updateThemePreference(theme);
          }
        } else {
          // If API fails, apply default client-side and try to update backend
          console.error('Failed to fetch theme preferences.');
          document.documentElement.setAttribute('data-theme', theme);
           // Optionally, attempt to set a default on the backend if fetch fails
          await updateThemePreference(theme);
        }
      } catch (error) {
        console.error('Error fetching theme preferences:', error);
        document.documentElement.setAttribute('data-theme', theme);
      }
    };

    fetchTheme();
  }, [theme]); // Include theme in dependency array to handle initial default setting

  const updateThemePreference = async (newTheme: string) => {
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ theme: newTheme }), // Only sending theme for now
      });
      if (!response.ok) {
        console.error('Failed to update theme preference');
      }
    } catch (error) {
      console.error('Error updating theme preference:', error);
    }
  };

  const setTheme = useCallback(async (newTheme: string) => {
    if (availableThemes.includes(newTheme)) {
      setThemeState(newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      await updateThemePreference(newTheme);
    } else {
      console.warn(`Attempted to set an unavailable theme: ${newTheme}`);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, availableThemes }}>
      {children}
    </ThemeContext.Provider>
  );
};
