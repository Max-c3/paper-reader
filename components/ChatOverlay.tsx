'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  highlightedText: string;
  conversationId?: string;
  initialMessages?: Message[];
  onSendMessage: (message: string, onStreamChunk: (text: string) => void) => Promise<void>;
  onStreamingComplete?: (conversationId: string) => void;
  focusTrigger?: number;
  initialPrompt?: string | null;
  onInitialPromptSent?: () => void;
}

export default function ChatOverlay({
  isOpen,
  onClose,
  highlightedText,
  conversationId,
  initialMessages = [],
  onSendMessage,
  onStreamingComplete,
  focusTrigger,
  initialPrompt,
  onInitialPromptSent,
}: ChatOverlayProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevConversationIdRef = useRef<string | undefined>(conversationId);
  const hasUnsavedMessagesRef = useRef(false);
  const messagesRef = useRef(messages);
  const initialPromptSentRef = useRef(false);
  const handleSendRef = useRef<((messageOverride?: string) => Promise<void>) | null>(null);
  
  // Scroll tracking for preventing auto-scroll when user is reading previous messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [showNewMessageButton, setShowNewMessageButton] = useState(false);
  const wasStreamingRef = useRef(false);
  const newMessageStartRef = useRef<HTMLDivElement>(null);

  // Keep messagesRef in sync with messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);


  useEffect(() => {
    // Only reset messages if conversation ID changed (new conversation)
    // Don't reset if we're streaming or if we have unsaved messages (messages without IDs)
    const conversationChanged = prevConversationIdRef.current !== conversationId;
    const currentMessages = messagesRef.current;
    const hasUnsavedMessages = currentMessages.some(m => !m.id);
    
    // Check if initialMessages has a complete conversation (has messages with IDs)
    const initialMessagesHasCompleteConversation = initialMessages.length > 0 && 
      initialMessages.every(m => m.id);
    
    // Don't reset if we're streaming or have unsaved messages
    if (conversationChanged) {
      if (!isStreaming && !hasUnsavedMessages) {
        // Clean reset for new conversation
        setMessages(initialMessages);
        prevConversationIdRef.current = conversationId;
        hasUnsavedMessagesRef.current = false;
        initialPromptSentRef.current = false; // Reset when conversation changes
      } else if (initialMessagesHasCompleteConversation && !isStreaming) {
        // InitialMessages has complete conversation with IDs, use it directly (no duplicates)
        setMessages(initialMessages);
        prevConversationIdRef.current = conversationId;
        hasUnsavedMessagesRef.current = false;
        initialPromptSentRef.current = false; // Reset when conversation changes
      } else if (isStreaming && !initialMessagesHasCompleteConversation) {
        // We're streaming but initialMessages doesn't have the conversation yet
        // Keep current messages (they have the user message and streaming assistant message)
        prevConversationIdRef.current = conversationId;
      }
    } else if (currentMessages.length === 0 && initialMessages.length > 0 && !isStreaming) {
      // Starting fresh with initial messages
      setMessages(initialMessages);
      initialPromptSentRef.current = false; // Reset when starting fresh
    } else if (!conversationChanged && initialMessagesHasCompleteConversation && !isStreaming) {
      // InitialMessages updated with complete conversation (all messages have IDs)
      // Use it to avoid duplicates, especially after first message is saved
      if (currentMessages.some(m => !m.id) || initialMessages.length >= currentMessages.length) {
        setMessages(initialMessages);
      }
    }
  }, [initialMessages, conversationId, isStreaming]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Focus input when panel opens or when focusTrigger changes (blueberry/highlight clicked)
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, focusTrigger]);

  // Auto-send initial prompt when chat opens
  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt.trim() && !isStreaming && messages.length === 0 && !initialPromptSentRef.current) {
      // Reset the flag when initialPrompt changes
      initialPromptSentRef.current = false;
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt.trim() && !isStreaming && messages.length === 0 && !initialPromptSentRef.current) {
      // Use a small delay to ensure the component is fully mounted and handleSend is defined
      const timer = setTimeout(() => {
        if (handleSendRef.current && !initialPromptSentRef.current) {
          handleSendRef.current(initialPrompt.trim());
          initialPromptSentRef.current = true;
          onInitialPromptSent?.();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialPrompt, isStreaming, messages.length, onInitialPromptSent]);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Track when streaming ends to show the new message button
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      // Streaming just ended
      if (isUserScrolledUp) {
        setShowNewMessageButton(true);
      }
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, isUserScrolledUp]);

  // Handle scroll events to detect if user is scrolled up
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    
    setIsUserScrolledUp(!isAtBottom);
    
    // Hide new message button when user scrolls to bottom
    if (isAtBottom) {
      setShowNewMessageButton(false);
    }
  };

  // Auto-scroll only when user is not scrolled up
  useEffect(() => {
    if (!isUserScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUserScrolledUp]);

  // Scroll to the start of the new message when button is clicked
  const handleNewMessageClick = () => {
    // Find the last assistant message and scroll to show it from the top
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const assistantMessages = container.querySelectorAll('[data-role="assistant"]');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      if (lastAssistantMessage) {
        lastAssistantMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    setShowNewMessageButton(false);
  };

  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride || input.trim();
    if (!messageToSend || isStreaming) return;

    const userMessage: Message = { role: 'user', content: messageToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    hasUnsavedMessagesRef.current = true;
    
    // Mark initial prompt as sent if this was an auto-send
    if (messageOverride) {
      initialPromptSentRef.current = true;
    }

    // Add placeholder for streaming response
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    // Callback to update streaming message
    const onStreamChunk = (text: string) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + text,
          };
        }
        return newMessages;
      });
    };

    try {
      await onSendMessage(messageToSend, onStreamChunk);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Sorry, an error occurred. Please try again.';
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          role: 'assistant',
          content: errorMessage,
        };
        return newMessages;
      });
    } finally {
      setIsStreaming(false);
      // After streaming completes, mark messages as saved (they'll have IDs after reload)
      hasUnsavedMessagesRef.current = false;
    }
  };

  // Keep handleSendRef in sync with handleSend
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter allows new line (default textarea behavior)
  };

  // Auto-adjust textarea height based on content
  const adjustTextareaHeight = () => {
    if (!inputRef.current) return;
    
    const textarea = inputRef.current;
    const minHeight = 44; // Single line height
    
    // If empty, force single line
    if (!input.trim()) {
      textarea.style.height = `${minHeight}px`;
      return;
    }
    
    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate line height (approx 20px per line)
    const lineHeight = 20;
    const maxLines = 9;
    const maxHeight = lineHeight * maxLines;
    
    // Set height to scrollHeight but cap at maxHeight, with minimum of single line
    const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = `${newHeight}px`;
  };

  // Adjust height whenever input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  return (
    <div 
      className={`h-full flex flex-col bg-gradient-to-b from-slate-50 to-white rounded-2xl shadow-xl border border-slate-200/60 overflow-hidden transition-all duration-300 ease-out ${
        isOpen ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <h2 className="text-base font-medium tracking-tight">helping you understand</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Highlighted text context */}
      <div className="px-5 py-4 bg-amber-50/80 border-b border-amber-100">
        <p className="text-xs uppercase tracking-wider text-amber-700/70 font-medium mb-2">Selected passage</p>
        <p className="text-sm text-slate-700 leading-relaxed line-clamp-3 italic">
          &quot;{highlightedText.substring(0, 200)}{highlightedText.length > 200 ? '...' : ''}&quot;
        </p>
      </div>

      {/* Messages wrapper */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4 chat-scrollbar relative"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">
              Ask a question about the highlighted text to get started.
            </p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            data-role={msg.role}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-slate-800 text-white rounded-br-md'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-sm rounded-bl-md'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      ul: ({ children }) => <ul className="list-disc list-outside mb-2 space-y-1 pl-6">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-outside mb-2 space-y-1 pl-6">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      code: ({ children }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>,
                      pre: ({ children }) => <pre className="bg-slate-100 p-3 rounded-lg overflow-x-auto mb-2 text-sm">{children}</pre>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-700 border border-slate-200 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className="text-sm text-slate-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      </div>

      {/* New message indicator button - positioned above the input */}
      {showNewMessageButton && (
        <div className="flex justify-center py-2">
          <button
            onClick={handleNewMessageClick}
            className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center opacity-50 hover:opacity-80 transition-opacity shadow-lg"
            aria-label="Scroll to new message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-100 bg-white/80 backdrop-blur">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={1}
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all placeholder:text-slate-400 resize-none overflow-y-auto leading-5"
            style={{ minHeight: '44px', maxHeight: '180px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="px-5 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all text-sm font-medium"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

