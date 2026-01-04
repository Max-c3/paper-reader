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

// PUT: Restore a deleted highlight with its conversation and messages (for undo)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { highlight: highlightData } = body;

    if (!highlightData) {
      return NextResponse.json({ error: 'highlight data is required' }, { status: 400 });
    }

    // Recreate the highlight
    const highlight = await db.highlight.create({
      data: {
        id: highlightData.id,
        pdfId: highlightData.pdfId,
        pageNumber: highlightData.pageNumber,
        selectionRanges: highlightData.selectionRanges,
        selectedText: highlightData.selectedText,
        createdAt: new Date(highlightData.createdAt),
      },
    });

    // Recreate conversation if it existed
    if (highlightData.conversation) {
      const conversation = await db.conversation.create({
        data: {
          id: highlightData.conversation.id,
          highlightId: highlight.id,
          createdAt: new Date(highlightData.conversation.createdAt),
        },
      });

      // Recreate messages if they existed
      if (highlightData.conversation.messages?.length > 0) {
        await db.message.createMany({
          data: highlightData.conversation.messages.map((msg: any) => ({
            id: msg.id,
            conversationId: conversation.id,
            role: msg.role,
            content: msg.content,
            createdAt: new Date(msg.createdAt),
          })),
        });
      }
    }

    // Fetch the complete restored highlight
    const restoredHighlight = await db.highlight.findUnique({
      where: { id: highlight.id },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    return NextResponse.json({ highlight: restoredHighlight });
  } catch (error) {
    console.error('Error restoring highlight:', error);
    return NextResponse.json(
      { error: 'Failed to restore highlight' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a highlight (cascade deletes conversation and messages)
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const highlightId = searchParams.get('id');

    if (!highlightId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Get the highlight with its conversation before deleting (for undo support)
    const highlight = await db.highlight.findUnique({
      where: { id: highlightId },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!highlight) {
      return NextResponse.json({ error: 'Highlight not found' }, { status: 404 });
    }

    // Delete the highlight (cascade will delete conversation and messages)
    await db.highlight.delete({
      where: { id: highlightId },
    });

    return NextResponse.json({ deleted: highlight });
  } catch (error) {
    console.error('Error deleting highlight:', error);
    return NextResponse.json(
      { error: 'Failed to delete highlight' },
      { status: 500 }
    );
  }
}

