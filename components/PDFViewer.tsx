'use client';

import { useState, useCallback, memo, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

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
  title?: string;
  onTextSelect: (selectedText: string, selectionRanges: any) => void;
  highlights: Array<{
    id: string;
    pageNumber: number;
    selectionRanges: string;
    selectedText: string;
  }>;
  onHighlightClick: (highlightId: string) => void;
  onHighlightDelete?: (highlightId: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const PDFViewer = memo(function PDFViewer({
  file,
  filename,
  title,
  onTextSelect,
  highlights,
  onHighlightClick,
  onHighlightDelete,
  isFullscreen = false,
  onToggleFullscreen,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [selectedText, setSelectedText] = useState('');
  const [selectionRanges, setSelectionRanges] = useState<any>(null);
  const [scale, setScale] = useState<number>(1.2); // Start at 120% like papiers.ai

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // Throttle refs for zoom operations
  const zoomInLastCallRef = useRef<number>(0);
  const zoomOutLastCallRef = useRef<number>(0);
  const ZOOM_THROTTLE_MS = 100; // Throttle to max once per 100ms

  // Zoom functions with throttling to prevent rapid successive calls
  const zoomIn = useCallback(() => {
    const now = Date.now();
    if (now - zoomInLastCallRef.current >= ZOOM_THROTTLE_MS) {
      setScale((prev) => Math.min(prev + 0.1, 3.0)); // Max 300%
      zoomInLastCallRef.current = now;
    }
  }, []);

  const zoomOut = useCallback(() => {
    const now = Date.now();
    if (now - zoomOutLastCallRef.current >= ZOOM_THROTTLE_MS) {
      setScale((prev) => Math.max(prev - 0.1, 0.5)); // Min 50%
      zoomOutLastCallRef.current = now;
    }
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
      // Arrow keys disabled for continuous scroll mode
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut]);

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

    // Extract page number from data-page-number attribute or find it
    let pageNum = 1;
    const pageNumberAttr = pageElement.getAttribute('data-page-number');
    if (pageNumberAttr) {
      pageNum = parseInt(pageNumberAttr, 10);
    } else {
      // Fallback: find page number by checking all pages
      const allPages = document.querySelectorAll('.react-pdf__Page');
      for (let i = 0; i < allPages.length; i++) {
        if (allPages[i].contains(pageElement)) {
          pageNum = i + 1;
          break;
        }
      }
    }

    const pageRect = pageElement.getBoundingClientRect();
    const selectionRect = range.getBoundingClientRect();

    // Get individual rects for each line of the selection
    // Find the rect with the rightmost point to position the popup correctly
    const clientRects = range.getClientRects();
    let rightmostRect = clientRects[0];
    for (let i = 1; i < clientRects.length; i++) {
      if (clientRects[i].right > rightmostRect.right) {
        rightmostRect = clientRects[i];
      }
    }

    // Calculate relative coordinates (normalized to 100% scale for storage)
    const ranges = {
      page: pageNum,
      startX: (selectionRect.left - pageRect.left) / scale,
      startY: (selectionRect.top - pageRect.top) / scale,
      endX: (selectionRect.right - pageRect.left) / scale,
      endY: (selectionRect.bottom - pageRect.top) / scale,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      // Viewport coordinates for popup positioning (fixed position)
      // Use the rightmost rect's position for accurate placement
      viewportEndX: rightmostRect.right,
      viewportStartY: rightmostRect.top,
    };

    setSelectedText(text);
    setSelectionRanges(ranges);
    onTextSelect(text, ranges);
  }, [scale, onTextSelect]);

  // Parse all highlights grouped by page
  const highlightsByPage = highlights.reduce((acc, h) => {
    try {
      const ranges = JSON.parse(h.selectionRanges);
      if (!acc[h.pageNumber]) {
        acc[h.pageNumber] = [];
      }
      acc[h.pageNumber].push({
        ...h,
        ranges,
      });
    } catch {
      // Skip invalid highlights
    }
    return acc;
  }, {} as Record<number, Array<{ id: string; ranges: any; selectedText: string }>>);

  return (
    <div className="flex flex-col w-full h-full">
      {/* Header Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        {/* Left: Paper Title */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium text-gray-900 truncate">
            {title || filename || 'Document'}
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

          {/* Fullscreen Toggle */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                // Compress/exit fullscreen icon
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
                    d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                  />
                </svg>
              ) : (
                // Expand/fullscreen icon
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
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* PDF Viewer Area - Continuous Scroll */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="flex flex-col items-center py-8">
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="p-8">Loading PDF...</div>}
          >
            {Array.from(new Array(numPages), (el, index) => {
              const pageNum = index + 1;
              const pageHighlights = highlightsByPage[pageNum] || [];
              
              return (
                <div
                  key={`page_${pageNum}`}
                  className="mb-8 flex justify-center"
                  onMouseUp={handleTextSelection}
                >
                  <div className="relative bg-white shadow-lg">
                    <Page
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      data-page-number={pageNum}
                    />
                    {/* Highlight overlays for this page */}
                    {pageHighlights.length > 0 && (
                      <div className="absolute inset-0 pointer-events-none z-10">
                        {pageHighlights.map((highlight) => (
                          <div
                            key={highlight.id}
                            className="absolute pointer-events-auto group"
                            style={{
                              left: `${highlight.ranges.startX * scale}px`,
                              top: `${highlight.ranges.startY * scale}px`,
                              width: `${Math.max(highlight.ranges.endX - highlight.ranges.startX, 10) * scale}px`,
                              height: `${Math.max(highlight.ranges.endY - highlight.ranges.startY, 10) * scale}px`,
                            }}
                          >
                            {/* Highlight background */}
                            <div
                              onClick={() => onHighlightClick(highlight.id)}
                              className="absolute inset-0 cursor-pointer bg-gray-300/30 transition-all duration-200 ease-out group-hover:scale-[1.03]"
                              style={{ 
                                borderRadius: '3px',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = '0 0 12px 4px rgba(59, 130, 246, 0.6), 0 0 24px 8px rgba(96, 165, 250, 0.4), 0 0 40px 12px rgba(59, 130, 246, 0.25), 0 0 60px 20px rgba(59, 130, 246, 0.1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                              title="Click to reopen conversation"
                            />
                            {/* Delete button */}
                            {onHighlightDelete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onHighlightDelete(highlight.id);
                                }}
                                className="absolute -top-2.5 -right-2.5 w-4 h-4 bg-gray-800 hover:bg-gray-900 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-50 transition-opacity duration-150 shadow-md"
                                title="Delete highlight"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-2.5 w-2.5 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Document>
        </div>
      </div>
    </div>
  );
});

export default PDFViewer;

