import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  // Add other user properties as needed
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (userData: User) => void; // Optional: if you have a direct login mechanism
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined); // Export AuthContext

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Assuming usePresence hook is used at a higher level or globally,
  // we might need to pass its setCurrentUser function or use a shared context for presence features.
  // For this example, let's assume usePresence is instantiated in a way that setCurrentUser can be called.
  // This part might need adjustment based on actual usePresence hook integration.
  // If usePresence is used within components that are children of AuthProvider, this won't work directly.
  // A common pattern is to have a global PresenceProvider.
  // For now, this is a placeholder to indicate where the call should happen.
  // import usePresence from '../hooks/usePresence'; // Hypothetical import

  useEffect(() => {
    // const presence = usePresence(); // This would cause issues if AuthProvider is higher up the tree.
    // A better approach: The component that initializes usePresence should observe 'user' from AuthContext.
    // Or, AuthContext itself could initialize usePresence if it's meant to be user-scoped.

    const fetchUser = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/me');
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          // presence.setCurrentUser(userData.username); // Call would be here
        } else {
          setUser(null);
          // presence.setCurrentUser(null); // And here
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        setUser(null);
        // presence.setCurrentUser(null); // And here
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []); // Empty dependency array: runs once on mount.

  // This effect will run when the user state changes.
  // It's a more appropriate place if usePresence is initialized outside and needs the username.
  // However, the usePresence hook itself should be refactored to be a context provider,
  // or instantiated within App.tsx and passed down or accessed via its own context.

  // For now, let's assume the component using usePresence (e.g. App.tsx or Layout.tsx)
  // will get the user from useAuth() and call presence.setCurrentUser().

  const login = (userData: User) => {
    setUser(userData);
    // If presence hook is managed here: presence.setCurrentUser(userData.username);
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
      });
      if (response.ok) {
        setUser(null);
        // If presence hook is managed here: presence.setCurrentUser(null);
      } else {
        console.error('Logout failed:', await response.text());
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
