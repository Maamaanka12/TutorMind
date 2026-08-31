import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { callAI, parseJSONArray, parseJSONObject } from '../utils/aiHelper.js';
import 'dotenv/config';

const router = Router();

// Helper: Get Learning Twin context for AI adaptation
async function getLearningTwinContext(pool, studentId) {
  const masteryResult = await pool.request()
    .input('studentId', sql.Int, studentId)
    .query(`
      SELECT c.name, kp.mastery_level, kp.misconceptions
      FROM KnowledgeProfile kp
      JOIN Concepts c ON kp.concept_id = c.id
      WHERE kp.student_id = @studentId
    `);

  const misconceptionsResult = await pool.request()
    .input('studentId', sql.Int, studentId)
    .query(`
      SELECT topic, misconception, severity
      FROM StudentMisconceptions
      WHERE student_id = @studentId AND resolved = 0
    `);

  const patternsResult = await pool.request()
    .input('studentId', sql.Int, studentId)
    .query(`
      SELECT pattern_text
      FROM LearningPatterns
      WHERE student_id = @studentId AND active = 1
    `);

  const topics = masteryResult.recordset.map(t =>
    `${t.name}: ${Math.round(t.mastery_level * 100)}%${t.misconceptions ? ' (has misconceptions)' : ''}`
  ).join(', ');

  const misconceptions = misconceptionsResult.recordset.map(m =>
    `${m.topic}: ${m.misconception} (severity: ${m.severity})`
  ).join('; ');

  const patterns = patternsResult.recordset.map(p => p.pattern_text).join('; ');

  // Get Why Engine data for deeper misconception context
  const whyEngineResult = await pool.request()
    .input('studentId', sql.Int, studentId)
    .query(`
      SELECT TOP 5 topic, identified_misconception, confidence, explanation, steps_count, resolved
      FROM WhyEngineSessions
      WHERE student_id = @studentId
      ORDER BY created_at DESC
    `);

  const whyEngineData = whyEngineResult.recordset.map(w =>
    `${w.topic}: ${w.identified_misconception} (confidence: ${w.confidence}, status: ${w.resolved ? 'resolved' : 'in_progress'})`
  ).join('; ');

  const unresolvedMisconceptions = whyEngineResult.recordset.filter(w => !w.resolved);

  return `Student learning profile:\n` +
    `Topics: ${topics || 'No topics studied yet'}.\n` +
    `Active misconceptions: ${misconceptions || 'None'}.\n` +
    `Why Engine findings: ${whyEngineData || 'No investigations yet'}.\n` +
    `Learning patterns: ${patterns || 'Not yet detected'}.\n` +
    `\nAdapt your teaching based on this profile. If mastery is high, skip basics. ` +
    `If misconceptions exist, address them. If patterns suggest example-based learning, use examples.\n` +
    `${unresolvedMisconceptions.length > 0 ? `IMPORTANT: The student has ${unresolvedMisconceptions.length} unresolved misconception(s) detected by the Why Engine. When teaching related topics, proactively address these.` : ''}`;
}

// Analyze material and extract concepts
router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { materialId } = req.body;
    const pool = await getPool();

    // Get material
    const matResult = await pool.request()
      .input('id', sql.Int, materialId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT content FROM Materials WHERE id = @id AND student_id = @studentId');

    if (matResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const content = matResult.recordset[0].content;

    // Use AI to extract concepts
    const prompt = `Analyze this educational material and extract the key concepts. 
Return a JSON array of objects with "name" (concept name), "description" (brief explanation), 
and "difficulty" (1-5 scale). Material:\n\n${content.substring(0, 8000)}`;

    const { text } = await callAI(prompt);
    const concepts = parseJSONArray(text);
    if (!concepts) {
      return res.status(502).json({ error: 'AI could not parse concepts. Please try again.', aiError: true, errorType: 'parse' });
    }

    // Save concepts to database
    for (const concept of concepts) {
      await pool.request()
        .input('materialId', sql.Int, materialId)
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
    const { conceptId, count = 3 } = req.body;
    const pool = await getPool();

    const conceptResult = await pool.request()
      .input('id', sql.Int, conceptId)
      .query('SELECT * FROM Concepts WHERE id = @id');

    if (conceptResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Concept not found' });
    }

    const concept = conceptResult.recordset[0];

    const prompt = `Generate ${count} multiple-choice assessment questions for the concept: "${concept.name}".
Description: ${concept.description}
Difficulty level: ${concept.difficulty_level}/5

Return a JSON array with objects having: "question" (the question text), "options" (array of 4 choices), 
"correctAnswer" (the correct option text), and "explanation" (why it's correct).`;

    const { text } = await callAI(prompt);
    const questions = parseJSONArray(text);
    if (!questions) {
      return res.status(502).json({ error: 'AI could not generate questions. Please try again.', aiError: true, errorType: 'parse' });
    }

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
    const { questionId, selectedAnswer } = req.body;
    const pool = await getPool();

    // Get question details
    const qResult = await pool.request()
      .input('id', sql.Int, questionId)
      .query('SELECT * FROM Questions WHERE id = @id');

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

    let misconception = null;
    let explanation = null;
    let followUpQuestion = null;

    if (!isCorrect) {
      // Use AI to detect misconception
      const prompt = `A student was asked this question and answered incorrectly.
Question: ${question.question_text}
Options: ${question.options}
Student's answer: ${selectedAnswer}
Correct answer: ${question.correct_answer}

Analyze why the student got this wrong. Identify the likely misconception or knowledge gap.
Then provide a clear, helpful explanation to correct their understanding.
Generate a new practice question to verify their understanding.

Return JSON with: "misconception" (what the student likely misunderstood),
"explanation" (targeted explanation), and "followUpQuestion" (object with "question", "options", "correctAnswer").`;

      try {
        const { text } = await callAI(prompt);
        const analysis = parseJSONObject(text);

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
