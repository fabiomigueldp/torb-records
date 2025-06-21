// frontend/src/pages/LibraryPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext'; // Assuming AuthContext provides user info

// Interface for track data from backend
interface Track {
  id: number;
  title: string;
  uploader: string;
  cover_url: string | null; // Can be null if no cover
  duration: number | null; // Can be null
  uuid?: string; // Added UUID for streaming - should match AudioTrackInfo
}

// Interface for user preferences from backend
interface UserPreferences {
  theme: string;
  muted_uploaders: string[];
}

interface LibraryPageProps {
  onPlayTrack?: (track: Track, playNext?: boolean) => void;
}

const LibraryPage: React.FC<LibraryPageProps> = ({ onPlayTrack }) => {
  const [allTracks, setAllTracks] = useState<Track[]>([]); // All tracks fetched from API
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]); // Tracks to display after filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);

  const location = useLocation();
  const { user } = useAuth(); // Get current user info if needed for uploader display or other features

  const newTrackId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('newTrackId');
  }, [location.search]);

  // Fetch tracks and user preferences
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [tracksResponse, prefsResponse] = await Promise.all([
          axios.get<Track[]>('/api/tracks'),
          axios.get<UserPreferences>('/api/preferences')
        ]);

        // Sort tracks by ID descending (newest first)
        const sortedTracks = tracksResponse.data.sort((a, b) => b.id - a.id);
        setAllTracks(sortedTracks);
        setUserPreferences(prefsResponse.data);

      } catch (err) {
        setError('Failed to fetch library data. Please try again later.');
        console.error('Error fetching library data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter tracks based on search term and muted uploaders
  useEffect(() => {
    if (!userPreferences) {
      // If preferences haven't loaded, show all tracks (or handle as appropriate)
      setFilteredTracks(allTracks.filter(track =>
        track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        track.uploader.toLowerCase().includes(searchTerm.toLowerCase())
      ));
      return;
    }

    const { muted_uploaders } = userPreferences;
    const lowerSearchTerm = searchTerm.toLowerCase();

    const currentFilteredTracks = allTracks.filter(track => {
      const matchesSearch = track.title.toLowerCase().includes(lowerSearchTerm) ||
                            track.uploader.toLowerCase().includes(lowerSearchTerm);

      // Apply mute logic from AC:
      // - Exclude if uploader in muted_uploaders
      // - Ignore rule for uploader 'fabiomigueldp'
      const isMuted = muted_uploaders.includes(track.uploader) && track.uploader !== 'fabiomigueldp';

      return matchesSearch && !isMuted;
    });
    setFilteredTracks(currentFilteredTracks);

  }, [allTracks, searchTerm, userPreferences]);


  // Scroll to and highlight new track
  useEffect(() => {
    if (newTrackId && filteredTracks.length > 0) { // Check filteredTracks before accessing
      const trackElement = document.getElementById(`track-${newTrackId}`);
      if (trackElement) {
        trackElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight effect is handled by className below
      }
    }
  }, [newTrackId, filteredTracks]);

  const handleToggleMuteUploader = async (uploaderUsername: string) => {
    if (!userPreferences) return;

    const currentlyMuted = userPreferences.muted_uploaders.includes(uploaderUsername);
    const newMutedUploaders = currentlyMuted
      ? userPreferences.muted_uploaders.filter(name => name !== uploaderUsername)
      : [...userPreferences.muted_uploaders, uploaderUsername];

    try {
      const response = await axios.put<UserPreferences>('/api/preferences', {
        theme: userPreferences.theme, // Keep current theme
        muted_uploaders: newMutedUploaders,
      });
      setUserPreferences(response.data); // Update local state with response from server
    } catch (err) {
      console.error('Failed to update mute preferences:', err);
      // Optionally show an error message to the user
      setError('Failed to update mute preferences. Please try again.');
    }
  };


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
        <div role="alert" className="alert alert-error mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{error}</span>
        </div>
        {/* Optionally, provide a retry button or further guidance */}
      </div>
    );
  }

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null || isNaN(seconds)) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-center sm:text-left">Music Library</h1>
        <input
          type="text"
          placeholder="Search tracks by title or uploader..."
          className="input input-bordered w-full max-w-xs"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredTracks.length === 0 && !loading ? (
         <div className="text-center">
           <p className="text-xl mb-4">
             {allTracks.length === 0 ? "Your library is empty." : "No tracks match your search or filter criteria."}
           </p>
           {allTracks.length === 0 && (
             <Link to="/upload" className="btn btn-primary">Upload your first track</Link>
           )}
         </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              id={`track-${track.id}`}
              className={`card bg-base-200 shadow-xl transition-all duration-300 ease-in-out hover:shadow-2xl
                          ${newTrackId && track.id === parseInt(newTrackId) ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-100 scale-105' : ''}`}
            >
              <figure className="px-2 pt-2 sm:px-4 sm:pt-4 relative">
                <img
                  src={track.cover_url || '/placeholder-cover.png'}
                  alt={`Cover for ${track.title}`}
                  className="rounded-xl aspect-square object-cover w-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder-cover.png';
                  }}
                />
                {/* Play button overlay - future feature
                <button className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-white/80"><path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" /></svg>
                </button>
                */}
              </figure>
              <div className="card-body items-center text-center p-3 sm:p-4">
                <h2 className="card-title text-md sm:text-lg truncate w-full" title={track.title}>
                  {track.title || 'Untitled Track'}
                </h2>
                <div
                  className={`tooltip ${userPreferences?.muted_uploaders.includes(track.uploader) && track.uploader !== 'fabiomigueldp' ? 'tooltip-open tooltip-warning' : ''}`}
                  data-tip={userPreferences?.muted_uploaders.includes(track.uploader) && track.uploader !== 'fabiomigueldp' ? `${track.uploader} is muted` : `Click to toggle mute for ${track.uploader}`}
                >
                  <button
                    onClick={() => handleToggleMuteUploader(track.uploader)}
                    className={`badge badge-outline text-xs sm:text-sm truncate max-w-full cursor-pointer hover:bg-opacity-20
                                ${userPreferences?.muted_uploaders.includes(track.uploader) && track.uploader !== 'fabiomigueldp' ? 'badge-warning line-through' : 'badge-neutral'}`}
                    disabled={track.uploader === 'fabiomigueldp'} // Disable button for 'fabiomigueldp'
                    title={track.uploader === 'fabiomigueldp' ? "This uploader cannot be muted" : (userPreferences?.muted_uploaders.includes(track.uploader) ? `Unmute ${track.uploader}` : `Mute ${track.uploader}`)}
                  >
                    {track.uploader || 'Unknown Uploader'}
                    {track.uploader === 'fabiomigueldp' && <span className="ml-1">👑</span>}
                  </button>
                </div>
                <p className="text-xs text-base-content/50 mt-1">{formatDuration(track.duration)}</p>
                <div className="card-actions mt-2 justify-center">
                  {onPlayTrack && track.uuid && ( // Only show play button if handler and uuid exist
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onPlayTrack(track)}
                      title={`Play ${track.title}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11V15.89a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84Z" /></svg>
                      Play
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LibraryPage;
