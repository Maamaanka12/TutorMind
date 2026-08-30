import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import 'dotenv/config';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

    // Use Gemini to extract concepts
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Analyze this educational material and extract the key concepts. 
Return a JSON array of objects with "name" (concept name), "description" (brief explanation), 
and "difficulty" (1-5 scale). Material:\n\n${content.substring(0, 8000)}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI could not parse concepts' });
    }

    const concepts = JSON.parse(jsonMatch[0]);

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
    res.status(500).json({ error: 'AI analysis failed' });
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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Generate ${count} multiple-choice assessment questions for the concept: "${concept.name}".
Description: ${concept.description}
Difficulty level: ${concept.difficulty_level}/5

Return a JSON array with objects having: "question" (the question text), "options" (array of 4 choices), 
"correctAnswer" (the correct option text), and "explanation" (why it's correct).`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI could not generate questions' });
    }

    const questions = JSON.parse(jsonMatch[0]);

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
    res.status(500).json({ error: 'Question generation failed' });
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
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
    res.status(500).json({ error: 'Evaluation failed' });
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
