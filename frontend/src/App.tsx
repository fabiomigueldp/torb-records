// frontend/src/App.tsx
import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout'; // Will be created in next step
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './contexts/AuthContext'; // To check initial auth state for /login

// Lazy load page components
const LoginPage = lazy(() => import('./pages/LoginPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

// A simple component to handle redirection from /login if user is already authenticated
const LoginPageWrapper: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading authentication status...</div>;
  }

  if (user) {
    return <Navigate to="/library" replace />;
  }
  return <LoginPage />;
};

function App() {
  return (
    <Router>
      <Suspense fallback={<div>Loading Page...</div>}>
        <Routes>
          <Route path="/login" element={<LoginPageWrapper />} />

          {/* Routes requiring authentication and layout */}
          <Route element={<Layout />}> {/* Layout will wrap these routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/playlists" element={<PlaylistsPage />} />
              <Route path="/chat" element={<ChatPage />} />
            </Route>
            <Route element={<ProtectedRoute isAdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>

          {/* Redirect root to /library if authenticated, else /login */}
          <Route path="/" element={<NavigateToHome />} />

          {/* Fallback for unmatched routes - optional */}
          {/* <Route path="*" element={<Navigate to="/" replace />} /> */}
        </Routes>
      </Suspense>
    </Router>
  );
}

// Helper component to determine initial redirect from "/"
const NavigateToHome: React.FC = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  return <Navigate to={user ? "/library" : "/login"} replace />;
};

export default App;
