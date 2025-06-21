// frontend/src/App.tsx
import React, { lazy, Suspense, useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './contexts/AuthContext';
import { AudioTrackInfo } from './components/AudioPlayer'; // Import Track type for player

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
  const [currentTrack, setCurrentTrack] = useState<AudioTrackInfo | null>(null);
  const [queue, setQueue] = useState<AudioTrackInfo[]>([]);

  const handlePlayTrack = useCallback((track: AudioTrackInfo, playNext: boolean = false) => {
    setCurrentTrack(track);
    setQueue(prevQueue => {
      // Avoid duplicate if track is already in queue
      const trackExists = prevQueue.find(t => t.id === track.id);
      if (trackExists) {
        // If track is already in queue, move it to the top (current playing)
        // and potentially remove other instances if desired, or just ensure it's at top.
        // For simplicity, if it exists, we assume it's being intentionally re-selected to play.
        // The AudioPlayer itself handles adding trackToPlay to its internal queue.
        return [track, ...prevQueue.filter(t => t.id !== track.id)];
      }
      return playNext ? [track, ...prevQueue] : [...prevQueue, track];
    });
  }, []);

  const handleUpdateQueue = useCallback((newQueue: AudioTrackInfo[]) => {
    setQueue(newQueue);
  }, []);

  const handlePlayNext = useCallback(() => {
    if (queue.length > 0) {
      const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % queue.length;
      setCurrentTrack(queue[nextIndex]);
    }
  }, [currentTrack, queue]);

  const handlePlayPrevious = useCallback(() => {
    if (queue.length > 0) {
      const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
      const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
      setCurrentTrack(queue[prevIndex]);
    }
  }, [currentTrack, queue]);


  return (
    <Router>
      <Suspense fallback={<div className="flex justify-center items-center h-screen"><span className="loading loading-spinner loading-lg"></span></div>}>
        <Routes>
          <Route path="/login" element={<LoginPageWrapper />} />

          {/* Routes requiring authentication and layout */}
          {/* Pass player state and handlers to Layout */}
          <Route element={
            <Layout
              playerTrack={currentTrack}
              playerQueue={queue}
              onUpdateQueue={handleUpdateQueue}
              onPlayNext={handlePlayNext}
              onPlayPrevious={handlePlayPrevious}
            />
          }>
            <Route element={<ProtectedRoute />}>
              {/* Pass playTrack handler to LibraryPage */}
              <Route path="/library" element={<LibraryPage onPlayTrack={handlePlayTrack} />} />
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
