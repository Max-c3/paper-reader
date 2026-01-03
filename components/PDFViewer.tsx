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

// Set up PDF.js worker - use local worker file from public folder
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PDFViewerProps {
  file: string;
  onTextSelect: (selectedText: string, selectionRanges: any) => void;
  highlights: Array<{
    id: string;
    pageNumber: number;
    selectionRanges: string;
    selectedText: string;
  }>;
  onHighlightClick: (highlightId: string) => void;
}

const PDFViewer = memo(function PDFViewer({
  file,
  onTextSelect,
  highlights,
  onHighlightClick,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [selectedText, setSelectedText] = useState('');
  const [selectionRanges, setSelectionRanges] = useState<any>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

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

    // Calculate relative coordinates
    const ranges = {
      page: pageNumber,
      startX: selectionRect.left - pageRect.left,
      startY: selectionRect.top - pageRect.top,
      endX: selectionRect.right - pageRect.left,
      endY: selectionRect.bottom - pageRect.top,
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
    <div className="flex flex-col items-center w-full">
      <div className="mb-4 flex gap-2 items-center">
        <button
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={pageNumber <= 1}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          Previous
        </button>
        <span className="text-sm">
          Page {pageNumber} of {numPages}
        </span>
        <button
          onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          Next
        </button>
      </div>

      <div
        className="relative border border-gray-300 shadow-lg"
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
                    left: `${highlight.ranges.startX}px`,
                    top: `${highlight.ranges.startY}px`,
                    width: `${Math.max(highlight.ranges.endX - highlight.ranges.startX, 10)}px`,
                    height: `${Math.max(highlight.ranges.endY - highlight.ranges.startY, 10)}px`,
                  }}
                  title="Click to reopen conversation"
                />
              ))}
            </div>
          </div>
        </Document>
      </div>
    </div>
  );
});

export default PDFViewer;

