// frontend/src/components/Layout.tsx
import React, { Suspense } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login'); // Redirect to login after logout
  };

  return (
    <div className="drawer">
      <input id="my-drawer-3" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col">
        {/* Navbar */}
        <div className="w-full navbar bg-base-300">
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
                {/* Theme dropdown placeholder - Using details for a simple dropdown */}
                <details>
                  <summary>Theme</summary>
                  <ul className="p-2 bg-base-100 rounded-t-none right-0">
                    {/* Placeholder themes - In a real app, these would change the theme */}
                    <li><a>Default</a></li>
                    <li><a>Dark</a></li>
                    <li><a>Light</a></li>
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
        <main className="p-4">
          {/* Suspense for outlet content, though App.tsx already has one */}
          <Suspense fallback={<div>Loading page content...</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {user && ( // Only show sidebar if user is logged in
        <div className="drawer-side">
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
