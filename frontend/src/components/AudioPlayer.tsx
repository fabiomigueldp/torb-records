import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import WaveSurfer from 'wavesurfer.js';

// Define Track interface matching LibraryPage and backend
interface Track {
  id: number;
  title: string;
  uploader: string;
  cover_url: string | null;
  duration: number | null;
  // Add uuid for streaming URL construction
  uuid?: string; // Assuming uuid is available for streaming
}

interface AudioPlayerProps {
  // Props to control the player from outside, e.g., from LibraryPage
  trackToPlay: Track | null;
  queue: Track[];
  onNext?: () => void;
  onPrevious?: () => void;
  onQueueUpdate?: (newQueue: Track[]) => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ trackToPlay, queue, onNext, onPrevious, onQueueUpdate }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0); // Use actual duration from player
  const [volume, setVolume] = useState(1); // Volume 0-1
  const [showQueue, setShowQueue] = useState(false);
  const [internalQueue, setInternalQueue] = useState<Track[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  useEffect(() => {
    setInternalQueue(queue);
  }, [queue]);

  useEffect(() => {
    if (trackToPlay) {
      setCurrentTrack(trackToPlay);
      // If it's a new track, add to beginning of queue if not already there
      if (trackToPlay && !internalQueue.find(t => t.id === trackToPlay.id)) {
        const newQueue = [trackToPlay, ...internalQueue.filter(t => t.id !== trackToPlay.id)];
        setInternalQueue(newQueue);
        onQueueUpdate?.(newQueue);
      }
    } else if (internalQueue.length > 0 && !currentTrack) {
      // If no specific track to play but queue has items, play first from queue
      setCurrentTrack(internalQueue[0]);
    }
  }, [trackToPlay]);


  useEffect(() => {
    if (currentTrack && currentTrack.uuid) {
      const streamUrl = `/api/stream/${currentTrack.uuid}/master.m3u8`;
      if (audioRef.current) {
        if (isSafari) {
          // Safari supports HLS natively in <audio>
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          audioRef.current.src = streamUrl;
          audioRef.current.load(); // Important for Safari to pick up new src
          // Autoplay if isPlaying was true or becomes true
          if (isPlaying) {
            audioRef.current.play().catch(e => console.error("Error playing audio:", e));
          }
        } else {
          // Use HLS.js for other browsers
          if (Hls.isSupported()) {
            if (hlsRef.current) {
              hlsRef.current.destroy();
            }
            const hls = new Hls();
            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(audioRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (isPlaying) {
                audioRef.current?.play().catch(e => console.error("Error playing audio:", e));
              }
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                console.error('HLS.js fatal error:', data);
                // Attempt to recover or notify user
                switch(data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.error("HLS.js network error, attempting to recover...");
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.error("HLS.js media error, attempting to recover...");
                    hls.recoverMediaError();
                    break;
                  default:
                    // Cannot recover
                    hls.destroy();
                    hlsRef.current = null;
                    break;
                }
              }
            });
          } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Fallback for browsers that support HLS in <audio> but Hls.js check failed
            audioRef.current.src = streamUrl;
            if (isPlaying) {
                audioRef.current.play().catch(e => console.error("Error playing audio:", e));
            }
          } else {
            console.error('HLS is not supported in this browser.');
            // Handle lack of HLS support (e.g., show message)
          }
        }
        // Reset states for new track
        setCurrentTime(0);
        // setTrackDuration(currentTrack.duration || 0); // Use actual duration from audio element's loadedmetadata
      }
    } else if (!currentTrack && audioRef.current) {
        // No current track, stop audio and clear src
        audioRef.current.pause();
        audioRef.current.src = "";
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    }

    // Initialize WaveSurfer
    if (waveformContainerRef.current && audioRef.current && currentTrack) {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }

      // Ensure audio context is resumed on user interaction if needed,
      // though WaveSurfer usually handles this or works with an existing context.
      // WaveSurfer will try to use the existing audio element's src.
      // It's important that the audio element is ready and potentially has started loading data.
      const ws = WaveSurfer.create({
        container: waveformContainerRef.current,
        waveColor: 'hsl(var(--p))', // DaisyUI primary color
        progressColor: 'hsl(var(--pf))', // DaisyUI primary-focus or a darker shade
        height: 60,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        media: audioRef.current, // Link wavesurfer to the audio element
        // backend: 'MediaElement', // Explicitly use MediaElement backend if issues with WebAudio
        // For HLS, WaveSurfer might not be able to decode the entire file upfront easily.
        // It will visualize what the <audio> element is playing.
        // Set partialRender to true if you load media directly into wavesurfer.
        // partialRender: true
      });
      wavesurferRef.current = ws;

      // If HLS.js is used, it might take time for audio to be fully available.
      // If Safari (native HLS), similar timing considerations.
      // Sometimes, you might need to call ws.load(audioRef.current) or ws.load(streamUrl)
      // explicitly after the media is attached or manifest is parsed,
      // but often `media` option in create is enough.

      // Handle cases where audio might not be immediately ready for waveform generation
      // For example, after HLS manifest is parsed and some segments loaded.
      const onAudioReadyForWaveform = () => {
        if (wavesurferRef.current && audioRef.current?.src && wavesurferRef.current.getMediaElement()?.src !== audioRef.current?.src) {
          // If WaveSurfer's media element src is stale or it didn't pick up the new audio src
          // This can happen if WaveSurfer is initialized before audio.src is fully set by HLS.js/Safari
          // wavesurferRef.current.load(audioRef.current); // This reloads using the audio element as source
        }
      };

      if (hlsRef.current) { // If HLS.js is active
        hlsRef.current.on(Hls.Events.MANIFEST_PARSED, onAudioReadyForWaveform);
        hlsRef.current.on(Hls.Events.LEVEL_LOADED, onAudioReadyForWaveform); // Or when some data is loaded
      } else if (isSafari && audioRef.current) { // Native HLS
         audioRef.current.onloadedmetadata = () => { // Or oncanplay / oncanplaythrough
            onAudioReadyForWaveform();
         };
      }


    } else {
       // No current track or waveform container, destroy wavesurfer if it exists
        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
            wavesurferRef.current = null;
        }
    }


    return () => {
      // Cleanup HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Cleanup WaveSurfer instance
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [currentTrack, isPlaying]); // isPlaying dependency ensures re-evaluation if play state changes, though currentTrack is primary driver for waveform.

  const handlePlayPause = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Error trying to play:", e));
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setTrackDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const time = Number(event.target.value);
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const newVolume = Number(event.target.value);
      audioRef.current.volume = newVolume;
      setVolume(newVolume);
    }
  };

  const playNextTrack = () => {
    if (onNext) {
        onNext(); // External handler for "next"
    } else { // Internal queue logic
        const currentIndex = internalQueue.findIndex(t => t.id === currentTrack?.id);
        if (currentIndex !== -1 && currentIndex < internalQueue.length - 1) {
            setCurrentTrack(internalQueue[currentIndex + 1]);
            setIsPlaying(true); // Autoplay next
        } else if (internalQueue.length > 0) {
            // Loop to first track or stop (here, loops to first)
            setCurrentTrack(internalQueue[0]);
            setIsPlaying(true);
        }
    }
  };

  const playPreviousTrack = () => {
     if (onPrevious) {
        onPrevious(); // External handler for "previous"
    } else { // Internal queue logic
        const currentIndex = internalQueue.findIndex(t => t.id === currentTrack?.id);
        if (currentIndex !== -1 && currentIndex > 0) {
            setCurrentTrack(internalQueue[currentIndex - 1]);
            setIsPlaying(true); // Autoplay previous
        } else if (internalQueue.length > 0) {
            // Loop to last track or stop (here, loops to last)
            setCurrentTrack(internalQueue[internalQueue.length - 1]);
            setIsPlaying(true);
        }
    }
  };

  const handleTrackEnd = () => {
    playNextTrack();
  };

  const formatTime = (timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const removeFromQueue = (trackId: number) => {
    const newQueue = internalQueue.filter(t => t.id !== trackId);
    setInternalQueue(newQueue);
    onQueueUpdate?.(newQueue);
    if (currentTrack?.id === trackId) { // If current track removed, play next or stop
        if (newQueue.length > 0) {
            setCurrentTrack(newQueue[0]);
            setIsPlaying(true);
        } else {
            setCurrentTrack(null);
            setIsPlaying(false);
        }
    }
  };

  if (!currentTrack && internalQueue.length === 0) {
    return <div className="fixed bottom-0 left-0 right-0 bg-base-300 p-2 text-center text-sm">No track selected.</div>;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-base-300 p-3 shadow-lg z-50">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleTrackEnd}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        // crossOrigin="anonymous" // For HLS/WaveSurfer if needed from different origin
      />

      <div className="container mx-auto flex items-center justify-between gap-4">
        {/* Track Info */}
        <div className="flex items-center gap-3 w-1/4 truncate">
          {currentTrack?.cover_url && (
            <img src={currentTrack.cover_url} alt={currentTrack.title} className="w-10 h-10 rounded object-cover" />
          )}
          <div>
            <p className="text-sm font-semibold truncate" title={currentTrack?.title}>{currentTrack?.title || 'No Track'}</p>
            <p className="text-xs text-base-content/70 truncate" title={currentTrack?.uploader}>{currentTrack?.uploader || 'Unknown Uploader'}</p>
          </div>
        </div>

        {/* Controls & Seek Bar */}
        <div className="flex flex-col items-center gap-1 w-1/2">
          <div className="flex items-center gap-3">
            <button onClick={playPreviousTrack} className="btn btn-ghost btn-sm" title="Previous" disabled={internalQueue.length <= 1}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M18 10a.75.75 0 0 1-.75.75H4.66l2.1 1.95a.75.75 0 1 1-1.02 1.1l-3.5-3.25a.75.75 0 0 1 0-1.1l3.5-3.25a.75.75 0 1 1 1.02 1.1l-2.1 1.95h12.59A.75.75 0 0 1 18 10Z" clipRule="evenodd" transform="scale(-1, 1) translate(-20, 0)" /></svg>
            </button>
            <button onClick={handlePlayPause} className="btn btn-primary btn-circle btn-sm" title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.75 4.5a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.5 0V5.25a.75.75 0 0 0-.75-.75Z" /><path d="M14.25 4.5a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.5 0V5.25a.75.75 0 0 0-.75-.75Z" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11V15.89a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84Z" /></svg>
              )}
            </button>
            <button onClick={playNextTrack} className="btn btn-ghost btn-sm" title="Next" disabled={internalQueue.length <= 1}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M2 10a.75.75 0 0 1 .75-.75h12.59l-2.1-1.95a.75.75 0 1 1 1.02-1.1l3.5 3.25a.75.75 0 0 1 0-1.1l-3.5 3.25a.75.75 0 1 1-1.02 1.1l2.1-1.95H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-md">
            <span className="text-xs">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={trackDuration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="range range-primary range-xs w-full"
              disabled={!currentTrack}
            />
            <span className="text-xs">{formatTime(trackDuration || (currentTrack?.duration || 0))}</span>
          </div>
          <div ref={waveformContainerRef} className="w-full h-[60px] opacity-80 hover:opacity-100 transition-opacity cursor-pointer">
            {/* WaveSurfer will render here. Add a placeholder or style for when it's empty or loading. */}
          </div>
        </div>

        {/* Volume & Queue Toggle */}
        <div className="flex items-center gap-2 w-1/4 justify-end">
           <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="range range-xs w-20"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
          <button onClick={() => setShowQueue(!showQueue)} className="btn btn-ghost btn-sm" title="Toggle Queue">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M2 5.75A.75.75 0 0 1 2.75 5h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 5.75Zm0 4A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 4A.75.75 0 0 1 2.75 13h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 13.75Z" /></svg>
          </button>
        </div>
      </div>

      {/* Queue Display */}
      {showQueue && (
        <div className="absolute bottom-full mb-1 right-0 w-full sm:w-96 max-h-60 overflow-y-auto bg-base-200 shadow-xl rounded-t-lg p-2 border-t border-base-100">
          <h3 className="text-sm font-semibold p-2">Up Next</h3>
          {internalQueue.length > 0 ? (
            <ul>
              {internalQueue.map((track, index) => (
                <li
                  key={track.id + '-' + index}
                  className={`flex justify-between items-center p-2 hover:bg-base-100 rounded cursor-pointer ${currentTrack?.id === track.id ? 'bg-primary text-primary-content' : ''}`}
                  onClick={() => { setCurrentTrack(track); setIsPlaying(true); }}
                >
                  <div className="truncate">
                    <span className="text-xs">{track.title}</span>
                    <span className="text-xs text-base-content/70 block">{track.uploader}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromQueue(track.id); }}
                    className="btn btn-ghost btn-xs text-error"
                    title="Remove from queue"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-2 text-xs text-base-content/70">Queue is empty.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioPlayer;
export type { Track as AudioTrackInfo }; // Export Track interface for use elsewhere
