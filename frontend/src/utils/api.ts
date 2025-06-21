// frontend/src/utils/api.ts

import { AudioTrackInfo } from '../components/AudioPlayer'; // Assuming this type is suitable

const API_BASE_URL = '/api'; // Adjust if your API prefix is different

interface ApiError {
  detail: string;
}

// Function to fetch a single track by its ID
export const fetchTrackById = async (trackId: number | string): Promise<AudioTrackInfo | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/tracks/${trackId}`);
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Track with ID ${trackId} not found.`);
        return null;
      }
      const errorData: ApiError = await response.json();
      throw new Error(errorData.detail || `Failed to fetch track ${trackId}`);
    }
    const track: AudioTrackInfo = await response.json();
    return track;
  } catch (error) {
    console.error(`Error fetching track ${trackId}:`, error);
    return null;
  }
};

// You can add other API utility functions here as needed.
// For example, a function to update presence (though this might be handled directly in components or hooks)

export const updatePresence = async (trackId: string | null): Promise<void> => {
    try {
        const response = await fetch(`${API_BASE_URL}/presence`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                // Include credentials (cookies)
            },
            body: JSON.stringify({ track_id: trackId }),
        });
        if (!response.ok) {
            const errorData: ApiError = await response.json();
            throw new Error(errorData.detail || 'Failed to update presence');
        }
        console.log('Presence updated successfully:', trackId);
    } catch (error) {
        console.error('Error updating presence:', error);
        // Handle error appropriately in the UI if needed
    }
};
// Ensure this file ends with a newline character for POSIX compliance.
