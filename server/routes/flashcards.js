import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { callAI, parseJSONArray } from '../utils/aiHelper.js';
import 'dotenv/config';

const router = Router();

// Generate flashcards from material using AI
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { materialId, count = 10, difficulty } = req.body;
    const pool = await getPool();

    // Get material
    const matResult = await pool.request()
      .input('id', sql.Int, materialId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT content, title FROM Materials WHERE id = @id AND student_id = @studentId');

    if (matResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const material = matResult.recordset[0];
    const difficultyPrompt = difficulty ? `Difficulty level: ${difficulty}/5` : 'Vary difficulty levels between 1-5';

    const prompt = `Generate ${count} high-quality flashcards from this educational material. 
Focus on important concepts, definitions, formulas, and key relationships. 
Avoid trivial or duplicate cards.

${difficultyPrompt}

Material title: ${material.title}
Material content:
${material.content.substring(0, 10000)}

Return a JSON array of objects with:
- "front" (question or concept to learn)
- "back" (answer or explanation)
- "difficulty" (1-5 scale)
- "cardType" (one of: "qa", "definition", "concept", "formula", "comparison")
- "conceptName" (related concept name if applicable)

Make cards genuinely useful for learning. Include a mix of question types.`;

    const { text } = await callAI(prompt);
    const cards = parseJSONArray(text);
    if (!cards) {
      return res.status(502).json({ error: 'AI could not generate flashcards. Please try again.', aiError: true, errorType: 'parse' });
    }

    // Get concepts for linking
    const conceptsResult = await pool.request()
      .input('materialId', sql.Int, materialId)
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
        .input('materialId', sql.Int, materialId)
        .input('conceptId', sql.Int, conceptId)
        .input('front', sql.NVarChar, card.front)
        .input('back', sql.NVarChar, card.back)
        .input('difficulty', sql.Int, card.difficulty || 1)
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
    const pool = await getPool();

    const result = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('limit', sql.Int, parseInt(limit))
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
    const { id } = req.params;
    const { correct } = req.body;
    const pool = await getPool();

    // Get current progress
    const progressResult = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('flashcardId', sql.Int, parseInt(id))
      .query('SELECT * FROM FlashcardProgress WHERE student_id = @studentId AND flashcard_id = @flashcardId');

    let progress = progressResult.recordset[0];

    if (!progress) {
      // Initialize progress if not exists
      await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('flashcardId', sql.Int, parseInt(id))
        .query(`INSERT INTO FlashcardProgress (student_id, flashcard_id, times_seen, times_correct, times_incorrect, next_review)
                VALUES (@studentId, @flashcardId, 1, ${correct ? 1 : 0}, ${correct ? 0 : 1}, DATEADD(DAY, 1, GETDATE()))`);
      
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
      .input('flashcardId', sql.Int, parseInt(id))
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

    // Update KnowledgeProfile if card is linked to a concept
    const cardResult = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('SELECT concept_id FROM Flashcards WHERE id = @id');

    if (cardResult.recordset.length > 0 && cardResult.recordset[0].concept_id) {
      const conceptId = cardResult.recordset[0].concept_id;
      
      if (correct) {
        await pool.request()
          .input('studentId', sql.Int, req.userId)
          .input('conceptId', sql.Int, conceptId)
          .query(`IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
            UPDATE KnowledgeProfile SET mastery_level = CASE WHEN mastery_level + 0.05 > 1 THEN 1 ELSE mastery_level + 0.05 END, updated_at = GETDATE()
            WHERE student_id = @studentId AND concept_id = @conceptId
          ELSE
            INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level) 
            VALUES (@studentId, @conceptId, 0.2)`);
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
    const { id } = req.params;
    const { front, back, difficulty, cardType } = req.body;
    const pool = await getPool();

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('studentId', sql.Int, req.userId)
      .input('front', sql.NVarChar, front)
      .input('back', sql.NVarChar, back)
      .input('difficulty', sql.Int, difficulty)
      .input('cardType', sql.NVarChar, cardType)
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
    const { id } = req.params;
    const pool = await getPool();

    // Delete progress first
    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('studentId', sql.Int, req.userId)
      .query('DELETE FROM FlashcardProgress WHERE flashcard_id = @id AND student_id = @studentId');

    // Delete card
    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('studentId', sql.Int, req.userId)
      .query('DELETE FROM Flashcards WHERE id = @id AND student_id = @studentId');

    res.json({ message: 'Flashcard deleted' });
  } catch (err) {
    console.error('Delete flashcard error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
