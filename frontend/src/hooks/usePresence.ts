import { useState, useEffect, useCallback, useRef } from 'react';

const WS_URL = `ws://${window.location.host}/ws`; // Assumes backend is on the same host

interface UserPresence {
  username: string;
  track_id: string | null;
  online: boolean;
}

interface UserPresence {
  username: string;
  track_id: string | null;
  online: boolean;
}

interface PresenceMessage {
  type: 'presence';
  users: UserPresence[];
}

interface ChatMessagePayload {
  id: number;
  sender: string;
  content: string;
  timestamp: string; // ISO string
}

interface ChatMessage {
  type: 'chat'; // Global chat message
  payload: ChatMessagePayload; // target will be null
}

interface DirectMessage {
  type: 'dm'; // DM received by the recipient
  payload: ChatMessagePayload & { from_user: string }; // from_user is the sender, target is recipient (current user)
}

interface DirectMessageReceipt {
  type: 'dm_receipt'; // DM receipt for the sender
  payload: ChatMessagePayload; // sender is current user, target is the recipient
}

interface ErrorMessage {
  type: 'error';
  payload: { message: string };
}

type WebSocketMessage = PresenceMessage | ChatMessage | DirectMessage | DirectMessageReceipt | ErrorMessage;

// Define a structure for storing DMs, keyed by the other user's username
export interface DirectMessagesState {
  [username: string]: ChatMessagePayload[];
}

// Define a structure for unread counts, keyed by username
export interface UnreadCountsState {
  [username: string]: number;
}

import {
  getUnreadCount,
  incrementUnreadCount,
  clearUnreadCount,
  getAllUnreadCounts,
  setUnreadCount
} from '../lib/indexedDb'; // IndexedDB utilities

