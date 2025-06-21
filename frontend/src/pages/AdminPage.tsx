// frontend/src/pages/AdminPage.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  adminFetchUsers, AdminUser, AdminUserCreatePayload, adminCreateUser, adminUpdateUser, adminDeleteUser,
  adminFetchRemovalRequests, RemovalRequest, adminApproveRemovalRequest, adminRejectRemovalRequest
} from '../utils/api';

type AdminSection = "users" | "removals";

// Define the shape of the WebSocket message payload for admin events
interface AdminEventPayload {
  event_type: string;
  request_id: number;
  status: "pending" | "approved" | "rejected";
  track_id: number;
  // Potentially other fields depending on event_type
}

const AdminPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AdminSection>("users");
  const [error, setError] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userFormData, setUserFormData] = useState<Partial<AdminUserCreatePayload>>({ username: '', password: '', is_admin: false });

  // Removals state
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
  const ws = useRef<WebSocket | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setError(null);
      const fetchedUsers = await adminFetchUsers();
      setUsers(fetchedUsers);
    } catch (err) {
      setError((err as Error).message);
      console.error("Failed to fetch users:", err);
    }
  }, []);

  const loadRemovalRequests = useCallback(async () => {
    try {
      setError(null);
      const fetchedRequests = await adminFetchRemovalRequests();
      setRemovalRequests(fetchedRequests);
    } catch (err) {
      setError((err as Error).message);
      console.error("Failed to fetch removal requests:", err);
    }
  }, []);

  useEffect(() => {
    if (activeSection === "users") {
      loadUsers();
    } else if (activeSection === "removals") {
      loadRemovalRequests();
    }
  }, [activeSection, loadUsers, loadRemovalRequests]);

  useEffect(() => {
    // Initialize WebSocket connection
    // Ensure this runs only once or reconnects appropriately
    if (!ws.current && typeof window !== 'undefined') {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

        console.log("Attempting to connect WebSocket to:", wsUrl);
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            console.log("WebSocket connected to AdminPage");
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data as string);
                console.log("WebSocket message received:", message);

                if (message.type === "admin_event" && message.payload) {
                    const payload = message.payload as AdminEventPayload;
                    if (payload.event_type === "removal_request_updated") {
                        console.log("Removal request updated event received, refreshing list:", payload);
                        // Option 1: Simple refresh
                        loadRemovalRequests();

                        // Option 2: More granular update (if payload contains full updated item)
                        // setRemovalRequests(prevRequests =>
                        //   prevRequests.map(req =>
                        //     req.id === payload.request_id ? { ...req, status: payload.status, ...payload.updated_data } : req
                        //   )
                        // );
                    }
                }
            } catch (e) {
                console.error("Error processing WebSocket message:", e);
            }
        };

        ws.current.onerror = (error) => {
            console.error("WebSocket error in AdminPage:", error);
            setError("WebSocket connection error. Real-time updates may not work.");
        };

        ws.current.onclose = () => {
            console.log("WebSocket disconnected from AdminPage");
            // Optionally attempt to reconnect here or notify user
        };
    }

    // Cleanup WebSocket connection on component unmount
    return () => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log("Closing WebSocket connection from AdminPage");
            ws.current.close();
        }
        ws.current = null; // Ensure it's reset for potential re-renders/re-mounts
    };
  }, [loadRemovalRequests]); // Empty dependency array ensures this runs once on mount and cleans up on unmount

  // User Modal Handlers
  const handleOpenUserModal = (user?: AdminUser) => {
    if (user) {
      setEditingUser(user);
      setUserFormData({ username: user.username, is_admin: user.is_admin, password: '' }); // Don't prefill password
    } else {
      setEditingUser(null);
      setUserFormData({ username: '', password: '', is_admin: false });
    }
    setShowUserModal(true);
    setError(null);
  };

  const handleCloseUserModal = () => {
    setShowUserModal(false);
    setEditingUser(null);
    setError(null);
  };

  const handleUserFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setUserFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleUserFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingUser) {
        // Prepare payload: only send password if it's being changed
        const payload: Partial<AdminUserCreatePayload> = { is_admin: userFormData.is_admin };
        if (userFormData.password) {
          payload.password = userFormData.password;
        }
        await adminUpdateUser(editingUser.username, payload);
      } else {
        if (!userFormData.username || !userFormData.password) {
          setError("Username and password are required for new users.");
          return;
        }
        await adminCreateUser(userFormData as AdminUserCreatePayload);
      }
      loadUsers();
      handleCloseUserModal();
    } catch (err) {
      setError((err as Error).message);
      console.error("Failed to save user:", err);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (window.confirm(`Are you sure you want to delete user ${username}?`)) {
      try {
        setError(null);
        await adminDeleteUser(username);
        loadUsers();
      } catch (err) {
        setError((err as Error).message);
        console.error("Failed to delete user:", err);
      }
    }
  };

  // Removal Request Handlers
  const handleApproveRequest = async (requestId: number) => {
    if (window.confirm("Are you sure you want to approve this removal request? This will delete the track and associated files.")) {
      try {
        setError(null);
        await adminApproveRemovalRequest(requestId);
        loadRemovalRequests(); // Refresh list
        // TODO: Implement WebSocket update for real-time
      } catch (err) {
        setError((err as Error).message);
        console.error("Failed to approve request:", err);
      }
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    if (window.confirm("Are you sure you want to reject this removal request?")) {
      try {
        setError(null);
        await adminRejectRemovalRequest(requestId);
        loadRemovalRequests(); // Refresh list
        // TODO: Implement WebSocket update for real-time
      } catch (err) {
        setError((err as Error).message);
        console.error("Failed to reject request:", err);
      }
    }
  };


  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>

      {error && <div className="alert alert-error shadow-lg mb-4"><div><span>Error: {error}</span></div></div>}

      <div role="tablist" className="tabs tabs-lifted">
        <button
          role="tab"
          className={`tab ${activeSection === 'users' ? 'tab-active' : ''}`}
          onClick={() => setActiveSection('users')}
        >
          Users
        </button>
        <button
          role="tab"
          className={`tab ${activeSection === 'removals' ? 'tab-active' : ''}`}
          onClick={() => setActiveSection('removals')}
        >
          Removal Requests
        </button>
      </div>

      {/* Users Section */}
      {activeSection === 'users' && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">User Management</h2>
            <button className="btn btn-primary" onClick={() => handleOpenUserModal()}>Add User</button>
          </div>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Admin</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.username}>
                    <td>{user.username}</td>
                    <td>{user.is_admin ? 'Yes' : 'No'}</td>
                    <td>
                      <button className="btn btn-sm btn-outline mr-2" onClick={() => handleOpenUserModal(user)}>Edit</button>
                      <button className="btn btn-sm btn-outline btn-error" onClick={() => handleDeleteUser(user.username)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">{editingUser ? 'Edit User' : 'Add New User'}</h3>
            <form onSubmit={handleUserFormSubmit}>
              <div className="form-control mt-4">
                <label className="label"><span className="label-text">Username</span></label>
                <input
                  type="text"
                  name="username"
                  value={userFormData.username || ''}
                  onChange={handleUserFormChange}
                  className="input input-bordered"
                  disabled={!!editingUser}
                  required={!editingUser}
                />
              </div>
              <div className="form-control mt-4">
                <label className="label"><span className="label-text">Password</span></label>
                <input
                  type="password"
                  name="password"
                  value={userFormData.password || ''}
                  onChange={handleUserFormChange}
                  className="input input-bordered"
                  placeholder={editingUser ? "Leave blank to keep current password" : ""}
                  required={!editingUser}
                />
              </div>
              <div className="form-control mt-4">
                <label className="cursor-pointer label">
                  <span className="label-text">Is Admin?</span>
                  <input
                    type="checkbox"
                    name="is_admin"
                    checked={userFormData.is_admin || false}
                    onChange={handleUserFormChange}
                    className="checkbox checkbox-primary"
                  />
                </label>
              </div>
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              <div className="modal-action mt-6">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn" onClick={handleCloseUserModal}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Removals Section */}
      {activeSection === 'removals' && (
        <div className="mt-6">
          <h2 className="text-2xl font-semibold mb-4">Track Removal Requests</h2>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Track Title</th>
                  <th>Track Uploader</th>
                  <th>Requester</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Requested At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {removalRequests.map(req => (
                  <tr key={req.id}>
                    <td>{req.id}</td>
                    <td>{req.track_title || 'N/A'}</td>
                    <td>{req.track_uploader || 'N/A'}</td>
                    <td>{req.requester}</td>
                    <td>{req.reason}</td>
                    <td><span className={`badge ${req.status === 'pending' ? 'badge-warning' : req.status === 'approved' ? 'badge-success' : 'badge-error'}`}>{req.status}</span></td>
                    <td>{new Date(req.created_at).toLocaleString()}</td>
                    <td>
                      {req.status === 'pending' && (
                        <>
                          <button className="btn btn-sm btn-success mr-2" onClick={() => handleApproveRequest(req.id)}>Approve</button>
                          <button className="btn btn-sm btn-error" onClick={() => handleRejectRequest(req.id)}>Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {removalRequests.length === 0 && (
                    <tr><td colSpan={8} className="text-center">No removal requests found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
// Ensure this file ends with a newline character for POSIX compliance.
