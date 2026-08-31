import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generateStructured } from '../services/aiService.js';
import { flashcardGeneration } from '../services/prompts.js';
import { parseId, clampInt, sanitizeString, requireFields, rateLimit } from '../utils/validate.js';
import 'dotenv/config';

const router = Router();

// Generate flashcards from material using AI
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { materialId, count = 10, difficulty } = req.body;

    // Validate inputs
    const matId = parseId(materialId);
    if (!matId) return res.status(400).json({ error: 'Invalid materialId' });
    const safeCount = clampInt(count, 1, 30, 10);
    const safeDifficulty = difficulty ? clampInt(difficulty, 1, 5, undefined) : undefined;

    const pool = await getPool();

    // Get material
    const matResult = await pool.request()
      .input('id', sql.Int, matId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT content, title FROM Materials WHERE id = @id AND student_id = @studentId');

    if (matResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const material = matResult.recordset[0];

    const prompt = flashcardGeneration({
      title: material.title,
      content: material.content,
      count: safeCount,
      difficulty: safeDifficulty,
    });

    const { data: cards } = await generateStructured(prompt);

    // Get concepts for linking
    const conceptsResult = await pool.request()
      .input('materialId', sql.Int, matId)
      .query('SELECT id, name FROM Concepts WHERE material_id = @materialId');
    
    const concepts = conceptsResult.recordset;
    const conceptMap = {};
    concepts.forEach(c => { conceptMap[c.name.toLowerCase()] = c.id; });

    // Save flashcards to database
    const savedCards = [];
    for (const card of cards) {
      // Try to link to concept
      let conceptId = null;
      if (card.conceptName) {
        conceptId = conceptMap[card.conceptName.toLowerCase()] || null;
      }

      const insertResult = await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('materialId', sql.Int, matId)
        .input('conceptId', sql.Int, conceptId)
        .input('front', sql.NVarChar, sanitizeString(card.front, 2000))
        .input('back', sql.NVarChar, sanitizeString(card.back, 5000))
        .input('difficulty', sql.Int, clampInt(card.difficulty, 1, 5, 1))
        .input('cardType', sql.NVarChar, card.cardType || 'qa')
        .query(`INSERT INTO Flashcards (student_id, material_id, concept_id, front, back, difficulty, card_type)
                OUTPUT INSERTED.id, INSERTED.created_at
                VALUES (@studentId, @materialId, @conceptId, @front, @back, @difficulty, @cardType)`);

      const flashcard = insertResult.recordset[0];

      // Initialize progress tracking
      await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('flashcardId', sql.Int, flashcard.id)
        .query(`INSERT INTO FlashcardProgress (student_id, flashcard_id, next_review)
                VALUES (@studentId, @flashcardId, DATEADD(DAY, 1, GETDATE()))`);

      savedCards.push({
        id: flashcard.id,
        front: card.front,
        back: card.back,
        difficulty: card.difficulty,
        cardType: card.cardType,
        created_at: flashcard.created_at,
      });
    }

    res.json({ cards: savedCards, message: `Generated ${savedCards.length} flashcards` });
  } catch (err) {
    console.error('Generate flashcards error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Flashcard generation failed. Please try again.' });
  }
});

