/**
 * AI SERVICE
 * Wraps the low-level callAI from aiHelper.js with:
 *   - Structured prompt templates (from prompts.js)
 *   - JSON response validation against required fields
 *   - Graceful fallback when validation fails
 */

import { callAI, parseJSONArray, parseJSONObject, classifyAIError } from '../utils/aiHelper.js';

/**
 * Validate that a parsed object contains all required fields.
 * Returns { valid, data, errors }.
 */
function validateResponse(data, requiredFields, isArray = false) {
  if (!data) return { valid: false, data: null, errors: ['No data received from AI'] };

  const items = isArray ? (Array.isArray(data) ? data : [data]) : [data];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`Item ${i}: expected object, got ${typeof item}`);
      continue;
    }
    for (const field of requiredFields) {
      if (item[field] === undefined || item[field] === null || item[field] === '') {
        errors.push(`Item ${i}: missing required field "${field}"`);
      }
    }
    // Validate followUpQuestion is an object with required sub-fields if present
    if (item.followUpQuestion && typeof item.followUpQuestion === 'object') {
      const fu = item.followUpQuestion;
      for (const sub of ['question', 'options', 'correctAnswer']) {
        if (!fu[sub]) {
          errors.push(`Item ${i}: followUpQuestion missing "${sub}"`);
        }
      }
    }
    // Validate options is an array of strings
    if (item.options && Array.isArray(item.options)) {
      if (item.options.length === 0 && requiredFields.includes('options')) {
        // Some prompts allow empty options (e.g. short_answer) — skip
      }
    }
  }

  return { valid: errors.length === 0, data, errors };
}

/**
 * Call AI with a structured prompt template and validate the response.
 *
 * @param {object} prompt - From prompts.js: { system, user, responseFormat, requiredFields }
 * @param {object} options - { maxRetries, fallbackData }
 * @returns {object} The validated AI response data
 * @throws Classified AI error on failure
 */
export async function generateStructured(prompt, options = {}) {
  const { maxRetries, fallbackData } = options;
  const fullPrompt = `${prompt.system}\n\n${prompt.user}`;

  const aiOptions = {};
  if (maxRetries !== undefined) aiOptions.maxRetries = maxRetries;

  const { text } = await callAI(fullPrompt, aiOptions);

  // Parse based on expected format
  let parsed;
  if (prompt.responseFormat === 'array') {
    parsed = parseJSONArray(text);
  } else if (prompt.responseFormat === 'object') {
    parsed = parseJSONObject(text);
  } else {
    // Try object first, then array
    parsed = parseJSONObject(text) || parseJSONArray(text);
  }

  if (!parsed) {
    if (fallbackData) {
      console.warn('AI returned unparseable response, using fallback data');
      return { ...fallbackData, _fallback: true };
    }
    throw { type: 'parse', status: 502, userMessage: 'AI returned an unexpected response. Please try again.', detail: 'Failed to parse AI response' };
  }

  // Validate required fields
  const isArray = prompt.responseFormat === 'array';
  const validation = validateResponse(parsed, prompt.requiredFields, isArray);

  if (!validation.valid) {
    console.warn('AI response validation warnings:', validation.errors);
    // If critical fields are missing and we have fallback, use it
    if (fallbackData) {
      return { ...fallbackData, _fallback: true, _warnings: validation.errors };
    }
    // Otherwise return what we got — the route handler can decide
    console.warn('Returning partially validated AI response');
  }

  return { data: parsed, warnings: validation.errors };
}

/**
 * Convenience: get Learning Twin context for adaptive tutoring.
 * This is a DB-only call (no AI involved), used to build context prompts.
 */
export async function buildLearningTwinContext(pool, studentId) {
  const { sql } = await import('../db.js');

  const [masteryResult, misconceptionsResult, patternsResult, whyEngineResult] = await Promise.all([
    pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`SELECT c.name, kp.mastery_level, kp.misconceptions
              FROM KnowledgeProfile kp
              JOIN Concepts c ON kp.concept_id = c.id
              WHERE kp.student_id = @studentId`),
    pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`SELECT topic, misconception, severity
              FROM StudentMisconceptions
              WHERE student_id = @studentId AND resolved = 0`),
    pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`SELECT pattern_text, confidence
              FROM LearningPatterns
              WHERE student_id = @studentId AND active = 1`),
    pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`SELECT TOP 5 topic, identified_misconception, confidence, explanation, steps_count, resolved
              FROM WhyEngineSessions
              WHERE student_id = @studentId
              ORDER BY created_at DESC`),
  ]);

  return {
    topics: masteryResult.recordset,
    misconceptions: misconceptionsResult.recordset,
    patterns: patternsResult.recordset,
    whyEngineData: whyEngineResult.recordset,
    unresolvedMisconceptions: whyEngineResult.recordset.filter(w => !w.resolved),
  };
}
