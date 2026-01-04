'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import SelectionPopup from '@/components/SelectionPopup';
import ChatOverlay from '@/components/ChatOverlay';

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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:198',message:'handleHighlightClick entry',data:{highlightId,highlightsCount:highlights.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Instant access from preloaded data
    const highlight = highlights.find((h) => h.id === highlightId);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:201',message:'highlight lookup result',data:{found:!!highlight,highlightId:highlight?.id,conversationId:highlight?.conversation?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!highlight) return;

    setSelectedText(highlight.selectedText);
    setCurrentHighlightId(highlightId);
    setCurrentConversationId(highlight.conversation?.id || null);
    setShowChat(true);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:207',message:'handleHighlightClick exit',data:{setHighlightId:highlightId,setConversationId:highlight.conversation?.id||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  }, [highlights]);

  const handleSendMessage = async (
    message: string,
    onStreamChunk: (text: string) => void
  ) => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:209',message:'handleSendMessage entry',data:{currentHighlightId,conversationId:currentConversationId,messageLength:message.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!currentHighlightId) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:213',message:'early return - no highlightId',data:{currentHighlightId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return;
    }

    try {
      const requestBody = {
        highlightId: currentHighlightId,
        message,
        conversationId: currentConversationId,
      };
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:220',message:'before fetch request',data:{requestBody},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:227',message:'after fetch - response status',data:{status:res.status,statusText:res.statusText,ok:res.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (!res.ok) {
        // #region agent log
        let errorData;
        try {
          errorData = await res.json();
        } catch {
          errorData = { error: await res.text().catch(() => 'Failed to send message') };
        }
        fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:230',message:'response not ok - error details',data:{status:res.status,statusText:res.statusText,errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const errorMessage = errorData?.error || 'Failed to send message';
        throw new Error(errorMessage);
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
                // Ignore parse errors
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

  return (
    <main className="min-h-screen bg-gray-50 p-4">
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

        {/* PDF Viewer */}
        {selectedPdf && (
          <div className="bg-white rounded-lg shadow-lg p-4">
            <PDFViewer
              file={`/api/files/${selectedPdf.filepath}`}
              onTextSelect={handleTextSelect}
              highlights={highlights}
              onHighlightClick={handleHighlightClick}
            />
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

        {/* Chat Overlay */}
        <ChatOverlay
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
    </main>
  );
}

