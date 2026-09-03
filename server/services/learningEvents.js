/**
 * LEARNING EVENTS SERVICE
 * Single source of truth for writing to the LearningEvents table
 * (the granular activity log for the Learning Twin).
 * Used by the standalone endpoint and by feature handlers (questions,
 * flashcards, exams) so every feature logs through the same code path.
 */
import { sql } from '../db.js';
import { sanitizeString, clampInt } from '../utils/validate.js';

/**
 * Insert a learning event for a student.
 * All fields are optional except eventType; invalid values are coerced to null.
 * Returns the inserted row ({ id, created_at }) or null if eventType is invalid.
 */
export async function logLearningEvent(pool, studentId, {
  eventType,
  conceptName = null,
  topic = null,
  isCorrect = null,
  difficulty = null,
  timeSpentSeconds = null,
  metadata = null,
}) {
  const safeEventType = sanitizeString(eventType, 50);
  if (!safeEventType) return null;

  const safeConceptName = conceptName ? sanitizeString(conceptName, 300) : null;
  const safeTopic = topic ? sanitizeString(topic, 300) : null;
  const safeIsCorrect = typeof isCorrect === 'boolean' ? isCorrect : null;
  const safeDifficulty = difficulty !== undefined && difficulty !== null
    ? clampInt(difficulty, 1, 10, null)
    : null;
  const safeTimeSpent = timeSpentSeconds !== undefined && timeSpentSeconds !== null
    ? clampInt(timeSpentSeconds, 0, 2147483647, null)
    : null;

  let safeMetadata = null;
  if (metadata !== undefined && metadata !== null) {
    safeMetadata = (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)).substring(0, 8000);
  }

  const result = await pool.request()
    .input('studentId', sql.Int, studentId)
    .input('eventType', sql.NVarChar, safeEventType)
    .input('conceptName', sql.NVarChar, safeConceptName)
    .input('topic', sql.NVarChar, safeTopic)
    .input('isCorrect', sql.Bit, safeIsCorrect)
    .input('difficulty', sql.Int, safeDifficulty)
    .input('timeSpentSeconds', sql.Int, safeTimeSpent)
    .input('metadata', sql.NVarChar, safeMetadata)
    .query(`
      INSERT INTO LearningEvents (student_id, event_type, concept_name, topic, is_correct, difficulty, time_spent_seconds, metadata)
      OUTPUT INSERTED.id, INSERTED.created_at
      VALUES (@studentId, @eventType, @conceptName, @topic, @isCorrect, @difficulty, @timeSpentSeconds, @metadata)
    `);

  return result.recordset[0] || null;
}