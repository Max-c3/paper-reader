import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { streamChatResponse } from '@/lib/gemini';

// POST: Send a message and get streaming response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { highlightId, message, conversationId } = body;

    if (!highlightId || !message) {
      return NextResponse.json(
        { error: 'highlightId and message are required' },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await db.conversation.findUnique({
        where: { id: conversationId },
        include: { highlight: true },
      });
    } else {
      // Check if highlight already has a conversation
      const existingConv = await db.conversation.findUnique({
        where: { highlightId },
        include: { highlight: true },
      });

      if (existingConv) {
        conversation = existingConv;
      } else {
        // Create new conversation
        conversation = await db.conversation.create({
          data: { highlightId },
          include: { highlight: true },
        });
      }
    }

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Save user message
    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Get conversation history
    const messages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });

    const conversationHistory = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Stream response from Gemini
    const stream = await streamChatResponse(
      conversation.highlight.selectedText,
      message,
      conversationHistory
    );

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = '';
          for await (const chunk of stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`));
          }

          // Save assistant message after streaming completes
          await db.message.create({
            data: {
              conversationId: conversation.id,
              role: 'assistant',
              content: fullResponse,
            },
          });

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, conversationId: conversation.id })}\n\n`));
          controller.close();
        } catch (error) {
          console.error('Error streaming response:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}

