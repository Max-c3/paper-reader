'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
  
  // Split panel state
  const [splitRatio, setSplitRatio] = useState(60); // PDF takes 60% by default
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      // Position popup near selection
      setPopupPosition({ x: ranges.endX + 20, y: ranges.startY });
      setShowPopup(true);
    } else {
      setShowPopup(false);
    }
  }, []);

  const handleQueryClick = async () => {
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
      setPendingHighlight({
        pdfId: selectedPdf.id,
        pageNumber: selectionRanges.page,
        selectionRanges,
        selectedText,
      });
      setCurrentHighlightId(null);
      setCurrentConversationId(null);
    }

    setShowChat(true);
  };

  const handleHighlightClick = useCallback((highlightId: string) => {
    // Instant access from preloaded data
    const highlight = highlights.find((h) => h.id === highlightId);
    if (!highlight) return;

    setSelectedText(highlight.selectedText);
    setCurrentHighlightId(highlightId);
    setCurrentConversationId(highlight.conversation?.id || null);
    setShowChat(true);
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
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img 
            src="/blueberry-logo.png" 
            alt="Blueberry Logo" 
            className="h-10 w-10 object-contain"
          />
          <span 
            className="text-2xl"
            style={{ fontFamily: "'American Typewriter', serif", fontWeight: 'bold' }}
          >
            blueberry
          </span>
        </div>
        <Link
          href="/papers"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          style={{ fontFamily: "'American Typewriter', serif" }}
        >
          <span>List of Papers</span>
        </Link>
      </div>

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
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>

            {pdfs.length > 0 && (
              <select
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
                    {pdf.filename}
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
            className="flex gap-0 rounded-lg overflow-hidden"
            style={{ height: 'calc(100vh - 200px)' }}
          >
            {/* PDF Viewer */}
            <div 
              className="bg-white shadow-lg overflow-hidden rounded-lg transition-all duration-300 ease-out"
              style={{ width: showChat ? `${splitRatio}%` : '100%' }}
            >
              <PDFViewer
                file={`/api/files/${selectedPdf.filepath}`}
                filename={selectedPdf.filename}
                onTextSelect={handleTextSelect}
                highlights={highlights}
                onHighlightClick={handleHighlightClick}
                onHighlightDelete={handleHighlightDelete}
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
                  // Clear pending highlight if no LLM call was made
                  setPendingHighlight(null);
                }}
                highlightedText={selectedText}
                conversationId={currentConversationId || undefined}
                initialMessages={currentMessages}
                onSendMessage={handleSendMessage}
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

