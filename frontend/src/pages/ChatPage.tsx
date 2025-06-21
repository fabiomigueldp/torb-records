// frontend/src/pages/ChatPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import usePresence, { ChatMessagePayload } from '../hooks/usePresence';
import { useAuth } from '../contexts/AuthContext';
import { parseSimpleMarkdown } from '../utils/markdown';
import { api } from '../utils/api';

type ChatMode = 'global' | 'dm';

const ChatPage: React.FC = () => {
  const { '*': dmUsername } = useParams<{ '*': string }>(); // Gets username for DM route e.g. /chat/dm/otheruser
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    globalChatMessages,
    directMessages,
    sendGlobalChatMessage,
    sendDirectMessage,
    loadOlderGlobalMessages,
    loadOlderDirectMessages,
    markDmsAsRead,
    isConnected,
  } = usePresence();

  const chatMode: ChatMode = dmUsername ? 'dm' : 'global';
  const currentChatPartner = chatMode === 'dm' ? dmUsername : null;

  const [newMessage, setNewMessage] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const chatDisplayRef = useRef<HTMLDivElement>(null);
  // Store oldest message timestamp for the *current* chat view (global or specific DM)
  const oldestMessageTimestampRef = useRef<string | null>(null);


  const messagesToDisplay: ChatMessagePayload[] = chatMode === 'global'
    ? globalChatMessages
    : (currentChatPartner ? directMessages[currentChatPartner] || [] : []);


  const scrollToBottom = useCallback((force: boolean = false) => {
    if (chatDisplayRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = chatDisplayRef.current;
        // If user is near the bottom or force scroll (e.g. on new self-sent message)
        if (force || scrollHeight - scrollTop <= clientHeight + 150) { // 150px threshold
            chatDisplayRef.current.scrollTop = scrollHeight;
        }
    }
  }, []);

  // Effect for loading initial messages and marking DMs as read
  useEffect(() => {
    setHasMoreHistory(true); // Reset for when chatMode changes
    oldestMessageTimestampRef.current = null; // Reset timestamp

    const fetchInitialMessages = async () => {
      if (!user) return;
      setIsLoadingHistory(true);
      try {
        let fetchedMessages: ChatMessagePayload[] = [];
        if (chatMode === 'global') {
          const response = await api.get<{ messages: ChatMessagePayload[] }>('/api/chat?limit=50');
          fetchedMessages = response.data.messages;
          if (fetchedMessages.length > 0) {
            loadOlderGlobalMessages(fetchedMessages.slice().reverse()); // API returns newest first
            oldestMessageTimestampRef.current = fetchedMessages[fetchedMessages.length - 1].timestamp;
          }
        } else if (currentChatPartner) {
          const response = await api.get<{ messages: ChatMessagePayload[] }>(`/api/chat/dm/${currentChatPartner}?limit=50`);
          fetchedMessages = response.data.messages;
          if (fetchedMessages.length > 0) {
            loadOlderDirectMessages(currentChatPartner, fetchedMessages.slice().reverse());
            oldestMessageTimestampRef.current = fetchedMessages[fetchedMessages.length - 1].timestamp;
          }
          markDmsAsRead(currentChatPartner); // Mark as read when DM chat is opened
        }

        if (fetchedMessages.length < 50) {
          setHasMoreHistory(false);
        }
        // scrollToBottom(true); // Scroll to bottom after initial load
      } catch (error) {
        console.error(`Failed to fetch initial ${chatMode} messages:`, error);
        setHasMoreHistory(false); // Avoid repeated failed attempts
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchInitialMessages();

    // Cleanup for marking DMs when component unmounts or chat partner changes
    return () => {
      if (chatMode === 'dm' && currentChatPartner) {
        markDmsAsRead(currentChatPartner);
      }
    };
  }, [
    chatMode,
    currentChatPartner,
    user,
    loadOlderGlobalMessages,
    loadOlderDirectMessages,
    markDmsAsRead
  ]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    // Only auto-scroll if the new message is recent or user is already near bottom
    if (messagesToDisplay.length > 0) {
        const lastMessage = messagesToDisplay[messagesToDisplay.length - 1];
        if (lastMessage) {
            const isRecent = (new Date().getTime() - new Date(lastMessage.timestamp).getTime()) < 3000; // 3 seconds
            const isSelfSent = lastMessage.sender === user?.username;
            if (isRecent || isSelfSent) {
                 scrollToBottom(isSelfSent); // Force scroll if self-sent
            } else {
                scrollToBottom(false); // Scroll only if near bottom
            }
        }
    }
  }, [messagesToDisplay, user?.username, scrollToBottom]);


  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && isConnected && user) {
      if (chatMode === 'global') {
        sendGlobalChatMessage(newMessage.trim());
      } else if (currentChatPartner) {
        sendDirectMessage(currentChatPartner, newMessage.trim());
      }
      setNewMessage('');
      // scrollToBottom(true); // Force scroll to bottom after sending a message
    } else if (!isConnected) {
      console.warn('Cannot send message: WebSocket not connected.');
    }
  };

  const handleLoadOlder = async () => {
    if (!hasMoreHistory || isLoadingHistory || !oldestMessageTimestampRef.current || !user) return;

    setIsLoadingHistory(true);
    try {
      let fetchedMessages: ChatMessagePayload[] = [];
      const url = chatMode === 'global'
        ? `/api/chat?before=${encodeURIComponent(oldestMessageTimestampRef.current)}&limit=50`
        : `/api/chat/dm/${currentChatPartner}?before=${encodeURIComponent(oldestMessageTimestampRef.current)}&limit=50`;

      const response = await api.get<{ messages: ChatMessagePayload[] }>(url);
      fetchedMessages = response.data.messages;

      if (fetchedMessages.length > 0) {
        const currentScrollHeight = chatDisplayRef.current?.scrollHeight;
        const currentScrollTop = chatDisplayRef.current?.scrollTop;

        if (chatMode === 'global') {
          loadOlderGlobalMessages(fetchedMessages.slice().reverse());
        } else if (currentChatPartner) {
          loadOlderDirectMessages(currentChatPartner, fetchedMessages.slice().reverse());
        }
        oldestMessageTimestampRef.current = fetchedMessages[fetchedMessages.length - 1].timestamp;

        if (chatDisplayRef.current && currentScrollHeight && currentScrollTop !== undefined) {
          chatDisplayRef.current.scrollTop = currentScrollTop + (chatDisplayRef.current.scrollHeight - currentScrollHeight);
        }
      }
      if (fetchedMessages.length < 50) {
        setHasMoreHistory(false);
      }
    } catch (error) {
      console.error(`Failed to fetch older ${chatMode} messages:`, error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const pageTitle = chatMode === 'global' ? "Global Chat" : `Chat with ${currentChatPartner}`;

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height)-var(--player-height)-2rem)]">
      <div className="p-4 border-b border-base-300">
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            {chatMode === 'dm' && (
                <Link to="/chat" className="btn btn-sm btn-outline">Back to Global Chat</Link>
            )}
        </div>
      </div>

      <div ref={chatDisplayRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-base-200">
        {hasMoreHistory && (
          <div className="text-center">
            <button onClick={handleLoadOlder} className="btn btn-sm btn-outline" disabled={isLoadingHistory}>
              {isLoadingHistory ? 'Loading...' : 'Load Older Messages'}
            </button>
          </div>
        )}
        {!hasMoreHistory && messagesToDisplay.length > 0 && (
          <p className="text-center text-xs text-base-content/70">--- Beginning of chat history ---</p>
        )}

        {messagesToDisplay.map((msg) => (
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
        {messagesToDisplay.length === 0 && !isLoadingHistory && (
          <p className="text-center text-base-content/70">
            {chatMode === 'global' ? "No global messages yet. Say hello!" : `No messages with ${currentChatPartner} yet. Start the conversation!`}
          </p>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-base-300">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isConnected ? `Message ${chatMode === 'dm' && currentChatPartner ? currentChatPartner : 'everyone'}...` : "Connecting to chat..."}
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
