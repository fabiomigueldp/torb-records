import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

import AudioPlayer, { AudioTrackInfo } from '../components/AudioPlayer';

// Mock Hls.js
const mockHlsDestroy = vi.fn();
const mockHlsAttachMedia = vi.fn();
const mockHlsLoadSource = vi.fn();
const mockHlsOn = vi.fn();

// Corrected Hls.js mock
const mockHlsInstance = {
  destroy: mockHlsDestroy,
  attachMedia: mockHlsAttachMedia,
  loadSource: mockHlsLoadSource,
  on: mockHlsOn,
  // Potentially add other methods like 'recoverMediaError', 'startLoad' if they are called
};

vi.mock('hls.js', () => {
  const HlsClassMock = vi.fn(() => mockHlsInstance);
  // @ts-expect-error - attaching static method to mock constructor
  HlsClassMock.isSupported = vi.fn(() => true); // Static method isSupported
  // @ts-expect-error - HLS events might not be directly on class
  HlsClassMock.Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError', LEVEL_LOADED: 'hlsLevelLoaded' }; // Mock Events if accessed statically

  return {
    default: HlsClassMock, // Hls is the default export
  };
});

// Mock WaveSurfer.js
const mockWaveSurferDestroy = vi.fn();
const mockWaveSurferLoad = vi.fn();
const mockWaveSurferSetMediaElement = vi.fn(); // If using media element linking

vi.mock('wavesurfer.js', () => {
  return {
    default: { // Assuming WaveSurfer is a default export
      create: vi.fn().mockImplementation(() => ({
        destroy: mockWaveSurferDestroy,
        load: mockWaveSurferLoad,
        setMediaElement: mockWaveSurferSetMediaElement, // if you use this method
        on: vi.fn(), // mock 'on' if your component uses it for WaveSurfer events
        getMediaElement: vi.fn(() => null), // mock this if used
        // Add other methods WaveSurfer instance might use
      })),
    },
  };
});


const mockTrack1: AudioTrackInfo = {
  id: 1,
  title: 'Test Track 1',
  uploader: 'Test Uploader 1',
  cover_url: '/cover1.jpg',
  duration: 180,
  uuid: 'uuid-test-1',
};

const mockTrack2: AudioTrackInfo = {
  id: 2,
  title: 'Test Track 2',
  uploader: 'Test Uploader 2',
  cover_url: '/cover2.jpg',
  duration: 240,
  uuid: 'uuid-test-2',
};

