import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { streamChatResponse, getOrCreateCache } from '@/lib/gemini';
import { extractPDFText } from '@/lib/pdf-extractor';

// POST: Send a message and get streaming response
export async function POST(request: NextRequest) {
  const timings: Record<string, number> = {};
  const startTotal = performance.now();
  
  // Check for API key early
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured. Please set it in your .env file.' },
      { status: 503 }
    );
  }
  
  try {
    const startParse = performance.now();
    const body = await request.json();
    const { highlightId, message, conversationId } = body;
    timings['1_parse_request'] = performance.now() - startParse;

    if (!highlightId || !message) {
      return NextResponse.json(
        { error: 'highlightId and message are required' },
        { status: 400 }
      );
    }

    // Batch database queries: Get conversation with highlight and PDF in fewer queries
    const startDb = performance.now();
    
    // Get or create conversation with highlight and PDF in optimized queries
    let conversation;
    if (conversationId) {
      conversation = await db.conversation.findUnique({
        where: { id: conversationId },
        include: { 
          highlight: {
            include: { pdf: true }
          },
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        },
      });
    } else {
      // Check if highlight already has a conversation
      const existingConv = await db.conversation.findUnique({
        where: { highlightId },
        include: { 
          highlight: {
            include: { pdf: true }
          },
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        },
      });

      if (existingConv) {
        conversation = existingConv;
      } else {
        // Create new conversation
        conversation = await db.conversation.create({
          data: { highlightId },
          include: { 
            highlight: {
              include: { pdf: true }
            },
            messages: {
              orderBy: { createdAt: 'asc' }
            }
          },
        });
      }
    }
    timings['2_db_conversation'] = performance.now() - startDb;

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Save user message
    const startSaveMsg = performance.now();
    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });
    timings['3_save_user_message'] = performance.now() - startSaveMsg;

    // Build conversation history from already-fetched messages
    const conversationHistory = conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // PDF is already included via the batched query
    const pdf = conversation.highlight.pdf;

    if (!pdf) {
      return NextResponse.json(
        { error: 'PDF not found' },
        { status: 404 }
      );
    }

    // Get or extract PDF full text (should already be extracted on upload)
    const startPdfText = performance.now();
    let pdfFullText = pdf.fullText;
    if (!pdfFullText) {
      // Extract on-demand if not stored (fallback for old PDFs)
      try {
        pdfFullText = await extractPDFText(pdf.filepath);
        // Update PDF with extracted text for future use
        await db.pDF.update({
          where: { id: pdf.id },
          data: { fullText: pdfFullText },
        });
        timings['4_pdf_extraction'] = performance.now() - startPdfText;
      } catch (extractError) {
        console.error('Error extracting PDF text:', extractError);
        return NextResponse.json(
          { error: 'Failed to extract PDF content. Please try re-uploading the PDF.' },
          { status: 500 }
        );
      }
    } else {
      timings['4_pdf_text_cached'] = performance.now() - startPdfText;
    }

    // Get or create Gemini cache for this PDF
    const startCache = performance.now();
    const { cacheId, cacheName, isNewCache } = await getOrCreateCache(
      pdf.id,
      pdf.cacheId,
      pdfFullText
    );
    timings['5_gemini_cache'] = performance.now() - startCache;
    timings['5_gemini_cache_was_new'] = isNewCache ? 1 : 0;
    
    // Update cache ID in database if it changed
    if (cacheId && cacheId !== pdf.cacheId) {
      await db.pDF.update({
        where: { id: pdf.id },
        data: { cacheId: cacheId },
      });
    }

    // Stream response from Gemini
    const startGemini = performance.now();
    const stream = await streamChatResponse(
      pdfFullText,
      conversation.highlight.selectedText,
      message,
      conversationHistory,
      cacheName
    );
    timings['6_gemini_stream_start'] = performance.now() - startGemini;
    timings['total_before_stream'] = performance.now() - startTotal;
    
    console.log('[Chat API Timings]', JSON.stringify(timings, null, 2));

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
          // Send error to client before closing
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Stream error' })}\n\n`));
          controller.close();
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
    
    // Provide more specific error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let status = 500;
    let message = 'Failed to process chat message';
    
    if (errorMessage.includes('GEMINI_API_KEY')) {
      status = 503;
      message = 'GEMINI_API_KEY is not configured. Please set it in your .env file.';
    } else if (errorMessage.includes('API key')) {
      status = 503;
      message = 'Invalid API key configuration. Please check your GEMINI_API_KEY.';
    }
    
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
