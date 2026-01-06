'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SelectionPopup from '@/components/SelectionPopup';
import ChatPanel from '@/components/ChatOverlay';

// Import polyfill
import '@/lib/polyfills';

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(() => import('@/components/PDFViewer'), {
  ssr: false,
  loading: () => <div className="p-8 text-center">Loading PDF viewer...</div>,
});

interface PDF {
  id: string;
  title?: string;
  filename: string;
  filepath: string;
  uploadedAt: string;
}

interface Highlight {
  id: string;
  pdfId: string;
  pageNumber: number;
  selectionRanges: string;
  selectedText: string;
  conversation?: {
    id: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
    }>;
  };
}

export default function Home() {
  const router = useRouter();
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<PDF | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [selectionRanges, setSelectionRanges] = useState<any>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [showPopup, setShowPopup] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [currentHighlightId, setCurrentHighlightId] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHighlights, setIsLoadingHighlights] = useState(false);
  
  // Pending highlight (not yet saved to DB - will be saved on first LLM call)
  const [pendingHighlight, setPendingHighlight] = useState<{
    pdfId: string;
    pageNumber: number;
    selectionRanges: any;
    selectedText: string;
  } | null>(null);
  
  // Deleted highlight for undo functionality
  const [deletedHighlight, setDeletedHighlight] = useState<Highlight | null>(null);
  
  // Focus trigger for chat input (incremented when user clicks blueberry or highlight)
  const [chatFocusTrigger, setChatFocusTrigger] = useState(0);
  
  // Committed highlighted text shown in chat (only updates when blueberry/highlight is clicked)
  const [chatHighlightedText, setChatHighlightedText] = useState('');
  
  // Initial prompt to auto-send when chat opens
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  
  // Split panel state
  const [splitRatio, setSplitRatio] = useState(60); // PDF takes 60% by default
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for keyboard shortcuts
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const selectPdfRef = useRef<HTMLSelectElement>(null);
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load PDFs on mount
  useEffect(() => {
    fetchPDFs();
  }, []);

  // Preload highlights when PDF is selected
  useEffect(() => {
    if (selectedPdf) {
      preloadHighlights(selectedPdf.id);
    }
  }, [selectedPdf]);

  const fetchPDFs = async () => {
    setError(null);
    try {
      const res = await fetch('/api/pdfs');
      if (!res.ok) {
        throw new Error('Failed to fetch PDFs');
      }
      const data = await res.json();
      setPdfs(data.pdfs || []);
    } catch (error) {
      console.error('Error fetching PDFs:', error);
      setError('Failed to load PDFs. Please refresh the page.');
    }
  };

  // Preload all highlights, conversations, and messages for instant access
  const preloadHighlights = async (pdfId: string) => {
    setIsLoadingHighlights(true);
    setError(null);
    try {
      const res = await fetch(`/api/highlights?pdfId=${pdfId}`);
      if (!res.ok) {
        throw new Error('Failed to load highlights');
      }
      const data = await res.json();
      setHighlights(data.highlights || []);
    } catch (error) {
      console.error('Error preloading highlights:', error);
      setError('Failed to load highlights. Please try refreshing.');
    } finally {
      setIsLoadingHighlights(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    setError(null);
    try {
      const res = await fetch('/api/pdfs', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setPdfs((prev) => [data.pdf, ...prev]);
        setSelectedPdf(data.pdf);
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload PDF');
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
      setError(error instanceof Error ? error.message : 'Error uploading PDF');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleTextSelect = useCallback((text: string, ranges: any) => {
    if (text.trim()) {
      setSelectedText(text);
      setSelectionRanges(ranges);
      // Position popup with its CENTER exactly above the rightmost pixel of the selection
      // Button is 90px wide, so left edge = viewportEndX - (buttonWidth / 2) to center it
      // Button is 90px tall, bottom should be 8px above selection top
      const buttonSize = 90;
      const gap = 3;
      setPopupPosition({ 
        x: ranges.viewportEndX - (buttonSize / 2),  // Center horizontally on right edge
        y: ranges.viewportStartY - buttonSize - gap  // 8px gap above selection
      });
      setShowPopup(true);
    } else {
      setShowPopup(false);
    }
  }, []);

  const handleQueryClick = useCallback(async () => {
    if (!selectedText || !selectedPdf || !selectionRanges) return;

    setShowPopup(false);

    // Check if highlight already exists (for instant access)
    const existingHighlight = highlights.find(
      (h) =>
        h.selectedText === selectedText &&
        h.pageNumber === selectionRanges.page
    );

    if (existingHighlight) {
      // Use existing highlight
      setCurrentHighlightId(existingHighlight.id);
      setCurrentConversationId(existingHighlight.conversation?.id || null);
      setPendingHighlight(null);
    } else {
      // Store as pending - will only save to DB when first LLM call happens
      // Capture the EXACT selection ranges at this moment (not recalculated later)
      setPendingHighlight({
        pdfId: selectedPdf.id,
        pageNumber: selectionRanges.page,
        selectionRanges: { ...selectionRanges }, // Clone to prevent any mutation
        selectedText,
      });
      setCurrentHighlightId(null);
      setCurrentConversationId(null);
    }

    // Clear native browser selection - we now rely on our overlay for visual feedback
    // This prevents the highlight from disappearing when focus changes to the chat input
    window.getSelection()?.removeAllRanges();

    setChatHighlightedText(selectedText); // Commit the highlighted text to show in chat
    setShowChat(true);
    setChatFocusTrigger(prev => prev + 1); // Trigger focus on chat input
  }, [selectedText, selectedPdf, selectionRanges, highlights]);

  const handleHighlightClick = useCallback((highlightId: string) => {
    // Instant access from preloaded data
    const highlight = highlights.find((h) => h.id === highlightId);
    if (!highlight) return;

    setSelectedText(highlight.selectedText);
    setChatHighlightedText(highlight.selectedText); // Commit the highlighted text to show in chat
    setCurrentHighlightId(highlightId);
    setCurrentConversationId(highlight.conversation?.id || null);
    setPendingHighlight(null); // Clear any pending highlight when clicking an existing one
    setShowChat(true);
    setChatFocusTrigger(prev => prev + 1); // Trigger focus on chat input
  }, [highlights]);

  const handleHighlightDelete = useCallback(async (highlightId: string) => {
    try {
      const res = await fetch(`/api/highlights?id=${highlightId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json();
        // Store deleted highlight for undo
        setDeletedHighlight(data.deleted);
        // Remove from local state
        setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
        // Close chat if this highlight was open
        if (currentHighlightId === highlightId) {
          setShowChat(false);
          setCurrentHighlightId(null);
          setCurrentConversationId(null);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete highlight');
      }
    } catch (error) {
      console.error('Error deleting highlight:', error);
      setError(error instanceof Error ? error.message : 'Error deleting highlight');
    }
  }, [currentHighlightId]);

  const handleUndoDelete = useCallback(async () => {
    if (!deletedHighlight) return;

    try {
      const res = await fetch('/api/highlights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlight: deletedHighlight }),
      });

      if (res.ok) {
        const data = await res.json();
        // Add restored highlight back to local state
        setHighlights((prev) => [...prev, data.highlight]);
        // Clear deleted highlight
        setDeletedHighlight(null);
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to restore highlight');
      }
    } catch (error) {
      console.error('Error restoring highlight:', error);
      setError(error instanceof Error ? error.message : 'Error restoring highlight');
    }
  }, [deletedHighlight]);

  // Keyboard shortcut for undo (Cmd+Z / Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'z' && deletedHighlight) {
        e.preventDefault();
        handleUndoDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deletedHighlight, handleUndoDelete]);

  // "f" key to toggle fullscreen (only when not in a text field)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      
      if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keyboard shortcuts: "?" (settings), "u" (upload), "s" (select PDF) - always active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // "?" key: open settings
      if (e.key === '?') {
        e.preventDefault();
        router.push('/settings');
      }
      // "u" key: click upload button
      else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        uploadInputRef.current?.click();
      }
      // "s" key: click select PDF dropdown
      else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        // Check if select exists and has PDFs
        if (selectPdfRef.current && pdfs.length > 0) {
          const select = selectPdfRef.current;
          // Scroll into view if needed
          select.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus first
          select.focus();
          // Then click to open dropdown - use setTimeout to ensure focus completes
          setTimeout(() => {
            // Try multiple approaches to ensure dropdown opens
            select.click();
            // Also dispatch a mousedown event
            const mouseEvent = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            select.dispatchEvent(mouseEvent);
          }, 50);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, pdfs.length]);

  // Keyboard shortcuts for selection popup (Space and 1-5)
  useEffect(() => {
    if (!showPopup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Space key: open chat (same as clicking blueberry)
      if (e.key === ' ') {
        e.preventDefault();
        handleQueryClick();
      }
      // Number keys 1-5: open chat and send configured prompt
      else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        
        // Get prompts from localStorage
        const stored = localStorage.getItem('shortcutPrompts');
        if (stored) {
          try {
            const prompts = JSON.parse(stored);
            const prompt = prompts[e.key];
            
            // Only proceed if prompt is configured
            if (prompt && prompt.trim()) {
              setInitialPrompt(prompt.trim());
              handleQueryClick();
            }
          } catch (error) {
            console.error('Error reading prompts:', error);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPopup, handleQueryClick]);

  const handleSendMessage = async (
    message: string,
    onStreamChunk: (text: string) => void
  ) => {
    let highlightId = currentHighlightId;
    let conversationId = currentConversationId;

    // If we have a pending highlight, save it now (first LLM call)
    if (pendingHighlight && !highlightId) {
      try {
        const res = await fetch('/api/highlights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingHighlight),
        });

        if (res.ok) {
          const data = await res.json();
          highlightId = data.highlight.id;
          setHighlights((prev) => [...prev, data.highlight]);
          setCurrentHighlightId(highlightId);
          setPendingHighlight(null);
        } else {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to create highlight');
        }
      } catch (error) {
        console.error('Error creating highlight:', error);
        throw error;
      }
    }

    if (!highlightId) {
      return;
    }

    try {
      const requestBody = {
        highlightId,
        message,
        conversationId,
      };
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to send message' }));
        throw new Error(errorData?.error || 'Failed to send message');
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                // Handle streaming errors from server
                if (data.error) {
                  throw new Error(data.error);
                }
                if (data.text) {
                  onStreamChunk(data.text);
                }
                if (data.done && data.conversationId) {
                  setCurrentConversationId(data.conversationId);
                  // Reload highlights to get updated conversation
                  if (selectedPdf) {
                    preloadHighlights(selectedPdf.id);
                  }
                }
              } catch (e) {
                // Re-throw actual errors, ignore JSON parse errors from partial chunks
                if (e instanceof Error && !e.message.includes('JSON')) {
                  throw e;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  // Get current conversation messages for chat overlay
  const currentMessages = useMemo(() => {
    if (!currentHighlightId) return [];
    const highlight = highlights.find((h) => h.id === currentHighlightId);
    if (!highlight?.conversation) return [];
    return highlight.conversation.messages.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  }, [highlights, currentHighlightId]);

  // Resizer drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newRatio = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      // Clamp between 30% and 80%
      setSplitRatio(Math.max(30, Math.min(80, newRatio)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white h-24 flex items-center overflow-visible">
        {/* Logo - absolutely positioned */}
        <img 
          src="/blueberry-logo.png" 
          alt="Blueberry Logo" 
          className="absolute object-contain"
          style={{ height: '130px', left: '130px', top: '50%', transform: 'translateY(-50%)' }}
        />
        {/* Text and navigation - in normal flow */}
        <div className="w-full px-6 flex justify-between items-center">
          <span 
            className="text-3xl"
            style={{ fontFamily: "'American Typewriter', serif", fontWeight: 'bold', marginLeft: '242px' }}
          >
            blueberry
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/papers"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-lg"
              style={{ fontFamily: "'American Typewriter', serif" }}
            >
              <span>List of Papers</span>
            </Link>
            <Link
              href="/settings"
              className="text-gray-600 hover:text-gray-900 transition-colors"
              title="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
      {/* Glowing separator */}
      <div 
        className="h-[3px] w-full"
        style={{
          background: 'linear-gradient(90deg, transparent, #3b82f6 15%, #60a5fa 50%, #3b82f6 85%, transparent)',
          boxShadow: '0 0 12px 4px rgba(59, 130, 246, 0.6), 0 0 24px 8px rgba(96, 165, 250, 0.4), 0 0 40px 12px rgba(59, 130, 246, 0.25), 0 0 60px 20px rgba(59, 130, 246, 0.1)'
        }}
      />

      <div className="p-4">
        <div className="max-w-7xl mx-auto">

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <div className="flex justify-between items-center">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-700 hover:text-red-900"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {isLoadingHighlights && (
          <div className="mb-4 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded-lg">
            Loading highlights...
          </div>
        )}

        {/* PDF Selection */}
        <div className="mb-6">
          <div className="flex gap-4 items-center mb-4">
            <label className="px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors">
              {isUploading ? 'Uploading...' : 'Upload Paper'}
              <input
                ref={uploadInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>

            {pdfs.length > 0 && (
              <select
                ref={selectPdfRef}
                value={selectedPdf?.id || ''}
                onChange={(e) => {
                  const pdf = pdfs.find((p) => p.id === e.target.value);
                  setSelectedPdf(pdf || null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select a PDF...</option>
                {pdfs.map((pdf) => (
                  <option key={pdf.id} value={pdf.id}>
                    {pdf.title || pdf.filename}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* PDF Viewer and Chat Panel Container */}
        {selectedPdf && (
          <div 
            ref={containerRef}
            className={`flex gap-0 rounded-lg overflow-hidden ${
              isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
            }`}
            style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 200px)' }}
          >
            {/* PDF Viewer */}
            <div 
              className="bg-white shadow-lg overflow-hidden rounded-lg transition-all duration-300 ease-out"
              style={{ width: showChat ? `${splitRatio}%` : '100%' }}
            >
              <PDFViewer
                file={`/api/files/${selectedPdf.filepath}`}
                filename={selectedPdf.filename}
                title={selectedPdf.title || selectedPdf.filename}
                onTextSelect={handleTextSelect}
                highlights={highlights}
                onHighlightClick={handleHighlightClick}
                onHighlightDelete={handleHighlightDelete}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen(prev => !prev)}
                pendingHighlight={pendingHighlight ? {
                  pageNumber: pendingHighlight.pageNumber,
                  selectionRanges: pendingHighlight.selectionRanges,
                  selectedText: pendingHighlight.selectedText,
                } : null}
              />
            </div>

            {/* Resizer */}
            {showChat && (
              <div
                onMouseDown={handleMouseDown}
                className={`w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center group transition-colors ${
                  isDragging ? 'bg-slate-300' : 'bg-transparent hover:bg-slate-200'
                }`}
              >
                <div className={`w-1 h-16 rounded-full transition-colors ${
                  isDragging ? 'bg-slate-500' : 'bg-slate-300 group-hover:bg-slate-400'
                }`} />
              </div>
            )}

            {/* Chat Panel */}
            <div 
              className={`overflow-hidden transition-all duration-300 ease-out ${
                showChat ? 'opacity-100' : 'opacity-0 w-0'
              }`}
              style={{ 
                width: showChat ? `calc(${100 - splitRatio}% - 8px)` : '0',
                marginLeft: showChat ? '8px' : '0',
                marginRight: showChat ? '4px' : '0',
              }}
            >
              <ChatPanel
                isOpen={showChat}
                onClose={() => {
                  setShowChat(false);
                  setSelectedText('');
                  setInitialPrompt(null);
                  // Clear pending highlight if no LLM call was made
                  setPendingHighlight(null);
                }}
                highlightedText={chatHighlightedText}
                conversationId={currentConversationId || undefined}
                initialMessages={currentMessages}
                onSendMessage={handleSendMessage}
                focusTrigger={chatFocusTrigger}
                initialPrompt={initialPrompt}
                onInitialPromptSent={() => setInitialPrompt(null)}
              />
            </div>
          </div>
        )}

        {/* Selection Popup */}
        {showPopup && (
          <SelectionPopup
            selectedText={selectedText}
            position={popupPosition}
            onQuery={handleQueryClick}
            onClose={() => setShowPopup(false)}
          />
        )}
        </div>
      </div>
    </main>
  );
}

