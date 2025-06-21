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
  // Use the presence hook, now including DM related states and functions
  const {
    onlineUsers,
    isConnected,
    unreadCounts,
    setCurrentUser,
    requestNotificationPermission
  } = usePresence();
  const [detailedUsers, setDetailedUsers] = useState<Array<UserPresence & { trackTitle?: string }>>([]);

  useEffect(() => {
    if (user) {
      setCurrentUser(user.username);
      requestNotificationPermission(); // Request permission when layout mounts for a logged-in user
    } else {
      setCurrentUser(null);
    }
  }, [user, setCurrentUser, requestNotificationPermission]);

  const handleLogout = async () => {
    await logout(); // AuthContext's logout
    setCurrentUser(null); // Clear user in presence
    navigate('/login');
  };

  useEffect(() => {
    const fetchTrackTitles = async () => {
      if (!user || !isConnected) {
        setDetailedUsers([]);
        return;
      }
      const usersWithTitles = await Promise.all(
        onlineUsers.map(async (presenceUser) => {
          if (presenceUser.online && presenceUser.track_id) {
            try {
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
      setDetailedUsers(usersWithTitles.filter(u => u.online));
    };

    fetchTrackTitles();
  }, [onlineUsers, isConnected, user]);

  const handleUserClick = (username: string) => {
    // Navigate to DM chat with the user
    navigate(`/chat/dm/${username}`);
    // Close the drawer if open (especially on mobile)
    const drawerCheckbox = document.getElementById('my-drawer-3') as HTMLInputElement;
    if (drawerCheckbox) {
      drawerCheckbox.checked = false;
    }
  };

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
              <span>Online Users {isConnected ? `(${detailedUsers.filter(u => u.username !== user?.username).length})` : '(Connecting...)'}</span>
            </li>
            {detailedUsers.filter(u => u.username !== user?.username).length > 0 ? (
              detailedUsers
                .filter(pUser => pUser.username !== user?.username) // Exclude current user from the list
                .map((pUser) => (
                <li key={pUser.username} onClick={() => handleUserClick(pUser.username)}>
                  <div className="flex justify-between items-center w-full">
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
                    {unreadCounts[pUser.username] > 0 && (
                      <span className="badge badge-primary badge-sm">{unreadCounts[pUser.username]}</span>
                    )}
                  </div>
                </li>
              ))
            ) : (
              isConnected && <li><span className="text-xs italic">No other users currently online.</span></li>
            )}
            {!isConnected && user && <li><span className="text-xs italic">Connecting to presence service...</span></li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Layout;
