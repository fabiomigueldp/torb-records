// frontend/src/components/Layout.tsx
import React, { Suspense, useState, useEffect } from 'react'; // Added useState, useEffect
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import AudioPlayer, { AudioTrackInfo } from './AudioPlayer'; // Import AudioPlayer and its Track type
import usePresence, { UserPresence } from '../hooks/usePresence'; // Import usePresence hook and type
import { fetchTrackById } from '../utils/api'; // Assuming an API utility to fetch track details

interface LayoutProps {
  playerTrack: AudioTrackInfo | null;
  playerQueue: AudioTrackInfo[];
  onUpdateQueue: (newQueue: AudioTrackInfo[]) => void;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
}

const Layout: React.FC<LayoutProps> = ({
  playerTrack,
  playerQueue,
  onUpdateQueue,
  onPlayNext,
  onPlayPrevious
}) => {
  const { user, logout } = useAuth();
  const { theme, setTheme, availableThemes } = useTheme();
  const navigate = useNavigate();
  const { onlineUsers, isConnected } = usePresence(); // Use the presence hook
  const [detailedUsers, setDetailedUsers] = useState<Array<UserPresence & { trackTitle?: string }>>([]);

  const handleLogout = async () => {
    // The usePresence hook's cleanup should handle WebSocket disconnection
    await logout();
    navigate('/login');
  };

  useEffect(() => {
    // Fetch track titles for users who are online and have a track_id
    const fetchTrackTitles = async () => {
      if (!user) { // Only fetch if user is logged in, otherwise WS won't connect
        setDetailedUsers([]);
        return;
      }
      const usersWithTitles = await Promise.all(
        onlineUsers.map(async (presenceUser) => {
          if (presenceUser.online && presenceUser.track_id) {
            try {
              // Ensure track_id is a number if your API expects that.
              // The presence message might send it as string or number.
              const track = await fetchTrackById(String(presenceUser.track_id));
              return { ...presenceUser, trackTitle: track?.title || 'Unknown Track' };
            } catch (error) {
              console.error(`Failed to fetch track details for ${presenceUser.track_id}:`, error);
              return { ...presenceUser, trackTitle: 'Error loading track' };
            }
          }
          return presenceUser;
        })
      );
      // Filter out users who are not online for the display list,
      // or handle how offline users with last known track are shown if desired.
      // For now, focusing on online users.
      setDetailedUsers(usersWithTitles.filter(u => u.online));
    };

    if (isConnected && user) {
      fetchTrackTitles();
    } else if (!isConnected || !user) {
      setDetailedUsers([]); // Clear detailed users if not connected or not logged in
    }
  }, [onlineUsers, isConnected, user]); // Re-run when onlineUsers, connection status, or user changes

  return (
    // Add pb-20 (padding-bottom) or similar to drawer-content to prevent overlap with fixed AudioPlayer
    <div className="drawer">
      <input id="my-drawer-3" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col min-h-screen pb-28 sm:pb-24"> {/* Adjusted padding */}
        {/* Navbar */}
        <div className="w-full navbar bg-base-300 sticky top-0 z-30"> {/* Make navbar sticky */}
          <div className="flex-none lg:hidden">
            <label htmlFor="my-drawer-3" aria-label="open sidebar" className="btn btn-square btn-ghost">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-6 h-6 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </label>
          </div>
          <div className="flex-1 px-2 mx-2">
            <Link to={user ? "/library" : "/login"} className="text-xl font-bold">Torb Records</Link>
          </div>
          <div className="flex-none hidden lg:block">
            <ul className="menu menu-horizontal">
              {/* Navbar menu content here */}
              {user && (
                <>
                  <li><Link to="/library">Library</Link></li>
                  <li><Link to="/upload">Upload</Link></li>
                  <li><Link to="/playlists">Playlists</Link></li>
                  <li><Link to="/chat">Chat</Link></li>
                  {user.is_admin && <li><Link to="/admin">Admin</Link></li>}
                </>
              )}
            </ul>
          </div>
          <div className="flex-none">
            <ul className="menu menu-horizontal items-center">
              <li>
                <details>
                  <summary>Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}</summary>
                  <ul className="p-2 bg-base-100 rounded-t-none right-0 shadow-lg">
                    {availableThemes.map((themeName) => (
                      <li key={themeName}>
                        <a onClick={() => setTheme(themeName)}>
                          {themeName.charAt(0).toUpperCase() + themeName.slice(1)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
              {user && (
                <li>
                  <button onClick={handleLogout} className="btn btn-ghost">Logout</button>
                </li>
              )}
            </ul>
          </div>
        </div>
        {/* Page content here */}
        <main className="p-4 flex-grow"> {/* Added flex-grow to push AudioPlayer down if content is short */}
          {/* Suspense for outlet content, though App.tsx already has one */}
          <Suspense fallback={<div className="flex justify-center items-center h-full"><span className="loading loading-spinner loading-lg"></span></div>}>
            <Outlet />
          </Suspense>
        </main>
        {/* Render AudioPlayer only if a user is logged in and there's a track or queue */}
        {user && (playerTrack || playerQueue.length > 0) && (
          <AudioPlayer
            trackToPlay={playerTrack}
            queue={playerQueue}
            onQueueUpdate={onUpdateQueue}
            onNext={onPlayNext}
            onPrevious={onPlayPrevious}
          />
        )}
      </div>
      {user && ( // Only show sidebar if user is logged in
        <div className="drawer-side z-40"> {/* Ensure sidebar is above content but below modal-like elements if any */}
          <label htmlFor="my-drawer-3" aria-label="close sidebar" className="drawer-overlay"></label>
          <ul className="menu p-4 w-80 min-h-full bg-base-200">
            {/* Sidebar content here */}
            <li><Link to="/library">Library</Link></li>
            <li><Link to="/upload">Upload</Link></li>
            <li><Link to="/playlists">Playlists</Link></li>
            <li><Link to="/chat">Chat</Link></li>
            {user.is_admin && <li><Link to="/admin">Admin</Link></li>}

            <li className="menu-title mt-4">
              <span>Online Users {isConnected ? `(${detailedUsers.length})` : '(Connecting...)'}</span>
            </li>
            {detailedUsers.length > 0 ? (
              detailedUsers.map((pUser) => (
                <li key={pUser.username} className="text-sm disabled"> {/* Use disabled for non-interactive items or style manually */}
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${pUser.online ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                    <span>{pUser.username}</span>
                    {pUser.trackTitle && (
                      <span className="text-xs opacity-70 truncate" title={pUser.trackTitle}>
                        🎧 {pUser.trackTitle}
                      </span>
                    )}
                    {!pUser.trackTitle && pUser.track_id && (
                       <span className="text-xs opacity-70">🎧 Loading...</span>
                    )}
                  </div>
                </li>
              ))
            ) : (
              isConnected && <li><span className="text-xs italic">No users currently online.</span></li>
            )}
            {!isConnected && user && <li><span className="text-xs italic">Connecting to presence service...</span></li>}

          </ul>
        </div>
      )}
    </div>
  );
};

export default Layout;
