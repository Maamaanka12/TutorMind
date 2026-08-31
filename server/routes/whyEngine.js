import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generateStructured } from '../services/aiService.js';
import { misconceptionDetection, targetedRemediation, freeFormMisconception } from '../services/prompts.js';
import { parseId, sanitizeString, rateLimit } from '../utils/validate.js';
import 'dotenv/config';

const router = Router();

// ============================================
// POST /api/why-engine/analyze
// Analyze a wrong answer: identify misconception, generate explanation + follow-up
// ============================================
router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { questionId, studentAnswer, questionText, options, correctAnswer, conceptId } = req.body;
    const pool = await getPool();
    const studentId = req.userId;

    // Validate required fields
    if (!questionText || studentAnswer === undefined || !correctAnswer) {
      return res.status(400).json({ error: 'questionText, studentAnswer, and correctAnswer are required' });
    }
    // Validate conceptId if provided
    const safeConceptId = conceptId ? parseId(conceptId) : null;

    // Get existing misconceptions for this student (if any related)
    let existingMisconceptions = [];
    if (safeConceptId) {
      const conceptResult = await pool.request()
        .input('conceptId', sql.Int, safeConceptId)
        .input('studentId', sql.Int, studentId)
        .query('SELECT c.name FROM Concepts c JOIN Materials m ON c.material_id = m.id WHERE c.id = @conceptId AND m.student_id = @studentId');
      
      if (conceptResult.recordset.length > 0) {
        const topic = conceptResult.recordset[0].name;
        const miscResult = await pool.request()
          .input('studentId', sql.Int, studentId)
          .input('topic', sql.NVarChar, topic)
          .query(`
            SELECT misconception, severity, occurrences
            FROM StudentMisconceptions
            WHERE student_id = @studentId AND topic = @topic AND resolved = 0
            ORDER BY occurrences DESC
          `);
        existingMisconceptions = miscResult.recordset;
      }
    }

    // Get student's mastery level for context (with ownership check)
    let masteryContext = '';
    if (safeConceptId) {
      const masteryResult = await pool.request()
        .input('studentId', sql.Int, studentId)
        .input('conceptId', sql.Int, safeConceptId)
        .query('SELECT mastery_level FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId');
      
      if (masteryResult.recordset.length > 0) {
        masteryContext = `Current mastery level: ${Math.round(masteryResult.recordset[0].mastery_level * 100)}%. `;
      }
    }

    // Use AI to analyze the misconception
    const prompt = misconceptionDetection({
      questionText,
      options,
      correctAnswer,
      studentAnswer,
      existingMisconceptions,
      masteryContext,
    });

    const { data: analysis } = await generateStructured(prompt);

    // Get concept name for topic (with ownership check)
    let topic = 'Unknown';
    if (safeConceptId) {
      const conceptResult = await pool.request()
        .input('conceptId', sql.Int, safeConceptId)
        .input('studentId', sql.Int, studentId)
        .query('SELECT c.name FROM Concepts c JOIN Materials m ON c.material_id = m.id WHERE c.id = @conceptId AND m.student_id = @studentId');
      if (conceptResult.recordset.length > 0) {
        topic = conceptResult.recordset[0].name;
      }
    }

    // Store/update misconception in StudentMisconceptions
    let misconceptionId = null;
    const existingMisc = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('topic', sql.NVarChar, topic)
      .query(`
        SELECT id, occurrences FROM StudentMisconceptions
        WHERE student_id = @studentId AND topic = @topic AND resolved = 0
        ORDER BY occurrences DESC
      `);

    if (existingMisc.recordset.length > 0) {
      misconceptionId = existingMisc.recordset[0].id;
      await pool.request()
        .input('id', sql.Int, misconceptionId)
        .query(`UPDATE StudentMisconceptions 
                SET occurrences = occurrences + 1, last_detected = GETDATE(), updated_at = GETDATE() 
                WHERE id = @id`);
    } else {
      const insertResult = await pool.request()
        .input('studentId', sql.Int, studentId)
        .input('conceptId', sql.Int, safeConceptId)
        .input('topic', sql.NVarChar, topic)
        .input('misconception', sql.NVarChar, analysis.misconception)
        .input('severity', sql.NVarChar, analysis.confidence === 'high' ? 'high' : analysis.confidence === 'medium' ? 'medium' : 'low')
        .query(`
          INSERT INTO StudentMisconceptions (student_id, concept_id, topic, misconception, severity)
          OUTPUT INSERTED.id
          VALUES (@studentId, @conceptId, @topic, @misconception, @severity)
        `);
      misconceptionId = insertResult.recordset[0].id;
    }

    // Create a Why Engine session to track this investigation
    const sessionResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('misconceptionId', sql.Int, misconceptionId)
      .input('originalQuestion', sql.NVarChar, questionText)
      .input('studentAnswer', sql.NVarChar, studentAnswer)
      .input('correctAnswer', sql.NVarChar, correctAnswer)
      .input('topic', sql.NVarChar, topic)
      .input('identifiedMisconception', sql.NVarChar, analysis.misconception)
      .input('confidence', sql.NVarChar, analysis.confidence)
      .input('explanation', sql.NVarChar, analysis.explanation)
      .input('followUpQuestion', sql.NVarChar, analysis.followUpQuestion)
      .input('followUpOptions', sql.NVarChar, JSON.stringify(analysis.followUpOptions))
      .input('followUpCorrectAnswer', sql.NVarChar, analysis.followUpCorrectAnswer)
      .query(`
        INSERT INTO WhyEngineSessions 
          (student_id, misconception_id, original_question, student_answer, correct_answer,
           topic, identified_misconception, confidence, explanation,
           follow_up_question, follow_up_options, follow_up_correct_answer)
        OUTPUT INSERTED.id
        VALUES (@studentId, @misconceptionId, @originalQuestion, @studentAnswer, @correctAnswer,
                @topic, @identifiedMisconception, @confidence, @explanation,
                @followUpQuestion, @followUpOptions, @followUpCorrectAnswer)
      `);

    // Update KnowledgeProfile - reduce mastery (with ownership check)
    if (safeConceptId) {
      await pool.request()
        .input('studentId', sql.Int, studentId)
        .input('conceptId', sql.Int, safeConceptId)
        .input('misconception', sql.NVarChar, analysis.misconception)
        .query(`
          IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
            UPDATE KnowledgeProfile SET mastery_level = CASE WHEN mastery_level - 0.1 < 0 THEN 0 ELSE mastery_level - 0.1 END, 
              misconceptions = @misconception, updated_at = GETDATE()
            WHERE student_id = @studentId AND concept_id = @conceptId
          ELSE
            INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level, misconceptions) 
            VALUES (@studentId, @conceptId, 0.2, @misconception)
        `);
    }

    res.json({
      sessionId: sessionResult.recordset[0].id,
      misconceptionId,
      misconception: analysis.misconception,
      confidence: analysis.confidence,
      explanation: analysis.explanation,
      followUpQuestion: analysis.followUpQuestion,
      followUpOptions: analysis.followUpOptions,
      followUpCorrectAnswer: analysis.followUpCorrectAnswer,
      topic,
    });
  } catch (err) {
    console.error('Why Engine analyze error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Analysis failed. Please try again later.' });
  }
});

