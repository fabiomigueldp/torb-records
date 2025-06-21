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
  type: 'chat';
  payload: ChatMessagePayload;
}

type WebSocketMessage = PresenceMessage | ChatMessage;

const usePresence = () => {
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
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
    };

    socketRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage; // Use the union type
        if (message.type === 'presence') {
          // Sort users: online first, then by username
          const sortedUsers = message.users.sort((a, b) => {
            if (a.online && !b.online) return -1;
            if (!a.online && b.online) return 1;
            return a.username.localeCompare(b.username);
          });
          setOnlineUsers(sortedUsers);
        } else if (message.type === 'chat') {
          setChatMessages((prevMessages) => {
            // Add new message. Consider sorting or limiting the number of messages.
            // For now, just append. Ensure no duplicates by ID if messages could be re-broadcast.
            if (prevMessages.find(m => m.id === message.payload.id)) {
              return prevMessages;
            }
            const newMessages = [...prevMessages, message.payload];
            // Sort by timestamp ascending (oldest first) for display
            newMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            // Optional: Limit the number of stored messages to prevent memory issues
            // const MAX_MESSAGES = 200;
            // if (newMessages.length > MAX_MESSAGES) {
            //   return newMessages.slice(newMessages.length - MAX_MESSAGES);
            // }
            return newMessages;
          });
        }
      } catch (error) {
        console.error('Error processing message from WebSocket:', error);
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

  const sendChatMessage = useCallback((content: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const message = {
        type: 'chat',
        content: content,
      };
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected. Cannot send chat message.');
      // Optionally, queue the message or notify the user
    }
  }, []); // Depends on socketRef, but socketRef.current changes don't trigger re-creation of this callback.

  // Function to prepend older messages, typically fetched via HTTP
  const loadOlderMessages = useCallback((olderMessages: ChatMessagePayload[]) => {
    setChatMessages(prevMessages => {
      const allMessages = [...olderMessages, ...prevMessages];
      // Remove duplicates by ID, keeping the one from prevMessages if conflicts (though unlikely with this flow)
      const uniqueMessages = Array.from(new Map(allMessages.map(msg => [msg.id, msg])).values());
      // Sort by timestamp ascending
      uniqueMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return uniqueMessages;
    });
  }, []);


  return { onlineUsers, chatMessages, isConnected, sendChatMessage, loadOlderMessages };
};

export default usePresence;
export type { UserPresence, ChatMessagePayload }; // Export types for components
// Ensure this file ends with a newline character for POSIX compliance.
