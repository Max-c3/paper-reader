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

// Use Gemini 3 Pro if available, fallback to latest stable
// Note: Model names may vary - check Google AI Studio for latest model names
export const getGeminiModel = () => {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  // Try Gemini 3 Pro first (adjust model name based on actual availability)
  // Common model names: 'gemini-3-pro', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
  return genAI.getGenerativeModel({ model: modelName });
};

export const streamChatResponse = async (
  highlightedText: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>
) => {
  const model = getGeminiModel();
  
  const systemPrompt = `You are a helpful AI assistant helping someone understand a research paper. The user has highlighted a specific passage from the paper, and they're asking questions about it.

Highlighted passage from the paper:
"""
${highlightedText}
"""

Please provide clear, concise, and helpful explanations. If the question is about the highlighted text, focus your answer on that specific passage.`;

  const chat = model.startChat({
    history: conversationHistory.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    })),
    systemInstruction: systemPrompt,
  });

  const result = await chat.sendMessageStream(userMessage);
  return result.stream;
};

