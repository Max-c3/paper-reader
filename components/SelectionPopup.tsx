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
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <button
        onClick={onQuery}
        className="cursor-pointer hover:scale-105 transition-transform duration-200"
        title="Ask AI about this selection"
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0',
        }}
      >
        <img 
          src="/blueberry-logo.png" 
          alt="Ask AI" 
          className="object-contain"
          style={{
            width: '90px',
            height: '90px',
            filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.7)) drop-shadow(0 0 16px rgba(96, 165, 250, 0.5)) drop-shadow(0 0 24px rgba(59, 130, 246, 0.3))',
          }}
        />
      </button>
    </div>
  );
}

