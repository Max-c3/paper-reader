'use client';

import { useState, useCallback, memo, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Polyfill for Promise.withResolvers (Node.js 18 compatibility)
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Set up PDF.js worker - use local file from public folder
if (typeof window !== 'undefined') {
  // Use local worker file (served from public folder)
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

interface PDFViewerProps {
  file: string;
  filename?: string;
  onTextSelect: (selectedText: string, selectionRanges: any) => void;
  highlights: Array<{
    id: string;
    pageNumber: number;
    selectionRanges: string;
    selectedText: string;
  }>;
  onHighlightClick: (highlightId: string) => void;
  onTitleExtracted?: (title: string) => void;
}

const PDFViewer = memo(function PDFViewer({
  file,
  filename,
  onTextSelect,
  highlights,
  onHighlightClick,
  onTitleExtracted,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [selectedText, setSelectedText] = useState('');
  const [selectionRanges, setSelectionRanges] = useState<any>(null);
  const [scale, setScale] = useState<number>(1.2); // Start at 120% like papiers.ai
  const [extractedTitle, setExtractedTitle] = useState<string>(filename || 'Document');

  // Extract title from first page
  const extractTitleFromPDF = useCallback(async (pdfDocument: any) => {
    try {
      const page = await pdfDocument.getPage(1);
      const textContent = await page.getTextContent();
      
      // Get text items and find the title (usually first large text block)
      const textItems = textContent.items as Array<{ str: string; transform: number[] }>;
      
      // Find the largest text (likely the title) or use first few lines
      let title = '';
      let maxFontSize = 0;
      
      for (const item of textItems.slice(0, 20)) { // Check first 20 items
        if (item.str && item.str.trim()) {
          // Calculate approximate font size from transform matrix
          const fontSize = item.transform ? Math.abs(item.transform[0]) : 0;
          if (fontSize > maxFontSize && fontSize > 10) {
            maxFontSize = fontSize;
            title = item.str.trim();
          }
        }
      }
      
      // If no large text found, use first non-empty line
      if (!title) {
        for (const item of textItems) {
          if (item.str && item.str.trim() && item.str.trim().length > 5) {
            title = item.str.trim();
            break;
          }
        }
      }
      
      // Clean up title (remove extra whitespace, limit length)
      if (title) {
        title = title.replace(/\s+/g, ' ').trim();
        if (title.length > 100) {
          title = title.substring(0, 100) + '...';
        }
        setExtractedTitle(title);
        if (onTitleExtracted) {
          onTitleExtracted(title);
        }
      }
    } catch (error) {
      console.error('Error extracting title:', error);
      // Fallback to filename
      setExtractedTitle(filename || 'Document');
    }
  }, [filename, onTitleExtracted]);

  const onDocumentLoadSuccess = async ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    
    // Extract title from first page
    try {
      const loadingTask = pdfjs.getDocument(file);
      const pdfDocument = await loadingTask.promise;
      await extractTitleFromPDF(pdfDocument);
    } catch (error) {
      console.error('Error loading PDF for title extraction:', error);
    }
  };

  // Zoom functions
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.1, 3.0)); // Max 300%
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.1, 0.5)); // Min 50%
  }, []);

  // Keyboard shortcuts: Cmd+J (zoom in), Cmd+K (zoom out), Arrow keys (page navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // Zoom shortcuts
      if (modifier && e.key === 'j') {
        e.preventDefault();
        zoomIn();
      } else if (modifier && e.key === 'k') {
        e.preventDefault();
        zoomOut();
      }
      // Page navigation (only when not typing in an input)
      else if (e.target === document.body || (e.target as HTMLElement).tagName !== 'INPUT') {
        if (e.key === 'ArrowLeft' && pageNumber > 1) {
          e.preventDefault();
          setPageNumber((p) => p - 1);
        } else if (e.key === 'ArrowRight' && pageNumber < numPages) {
          e.preventDefault();
          setPageNumber((p) => p + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, pageNumber, numPages]);

  // Format zoom percentage for display
  const zoomPercentage = Math.round(scale * 100);

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectedText('');
      setSelectionRanges(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    if (text.length === 0) {
      setSelectedText('');
      setSelectionRanges(null);
      return;
    }

    // Get the page element
    const pageElement = range.commonAncestorContainer.parentElement?.closest('.react-pdf__Page');
    if (!pageElement) return;

    // Get page number from data attribute or by finding which page contains the selection
    const pageRect = pageElement.getBoundingClientRect();
    const selectionRect = range.getBoundingClientRect();

    // Calculate relative coordinates (normalized to 100% scale for storage)
    const ranges = {
      page: pageNumber,
      startX: (selectionRect.left - pageRect.left) / scale,
      startY: (selectionRect.top - pageRect.top) / scale,
      endX: (selectionRect.right - pageRect.left) / scale,
      endY: (selectionRect.bottom - pageRect.top) / scale,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
    };

    setSelectedText(text);
    setSelectionRanges(ranges);
    onTextSelect(text, ranges);
  }, [pageNumber, onTextSelect]);

  // Parse highlights for current page
  const pageHighlights = highlights
    .filter((h) => h.pageNumber === pageNumber)
    .map((h) => {
      try {
        return {
          ...h,
          ranges: JSON.parse(h.selectionRanges),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<{
      id: string;
      ranges: any;
      selectedText: string;
    }>;

  return (
    <div className="flex flex-col w-full h-full">
      {/* Header Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        {/* Left: Paper Title */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium text-gray-900 truncate">
            {filename || 'Document'}
          </h2>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-4 ml-4">
          {/* Open External Link */}
          <a
            href={file}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
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
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <span>Open External</span>
          </a>

          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title="Zoom out (Cmd+K)"
              aria-label="Zoom out"
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
                  d="M20 12H4"
                />
              </svg>
            </button>
            <span className="text-sm text-gray-700 min-w-[3rem] text-center">
              {zoomPercentage}%
            </span>
            <button
              onClick={zoomIn}
              className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title="Zoom in (Cmd+J)"
              aria-label="Zoom in"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>

          {/* Page Count */}
          <span className="text-sm text-gray-600">
            {numPages > 0 ? `${numPages} pages` : ''}
          </span>
        </div>
      </div>

      {/* PDF Viewer Area */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="flex justify-center py-8">
          <div
            className="relative bg-white shadow-lg"
            onMouseUp={handleTextSelection}
          >
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="p-8">Loading PDF...</div>}
            >
              <div className="relative">
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
                {/* Highlight overlays for this page - positioned absolutely over the page */}
                <div className="absolute inset-0 pointer-events-none">
                  {pageHighlights.map((highlight) => (
                    <div
                      key={highlight.id}
                      onClick={() => onHighlightClick(highlight.id)}
                      className="absolute cursor-pointer hover:bg-gray-400 bg-gray-300 bg-opacity-30 transition-opacity pointer-events-auto"
                      style={{
                        left: `${highlight.ranges.startX * scale}px`,
                        top: `${highlight.ranges.startY * scale}px`,
                        width: `${Math.max(highlight.ranges.endX - highlight.ranges.startX, 10) * scale}px`,
                        height: `${Math.max(highlight.ranges.endY - highlight.ranges.startY, 10) * scale}px`,
                      }}
                      title="Click to reopen conversation"
                    />
                  ))}
                </div>
              </div>
            </Document>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PDFViewer;

