'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ShortcutPrompts {
  "1": string;
  "2": string;
  "3": string;
  "4": string;
  "5": string;
}

export default function SettingsPage() {
  const [prompts, setPrompts] = useState<ShortcutPrompts>({
    "1": "",
    "2": "",
    "3": "",
    "4": "",
    "5": "",
  });

  useEffect(() => {
    // Load prompts from localStorage
    const stored = localStorage.getItem('shortcutPrompts');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setPrompts((prev) => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Error loading prompts:', error);
      }
    }
  }, []);

  const handlePromptChange = (key: keyof ShortcutPrompts, value: string) => {
    const updated = { ...prompts, [key]: value };
    setPrompts(updated);
    // Save to localStorage
    localStorage.setItem('shortcutPrompts', JSON.stringify(updated));
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white h-24 flex items-center overflow-visible">
        {/* Logo - absolutely positioned */}
        <Link href="/">
          <img 
            src="/blueberry-logo.png" 
            alt="Blueberry Logo" 
            className="absolute object-contain"
            style={{ height: '130px', left: '130px', top: '50%', transform: 'translateY(-50%)' }}
          />
        </Link>
        {/* Text and navigation - in normal flow */}
        <div className="w-full px-6 flex justify-between items-center">
          <Link href="/">
            <span 
              className="text-3xl hover:opacity-80 transition-opacity"
              style={{ fontFamily: "'American Typewriter', serif", fontWeight: 'bold', marginLeft: '242px' }}
            >
              blueberry
            </span>
          </Link>
          <Link
            href="/papers"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-lg"
            style={{ fontFamily: "'American Typewriter', serif" }}
          >
            <span>List of Papers</span>
          </Link>
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

      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <h1 
            className="text-2xl font-medium text-gray-900 mb-6"
            style={{ fontFamily: "'American Typewriter', serif" }}
          >
            Shortcut Prompts Settings
          </h1>

          {/* Keyboard Shortcuts Section */}
          <div className="mb-8">
            <h2 
              className="text-lg font-medium text-gray-900 mb-4"
              style={{ fontFamily: "'American Typewriter', serif" }}
            >
              Keyboard Shortcuts
            </h2>
            <div className="space-y-3">
              {[
                { key: '?', description: 'Open settings' },
                { key: 'Space', description: 'Open chat (when text is selected)' },
                { key: 'u', description: 'Upload paper' },
                { key: 's', description: 'Click Select PDF dropdown' },
              ].map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors flex items-center gap-4"
                >
                  {/* Key indicator */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center"
                    style={{
                      minWidth: '80px',
                      height: '40px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'linear-gradient(to bottom, #f9fafb, #e5e7eb)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151',
                    }}
                  >
                    {shortcut.key}
                  </div>
                  {/* Description */}
                  <div className="flex-1 text-sm text-gray-700" style={{ fontFamily: "'American Typewriter', serif" }}>
                    {shortcut.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt Configuration Section */}
          <div className="mb-6">
            <h2 
              className="text-lg font-medium text-gray-900 mb-4"
              style={{ fontFamily: "'American Typewriter', serif" }}
            >
              Prompt Shortcuts (1-5)
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Configure prompts for keyboard shortcuts 1-5. When you highlight text and press a number key, 
              the chat will open and automatically send the configured prompt. Leave empty to disable a shortcut.
            </p>
          </div>

          <div className="space-y-4">
            {(['1', '2', '3', '4', '5'] as const).map((key) => (
              <div
                key={key}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors flex items-start gap-4"
              >
                {/* Key indicator */}
                <div
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    minWidth: '48px',
                    height: '48px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: 'linear-gradient(to bottom, #f9fafb, #e5e7eb)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#374151',
                  }}
                >
                  {key}
                </div>
                {/* Textarea */}
                <textarea
                  value={prompts[key]}
                  onChange={(e) => handlePromptChange(key, e.target.value)}
                  placeholder={`Enter prompt for shortcut ${key}...`}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  style={{ fontFamily: "'American Typewriter', serif" }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

