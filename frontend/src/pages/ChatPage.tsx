// frontend/src/pages/ChatPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import usePresence, { ChatMessagePayload } from '../hooks/usePresence'; // Assuming usePresence exports ChatMessagePayload
import { useAuth } from '../contexts/AuthContext'; // To get current user for display comparison
import { parseSimpleMarkdown } from '../utils/markdown'; // Markdown parser
import { api } from '../utils/api'; // API utility for HTTP requests

const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const { chatMessages, sendChatMessage, loadOlderMessages, isConnected } = usePresence();
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const chatDisplayRef = useRef<HTMLDivElement>(null);
  const oldestMessageTimestampRef = useRef<string | null>(null);

  // Function to scroll to the bottom of the chat display
  const scrollToBottom = useCallback(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, []);

  // Initial load of messages & scroll to bottom
  useEffect(() => {
    const fetchInitialMessages = async () => {
      if (!hasMoreHistory || isLoadingHistory) return;
      setIsLoadingHistory(true);
      try {
        const response = await api.get<{ messages: ChatMessagePayload[] }>('/api/chat?limit=50');
        const fetchedMessages = response.data.messages;

        if (fetchedMessages.length > 0) {
          loadOlderMessages(fetchedMessages.reverse()); // API returns newest first, hook expects oldest first for prepending
          oldestMessageTimestampRef.current = fetchedMessages[fetchedMessages.length - 1].timestamp;
        }
        if (fetchedMessages.length < 50) {
          setHasMoreHistory(false);
        }
        // scrollToBottom(); // Scroll after initial load
      } catch (error) {
        console.error('Failed to fetch initial chat messages:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchInitialMessages();
  }, [loadOlderMessages]); // Only run once on mount effectively, as loadOlderMessages is stable

  // Scroll to bottom when new messages arrive from WebSocket
   useEffect(() => {
    if (chatMessages.length > 0) {
        // Heuristic: if the last message is recent, auto-scroll.
        // This avoids auto-scrolling when loading historical messages.
        // A more robust way might involve checking if the user was already scrolled to the bottom.
        const lastMessage = chatMessages[chatMessages.length - 1];
        if (lastMessage && (new Date().getTime() - new Date(lastMessage.timestamp).getTime()) < 2000) { // e.g., message is within last 2s
             scrollToBottom();
        } else if (chatDisplayRef.current && chatDisplayRef.current.scrollHeight - chatDisplayRef.current.scrollTop < chatDisplayRef.current.clientHeight + 100) {
            // If user is close to the bottom, scroll them down.
            scrollToBottom();
        }
    }
  }, [chatMessages, scrollToBottom]);


  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && isConnected) {
      sendChatMessage(newMessage.trim());
      setNewMessage('');
      // scrollToBottom(); // Should be handled by the useEffect above
    } else if (!isConnected) {
      console.warn('Cannot send message: WebSocket not connected.');
      // TODO: Optionally notify user that they are disconnected
    }
  };

  const handleLoadOlder = async () => {
    if (!hasMoreHistory || isLoadingHistory || !oldestMessageTimestampRef.current) return;

    setIsLoadingHistory(true);
    try {
      const response = await api.get<{ messages: ChatMessagePayload[] }>(
        `/api/chat?before=${encodeURIComponent(oldestMessageTimestampRef.current)}&limit=50`
      );
      const fetchedMessages = response.data.messages;

      if (fetchedMessages.length > 0) {
        const currentScrollHeight = chatDisplayRef.current?.scrollHeight;
        const currentScrollTop = chatDisplayRef.current?.scrollTop;

        loadOlderMessages(fetchedMessages.reverse()); // API returns newest first
        oldestMessageTimestampRef.current = fetchedMessages[fetchedMessages.length - 1].timestamp;

        // Restore scroll position after loading older messages
        if (chatDisplayRef.current && currentScrollHeight && currentScrollTop !== undefined) {
            chatDisplayRef.current.scrollTop = currentScrollTop + (chatDisplayRef.current.scrollHeight - currentScrollHeight);
        }

      }
      if (fetchedMessages.length < 50) {
        setHasMoreHistory(false);
      }
    } catch (error) {
      console.error('Failed to fetch older chat messages:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height)-var(--player-height)-2rem)]"> {/* Adjust height based on layout */}
      <h1 className="text-2xl font-bold mb-4 p-4 border-b border-base-300">Global Chat</h1>

      <div ref={chatDisplayRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-base-200">
        {hasMoreHistory && (
          <div className="text-center">
            <button
              onClick={handleLoadOlder}
              className="btn btn-sm btn-outline"
              disabled={isLoadingHistory}
            >
              {isLoadingHistory ? 'Loading...' : 'Load Older Messages'}
            </button>
          </div>
        )}
        {!hasMoreHistory && chatMessages.length > 0 && (
            <p className="text-center text-xs text-base-content/70">--- Beginning of chat history ---</p>
        )}

        {chatMessages.map((msg) => (
          <div key={msg.id} className={`chat ${msg.sender === user?.username ? 'chat-end' : 'chat-start'}`}>
            <div className="chat-header text-xs opacity-70">
              {msg.sender}
              <time className="text-xs opacity-50 ml-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
            <div
              className={`chat-bubble ${msg.sender === user?.username ? 'chat-bubble-primary' : 'chat-bubble-secondary'}`}
              dangerouslySetInnerHTML={{ __html: parseSimpleMarkdown(msg.content) }}
            />
          </div>
        ))}
        {chatMessages.length === 0 && !isLoadingHistory && (
            <p className="text-center text-base-content/70">No messages yet. Say hello!</p>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-base-300">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isConnected ? "Type your message..." : "Connecting to chat..."}
            className="input input-bordered flex-grow"
            disabled={!isConnected || isLoadingHistory}
          />
          <button type="submit" className="btn btn-primary" disabled={!isConnected || isLoadingHistory || !newMessage.trim()}>
            Send
          </button>
        </div>
        {!isConnected && <p className="text-xs text-error mt-1">Disconnected from chat. Attempting to reconnect...</p>}
      </form>
    </div>
  );
};

export default ChatPage;
