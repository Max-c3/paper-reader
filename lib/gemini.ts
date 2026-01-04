import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';

const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  return key;
};

const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Cache manager for explicit context caching
let cacheManager: GoogleAICacheManager | null = null;
const getCacheManager = () => {
  if (!cacheManager && process.env.GEMINI_API_KEY) {
    cacheManager = new GoogleAICacheManager(process.env.GEMINI_API_KEY);
  }
  return cacheManager;
};

// Cache TTL in seconds (1 hour)
const CACHE_TTL_SECONDS = 3600;

// Model to use for caching (must match the model used for generation)
const CACHE_MODEL = 'models/gemini-2.0-flash-001';

interface CacheResult {
  cacheId: string | null;
  cacheName: string | null;
  isNewCache: boolean;
}

/**
 * Gets an existing cache or creates a new one for PDF content
 * @param pdfId - Database ID of the PDF (used for cache display name)
 * @param existingCacheId - Existing cache ID from database (if any)
 * @param pdfText - Full text content of the PDF
 * @returns Promise<CacheResult> - Cache info including name for API calls
 */
export async function getOrCreateCache(
  pdfId: string,
  existingCacheId: string | null,
  pdfText: string
): Promise<CacheResult> {
  const manager = getCacheManager();
  if (!manager) {
    return { cacheId: null, cacheName: null, isNewCache: false };
  }

  // If we have an existing cache ID, try to use it
  if (existingCacheId) {
    try {
      const existingCache = await manager.get(existingCacheId);
      if (existingCache && existingCache.name) {
        console.log(`[Gemini Cache] Using existing cache: ${existingCacheId}`);
        return { cacheId: existingCacheId, cacheName: existingCache.name, isNewCache: false };
      }
    } catch (error) {
      // Cache expired or not found - will create a new one
      console.log(`[Gemini Cache] Existing cache expired or invalid: ${existingCacheId}`);
    }
  }

  // Create a new cache
  try {
    console.log(`[Gemini Cache] Creating new cache for PDF: ${pdfId}`);
    
    const cache = await manager.create({
      model: CACHE_MODEL,
      displayName: `pdf-${pdfId}`,
      systemInstruction: {
        role: 'system',
        parts: [{ text: `You are a helpful AI assistant helping someone understand a research paper. The full content of the paper is provided below for context.` }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `FULL RESEARCH PAPER CONTENT:\n"""\n${pdfText}\n"""` }],
        },
      ],
      ttlSeconds: CACHE_TTL_SECONDS,
    });

    console.log(`[Gemini Cache] Created new cache: ${cache.name}`);
    return { cacheId: cache.name ?? null, cacheName: cache.name ?? null, isNewCache: true };
  } catch (error) {
    console.error('[Gemini Cache] Error creating cache:', error);
    return { cacheId: null, cacheName: null, isNewCache: false };
  }
}

// Use the same model as caching for consistency
export const getGeminiModel = (systemInstruction?: string) => {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  // Use the same model as caching
  const modelName = process.env.GEMINI_MODEL || CACHE_MODEL.replace('models/', '');
  const config: any = { model: modelName };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  return genAI.getGenerativeModel(config);
};

/**
 * Get a model from cached content for faster responses
 */
const getModelFromCache = async (cacheName: string) => {
  const manager = getCacheManager();
  if (!manager || !genAI) {
    return null;
  }
  
  try {
    const cache = await manager.get(cacheName);
    if (cache) {
      return genAI.getGenerativeModelFromCachedContent(cache);
    }
  } catch (error) {
    console.error('[Gemini] Error getting model from cache:', error);
  }
  return null;
};

export const streamChatResponse = async (
  pdfFullText: string,
  highlightedText: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  cacheName?: string | null
) => {
  // CRITICAL: Set max output tokens to prevent runaway costs
  // 2000 tokens is approximately 1500 words - reasonable for explanations
  const MAX_OUTPUT_TOKENS = 2000;
  
  // Build the highlighted section prompt (used in both cached and non-cached paths)
  const highlightPrompt = `The user has highlighted a specific passage from the paper, and their question is in direct context of this highlighted section.

Highlighted section from the paper:
"""
${highlightedText}
"""

Please provide clear, concise, and helpful explanations. When answering, consider the full context of the paper, but pay special attention to the highlighted section when it's relevant to the question.`;

  // Try to use cached model if available
  if (cacheName) {
    const cachedModel = await getModelFromCache(cacheName);
    if (cachedModel) {
      console.log('[Gemini] Using cached model for response');
      
      const chat = cachedModel.startChat({
        history: conversationHistory.map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      });

      // Include the highlighted section context with the user's message
      const messageWithContext = `${highlightPrompt}\n\nUser's question: ${userMessage}`;
      const result = await chat.sendMessageStream(messageWithContext);
      return result.stream;
    } else {
      console.log('[Gemini] Cache not available, falling back to full context');
    }
  }

  // Fallback: No cache available, include full PDF in system prompt
  const systemPrompt = `You are a helpful AI assistant helping someone understand a research paper.

FULL RESEARCH PAPER CONTENT:
"""
${pdfFullText}
"""

${highlightPrompt}`;

  const model = getGeminiModel(systemPrompt);
  
  const chat = model.startChat({
    history: conversationHistory.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    })),
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  const result = await chat.sendMessageStream(userMessage);
  return result.stream;
};
