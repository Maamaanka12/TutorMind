import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Maximum retry attempts for transient errors
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 2000;

/**
 * Classify an AI error and return a friendly user-facing message.
 */
function classifyAIError(error) {
  const message = (error.message || error.toString()).toLowerCase();

  // Rate limiting / quota exceeded
  if (message.includes('429') || message.includes('quota') || message.includes('rate limit') || message.includes('resource exhausted')) {
    return {
      type: 'quota',
      status: 429,
      userMessage: 'AI service is temporarily at capacity. Please try again in a few minutes.',
      detail: 'Rate limit or quota exceeded',
    };
  }

  // API key issues
  if (message.includes('api key') || message.includes('invalid key') || message.includes('unauthorized') || message.includes('403')) {
    return {
      type: 'api_key',
      status: 503,
      userMessage: 'AI service configuration issue. Please contact support.',
      detail: 'Invalid or missing API key',
    };
  }

  // Service unavailable
  if (message.includes('503') || message.includes('service unavailable') || message.includes('overloaded')) {
    return {
      type: 'unavailable',
      status: 503,
      userMessage: 'AI service is temporarily unavailable. Please try again shortly.',
      detail: 'Service unavailable',
    };
  }

  // Safety / content filters
  if (message.includes('safety') || message.includes('blocked') || message.includes('content filter')) {
    return {
      type: 'safety',
      status: 422,
      userMessage: 'The AI could not process this content. Please try rephrasing or using different material.',
      detail: 'Content blocked by safety filters',
    };
  }

  // Timeout
  if (message.includes('timeout') || message.includes('deadline')) {
    return {
      type: 'timeout',
      status: 504,
      userMessage: 'AI request timed out. Please try again with a shorter prompt.',
      detail: 'Request timed out',
    };
  }

  // JSON parse failure (AI returned invalid format)
  if (message.includes('json') || message.includes('parse') || message.includes('unexpected token')) {
    return {
      type: 'parse',
      status: 502,
      userMessage: 'AI returned an unexpected response. Please try again.',
      detail: 'Failed to parse AI response',
    };
  }

  // Generic / unknown
  return {
    type: 'unknown',
    status: 500,
    userMessage: 'Something went wrong with the AI service. Please try again later.',
    detail: error.message || 'Unknown AI error',
  };
}

/**
 * Check if an error is transient and worth retrying.
 */
function isRetryable(error) {
  const classification = classifyAIError(error);
  return ['quota', 'unavailable', 'timeout', 'unknown'].includes(classification.type);
}

/**
 * Call the AI model with retry logic and friendly error handling.
 *
 * @param {string} modelName - The Gemini model name (default: 'gemini-2.5-flash')
 * @param {string} prompt - The prompt to send
 * @param {object} options - Optional config: { maxRetries, responseMimeType }
 * @returns {{ text: string }} The raw text response
 * @throws {object} Classified error with { type, status, userMessage, detail }
 */
export async function callAI(prompt, options = {}) {
  const { modelName = 'gemini-2.5-flash', maxRetries = MAX_RETRIES } = options;
  const model = genAI.getGenerativeModel({ model: modelName });

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return { text };
    } catch (error) {
      lastError = error;
      const classified = classifyAIError(error);

      console.warn(`AI call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, classified.detail);

      // Don't retry if it's not a transient error
      if (!isRetryable(error)) {
        throw classified;
      }

      // Don't retry if we've exhausted attempts
      if (attempt < maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  throw classifyAIError(lastError);
}

/**
 * Parse a JSON array from AI text response.
 * Returns null if parsing fails (caller should handle).
 */
export function parseJSONArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Parse a JSON object from AI text response.
 * Returns null if parsing fails.
 */
export function parseJSONObject(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Express route wrapper that catches AI errors and returns friendly responses.
 * Usage: router.post('/endpoint', authenticate, withGracefulAI(async (req, res) => { ... }));
 */
export function withGracefulAI(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (aiError) {
      // If the error is already a classified AI error (from callAI)
      if (aiError.userMessage) {
        return res.status(aiError.status).json({
          error: aiError.userMessage,
          aiError: true,
          errorType: aiError.type,
        });
      }

      // If it's a JSON parse error from our parsing helpers
      if (aiError.type === 'parse') {
        return res.status(502).json({
          error: aiError.userMessage,
          aiError: true,
          errorType: aiError.type,
        });
      }

      // Unknown/unhandled error — classify it
      const classified = classifyAIError(aiError);
      console.error('Unhandled AI error:', aiError);
      return res.status(classified.status).json({
        error: classified.userMessage,
        aiError: true,
        errorType: classified.type,
      });
    }
  };
}

export { classifyAIError };
