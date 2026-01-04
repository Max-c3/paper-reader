'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PDF {
  id: string;
  filename: string;
  filepath: string;
  uploadedAt: string;
}

export default function PapersPage() {
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchPDFs();
  }, []);

  const fetchPDFs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/pdfs');
      if (res.ok) {
        const data = await res.json();
        setPdfs(data.pdfs || []);
      }
    } catch (error) {
      console.error('Error fetching PDFs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (pdfId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    setDeletingId(pdfId);
    try {
      const res = await fetch(`/api/pdfs/${pdfId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Remove from list
        setPdfs((prev) => prev.filter((p) => p.id !== pdfId));
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Failed to delete PDF');
      }
    } catch (error) {
      console.error('Error deleting PDF:', error);
      alert('Error deleting PDF');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-900">List of Papers</h1>
        <Link
          href="/"
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
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          <span>Back to Reader</span>
        </Link>
      </div>

      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading papers...</div>
          ) : pdfs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No papers uploaded yet.</p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Upload a PDF
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {pdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors flex items-center justify-between group"
                >
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => router.push(`/?pdf=${pdf.id}`)}
                      className="text-left w-full"
                    >
                      <h3 className="text-base font-medium text-gray-900 truncate hover:text-blue-600 transition-colors">
                        {pdf.filename}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Uploaded {formatDate(pdf.uploadedAt)}
                      </p>
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(pdf.id, pdf.filename)}
                    disabled={deletingId === pdf.id}
                    className="ml-4 p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Delete PDF"
                  >
                    {deletingId === pdf.id ? (
                      <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

