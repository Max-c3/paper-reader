import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Fetch all highlights for a PDF with conversations and messages (preloading)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pdfId = searchParams.get('pdfId');

    if (!pdfId) {
      return NextResponse.json({ error: 'pdfId is required' }, { status: 400 });
    }

    // Single optimized query with all relations pre-loaded
    const highlights = await db.highlight.findMany({
      where: { pdfId },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ highlights });
  } catch (error) {
    console.error('Error fetching highlights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch highlights' },
      { status: 500 }
    );
  }
}

// POST: Create a new highlight
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pdfId, pageNumber, selectionRanges, selectedText } = body;

    if (!pdfId || pageNumber === undefined || !selectionRanges || !selectedText) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create highlight
    const highlight = await db.highlight.create({
      data: {
        pdfId,
        pageNumber,
        selectionRanges: JSON.stringify(selectionRanges),
        selectedText,
      },
      include: {
        conversation: {
          include: {
            messages: true,
          },
        },
      },
    });

    return NextResponse.json({ highlight }, { status: 201 });
  } catch (error) {
    console.error('Error creating highlight:', error);
    return NextResponse.json(
      { error: 'Failed to create highlight' },
      { status: 500 }
    );
  }
}

