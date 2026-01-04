import { GoogleGenerativeAI } from '@google/generative-ai';

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

/**
 * Creates a context cache for PDF content using Gemini's caching API
 * @param pdfText - Full text content of the PDF to cache
 * @returns Promise<string | null> - Cache ID if successful, null if caching fails
 */
export async function createPDFCache(pdfText: string): Promise<string | null> {
  if (!genAI) {
    return null;
  }
  
  try {
    // Note: Explicit caching may require direct API calls
    // For now, we'll use implicit caching by structuring prompts correctly
    // This function is a placeholder for future explicit caching implementation
    // The cache ID will be stored in the database for reference
    // For implicit caching, we return null and include PDF text in first message
    return null;
  } catch (error) {
    console.error('Error creating PDF cache:', error);
    return null;
  }
}

// Use Gemini 3 Pro if available, fallback to latest stable
// Note: Model names may vary - check Google AI Studio for latest model names
export const getGeminiModel = (systemInstruction?: string) => {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  // Use Gemini 3 Pro as default (adjust model name based on actual availability)
  // Common model names: 'gemini-3-pro-preview', 'gemini-3-pro', 'gemini-1.5-flash', 'gemini-pro'
  const modelName = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
  const config: any = { model: modelName };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  return genAI.getGenerativeModel(config);
};

export const streamChatResponse = async (
  pdfFullText: string,
  highlightedText: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  cacheId?: string | null
) => {
  // CRITICAL: Set max output tokens to prevent runaway costs
  // 2000 tokens is approximately 1500 words - reasonable for explanations
  // This is a hard limit that cannot be exceeded, protecting against runaway costs
  const MAX_OUTPUT_TOKENS = 2000;
  
  // Structure the prompt in the required order:
  // 1. Full PDF content (via cache reference or inline for implicit caching)
  // 2. Highlighted section note
  // 3. User query
  
  // For implicit caching: Include full PDF text in first message only
  // For explicit caching (future): Use cacheId reference
  const isFirstMessage = conversationHistory.length === 0;
  
  let systemPrompt: string;
  
  if (cacheId) {
    // Explicit caching: Reference cached content
    systemPrompt = `You are a helpful AI assistant helping someone understand a research paper.

The full content of the research paper has been provided in the cached context (cache ID: ${cacheId}).

The user has highlighted a specific passage from the paper, and their question is in direct context of this highlighted section.

Highlighted section from the paper:
"""
${highlightedText}
"""

Please provide clear, concise, and helpful explanations. When answering, consider the full context of the paper, but pay special attention to the highlighted section when it's relevant to the question.`;
  } else if (isFirstMessage) {
    // First message: Include full PDF for implicit caching
    systemPrompt = `You are a helpful AI assistant helping someone understand a research paper.

FULL RESEARCH PAPER CONTENT:
"""
${pdfFullText}
"""

The user has highlighted a specific passage from the paper, and their question is in direct context of this highlighted section.

Highlighted section from the paper:
"""
${highlightedText}
"""

Please provide clear, concise, and helpful explanations. When answering, consider the full context of the paper, but pay special attention to the highlighted section when it's relevant to the question.`;
  } else {
    // Subsequent messages: Reference that PDF was provided earlier (implicit caching)
    systemPrompt = `You are a helpful AI assistant helping someone understand a research paper.

The full content of the research paper was provided in our previous conversation. Please refer to that context.

The user has highlighted a specific passage from the paper, and their question is in direct context of this highlighted section.

Highlighted section from the paper:
"""
${highlightedText}
"""

Please provide clear, concise, and helpful explanations. When answering, consider the full context of the paper, but pay special attention to the highlighted section when it's relevant to the question.`;
  }

  // Set system instruction at the model level (this works better with history)
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

  // The generationConfig set in startChat applies to all messages in this chat
  const result = await chat.sendMessageStream(userMessage);
  return result.stream;
};

