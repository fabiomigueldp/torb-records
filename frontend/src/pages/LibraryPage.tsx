// frontend/src/pages/LibraryPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axios from 'axios';

interface Track {
  id: number;
  title: string;
  artist_str: string; // Assuming backend provides this
  duration: number; // in seconds
  cover_art_url: string; // URL to the cover art
  file_url: string; // URL to the track file
}

const LibraryPage: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();

  const newTrackId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('newTrackId');
  }, [location.search]);

  useEffect(() => {
    const fetchTracks = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get<Track[]>('/api/tracks');
        // Sort tracks to show newest first, which helps if newTrackId is not available
        const sortedTracks = response.data.sort((a, b) => b.id - a.id);
        setTracks(sortedTracks);
      } catch (err) {
        setError('Failed to fetch tracks. Please try again later.');
        console.error('Error fetching tracks:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTracks();
  }, []); // Fetch tracks on component mount

  // Scroll to and highlight new track
  useEffect(() => {
    if (newTrackId) {
      const trackElement = document.getElementById(`track-${newTrackId}`);
      if (trackElement) {
        trackElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [newTrackId, tracks]); // Rerun when newTrackId or tracks list changes

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6 text-center">Music Library</h1>
        <div role="alert" className="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6 text-center">Music Library</h1>
        <div className="text-center">
          <p className="text-xl mb-4">Your library is empty.</p>
          <Link to="/upload" className="btn btn-primary">Upload your first track</Link>
        </div>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">Music Library</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {tracks.map((track) => (
          <div
            key={track.id}
            id={`track-${track.id}`}
            className={`card bg-base-200 shadow-xl transition-all duration-500 ease-in-out
                        ${newTrackId && track.id === parseInt(newTrackId) ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-100 scale-105' : ''}`}
          >
            <figure className="px-2 pt-2 sm:px-4 sm:pt-4">
              <img
                src={track.cover_art_url || '/placeholder-cover.png'} // Fallback if no cover art
                alt={`Cover for ${track.title}`}
                className="rounded-xl aspect-square object-cover w-full"
                onError={(e) => (e.currentTarget.src = '/placeholder-cover.png')} // Handle broken image links
              />
            </figure>
            <div className="card-body items-center text-center p-4">
              <h2 className="card-title text-lg truncate w-full" title={track.title}>{track.title}</h2>
              <p className="text-sm text-base-content/70 truncate w-full" title={track.artist_str || 'Unknown Artist'}>
                {track.artist_str || 'Unknown Artist'}
              </p>
              <p className="text-xs text-base-content/50">{formatDuration(track.duration)}</p>
              {/* Add play button or link to track page if needed */}
              {/* <div className="card-actions">
                <button className="btn btn-primary btn-sm">Play</button>
              </div> */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LibraryPage;
