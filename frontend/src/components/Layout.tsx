// frontend/src/components/Layout.tsx
import React, { Suspense } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import AudioPlayer, { AudioTrackInfo } from './AudioPlayer'; // Import AudioPlayer and its Track type

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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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
          </ul>
        </div>
      )}
    </div>
  );
};

export default Layout;