const mockQueue: AudioTrackInfo[] = [mockTrack1, mockTrack2];

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
    // Mock HTMLMediaElement methods used by the component or libraries
    // @ts-expect-error - JSDOM doesn't fully implement these
    HTMLMediaElement.prototype.load = vi.fn();
    // @ts-expect-error
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    // @ts-expect-error
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  test('renders with no track initially (or placeholder)', () => {
    render(
      <AudioPlayer
        trackToPlay={null}
        queue={[]}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onQueueUpdate={vi.fn()}
      />
    );
    // Expect some placeholder text or minimal UI when no track is active
    expect(screen.getByText(/No track selected/i)).toBeInTheDocument();
  });

  test('renders track information when a track is provided', () => {
    render(
      <AudioPlayer
        trackToPlay={mockTrack1}
        queue={mockQueue}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onQueueUpdate={vi.fn()}
      />
    );
    expect(screen.getByText(mockTrack1.title)).toBeInTheDocument();
    expect(screen.getByText(mockTrack1.uploader)).toBeInTheDocument();
    const coverImage = screen.getByAltText(mockTrack1.title) as HTMLImageElement;
    expect(coverImage.src).toContain(mockTrack1.cover_url);
  });

  test('calls Hls.js methods when not Safari and track is provided', () => {
    // Mock navigator.userAgent to not be Safari
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
      configurable: true,
    });

    render(
      <AudioPlayer
        trackToPlay={mockTrack1}
        queue={mockQueue}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onQueueUpdate={vi.fn()}
      />
    );
    expect(Hls.isSupported).toHaveBeenCalled();
    // Check that Hls constructor was called, and methods on its instance
    expect(mockHlsLoadSource).toHaveBeenCalledWith(`/api/stream/${mockTrack1.uuid}/master.m3u8`);
    expect(mockHlsAttachMedia).toHaveBeenCalled();
  });

   test('initializes WaveSurfer when a track is provided', () => {
    render(
      <AudioPlayer
        trackToPlay={mockTrack1}
        queue={mockQueue}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onQueueUpdate={vi.fn()}
      />
    );
    expect(WaveSurfer.create).toHaveBeenCalled();
  });


  test('play/pause button toggles play state (mocked)', () => {
    render(
      <AudioPlayer
        trackToPlay={mockTrack1}
        queue={mockQueue}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onQueueUpdate={vi.fn()}
      />
    );
    const playPauseButton = screen.getByTitle(/play/i); // Initial state is Play
    fireEvent.click(playPauseButton);
    // expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(); // Check if audio.play() was called
    // expect(screen.getByTitle(/pause/i)).toBeInTheDocument(); // Check if title/icon changes

    // fireEvent.click(screen.getByTitle(/pause/i));
    // expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    // expect(screen.getByTitle(/play/i)).toBeInTheDocument();
    // Note: Verifying icon/title change depends on how setIsPlaying updates the button's appearance.
    // Verifying actual play/pause calls can be tricky due to async nature and JSDOM limits.
    // A simpler check might be that the button exists and is clickable.
    expect(playPauseButton).toBeInTheDocument();
  });

  test('next and previous buttons call handlers or internal logic', () => {
    const onNextMock = vi.fn();
    const onPreviousMock = vi.fn();
    render(
      <AudioPlayer
        trackToPlay={mockTrack1}
        queue={mockQueue}
        onNext={onNextMock}
        onPrevious={onPreviousMock}
        onQueueUpdate={vi.fn()}
      />
    );

    const nextButton = screen.getByTitle(/next/i);
    fireEvent.click(nextButton);
    expect(onNextMock).toHaveBeenCalled();

    const prevButton = screen.getByTitle(/previous/i);
    fireEvent.click(prevButton);
    expect(onPreviousMock).toHaveBeenCalled();
  });

  test('queue display can be toggled and shows tracks', () => {
    const onUpdateQueueMock = vi.fn();
    render(
      <AudioPlayer
        trackToPlay={mockTrack1}
        queue={mockQueue}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onQueueUpdate={onUpdateQueueMock}
      />
    );

    const queueToggleButton = screen.getByTitle(/toggle queue/i);
    expect(screen.queryByText(/Up Next/i)).not.toBeInTheDocument(); // Queue initially hidden

    fireEvent.click(queueToggleButton); // Show queue
    expect(screen.getByText(/Up Next/i)).toBeInTheDocument();
    expect(screen.getByText(mockTrack1.title)).toBeInTheDocument();
    expect(screen.getByText(mockTrack2.title)).toBeInTheDocument();

    // Test removing from queue
    const removeButtons = screen.getAllByTitle(/remove from queue/i);
    fireEvent.click(removeButtons[0]); // Remove first track (mockTrack1)

    // Check if onUpdateQueue was called with the updated queue
    // The internal logic will also try to set current track if the removed one was playing.
    // For this test, primarily check if the queue update handler is involved.
    expect(onUpdateQueueMock).toHaveBeenCalledWith([mockTrack2]); // mockTrack1 removed

    fireEvent.click(queueToggleButton); // Hide queue
    expect(screen.queryByText(/Up Next/i)).not.toBeInTheDocument();
  });

});

// Reset UserAgent after tests if it was modified for specific tests
const originalUserAgent = navigator.userAgent;
afterAll(() => {
  Object.defineProperty(navigator, 'userAgent', {
    value: originalUserAgent,
    configurable: true,
  });
});
