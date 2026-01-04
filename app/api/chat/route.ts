import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { streamChatResponse } from '@/lib/gemini';
import { appendFile } from 'fs/promises';
import { join } from 'path';

// POST: Send a message and get streaming response
export async function POST(request: NextRequest) {
  // #region agent log
  appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:6',message:'API route entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})+'\n').catch(()=>{});
  // #endregion
  
  // Check for API key early
  // #region agent log
  const envKeys = Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('API'));
  appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:14',message:'checking GEMINI_API_KEY',data:{hasKey:!!process.env.GEMINI_API_KEY,keyLength:process.env.GEMINI_API_KEY?.length||0,relevantEnvKeys:envKeys},timestamp:Date.now(),sessionId:'debug-session',runId:'env-check',hypothesisId:'E'})+'\n').catch(()=>{});
  // #endregion
  if (!process.env.GEMINI_API_KEY) {
    // #region agent log
    appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:18',message:'GEMINI_API_KEY missing',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'env-check',hypothesisId:'E'})+'\n').catch(()=>{});
    // #endregion
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured. Please set it in your .env file.' },
      { status: 503 }
    );
  }
  
  try {
    const body = await request.json();
    // #region agent log
    appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:9',message:'request body parsed',data:{body,hasHighlightId:!!body.highlightId,hasMessage:!!body.message,hasConversationId:!!body.conversationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})+'\n').catch(()=>{});
    // #endregion
    const { highlightId, message, conversationId } = body;

    if (!highlightId || !message) {
      // #region agent log
      appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:12',message:'validation failed',data:{highlightId:!!highlightId,message:!!message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})+'\n').catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'highlightId and message are required' },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      // #region agent log
      appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:20',message:'looking up conversation by id',data:{conversationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n').catch(()=>{});
      // #endregion
      conversation = await db.conversation.findUnique({
        where: { id: conversationId },
        include: { highlight: true },
      });
      // #region agent log
      appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:25',message:'conversation lookup result',data:{found:!!conversation,conversationId:conversation?.id,hasHighlight:!!conversation?.highlight},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n').catch(()=>{});
      // #endregion
    } else {
      // #region agent log
      appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:27',message:'no conversationId - checking existing',data:{highlightId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n').catch(()=>{});
      // #endregion
      // Check if highlight already has a conversation
      const existingConv = await db.conversation.findUnique({
        where: { highlightId },
        include: { highlight: true },
      });
      // #region agent log
      appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:32',message:'existing conversation check',data:{found:!!existingConv,conversationId:existingConv?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n').catch(()=>{});
      // #endregion

      if (existingConv) {
        conversation = existingConv;
      } else {
        // #region agent log
        appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:36',message:'creating new conversation',data:{highlightId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n').catch(()=>{});
        // #endregion
        // Create new conversation
        conversation = await db.conversation.create({
          data: { highlightId },
          include: { highlight: true },
        });
        // #region agent log
        appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:40',message:'conversation created',data:{conversationId:conversation?.id,hasHighlight:!!conversation?.highlight},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n').catch(()=>{});
        // #endregion
      }
    }

    if (!conversation) {
      // #region agent log
      appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:43',message:'conversation not found error',data:{highlightId,conversationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n').catch(()=>{});
      // #endregion
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
    // #region agent log
    appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:71',message:'before Gemini API call',data:{highlightTextLength:conversation.highlight.selectedText.length,messageLength:message.length,historyLength:conversationHistory.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n').catch(()=>{});
    // #endregion
    const stream = await streamChatResponse(
      conversation.highlight.selectedText,
      message,
      conversationHistory
    );
    // #region agent log
    appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:76',message:'Gemini API call succeeded',data:{hasStream:!!stream},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n').catch(()=>{});
    // #endregion

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
    // #region agent log
    appendFile(join(process.cwd(),'.cursor','debug.log'),JSON.stringify({location:'app/api/chat/route.ts:114',message:'API route error caught',data:{errorMessage:error instanceof Error?error.message:String(error),errorName:error instanceof Error?error.name:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})+'\n').catch(()=>{});
    // #endregion
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