// ============================================
// POST /api/why-engine/resolve
// Evaluate follow-up answer — did the student resolve the misconception?
// ============================================
router.post('/resolve', authenticate, async (req, res) => {
  try {
    const { sessionId, followUpAnswer } = req.body;
    const pool = await getPool();
    const studentId = req.userId;

    if (!sessionId || followUpAnswer === undefined) {
      return res.status(400).json({ error: 'sessionId and followUpAnswer are required' });
    }
    const safeSessionId = parseId(sessionId);
    if (!safeSessionId) return res.status(400).json({ error: 'Invalid sessionId' });

    // Get the session (ownership verified via student_id)
    const sessionResult = await pool.request()
      .input('id', sql.Int, safeSessionId)
      .input('studentId', sql.Int, studentId)
      .query('SELECT * FROM WhyEngineSessions WHERE id = @id AND student_id = @studentId');

    if (sessionResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.recordset[0];
    const isCorrect = followUpAnswer === session.follow_up_correct_answer;

    // Update the session with the follow-up answer (ownership check)
    await pool.request()
      .input('id', sql.Int, safeSessionId)
      .input('studentId', sql.Int, studentId)
      .input('followUpAnswer', sql.NVarChar, followUpAnswer)
      .query(`
        UPDATE WhyEngineSessions 
        SET follow_up_student_answer = @followUpAnswer, updated_at = GETDATE()
        WHERE id = @id AND student_id = @studentId
      `);

    let resolutionStatus;
    let responseMessage;
    let nextFollowUp = null;

    if (isCorrect) {
      // Student understood! Check if this is enough evidence to resolve
      let totalSessions = 1;
      if (session.misconception_id) {
        const sessionCount = await pool.request()
          .input('misconceptionId', sql.Int, session.misconception_id)
          .input('studentId', sql.Int, studentId)
          .query(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved_count
            FROM WhyEngineSessions
            WHERE misconception_id = @misconceptionId AND student_id = @studentId
          `);
        totalSessions = sessionCount.recordset[0].total;
      }

      // If this is the first follow-up or they've gotten it right before, mark as improving
      if (totalSessions <= 1) {
        resolutionStatus = 'improving';
        responseMessage = `Great work! You answered correctly. Your understanding of this concept is improving. The Why Engine will continue to monitor this area.`;
      } else {
        // Multiple correct follow-ups — mark as resolved
        resolutionStatus = 'resolved';
        responseMessage = `Excellent! You've demonstrated understanding of this concept. The misconception appears to be resolved.`;

        // Mark the misconception as resolved
        if (session.misconception_id) {
          await pool.request()
            .input('id', sql.Int, session.misconception_id)
            .query(`
              UPDATE StudentMisconceptions 
              SET resolved = 1, updated_at = GETDATE()
              WHERE id = @id
            `);
        }

        // Boost mastery
        // Get concept_id from the misconception
        if (session.misconception_id) {
          const miscResult = await pool.request()
            .input('id', sql.Int, session.misconception_id)
            .query('SELECT concept_id FROM StudentMisconceptions WHERE id = @id');
          
          if (miscResult.recordset.length > 0 && miscResult.recordset[0].concept_id) {
            await pool.request()
              .input('studentId', sql.Int, studentId)
              .input('conceptId', sql.Int, miscResult.recordset[0].concept_id)
              .query(`
                IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
                  UPDATE KnowledgeProfile SET mastery_level = CASE WHEN mastery_level + 0.2 > 1 THEN 1 ELSE mastery_level + 0.2 END, 
                    updated_at = GETDATE(), last_assessed = GETDATE()
                  WHERE student_id = @studentId AND concept_id = @conceptId
                ELSE
                  INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level) 
                  VALUES (@studentId, @conceptId, 0.5)
              `);
          }
        }
      }

      // Update the session as resolved (ownership check)
      await pool.request()
        .input('id', sql.Int, safeSessionId)
        .input('studentId', sql.Int, studentId)
        .input('status', sql.NVarChar, resolutionStatus)
        .query(`
          UPDATE WhyEngineSessions 
          SET resolved = 1, resolution_status = @status, updated_at = GETDATE()
          WHERE id = @id AND student_id = @studentId
        `);

    } else {
      // Still incorrect — increase severity, generate another follow-up
      resolutionStatus = 'in_progress';

      // Increase severity if repeated failures
      if (session.misconception_id) {
        await pool.request()
          .input('id', sql.Int, session.misconception_id)
          .query(`
            UPDATE StudentMisconceptions 
            SET occurrences = occurrences + 1, severity = 'high', last_detected = GETDATE(), updated_at = GETDATE()
            WHERE id = @id
          `);
      }

      // Generate another targeted follow-up
      const remediationPrompt = targetedRemediation({
        originalQuestion: session.original_question,
        studentOriginalAnswer: session.student_answer,
        correctAnswer: session.correct_answer,
        misconception: session.identified_misconception,
        explanationGiven: session.explanation,
        studentFollowUpAnswer: followUpAnswer,
      });

      try {
        const { data: newFollowUp } = await generateStructured(remediationPrompt, { maxRetries: 1 });

        // Update the session with the new follow-up (ownership check)
        await pool.request()
          .input('id', sql.Int, safeSessionId)
          .input('explanation', sql.NVarChar, newFollowUp.explanation)
          .input('followUpQuestion', sql.NVarChar, newFollowUp.followUpQuestion)
          .input('followUpOptions', sql.NVarChar, JSON.stringify(newFollowUp.followUpOptions))
          .input('followUpCorrectAnswer', sql.NVarChar, newFollowUp.followUpCorrectAnswer)
          .query(`
            UPDATE WhyEngineSessions 
            SET explanation = @explanation, follow_up_question = @followUpQuestion,
                follow_up_options = @followUpOptions, follow_up_correct_answer = @followUpCorrectAnswer,
                follow_up_student_answer = NULL, steps_count = steps_count + 1, updated_at = GETDATE()
            WHERE id = @id
          `);

        nextFollowUp = {
          sessionId,
          explanation: newFollowUp.explanation,
          followUpQuestion: newFollowUp.followUpQuestion,
          followUpOptions: newFollowUp.followUpOptions,
          followUpCorrectAnswer: newFollowUp.followUpCorrectAnswer,
        };
      } catch (aiErr) {
        console.error('Why Engine follow-up generation error:', aiErr.detail || aiErr.message);
        // Continue without a new follow-up — the student still gets feedback
      }

      responseMessage = `The student is still struggling with this concept. The Why Engine is generating a different approach.`;
    }

    res.json({
      sessionId,
      isCorrect,
      resolutionStatus,
      responseMessage,
      misconception: session.identified_misconception,
      topic: session.topic,
      nextFollowUp,
    });
  } catch (err) {
    console.error('Why Engine resolve error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Resolution check failed. Please try again later.' });
  }
});

// ============================================
// GET /api/why-engine/history
// Get the student's misconception investigation history
// ============================================
router.get('/history', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const studentId = req.userId;
    const limit = parseInt(req.query.limit) || 20;

    const result = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          w.id, w.original_question, w.student_answer, w.correct_answer,
          w.topic, w.identified_misconception, w.confidence, w.explanation,
          w.follow_up_student_answer, w.resolved, w.resolution_status,
          w.steps_count, w.created_at, w.updated_at,
          sm.severity, sm.occurrences as total_occurrences
        FROM WhyEngineSessions w
        LEFT JOIN StudentMisconceptions sm ON w.misconception_id = sm.id
        WHERE w.student_id = @studentId
        ORDER BY w.created_at DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Why Engine history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ============================================
// GET /api/why-engine/stats
// Get statistics about the student's misconception resolution
// ============================================
router.get('/stats', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const studentId = req.userId;

    const statsResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT 
          COUNT(*) as total_investigations,
          SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN resolution_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN resolution_status = 'improving' THEN 1 ELSE 0 END) as improving,
          ISNULL(AVG(steps_count), 0) as avg_steps,
          SUM(CASE WHEN confidence = 'high' THEN 1 ELSE 0 END) as high_confidence
        FROM WhyEngineSessions
        WHERE student_id = @studentId
      `);

    const topicStats = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT topic, 
               COUNT(*) as investigations,
               SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved,
               MAX(confidence) as highest_confidence
        FROM WhyEngineSessions
        WHERE student_id = @studentId
        GROUP BY topic
        ORDER BY COUNT(*) DESC
      `);

    res.json({
      overall: statsResult.recordset[0],
      byTopic: topicStats.recordset,
    });
  } catch (err) {
    console.error('Why Engine stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// GET /api/why-engine/session/:id
// Get a specific investigation session with full details
// ============================================
router.get('/session/:id', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const { id } = req.params;

    const safeId = parseId(id);
    if (!safeId) return res.status(400).json({ error: 'Invalid session ID' });

    const result = await pool.request()
      .input('id', sql.Int, safeId)
      .input('studentId', sql.Int, req.userId)
      .query(`
        SELECT w.*, sm.severity, sm.occurrences as total_occurrences
        FROM WhyEngineSessions w
        LEFT JOIN StudentMisconceptions sm ON w.misconception_id = sm.id
        WHERE w.id = @id AND w.student_id = @studentId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Why Engine session error:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ============================================
// POST /api/why-engine/free-form
// Analyze a free-form wrong answer (for AI chat integration)
// ============================================
router.post('/free-form', authenticate, async (req, res) => {
  try {
    const { questionText, studentAnswer, topic } = req.body;
    const pool = await getPool();
    const studentId = req.userId;

    if (!questionText || !studentAnswer) {
      return res.status(400).json({ error: 'questionText and studentAnswer are required' });
    }

    // Get existing misconceptions for context
    let existingMisconceptions = [];
    if (topic) {
      const miscResult = await pool.request()
        .input('studentId', sql.Int, studentId)
        .input('topic', sql.NVarChar, topic)
        .query(`
          SELECT misconception, severity, occurrences
          FROM StudentMisconceptions
          WHERE student_id = @studentId AND topic = @topic AND resolved = 0
        `);
      existingMisconceptions = miscResult.recordset;
    }

    const prompt = freeFormMisconception({
      questionText,
      studentAnswer,
      topic,
      existingMisconceptions,
    });

    const { data: analysis } = await generateStructured(prompt);
    const resolvedTopic = topic || analysis.topic || 'Unknown';

    // Store misconception
    let misconceptionId = null;
    const existingMisc = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('topic', sql.NVarChar, resolvedTopic)
      .query(`
        SELECT id FROM StudentMisconceptions
        WHERE student_id = @studentId AND topic = @topic AND resolved = 0
        ORDER BY occurrences DESC
      `);

    if (existingMisc.recordset.length > 0) {
      misconceptionId = existingMisc.recordset[0].id;
      await pool.request()
        .input('id', sql.Int, misconceptionId)
        .query(`UPDATE StudentMisconceptions SET occurrences = occurrences + 1, last_detected = GETDATE(), updated_at = GETDATE() WHERE id = @id`);
    } else {
      const insertResult = await pool.request()
        .input('studentId', sql.Int, studentId)
        .input('topic', sql.NVarChar, resolvedTopic)
        .input('misconception', sql.NVarChar, analysis.misconception)
        .input('severity', sql.NVarChar, analysis.confidence === 'high' ? 'high' : 'medium')
        .query(`
          INSERT INTO StudentMisconceptions (student_id, topic, misconception, severity)
          OUTPUT INSERTED.id
          VALUES (@studentId, @topic, @misconception, @severity)
        `);
      misconceptionId = insertResult.recordset[0].id;
    }

    // Create session
    const sessionResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('misconceptionId', sql.Int, misconceptionId)
      .input('originalQuestion', sql.NVarChar, sanitizeString(questionText, 5000))
      .input('studentAnswer', sql.NVarChar, sanitizeString(studentAnswer, 2000))
      .input('correctAnswer', sql.NVarChar, 'Pending review')
      .input('topic', sql.NVarChar, resolvedTopic)
      .input('identifiedMisconception', sql.NVarChar, analysis.misconception)
      .input('confidence', sql.NVarChar, analysis.confidence)
      .input('explanation', sql.NVarChar, analysis.explanation)
      .input('followUpQuestion', sql.NVarChar, analysis.followUpQuestion)
      .input('followUpOptions', sql.NVarChar, JSON.stringify(analysis.followUpOptions))
      .input('followUpCorrectAnswer', sql.NVarChar, analysis.followUpCorrectAnswer)
      .query(`
        INSERT INTO WhyEngineSessions 
          (student_id, misconception_id, original_question, student_answer, correct_answer,
           topic, identified_misconception, confidence, explanation,
           follow_up_question, follow_up_options, follow_up_correct_answer)
        OUTPUT INSERTED.id
        VALUES (@studentId, @misconceptionId, @originalQuestion, @studentAnswer, @correctAnswer,
                @topic, @identifiedMisconception, @confidence, @explanation,
                @followUpQuestion, @followUpOptions, @followUpCorrectAnswer)
      `);

    res.json({
      sessionId: sessionResult.recordset[0].id,
      misconceptionId,
      topic: resolvedTopic,
      misconception: analysis.misconception,
      confidence: analysis.confidence,
      reasoningAnalysis: analysis.reasoningAnalysis,
      explanation: analysis.explanation,
      followUpQuestion: analysis.followUpQuestion,
      followUpOptions: analysis.followUpOptions,
      followUpCorrectAnswer: analysis.followUpCorrectAnswer,
    });
  } catch (err) {
    console.error('Why Engine free-form error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Analysis failed. Please try again later.' });
  }
});

export default router;
