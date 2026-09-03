import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { sanitizeString, clampInt, requireFields, rateLimit } from '../utils/validate.js';
import { logLearningEvent } from '../services/learningEvents.js';

const router = Router();

// Record a learning event (granular activity log for the Learning Twin)
router.post('/', authenticate, rateLimit({ windowMs: 60000, max: 60 }), async (req, res) => {
  try {
    const missing = requireFields(req.body, ['eventType']);
    if (missing) return res.status(400).json({ error: missing });

    const eventType = sanitizeString(req.body.eventType, 50);
    if (!eventType) return res.status(400).json({ error: 'eventType must be a non-empty string' });

    const pool = await getPool();
    const event = await logLearningEvent(pool, req.userId, {
      eventType,
      conceptName: req.body.conceptName,
      topic: req.body.topic,
      isCorrect: req.body.isCorrect,
      difficulty: req.body.difficulty,
      timeSpentSeconds: req.body.timeSpentSeconds,
      metadata: req.body.metadata,
    });

    res.status(201).json({
      id: event.id,
      eventType,
      conceptName: req.body.conceptName ? sanitizeString(req.body.conceptName, 300) : null,
      topic: req.body.topic ? sanitizeString(req.body.topic, 300) : null,
      isCorrect: typeof req.body.isCorrect === 'boolean' ? req.body.isCorrect : null,
      difficulty: req.body.difficulty !== undefined && req.body.difficulty !== null
        ? clampInt(req.body.difficulty, 1, 10, null)
        : null,
      timeSpentSeconds: req.body.timeSpentSeconds !== undefined && req.body.timeSpentSeconds !== null
        ? clampInt(req.body.timeSpentSeconds, 0, 2147483647, null)
        : null,
      createdAt: event.created_at,
    });
  } catch (err) {
    console.error('Record learning event error:', err);
    res.status(500).json({ error: 'Failed to record learning event' });
  }
});

// Get the student's learning events (most recent first)
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, 1, 200, 50);
    const eventType = req.query.eventType ? sanitizeString(req.query.eventType, 50) : null;
    const pool = await getPool();

    const request = pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('limit', sql.Int, limit);

    let where = 'WHERE student_id = @studentId';
    if (eventType) {
      where += ' AND event_type = @eventType';
      request.input('eventType', sql.NVarChar, eventType);
    }

    const result = await request.query(`
      SELECT TOP (@limit) id, event_type, concept_name, topic, is_correct, difficulty,
             time_spent_seconds, metadata, created_at
      FROM LearningEvents
      ${where}
      ORDER BY created_at DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Get learning events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;