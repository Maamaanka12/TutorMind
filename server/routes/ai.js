import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generateStructured, buildLearningTwinContext } from '../services/aiService.js';
import { conceptExtraction, questionGeneration, quizMisconception, adaptiveTutoringContext } from '../services/prompts.js';
import { logLearningEvent } from '../services/learningEvents.js';
import { parseId, sanitizeString, requireFields, rateLimit } from '../utils/validate.js';
import 'dotenv/config';

const router = Router();

// Helper: Get Learning Twin context for AI adaptation
async function getLearningTwinContext(pool, studentId) {
  const contextData = await buildLearningTwinContext(pool, studentId);
  const prompt = adaptiveTutoringContext(contextData);
  return prompt.system + '\n\n' + prompt.user;
}

// Analyze material and extract concepts
router.post('/analyze', authenticate, async (req, res) => {
  try {
    const matId = parseId(req.body.materialId);
    if (!matId) return res.status(400).json({ error: 'Invalid materialId' });
    const pool = await getPool();

    // Get material (ownership verified via student_id)
    const matResult = await pool.request()
      .input('id', sql.Int, matId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT content FROM Materials WHERE id = @id AND student_id = @studentId');

    if (matResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const content = matResult.recordset[0].content;

    const prompt = conceptExtraction({ content });
    const { data: concepts } = await generateStructured(prompt);

    // Save concepts to database (linked to student's material)
    for (const concept of concepts) {
      await pool.request()
        .input('materialId', sql.Int, matId)
        .input('name', sql.NVarChar, concept.name)
        .input('description', sql.NVarChar, concept.description)
        .input('difficulty', sql.Int, concept.difficulty || 1)
        .query(`INSERT INTO Concepts (material_id, name, description, difficulty_level) 
                VALUES (@materialId, @name, @description, @difficulty)`);
    }

    res.json({ concepts, message: `Extracted ${concepts.length} concepts` });
  } catch (err) {
    console.error('AI analyze error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'AI analysis failed. Please try again later.' });
  }
});

// Generate diagnostic assessment questions
router.post('/generate-questions', authenticate, async (req, res) => {
  try {
    const conceptId = parseId(req.body.conceptId);
    if (!conceptId) return res.status(400).json({ error: 'Invalid conceptId' });
    const count = parseInt(req.body.count, 10) || 3;
    const pool = await getPool();

    // Verify concept belongs to a material owned by this student
    const conceptResult = await pool.request()
      .input('id', sql.Int, conceptId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT c.* FROM Concepts c JOIN Materials m ON c.material_id = m.id WHERE c.id = @id AND m.student_id = @studentId');

    if (conceptResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const concept = conceptResult.recordset[0];

    const prompt = questionGeneration({
      conceptName: concept.name,
      description: concept.description,
      difficulty: concept.difficulty_level,
      count,
    });

    const { data: questions } = await generateStructured(prompt);

    // Save questions to database
    const savedQuestions = [];
    for (const q of questions) {
      const insertResult = await pool.request()
        .input('conceptId', sql.Int, conceptId)
        .input('questionText', sql.NVarChar, q.question)
        .input('options', sql.NVarChar, JSON.stringify(q.options))
        .input('correctAnswer', sql.NVarChar, q.correctAnswer)
        .input('difficulty', sql.Int, concept.difficulty_level)
        .query(`INSERT INTO Questions (concept_id, question_text, options, correct_answer, difficulty_level) 
                OUTPUT INSERTED.id VALUES (@conceptId, @questionText, @options, @correctAnswer, @difficulty)`);

      savedQuestions.push({
        id: insertResult.recordset[0].id,
        question: q.question,
        options: q.options,
      });
    }

    res.json({ questions: savedQuestions });
  } catch (err) {
    console.error('Generate questions error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Question generation failed. Please try again later.' });
  }
});

// Detect misconception and provide adaptive explanation
router.post('/evaluate', authenticate, async (req, res) => {
  try {
    const questionId = parseId(req.body.questionId);
    if (!questionId) return res.status(400).json({ error: 'Invalid questionId' });
    const selectedAnswer = sanitizeString(req.body.selectedAnswer, 2000);
    if (!selectedAnswer) return res.status(400).json({ error: 'selectedAnswer is required' });
    const pool = await getPool();

    // Get question details (verify concept belongs to student's material)
    const qResult = await pool.request()
      .input('id', sql.Int, questionId)
      .input('studentId', sql.Int, req.userId)
      .query(`SELECT q.* FROM Questions q 
              JOIN Concepts c ON q.concept_id = c.id 
              JOIN Materials m ON c.material_id = m.id 
              WHERE q.id = @id AND m.student_id = @studentId`);

    if (qResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = qResult.recordset[0];
    const isCorrect = selectedAnswer === question.correct_answer;

    // Save answer and get the inserted ID
    const answerResult = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('questionId', sql.Int, questionId)
      .input('selectedAnswer', sql.NVarChar, selectedAnswer)
      .input('isCorrect', sql.Bit, isCorrect)
      .query(`INSERT INTO Answers (student_id, question_id, selected_answer, is_correct) 
              OUTPUT INSERTED.id
              VALUES (@studentId, @questionId, @selectedAnswer, @isCorrect)`);
    const answerId = answerResult.recordset[0].id;

    // Log granular learning event for the Learning Twin
    const conceptNameResult = await pool.request()
      .input('conceptId', sql.Int, question.concept_id)
      .query('SELECT name FROM Concepts WHERE id = @conceptId');
    const conceptName = conceptNameResult.recordset.length > 0 ? conceptNameResult.recordset[0].name : null;
    try {
      await logLearningEvent(pool, req.userId, {
        eventType: 'question_answered',
        conceptName,
        isCorrect,
        difficulty: question.difficulty_level,
        timeSpentSeconds: req.body.timeSpentSeconds,
        metadata: { questionId, answerId },
      });
    } catch (eventErr) {
      console.warn('Could not log learning event:', eventErr.message);
    }

    let misconception = null;
    let explanation = null;
    let followUpQuestion = null;

    if (!isCorrect) {
      // Build learning context for adaptive AI tutoring
      let studentContext = null;
      try {
        const contextData = await buildLearningTwinContext(pool, req.userId);
        const { topics, misconceptions, patterns, unresolvedMisconceptions } = contextData;
        const topicStr = topics?.length
          ? topics.map(t => `${t.name}: ${Math.round(t.mastery_level * 100)}%${t.misconceptions ? ' (has misconceptions)' : ''}`).join(', ')
          : 'No topics studied yet';
        const miscStr = misconceptions?.length
          ? misconceptions.map(m => `${m.topic}: ${m.misconception} (severity: ${m.severity})`).join('; ')
          : 'None';
        const patternStr = patterns?.length
          ? patterns.map(p => p.pattern_text).join('; ')
          : 'Not yet detected';
        studentContext = `Topics mastery: ${topicStr}.
Active misconceptions: ${miscStr}.
Learning patterns: ${patternStr}.${unresolvedMisconceptions?.length > 0 ? ` The student has ${unresolvedMisconceptions.length} unresolved misconception(s).` : ''}`;
      } catch (ctxErr) {
        console.warn('Could not build learning context for evaluate:', ctxErr.message);
      }

      // Use AI to detect misconception
      const prompt = quizMisconception({
        questionText: question.question_text,
        options: question.options,
        correctAnswer: question.correct_answer,
        studentAnswer: selectedAnswer,
        studentContext,
      });

      try {
        const { data: analysis } = await generateStructured(prompt);

        if (analysis) {
          misconception = analysis.misconception;
          explanation = analysis.explanation;
          followUpQuestion = analysis.followUpQuestion;

          // Update answer with misconception
          await pool.request()
            .input('id', sql.Int, answerId)
            .input('misconception', sql.NVarChar, misconception)
            .input('explanation', sql.NVarChar, explanation)
            .query('UPDATE Answers SET misconception = @misconception, explanation = @explanation WHERE id = @id');

          // Update knowledge profile
          await pool.request()
            .input('studentId', sql.Int, req.userId)
            .input('conceptId', sql.Int, question.concept_id)
            .input('misconception', sql.NVarChar, misconception)
            .query(`IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
              UPDATE KnowledgeProfile SET mastery_level = mastery_level - 0.1, misconceptions = @misconception, updated_at = GETDATE()
              WHERE student_id = @studentId AND concept_id = @conceptId
            ELSE
              INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level, misconceptions) 
              VALUES (@studentId, @conceptId, 0.3, @misconception)`);

          // Record misconception in StudentMisconceptions table
          const conceptNameResult = await pool.request()
            .input('conceptId', sql.Int, question.concept_id)
            .query('SELECT name FROM Concepts WHERE id = @conceptId');
          const conceptName = conceptNameResult.recordset.length > 0 ? conceptNameResult.recordset[0].name : 'Unknown';

          // Check if this misconception already exists
          const existingMisconception = await pool.request()
            .input('studentId', sql.Int, req.userId)
            .input('topic', sql.NVarChar, conceptName)
            .query(`
              SELECT id, occurrences FROM StudentMisconceptions
              WHERE student_id = @studentId AND topic = @topic AND resolved = 0
              ORDER BY occurrences DESC
            `);

          let whyEngineMisconceptionId = null;
          if (existingMisconception.recordset.length > 0) {
            whyEngineMisconceptionId = existingMisconception.recordset[0].id;
            await pool.request()
              .input('id', sql.Int, existingMisconception.recordset[0].id)
              .query(`UPDATE StudentMisconceptions SET occurrences = occurrences + 1, last_detected = GETDATE(), updated_at = GETDATE() WHERE id = @id`);
          } else {
            const insertResult = await pool.request()
              .input('studentId', sql.Int, req.userId)
              .input('conceptId', sql.Int, question.concept_id)
              .input('topic', sql.NVarChar, conceptName)
              .input('misconception', sql.NVarChar, misconception)
              .query(`
                INSERT INTO StudentMisconceptions (student_id, concept_id, topic, misconception)
                OUTPUT INSERTED.id
                VALUES (@studentId, @conceptId, @topic, @misconception)
              `);
            whyEngineMisconceptionId = insertResult.recordset[0].id;
          }

          // Create a Why Engine session for this investigation
          const followUpObj = followUpQuestion || {};
          await pool.request()
            .input('studentId', sql.Int, req.userId)
            .input('misconceptionId', sql.Int, whyEngineMisconceptionId)
            .input('originalQuestion', sql.NVarChar, question.question_text)
            .input('studentAnswer', sql.NVarChar, selectedAnswer)
            .input('correctAnswer', sql.NVarChar, question.correct_answer)
            .input('topic', sql.NVarChar, conceptName)
            .input('identifiedMisconception', sql.NVarChar, misconception)
            .input('confidence', sql.NVarChar, 'medium')
            .input('explanation', sql.NVarChar, explanation)
            .input('followUpQuestion', sql.NVarChar, followUpObj.question || null)
            .input('followUpOptions', sql.NVarChar, followUpObj.options ? JSON.stringify(followUpObj.options) : null)
            .input('followUpCorrectAnswer', sql.NVarChar, followUpObj.correctAnswer || null)
            .query(`
              INSERT INTO WhyEngineSessions 
                (student_id, misconception_id, original_question, student_answer, correct_answer,
                 topic, identified_misconception, confidence, explanation,
                 follow_up_question, follow_up_options, follow_up_correct_answer)
              VALUES (@studentId, @misconceptionId, @originalQuestion, @studentAnswer, @correctAnswer,
                      @topic, @identifiedMisconception, @confidence, @explanation,
                      @followUpQuestion, @followUpOptions, @followUpCorrectAnswer)
            `);
        }
      } catch (aiErr) {
        console.error('AI misconception detection failed:', aiErr.detail || aiErr.message);
        // Graceful fallback: still record the wrong answer, just skip AI analysis
        explanation = 'AI analysis is temporarily unavailable. The correct answer is shown above.';
      }
    } else {
      // Correct answer - increase mastery
      await pool.request()
        .input('studentId', sql.Int, req.userId)
        .input('conceptId', sql.Int, question.concept_id)
        .query(`IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
          UPDATE KnowledgeProfile SET mastery_level = CASE WHEN mastery_level + 0.15 > 1 THEN 1 ELSE mastery_level + 0.15 END, updated_at = GETDATE()
          WHERE student_id = @studentId AND concept_id = @conceptId
        ELSE
          INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level) 
          VALUES (@studentId, @conceptId, 0.4)`);
    }

    res.json({
      isCorrect,
      correctAnswer: question.correct_answer,
      misconception,
      explanation,
      followUpQuestion,
    });
  } catch (err) {
    console.error('Evaluate error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Evaluation failed. Please try again later.' });
  }
});

// Get student's knowledge profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .query(`
        SELECT kp.*, c.name as concept_name, c.description as concept_description, c.difficulty_level
        FROM KnowledgeProfile kp
        JOIN Concepts c ON kp.concept_id = c.id
        WHERE kp.student_id = @studentId
        ORDER BY kp.mastery_level DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Learning Twin context for AI tutoring
router.get('/learning-context', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const context = await getLearningTwinContext(pool, req.userId);
    res.json({ context });
  } catch (err) {
    console.error('Get learning context error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get student's misconception history
router.get('/misconceptions', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .query(`
        SELECT a.id, a.misconception, a.explanation, a.created_at,
               q.question_text, c.name as concept_name
        FROM Answers a
        JOIN Questions q ON a.question_id = q.id
        JOIN Concepts c ON q.concept_id = c.id
        WHERE a.student_id = @studentId AND a.is_correct = 0 AND a.misconception IS NOT NULL
        ORDER BY a.created_at DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