// Get all flashcards for student (with optional filters)
router.get('/', authenticate, async (req, res) => {
  try {
    const { materialId, conceptId, dueOnly } = req.query;
    const pool = await getPool();

    let query = `
      SELECT f.*, fp.times_seen, fp.times_correct, fp.times_incorrect, 
             fp.last_reviewed, fp.next_review, fp.mastery_level,
             m.title as material_title, c.name as concept_name
      FROM Flashcards f
      LEFT JOIN FlashcardProgress fp ON f.id = fp.flashcard_id AND fp.student_id = f.student_id
      LEFT JOIN Materials m ON f.material_id = m.id
      LEFT JOIN Concepts c ON f.concept_id = c.id
      WHERE f.student_id = @studentId
    `;

    const request = pool.request()
      .input('studentId', sql.Int, req.userId);

    if (materialId) {
      query += ' AND f.material_id = @materialId';
      request.input('materialId', sql.Int, parseInt(materialId));
    }

    if (conceptId) {
      query += ' AND f.concept_id = @conceptId';
      request.input('conceptId', sql.Int, parseInt(conceptId));
    }

    if (dueOnly === 'true') {
      query += ' AND (fp.next_review <= GETDATE() OR fp.next_review IS NULL)';
    }

    query += ' ORDER BY fp.next_review ASC, f.created_at DESC';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Get flashcards error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get flashcard stats/dashboard
router.get('/stats', authenticate, async (req, res) => {
  try {
    const pool = await getPool();

    const stats = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .query(`
        SELECT 
          COUNT(DISTINCT f.id) as total_cards,
          COUNT(DISTINCT CASE WHEN fp.mastery_level >= 0.8 THEN f.id END) as mastered_cards,
          COUNT(DISTINCT CASE WHEN fp.next_review <= GETDATE() OR fp.next_review IS NULL THEN f.id END) as due_cards,
          COUNT(DISTINCT CASE WHEN fp.mastery_level < 0.5 AND fp.times_seen > 0 THEN f.id END) as needs_review,
          ISNULL(AVG(CASE WHEN fp.times_seen > 0 THEN CAST(fp.times_correct AS FLOAT) / NULLIF(fp.times_seen, 0) END), 0) as avg_accuracy
        FROM Flashcards f
        LEFT JOIN FlashcardProgress fp ON f.id = fp.flashcard_id AND fp.student_id = f.student_id
        WHERE f.student_id = @studentId
      `);

    // Get recent performance (last 10 reviews)
    const recentPerformance = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .query(`
        SELECT TOP 10 f.front, fp.times_correct, fp.times_incorrect, fp.last_reviewed
        FROM FlashcardProgress fp
        JOIN Flashcards f ON fp.flashcard_id = f.id
        WHERE fp.student_id = @studentId AND fp.last_reviewed IS NOT NULL
        ORDER BY fp.last_reviewed DESC
      `);

    res.json({
      stats: stats.recordset[0],
      recentPerformance: recentPerformance.recordset,
    });
  } catch (err) {
    console.error('Get flashcard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get cards due for review (spaced repetition)
router.get('/review', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const safeLimit = clampInt(limit, 1, 50, 20);
    const pool = await getPool();

    const result = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('limit', sql.Int, safeLimit)
      .query(`
        SELECT TOP (@limit) f.*, fp.times_seen, fp.times_correct, fp.times_incorrect,
               fp.ease_factor, fp.interval_days, fp.mastery_level
        FROM Flashcards f
        LEFT JOIN FlashcardProgress fp ON f.id = fp.flashcard_id AND fp.student_id = f.student_id
        WHERE f.student_id = @studentId
        AND (fp.next_review <= GETDATE() OR fp.next_review IS NULL OR fp.times_seen = 0)
        ORDER BY 
          CASE WHEN fp.times_seen = 0 THEN 0 ELSE 1 END,
          fp.mastery_level ASC,
          fp.next_review ASC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Get review cards error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update flashcard review (spaced repetition algorithm)
router.post('/:id/review', authenticate, async (req, res) => {
  try {
    const flashcardId = parseId(req.params.id);
    if (!flashcardId) return res.status(400).json({ error: 'Invalid flashcard ID' });
    const correct = !!req.body.correct;
    const pool = await getPool();

    // Verify card belongs to this student
    const cardCheck = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('flashcardId', sql.Int, flashcardId)
      .query('SELECT id FROM Flashcards WHERE id = @flashcardId AND student_id = @studentId');
    if (cardCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Flashcard not found' });
    }

    // Get current progress
    const progressResult = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('flashcardId', sql.Int, flashcardId)
      .query('SELECT * FROM FlashcardProgress WHERE student_id = @studentId AND flashcard_id = @flashcardId');

    let progress = progressResult.recordset[0];

    if (!progress) {
      // Initialize progress if not exists
      await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('flashcardId', sql.Int, flashcardId)
        .input('timesCorrect', sql.Int, correct ? 1 : 0)
        .input('timesIncorrect', sql.Int, correct ? 0 : 1)
        .query(`INSERT INTO FlashcardProgress (student_id, flashcard_id, times_seen, times_correct, times_incorrect, next_review)
                VALUES (@studentId, @flashcardId, 1, @timesCorrect, @timesIncorrect, DATEADD(DAY, 1, GETDATE()))`);
      
      progress = {
        times_seen: 0,
        times_correct: 0,
        times_incorrect: 0,
        ease_factor: 2.5,
        interval_days: 1,
        mastery_level: 0,
      };
    }

    // SM-2 Spaced Repetition Algorithm
    const timesSeen = (progress.times_seen || 0) + 1;
    const timesCorrect = (progress.times_correct || 0) + (correct ? 1 : 0);
    const timesIncorrect = (progress.times_incorrect || 0) + (correct ? 0 : 1);
    
    let easeFactor = progress.ease_factor || 2.5;
    let intervalDays = progress.interval_days || 1;
    const masteryLevel = progress.mastery_level || 0;

    if (correct) {
      // Correct answer - increase interval
      if (timesSeen === 1) {
        intervalDays = 1;
      } else if (timesSeen === 2) {
        intervalDays = 6;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor);
      }
      easeFactor = Math.max(1.3, easeFactor + 0.1);
    } else {
      // Incorrect answer - reset interval, reduce ease
      intervalDays = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    }

    // Calculate mastery level (0-1)
    const newMastery = Math.min(1, Math.max(0, 
      (timesCorrect / Math.max(timesSeen, 1)) * 0.6 + 
      (Math.min(timesSeen, 10) / 10) * 0.2 +
      (easeFactor - 1.3) / 1.2 * 0.2
    ));

    // Update progress
    await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('flashcardId', sql.Int, flashcardId)
      .input('timesSeen', sql.Int, timesSeen)
      .input('timesCorrect', sql.Int, timesCorrect)
      .input('timesIncorrect', sql.Int, timesIncorrect)
      .input('easeFactor', sql.Float, easeFactor)
      .input('intervalDays', sql.Int, intervalDays)
      .input('masteryLevel', sql.Float, newMastery)
      .query(`
        UPDATE FlashcardProgress 
        SET times_seen = @timesSeen, times_correct = @timesCorrect, times_incorrect = @timesIncorrect,
            ease_factor = @easeFactor, interval_days = @intervalDays, mastery_level = @masteryLevel,
            last_reviewed = GETDATE(), next_review = DATEADD(DAY, @intervalDays, GETDATE()),
            updated_at = GETDATE()
        WHERE student_id = @studentId AND flashcard_id = @flashcardId
      `);

    // ─── LEARNING LOOP: Update KnowledgeProfile mastery ───
    const cardResult = await pool.request()
      .input('id', sql.Int, flashcardId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT concept_id FROM Flashcards WHERE id = @id AND student_id = @studentId');

    if (cardResult.recordset.length > 0 && cardResult.recordset[0].concept_id) {
      const conceptId = cardResult.recordset[0].concept_id;
      const masteryDelta = correct ? 0.05 : -0.03;
      
      await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('conceptId', sql.Int, conceptId)
        .input('delta', sql.Float, masteryDelta)
        .query(`IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
          UPDATE KnowledgeProfile SET mastery_level = CASE WHEN mastery_level + @delta > 1 THEN 1 WHEN mastery_level + @delta < 0 THEN 0 ELSE mastery_level + @delta END, updated_at = GETDATE()
          WHERE student_id = @studentId AND concept_id = @conceptId
        ELSE
          INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level)
          VALUES (@studentId, @conceptId, CASE WHEN @delta > 0 THEN 0.2 ELSE 0.1 END)`);

      // Track flashcard-level misconceptions for the Learning Twin
      if (!correct) {
        const conceptNameResult = await pool.request()
          .input('conceptId', sql.Int, conceptId)
          .query('SELECT name FROM Concepts WHERE id = @conceptId');
        const topic = conceptNameResult.recordset.length > 0 ? conceptNameResult.recordset[0].name : 'General';

        const existingMisc = await pool.request()
          .input('studentId', sql.Int, req.userId)
          .input('topic', sql.NVarChar, topic)
          .query(`SELECT id FROM StudentMisconceptions
                  WHERE student_id = @studentId AND topic = @topic AND resolved = 0`);

        if (existingMisc.recordset.length > 0) {
          await pool.request()
            .input('id', sql.Int, existingMisc.recordset[0].id)
            .query(`UPDATE StudentMisconceptions SET occurrences = occurrences + 1, last_detected = GETDATE(), updated_at = GETDATE() WHERE id = @id`);
        } else {
          await pool.request()
            .input('studentId', sql.Int, req.userId)
            .input('conceptId', sql.Int, conceptId)
            .input('topic', sql.NVarChar, topic)
            .input('misconception', sql.NVarChar, `Flashcard review incorrect for: ${topic}`)
            .input('severity', sql.NVarChar, 'low')
            .query(`
              INSERT INTO StudentMisconceptions (student_id, concept_id, topic, misconception, severity)
              VALUES (@studentId, @conceptId, @topic, @misconception, @severity)
            `);
        }
      }
    }

    res.json({
      correct,
      nextReview: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
      intervalDays,
      masteryLevel: newMastery,
    });
  } catch (err) {
    console.error('Review flashcard error:', err);
    res.status(500).json({ error: 'Review failed' });
  }
});

// Update flashcard
router.put('/:id', authenticate, async (req, res) => {
  try {
    const flashcardId = parseId(req.params.id);
    if (!flashcardId) return res.status(400).json({ error: 'Invalid flashcard ID' });
    const { front, back, difficulty, cardType } = req.body;

    const safeFront = sanitizeString(front, 2000);
    const safeBack = sanitizeString(back, 5000);
    if (!safeFront || !safeBack) {
      return res.status(400).json({ error: 'Front and back text are required' });
    }

    const pool = await getPool();

    await pool.request()
      .input('id', sql.Int, flashcardId)
      .input('studentId', sql.Int, req.userId)
      .input('front', sql.NVarChar, safeFront)
      .input('back', sql.NVarChar, safeBack)
      .input('difficulty', sql.Int, clampInt(difficulty, 1, 5, 1))
      .input('cardType', sql.NVarChar, cardType || 'qa')
      .query(`UPDATE Flashcards 
              SET front = @front, back = @back, difficulty = @difficulty, card_type = @cardType
              WHERE id = @id AND student_id = @studentId`);

    res.json({ message: 'Flashcard updated' });
  } catch (err) {
    console.error('Update flashcard error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Delete flashcard
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const flashcardId = parseId(req.params.id);
    if (!flashcardId) return res.status(400).json({ error: 'Invalid flashcard ID' });
    const pool = await getPool();

    // Delete progress first
    await pool.request()
      .input('id', sql.Int, flashcardId)
      .input('studentId', sql.Int, req.userId)
      .query('DELETE FROM FlashcardProgress WHERE flashcard_id = @id AND student_id = @studentId');

    // Delete card
    await pool.request()
      .input('id', sql.Int, flashcardId)
      .input('studentId', sql.Int, req.userId)
      .query('DELETE FROM Flashcards WHERE id = @id AND student_id = @studentId');

    res.json({ message: 'Flashcard deleted' });
  } catch (err) {
    console.error('Delete flashcard error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── LEARNING LOOP: Study session complete — trigger pattern detection ───
router.post('/session-complete', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const studentId = req.userId;
    const { correctCount, incorrectCount } = req.body || {};

    // Auto-run pattern detection if enough study data
    const countResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query('SELECT COUNT(*) as cnt FROM FlashcardProgress WHERE student_id = @studentId AND times_seen > 0');

    if (countResult.recordset[0].cnt >= 10) {
      // Store a study session pattern
      const accuracy = correctCount && (correctCount + (incorrectCount || 0)) > 0
        ? Math.round(correctCount / (correctCount + incorrectCount) * 100)
        : null;

      if (accuracy !== null) {
        const existing = await pool.request()
          .input('studentId', sql.Int, studentId)
          .input('type', sql.NVarChar, 'study_session')
          .query(`SELECT id FROM LearningPatterns
                  WHERE student_id = @studentId AND pattern_type = @type AND active = 1`);

        const patternText = accuracy >= 80
          ? `Flashcard study session: ${accuracy}% accuracy. Strong recall — try harder cards.`
          : accuracy >= 50
          ? `Flashcard study session: ${accuracy}% accuracy. Mixed results — review weak areas.`
          : `Flashcard study session: ${accuracy}% accuracy. Significant review needed.`;

        if (existing.recordset.length > 0) {
          await pool.request()
            .input('id', sql.Int, existing.recordset[0].id)
            .input('text', sql.NVarChar, patternText)
            .input('confidence', sql.Float, 0.7)
            .query(`UPDATE LearningPatterns SET pattern_text = @text, confidence = @confidence,
                    evidence_count = evidence_count + 1, last_detected = GETDATE(), updated_at = GETDATE()
                    WHERE id = @id`);
        } else {
          await pool.request()
            .input('studentId', sql.Int, studentId)
            .input('text', sql.NVarChar, patternText)
            .input('confidence', sql.Float, 0.7)
            .query(`INSERT INTO LearningPatterns (student_id, pattern_type, pattern_text, confidence)
                    VALUES (@studentId, 'study_session', @text, @confidence)`);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Session complete error:', err);
    res.status(500).json({ error: 'Failed to record session' });
  }
});

export default router;