const usePresence = () => {
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const [globalChatMessages, setGlobalChatMessages] = useState<ChatMessagePayload[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessagesState>({});
  const [unreadCounts, setUnreadCounts] = useState<UnreadCountsState>({});
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const currentUsernameRef = useRef<string | null>(null); // To store current user's name for DM logic
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10; // Max attempts before stopping
  const baseReconnectDelay = 1000; // 1 second

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected.');
      return;
    }

    // Ensure previous socket is closed before creating a new one
    if (socketRef.current) {
        socketRef.current.close();
    }

    console.log('Attempting to connect WebSocket...');
    socketRef.current = new WebSocket(WS_URL);

    socketRef.current.onopen = () => {
      console.log('WebSocket connected.');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
      // Load initial unread counts from IndexedDB
      getAllUnreadCounts().then(counts => setUnreadCounts(counts));
    };

    socketRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage; // Use the union type

        if (message.type === 'presence') {
          const sortedUsers = message.users.sort((a, b) => {
            if (a.online && !b.online) return -1;
            if (!a.online && b.online) return 1;
            return a.username.localeCompare(b.username);
          });
          setOnlineUsers(sortedUsers);
        } else if (message.type === 'chat') { // Global chat message
          setGlobalChatMessages((prevMessages) => {
            if (prevMessages.find(m => m.id === message.payload.id)) return prevMessages;
            const newMessages = [...prevMessages, message.payload];
            newMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return newMessages;
          });
        } else if (message.type === 'dm' || message.type === 'dm_receipt') {
          const dmPayload = message.payload;
          // Determine the other user involved in the DM
          // For 'dm', `from_user` is the sender. For 'dm_receipt', `target` is the other user.
          const otherUser = message.type === 'dm' ? (message.payload as DirectMessage['payload']).from_user : dmPayload.target;

          if (!otherUser) {
            console.error("DM or receipt does not have a valid other user:", message);
            return;
          }

          setDirectMessages(prevDms => {
            const userDms = prevDms[otherUser] || [];
            if (userDms.find(m => m.id === dmPayload.id)) return prevDms; // Avoid duplicates
            const updatedUserDms = [...userDms, dmPayload];
            updatedUserDms.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return { ...prevDms, [otherUser]: updatedUserDms };
          });

          // Handle unread counts and notifications for incoming DMs ('dm' type)
          // Only increment if the message is from another user (not a receipt for self-sent message)
          // and the chat window for this user is not currently active (this check happens in ChatPage.tsx)
          if (message.type === 'dm') {
            const sender = (message.payload as DirectMessage['payload']).from_user;
            // Check if the current user is the recipient
            if (dmPayload.target === currentUsernameRef.current) {
                 // Heuristic: if document is hidden or chat with `sender` is not active, increment unread.
                 // The active chat check will be more robustly handled in ChatPage/DMView.
                if (document.hidden || !isActiveChat(sender)) {
                    incrementUnreadCount(sender).then(newCount => {
                        setUnreadCounts(prev => ({ ...prev, [sender]: newCount }));
                        showNotification(sender, dmPayload.content);
                    });
                } else {
                    // If chat is active, clear unread for this user as they are seeing the message
                    clearUnreadCount(sender).then(() => {
                        setUnreadCounts(prev => ({ ...prev, [sender]: 0 }));
                    });
                }
            }
          }
        } else if (message.type === 'error') {
          // Handle errors, e.g., display a toast notification to the user
          console.error('Received error from server:', message.payload.message);
          // Example: alert(message.payload.message);
        }

      } catch (error) {
        console.error('Error processing message from WebSocket:', error);
      }
    };

    // Placeholder for isActiveChat - this would ideally be passed in or managed by a context
    // For now, this is a simplified version. A more robust solution would involve knowing which DM view is active.
    const isActiveChat = (username: string) => {
        // This is a temporary placeholder. In a real app, you'd check if the chat UI for `username` is currently visible.
        // For example, by checking the current route or a state variable in a chat context.
        // if in a DM view with 'username', return true.
        // This will be refined when ChatPage is updated.
        const currentPath = window.location.pathname;
        return currentPath.includes(`/chat/dm/${username}`) && !document.hidden;
    };


    const showNotification = (sender: string, content: string) => {
        if (Notification.permission === 'granted' && document.hidden) {
            new Notification(`New message from ${sender}`, {
                body: content,
                icon: '/favicon.ico', // Optional: add an icon
            });
        }
    };

    socketRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Error event will usually be followed by a close event
    };

    socketRef.current.onclose = (event) => {
      console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
      setIsConnected(false);
      setOnlineUsers([]); // Clear users on disconnect

      // Reconnect logic with exponential backoff
      // Do not attempt to reconnect if the close code indicates a terminal issue (e.g., auth failure)
      if (event.code === 1008 /* Policy Violation */ || event.code === 1011 /* Server Error that prevents reconnection */) {
        console.error(`WebSocket connection closed with code ${event.code}. Won't attempt to reconnect.`);
        // Potentially redirect to login or show a specific message to the user
        return;
      }

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current -1), 30000); // Max 30s delay
        console.log(`Attempting to reconnect in ${delay / 1000} seconds... (Attempt ${reconnectAttemptsRef.current})`);
        setTimeout(connect, delay);
      } else {
        console.error('Max WebSocket reconnect attempts reached.');
      }
    };
  }, []); // Empty dependency array means this function is created once

  useEffect(() => {
    // Attempt to connect when the hook is first used.
    // Consider if this should be manually triggered or depend on user auth status.
    connect();

    return () => {
      if (socketRef.current) {
        console.log('Closing WebSocket connection due to component unmount or effect cleanup.');
        // Clear onclose handler to prevent reconnect attempts after explicit close
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      // Reset reconnect attempts if component unmounts
      reconnectAttemptsRef.current = 0;
    };
  }, [connect]); // `connect` is stable due to useCallback with empty deps.

  // Function to manually send messages if needed in the future
  // const sendMessage = useCallback((message: string) => {
  //   if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
  //     socketRef.current.send(message);
  //   } else {
  //     console.error('WebSocket is not connected.');
  //   }
  // }, []);

  const sendGlobalChatMessage = useCallback((content: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const message = {
        type: 'chat', // Global chat
        content: content,
      };
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected. Cannot send global chat message.');
    }
  }, []);

  const sendDirectMessage = useCallback((recipient: string, content: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      if (!currentUsernameRef.current) {
        console.error("Current user's username is not set. Cannot send DM.");
        return;
      }
      if (recipient === currentUsernameRef.current) {
        console.warn("Attempting to send DM to self. This should be handled by UI.");
        // UI should prevent this, but as a fallback, do nothing.
        return;
      }
      const message = {
        type: 'dm',
        to: recipient,
        content: content,
      };
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected. Cannot send direct message.');
    }
  }, []); // currentUsernameRef is a ref, doesn't need to be in dependency array

  // Function to prepend older global messages
  const loadOlderGlobalMessages = useCallback((olderMessages: ChatMessagePayload[]) => {
    setGlobalChatMessages(prevMessages => {
      const allMessages = [...olderMessages, ...prevMessages];
      const uniqueMessages = Array.from(new Map(allMessages.map(msg => [msg.id, msg])).values());
      uniqueMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return uniqueMessages;
    });
  }, []);

  // Function to prepend older DMs for a specific user
  const loadOlderDirectMessages = useCallback((username: string, olderMessages: ChatMessagePayload[]) => {
    setDirectMessages(prevDms => {
      const userDms = prevDms[username] || [];
      const allMessages = [...olderMessages, ...userDms];
      const uniqueMessages = Array.from(new Map(allMessages.map(msg => [msg.id, msg])).values());
      uniqueMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { ...prevDms, [username]: uniqueMessages };
    });
  }, []);

  // Function to set the current user's username - typically called from AuthContext
  const setCurrentUser = useCallback((username: string | null) => {
    currentUsernameRef.current = username;
  }, []);

  // Function to manually mark DMs as read for a user
  const markDmsAsRead = useCallback(async (username: string) => {
    await clearUnreadCount(username);
    setUnreadCounts(prev => ({ ...prev, [username]: 0 }));
  }, []);


  return {
    onlineUsers,
    globalChatMessages,
    directMessages,
    unreadCounts,
    isConnected,
    sendGlobalChatMessage,
    sendDirectMessage,
    loadOlderGlobalMessages,
    loadOlderDirectMessages,
    setCurrentUser,
    markDmsAsRead,
    // For notification permission request:
    requestNotificationPermission: () => {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('Notification permission granted.');
                } else {
                    console.log('Notification permission denied.');
                }
            });
        }
    }
  };
};

export default usePresence;
export type { UserPresence, ChatMessagePayload }; // Export types for components
// Ensure this file ends with a newline character for POSIX compliance.
// Ensure this file ends with a newline character for POSIX compliance.
