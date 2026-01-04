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

    let highlightId: string;
    let conversationId: string | null = null;

    if (existingHighlight) {
      highlightId = existingHighlight.id;
      conversationId = existingHighlight.conversation?.id || null;
      setCurrentHighlightId(highlightId);
      setCurrentConversationId(conversationId);
    } else {
      // Create new highlight
      try {
        const res = await fetch('/api/highlights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfId: selectedPdf.id,
            pageNumber: selectionRanges.page,
            selectionRanges,
            selectedText,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          highlightId = data.highlight.id;
          setHighlights((prev) => [...prev, data.highlight]);
          setCurrentHighlightId(highlightId);
        } else {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to create highlight');
        }
      } catch (error) {
        console.error('Error creating highlight:', error);
        setError(error instanceof Error ? error.message : 'Error creating highlight');
        return;
      }
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

  const handleSendMessage = async (
    message: string,
    onStreamChunk: (text: string) => void
  ) => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:handleSendMessage-entry',message:'handleSendMessage called',data:{currentHighlightId,currentConversationId,messageLength:message.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!currentHighlightId) {
      return;
    }

    try {
      const requestBody = {
        highlightId: currentHighlightId,
        message,
        conversationId: currentConversationId,
      };
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:before-fetch',message:'about to call /api/chat',data:{requestBody},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:after-fetch',message:'fetch response received',data:{status:res.status,ok:res.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to send message' }));
        throw new Error(errorData?.error || 'Failed to send message');
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let chunkCount = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:stream-done',message:'stream finished',data:{totalChunks:chunkCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            break;
          }

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          chunkCount++;

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:stream-error',message:'error in stream',data:{error:data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
                  // #endregion
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
                // #region agent log
                if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                  fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:parse-error',message:'JSON parse error in stream',data:{line,error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
                  throw e; // Re-throw if it's not just a parse error
                }
                // #endregion
              }
            }
          }
        }
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:catch-error',message:'error caught in handleSendMessage',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
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
      {/* Top Bar with List Button */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-3 flex justify-end">
        <Link
          href="/papers"
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>List of Papers</span>
        </Link>
      </div>

      <div className="p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">AI Paper Reader</h1>

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
              {isUploading ? 'Uploading...' : 'Upload PDF'}
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

