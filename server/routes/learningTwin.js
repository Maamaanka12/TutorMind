import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generateStructured } from '../services/aiService.js';
import { patternDetection } from '../services/prompts.js';
import { parseId, sanitizeString, rateLimit } from '../utils/validate.js';
import 'dotenv/config';

const router = Router();

// Get full Learning Twin data
router.get('/', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const studentId = req.userId;

    // 1. Topic mastery from KnowledgeProfile
    const masteryResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT kp.id, kp.mastery_level, kp.misconceptions, kp.last_assessed, kp.updated_at,
               c.id as concept_id, c.name as concept_name, c.description as concept_description,
               c.difficulty_level, m.title as material_title
        FROM KnowledgeProfile kp
        JOIN Concepts c ON kp.concept_id = c.id
        LEFT JOIN Materials m ON c.material_id = m.id
        WHERE kp.student_id = @studentId
        ORDER BY kp.mastery_level DESC
      `);

    // 2. Active misconceptions from StudentMisconceptions
    const misconceptionsResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT id, topic, misconception, severity, occurrences, resolved,
               first_detected, last_detected
        FROM StudentMisconceptions
        WHERE student_id = @studentId
        ORDER BY occurrences DESC, last_detected DESC
      `);

    // 3. Learning patterns
    const patternsResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT id, pattern_type, pattern_text, evidence_count, confidence, active,
               first_detected, last_detected
        FROM LearningPatterns
        WHERE student_id = @studentId AND active = 1
        ORDER BY confidence DESC
      `);

    // 4. Flashcard stats
    const flashcardStats = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT 
          COUNT(DISTINCT f.id) as total_cards,
          COUNT(DISTINCT CASE WHEN fp.mastery_level >= 0.8 THEN f.id END) as mastered,
          COUNT(DISTINCT CASE WHEN fp.next_review <= GETDATE() OR fp.next_review IS NULL THEN f.id END) as due,
          ISNULL(AVG(CASE WHEN fp.times_seen > 0 THEN CAST(fp.times_correct AS FLOAT) / NULLIF(fp.times_seen, 0) END), 0) as accuracy
        FROM Flashcards f
        LEFT JOIN FlashcardProgress fp ON f.id = fp.flashcard_id AND fp.student_id = f.student_id
        WHERE f.student_id = @studentId
      `);

    // 5. Exam stats
    const examStats = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT 
          COUNT(*) as total_exams,
          ISNULL(AVG(percentage), 0) as avg_score,
          MAX(percentage) as best_score,
          MAX(submitted_at) as last_exam_date
        FROM Exams
        WHERE student_id = @studentId AND status = 'completed'
      `);

    // 6. Recent activity (last 20 answers)
    const recentActivity = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT TOP 20 a.is_correct, a.created_at, q.question_text, c.name as concept_name
        FROM Answers a
        JOIN Questions q ON a.question_id = q.id
        JOIN Concepts c ON q.concept_id = c.id
        WHERE a.student_id = @studentId
        ORDER BY a.created_at DESC
      `);

    // 7. Calculate overall mastery
    const topics = masteryResult.recordset;
    const overallMastery = topics.length > 0
      ? topics.reduce((sum, t) => sum + (t.mastery_level || 0), 0) / topics.length
      : 0;

    // 8. Identify strong and weak topics
    const strongTopics = topics.filter(t => t.mastery_level >= 0.7);
    const weakTopics = topics.filter(t => t.mastery_level < 0.5);
    const reviewTopics = topics.filter(t => t.mastery_level >= 0.5 && t.mastery_level < 0.7);

    // 9. Generate recommendations based on data
    const recommendations = generateRecommendations({
      topics,
      strongTopics,
      weakTopics,
      reviewTopics,
      misconceptions: misconceptionsResult.recordset,
      patterns: patternsResult.recordset,
      flashcardStats: flashcardStats.recordset[0],
      examStats: examStats.recordset[0],
      recentActivity: recentActivity.recordset,
    });

    res.json({
      overallMastery: Math.round(overallMastery * 100),
      topicMastery: topics.map(t => ({
        concept_id: t.concept_id,
        name: t.concept_name,
        description: t.concept_description,
        material: t.material_title,
        mastery: Math.round((t.mastery_level || 0) * 100),
        difficulty: t.difficulty_level,
        lastAssessed: t.last_assessed,
        hasMisconception: !!t.misconceptions,
      })),
      strongTopics: strongTopics.map(t => ({
        name: t.concept_name,
        mastery: Math.round((t.mastery_level || 0) * 100),
      })),
      weakTopics: weakTopics.map(t => ({
        name: t.concept_name,
        mastery: Math.round((t.mastery_level || 0) * 100),
      })),
      reviewTopics: reviewTopics.map(t => ({
        name: t.concept_name,
        mastery: Math.round((t.mastery_level || 0) * 100),
      })),
      misconceptions: misconceptionsResult.recordset.filter(m => !m.resolved),
      resolvedMisconceptions: misconceptionsResult.recordset.filter(m => m.resolved),
      patterns: patternsResult.recordset,
      flashcardStats: {
        total: flashcardStats.recordset[0].total_cards,
        mastered: flashcardStats.recordset[0].mastered,
        due: flashcardStats.recordset[0].due,
        accuracy: Math.round((flashcardStats.recordset[0].accuracy || 0) * 100),
      },
      examStats: {
        total: examStats.recordset[0].total_exams,
        avgScore: Math.round(examStats.recordset[0].avg_score || 0),
        bestScore: Math.round(examStats.recordset[0].best_score || 0),
        lastExam: examStats.recordset[0].last_exam_date,
      },
      recentActivity: recentActivity.recordset,
      recommendations,
    });
  } catch (err) {
    console.error('Get learning twin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Learning Twin context for AI tutoring
router.get('/context', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const studentId = req.userId;

    // Get topic mastery
    const masteryResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT c.name, kp.mastery_level, kp.misconceptions
        FROM KnowledgeProfile kp
        JOIN Concepts c ON kp.concept_id = c.id
        WHERE kp.student_id = @studentId
      `);

    // Get active misconceptions
    const misconceptionsResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT topic, misconception, severity, occurrences
        FROM StudentMisconceptions
        WHERE student_id = @studentId AND resolved = 0
      `);

    // Get learning patterns
    const patternsResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT pattern_text, confidence
        FROM LearningPatterns
        WHERE student_id = @studentId AND active = 1
      `);

    // Build context string for AI
    const topics = masteryResult.recordset.map(t => 
      `${t.name}: ${Math.round(t.mastery_level * 100)}%${t.misconceptions ? ' (has misconceptions)' : ''}`
    ).join(', ');

    const misconceptions = misconceptionsResult.recordset.map(m =>
      `${m.topic}: ${m.misconception} (severity: ${m.severity}, occurrences: ${m.occurrences})`
    ).join('; ');

    const patterns = patternsResult.recordset.map(p => p.pattern_text).join('; ');

    const context = {
      topics: masteryResult.recordset,
      misconceptions: misconceptionsResult.recordset,
      patterns: patternsResult.recordset,
      contextString: `Student profile: ${topics || 'No topics studied yet'}. ` +
        `Active misconceptions: ${misconceptions || 'None'}. ` +
        `Learning patterns: ${patterns || 'Not yet detected'}.`,
    };

    res.json(context);
  } catch (err) {
    console.error('Get learning twin context error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record a misconception
router.post('/misconceptions', authenticate, async (req, res) => {
  try {      const { conceptId, topic, misconception, severity = 'medium' } = req.body;

      // Validate inputs
      const safeTopic = sanitizeString(topic, 300);
      const safeMisconception = sanitizeString(misconception, 2000);
      if (!safeTopic || !safeMisconception) {
        return res.status(400).json({ error: 'topic and misconception are required' });
      }
      const safeConceptId = conceptId ? parseId(conceptId) : null;
      const safeSeverity = ['low', 'medium', 'high'].includes(severity) ? severity : 'medium';

      const pool = await getPool();

      // Check if this misconception already exists for this topic (with student_id)
      const existing = await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('topic', sql.NVarChar, safeTopic)
        .input('misconception', sql.NVarChar, safeMisconception)
      .query(`
        SELECT id, occurrences FROM StudentMisconceptions
        WHERE student_id = @studentId AND topic = @topic AND misconception = @misconception AND resolved = 0
      `);

    if (existing.recordset.length > 0) {
      // Update occurrence count
      const id = existing.recordset[0].id;
      await pool.request()
        .input('id', sql.Int, id)
        .query(`
          UPDATE StudentMisconceptions 
          SET occurrences = occurrences + 1, last_detected = GETDATE(), updated_at = GETDATE()
          WHERE id = @id
        `);
      res.json({ id, updated: true });
    } else {
      // Insert new misconception
      const result = await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('conceptId', sql.Int, safeConceptId)
        .input('topic', sql.NVarChar, safeTopic)
        .input('misconception', sql.NVarChar, safeMisconception)
        .input('severity', sql.NVarChar, safeSeverity)
        .query(`
          INSERT INTO StudentMisconceptions (student_id, concept_id, topic, misconception, severity)
          OUTPUT INSERTED.id
          VALUES (@studentId, @conceptId, @topic, @misconception, @severity)
        `);
      res.json({ id: result.recordset[0].id, updated: false });
    }
  } catch (err) {
    console.error('Record misconception error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve a misconception
router.put('/misconceptions/:id/resolve', authenticate, async (req, res) => {
  try {
    const miscId = parseId(req.params.id);
    if (!miscId) return res.status(400).json({ error: 'Invalid misconception ID' });
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, miscId)
      .input('studentId', sql.Int, req.userId)
      .query('UPDATE StudentMisconceptions SET resolved = 1, updated_at = GETDATE() WHERE id = @id AND student_id = @studentId');
    res.json({ success: true });
  } catch (err) {
    console.error('Resolve misconception error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Detect and record learning patterns using AI
router.post('/detect-patterns', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const studentId = req.userId;

    // Gather data for pattern detection
    const [answersResult, flashcardResult, examResult] = await Promise.all([
      pool.request()
        .input('studentId', sql.Int, studentId)
        .query(`
          SELECT TOP 50 a.is_correct, a.misconception, q.question_text, q.options, 
                 q.correct_answer, q.difficulty_level, c.name as concept_name
          FROM Answers a
          JOIN Questions q ON a.question_id = q.id
          JOIN Concepts c ON q.concept_id = c.id
          WHERE a.student_id = @studentId
          ORDER BY a.created_at DESC
        `),
      pool.request()
        .input('studentId', sql.Int, studentId)
        .query(`
          SELECT TOP 30 fp.times_correct, fp.times_incorrect, fp.mastery_level, f.card_type
          FROM FlashcardProgress fp
          JOIN Flashcards f ON fp.flashcard_id = f.id
          WHERE fp.student_id = @studentId AND fp.times_seen > 0
        `),
      pool.request()
        .input('studentId', sql.Int, studentId)
        .query(`
          SELECT TOP 10 e.percentage, ea.time_spent_seconds, eq.question_type
          FROM Exams e
          JOIN ExamAnswers ea ON e.id = ea.exam_id AND ea.student_id = @studentId
          JOIN ExamQuestions eq ON ea.question_id = eq.id
          WHERE e.student_id = @studentId AND e.status = 'completed'
        `),
    ]);

    const data = {
      recentAnswers: answersResult.recordset,
      flashcardPerformance: flashcardResult.recordset,
      examPerformance: examResult.recordset,
    };

    if (data.recentAnswers.length < 5) {
      return res.json({ patterns: [], message: 'Not enough data yet for pattern detection' });
    }

    // Use AI to detect patterns
    const prompt = patternDetection({
      recentAnswers: data.recentAnswers.slice(0, 20),
      flashcardPerformance: data.flashcardPerformance.slice(0, 10),
      examPerformance: data.examPerformance,
    });

    let detectedPatterns = [];
    try {
      const result = await generateStructured(prompt, { maxRetries: 1, fallbackData: [] });
      detectedPatterns = result.data || [];
    } catch (aiErr) {
      console.error('AI pattern detection failed:', aiErr.detail || aiErr.message);
      return res.json({
        patterns: [],
        message: 'AI pattern detection is temporarily unavailable. Please try again later.',
        aiUnavailable: true,
      });
    }

    // Save patterns to database
    for (const pattern of detectedPatterns) {
      // Check if pattern already exists
      const existing = await pool.request()
        .input('studentId', sql.Int, studentId)
        .input('type', sql.NVarChar, pattern.type)
        .query(`
          SELECT id FROM LearningPatterns
          WHERE student_id = @studentId AND pattern_type = @type AND active = 1
        `);

      if (existing.recordset.length > 0) {
        // Update existing pattern
        await pool.request()
          .input('id', sql.Int, existing.recordset[0].id)
          .input('text', sql.NVarChar, pattern.text)
          .input('confidence', sql.Float, pattern.confidence)
          .query(`
            UPDATE LearningPatterns 
            SET pattern_text = @text, confidence = @confidence, 
                evidence_count = evidence_count + 1, last_detected = GETDATE(), updated_at = GETDATE()
            WHERE id = @id
          `);
      } else {
        // Insert new pattern
        await pool.request()
          .input('studentId', sql.Int, studentId)
          .input('type', sql.NVarChar, pattern.type)
          .input('text', sql.NVarChar, pattern.text)
          .input('confidence', sql.Float, pattern.confidence)
          .query(`
            INSERT INTO LearningPatterns (student_id, pattern_type, pattern_text, confidence)
            VALUES (@studentId, @type, @text, @confidence)
          `);
      }
    }

    res.json({ patterns: detectedPatterns, count: detectedPatterns.length });
  } catch (err) {
    console.error('Detect patterns error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Pattern detection failed. Please try again later.' });
  }
});

// Get recommendations
router.get('/recommendations', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const studentId = req.userId;

    const [topicsResult, misconceptionsResult, flashcardResult, examResult] = await Promise.all([
      pool.request()
        .input('studentId', sql.Int, studentId)
        .query(`
          SELECT c.name, kp.mastery_level
          FROM KnowledgeProfile kp
          JOIN Concepts c ON kp.concept_id = c.id
          WHERE kp.student_id = @studentId
          ORDER BY kp.mastery_level ASC
        `),
      pool.request()
        .input('studentId', sql.Int, studentId)
        .query(`
          SELECT topic, misconception, severity, occurrences
          FROM StudentMisconceptions
          WHERE student_id = @studentId AND resolved = 0
          ORDER BY occurrences DESC
        `),
      pool.request()
        .input('studentId', sql.Int, studentId)
        .query(`
          SELECT COUNT(*) as due
          FROM Flashcards f
          LEFT JOIN FlashcardProgress fp ON f.id = fp.flashcard_id AND fp.student_id = f.student_id
          WHERE f.student_id = @studentId
          AND (fp.next_review <= GETDATE() OR fp.next_review IS NULL)
        `),
      pool.request()
        .input('studentId', sql.Int, studentId)
        .query(`
          SELECT TOP 3 title, percentage, analysis
          FROM Exams
          WHERE student_id = @studentId AND status = 'completed'
          ORDER BY submitted_at DESC
        `),
    ]);

    const recommendations = [];
    const topics = topicsResult.recordset;
    const misconceptions = misconceptionsResult.recordset;
    const dueCards = flashcardResult.recordset[0].due;
    const recentExams = examResult.recordset;

    // Recommend reviewing weak topics
    const weakTopics = topics.filter(t => t.mastery_level < 0.5);
    if (weakTopics.length > 0) {
      recommendations.push({
        type: 'review',
        priority: 'high',
        text: `Focus on weak topics: ${weakTopics.map(t => t.name).join(', ')}`,
        detail: `These topics have mastery below 50%. Consider studying them with flashcards or taking a focused exam.`,
      });
    }

    // Recommend flashcard review
    if (dueCards > 0) {
      recommendations.push({
        type: 'flashcards',
        priority: 'medium',
        text: `You have ${dueCards} flashcard${dueCards > 1 ? 's' : ''} due for review`,
        detail: 'Spaced repetition works best when you review cards on schedule.',
      });
    }

    // Address misconceptions
    if (misconceptions.length > 0) {
      const severe = misconceptions.filter(m => m.severity === 'high');
      if (severe.length > 0) {
        recommendations.push({
          type: 'misconception',
          priority: 'high',
          text: `Address critical misconception: ${severe[0].topic}`,
          detail: severe[0].misconception,
        });
      }
    }

    // Suggest exam for untested topics
    const untestedTopics = topics.filter(t => !t.mastery_level || t.mastery_level === 0);
    if (untestedTopics.length > 0) {
      recommendations.push({
        type: 'exam',
        priority: 'medium',
        text: `Take an exam to assess: ${untestedTopics.slice(0, 3).map(t => t.name).join(', ')}`,
        detail: 'These topics haven\'t been assessed yet. An exam will help calibrate your learning path.',
      });
    }

    // Recommend practice for topics between 50-70%
    const reviewTopics = topics.filter(t => t.mastery_level >= 0.5 && t.mastery_level < 0.7);
    if (reviewTopics.length > 0) {
      recommendations.push({
        type: 'practice',
        priority: 'medium',
        text: `Practice to strengthen: ${reviewTopics.map(t => t.name).join(', ')}`,
        detail: 'These topics are close to mastery. A few more correct answers will solidify your knowledge.',
      });
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

    res.json(recommendations.slice(0, 5));
  } catch (err) {
    console.error('Get recommendations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function generateRecommendations({ topics, weakTopics, reviewTopics, misconceptions, flashcardStats, examStats, recentActivity }) {
  const recommendations = [];

  // High priority: weak topics
  if (weakTopics.length > 0) {
    recommendations.push({
      type: 'priority',
      icon: 'alert',
      text: `Focus on: ${weakTopics.slice(0, 3).map(t => t.concept_name).join(', ')}`,
      detail: `${weakTopics.length} topic${weakTopics.length > 1 ? 's' : ''} need${weakTopics.length === 1 ? 's' : ''} attention (below 50% mastery)`,
    });
  }

  // Misconceptions to address
  const activeMisconceptions = misconceptions.filter(m => !m.resolved && m.severity === 'high');
  if (activeMisconceptions.length > 0) {
    recommendations.push({
      type: 'misconception',
      icon: 'warning',
      text: `Address misconception: ${activeMisconceptions[0].topic}`,
      detail: activeMisconceptions[0].misconception,
    });
  }

  // Flashcard review
  if (flashcardStats && flashcardStats.due > 0) {
    recommendations.push({
      type: 'flashcards',
      icon: 'cards',
      text: `Review ${flashcardStats.due} flashcard${flashcardStats.due > 1 ? 's' : ''}`,
      detail: 'Spaced repetition is most effective when you review on schedule',
    });
  }

  // Exam suggestion
  if (examStats && examStats.total === 0) {
    recommendations.push({
      type: 'exam',
      icon: 'exam',
      text: 'Take your first exam',
      detail: 'Assessment helps calibrate your learning path',
    });
  }

  // Strengthen review topics
  if (reviewTopics.length > 0) {
    recommendations.push({
      type: 'practice',
      icon: 'trending',
      text: `Strengthen: ${reviewTopics.slice(0, 3).map(t => t.concept_name).join(', ')}`,
      detail: 'These topics are close to mastery level',
    });
  }

  return recommendations;
}

export default router;
