'use client';

import { useState, useEffect, useRef } from 'react';

interface SelectionPopupProps {
  selectedText: string;
  position: { x: number; y: number };
  onQuery: () => void;
  onClose: () => void;
}

export default function SelectionPopup({
  selectedText,
  position,
  onQuery,
  onClose,
}: SelectionPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!selectedText) return null;

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-2"
      style={{
        left: `${position.x}px`,
        top: `${position.y - 50}px`,
      }}
    >
      <button
        onClick={onQuery}
        className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        title="Ask AI about this selection"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.829V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        Ask AI
      </button>
    </div>
  );
}

