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

// Admin User Management Types
export interface AdminUser {
  username: string;
  is_admin: boolean;
}

export interface AdminUserCreatePayload {
  username: string;
  password?: string; // Optional on update, required on create
  is_admin: boolean;
}


// Admin Removal Request Types
export interface TrackInfo { // Simplified, expand as needed
    id: number;
    title: string;
    uploader: string;
}
export interface RemovalRequest {
    id: number;
    track_id: number;
    requester: string;
    reason?: string;
    status: "pending" | "approved" | "rejected";
    created_at: string; // ISO date string
    track_title?: string;
    track_uploader?: string;
}


// Helper function for handling API responses
async function handleApiResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `HTTP error ${response.status}`);
    }
    return response.json() as Promise<T>;
}


// --- Admin: User Management ---
export const adminFetchUsers = async (): Promise<AdminUser[]> => {
    const response = await fetch(`${API_BASE_URL}/admin/users`);
    return handleApiResponse<AdminUser[]>(response);
};

export const adminCreateUser = async (userData: AdminUserCreatePayload): Promise<AdminUser> => {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
    });
    return handleApiResponse<AdminUser>(response);
};

export const adminUpdateUser = async (username: string, userData: Partial<AdminUserCreatePayload>): Promise<AdminUser> => {
    const response = await fetch(`${API_BASE_URL}/admin/users/${username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
    });
    return handleApiResponse<AdminUser>(response);
};

export const adminDeleteUser = async (username: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/admin/users/${username}`, {
        method: 'DELETE',
    });
    if (!response.ok) { // No JSON body for 204, so handle manually
        const errorData: ApiError = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `HTTP error ${response.status}`);
    }
    // No content expected on success (204)
};


// --- Admin: Removal Requests ---
export const adminFetchRemovalRequests = async (): Promise<RemovalRequest[]> => {
    const response = await fetch(`${API_BASE_URL}/admin/removal_requests`);
    return handleApiResponse<RemovalRequest[]>(response);
};

export const adminApproveRemovalRequest = async (requestId: number): Promise<RemovalRequest> => {
    const response = await fetch(`${API_BASE_URL}/admin/removal_requests/${requestId}/approve`, {
        method: 'POST',
    });
    return handleApiResponse<RemovalRequest>(response);
};

export const adminRejectRemovalRequest = async (requestId: number): Promise<RemovalRequest> => {
    const response = await fetch(`${API_BASE_URL}/admin/removal_requests/${requestId}/reject`, {
        method: 'POST',
    });
    return handleApiResponse<RemovalRequest>(response);
};

// --- User: Submit Removal Request ---
export interface UserSubmitRemovalRequestPayload {
    reason: string;
}
export const userSubmitRemovalRequest = async (trackId: number, payload: UserSubmitRemovalRequestPayload): Promise<RemovalRequest> => {
    const response = await fetch(`${API_BASE_URL}/tracks/${trackId}/removal_request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleApiResponse<RemovalRequest>(response);
};

// Ensure this file ends with a newline character for POSIX compliance.
