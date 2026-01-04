import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Paper Reader',
  description: 'Read and understand papers with AI assistance',
};

// #region agent log
const logDebug = (location: string, message: string, data: Record<string, unknown>, hypothesisId: string) => {
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7243/ingest/2af80244-8311-4650-8433-37609ae640a4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location,message,data,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId})}).catch(()=>{});
  }
};
// #endregion

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // #region agent log
  if (typeof window !== 'undefined') {
    const htmlEl = document.documentElement;
    const htmlAttrs = Array.from(htmlEl.attributes).map(a => ({ name: a.name, value: a.value }));
    logDebug('layout.tsx:RootLayout', 'Client-side HTML element attributes during render', { htmlAttrs, isClient: true }, 'A');
  } else {
    console.log('[DEBUG layout.tsx:RootLayout] Server-side render - no window access');
  }
  // #endregion

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

