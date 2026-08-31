import { Router } from 'express';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generateStructured } from '../services/aiService.js';
import { examGeneration, examAnalysis } from '../services/prompts.js';
import { parseJSONObject } from '../utils/aiHelper.js';
import { parseId, clampInt, sanitizeString, rateLimit } from '../utils/validate.js';
import 'dotenv/config';

const router = Router();

// Generate an exam using AI
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { title, materialId, totalQuestions = 10, timeLimitMinutes = 30, difficulty = 'adaptive' } = req.body;

    // Validate inputs
    const matId = materialId ? parseId(materialId) : null;
    const safeQuestions = clampInt(totalQuestions, 1, 50, 10);
    const safeMinutes = clampInt(timeLimitMinutes, 5, 180, 30);
    const safeDifficulty = clampInt(difficulty, 1, 5, undefined);
    const safeTitle = sanitizeString(title, 500) || 'Exam';

    const pool = await getPool();

    // Get material content
    let materialContent = '';
    let materialTitle = title || 'Exam';
    if (matId) {
      const matResult = await pool.request()
        .input('id', sql.Int, matId)
        .input('studentId', sql.Int, req.userId)
        .query('SELECT content, title FROM Materials WHERE id = @id AND student_id = @studentId');

      if (matResult.recordset.length > 0) {
        materialContent = matResult.recordset[0].content;
        materialTitle = safeTitle || matResult.recordset[0].title;
      }
    }

    // Get student's weak areas from KnowledgeProfile for adaptive difficulty
    const weakAreas = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .query(`
        SELECT TOP 5 c.name, c.description, kp.mastery_level
        FROM KnowledgeProfile kp
        JOIN Concepts c ON kp.concept_id = c.id
        WHERE kp.student_id = @studentId AND kp.mastery_level < 0.6
        ORDER BY kp.mastery_level ASC
      `);

    const weakAreaList = weakAreas.recordset.map(w => ({
      name: w.name,
      mastery: Math.round(w.mastery_level * 100),
    }));

    const prompt = examGeneration({
      title: materialTitle,
      content: materialContent,
      totalQuestions: safeQuestions,
      difficulty: safeDifficulty || 'adaptive',
      weakAreas: weakAreaList.length > 0 ? weakAreaList : undefined,
    });

    const { data: questions } = await generateStructured(prompt);

    // Create exam record
    const examResult = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('title', sql.NVarChar, materialTitle)
      .input('materialId', sql.Int, matId)
      .input('totalQuestions', sql.Int, questions.length)
      .input('timeLimitMinutes', sql.Int, safeMinutes)
      .input('difficulty', sql.NVarChar, safeDifficulty || 'adaptive')
      .query(`INSERT INTO Exams (student_id, title, material_id, total_questions, time_limit_minutes, difficulty)
              OUTPUT INSERTED.id, INSERTED.started_at
              VALUES (@studentId, @title, @materialId, @totalQuestions, @timeLimitMinutes, @difficulty)`);

    const exam = examResult.recordset[0];

    // Save questions
    const savedQuestions = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qResult = await pool.request()
        .input('examId', sql.Int, exam.id)
        .input('questionNumber', sql.Int, i + 1)
        .input('questionText', sql.NVarChar, q.question)
        .input('questionType', sql.NVarChar, q.type)
        .input('options', sql.NVarChar, JSON.stringify(q.options || []))
        .input('correctAnswer', sql.NVarChar, q.correctAnswer)
        .input('conceptName', sql.NVarChar, q.conceptName || null)
        .query(`INSERT INTO ExamQuestions (exam_id, question_number, question_text, question_type, options, correct_answer, concept_name)
                OUTPUT INSERTED.id
                VALUES (@examId, @questionNumber, @questionText, @questionType, @options, @correctAnswer, @conceptName)`);

      savedQuestions.push({
        id: qResult.recordset[0].id,
        question_number: i + 1,
        question_text: q.question,
        question_type: q.type,
        options: q.options || [],
        concept_name: q.conceptName || null,
      });
    }

    res.json({
      exam: {
        id: exam.id,
        title: materialTitle,
        total_questions: savedQuestions.length,
        time_limit_minutes: safeMinutes,
        difficulty: safeDifficulty || 'adaptive',
        started_at: exam.started_at,
      },
      questions: savedQuestions,
    });
  } catch (err) {
    console.error('Generate exam error:', err);
    if (err.userMessage) {
      return res.status(err.status).json({ error: err.userMessage, aiError: true, errorType: err.type });
    }
    res.status(500).json({ error: 'Exam generation failed. Please try again.' });
  }
});

// Get exam with questions
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const examId = parseId(id);
    if (!examId) return res.status(400).json({ error: 'Invalid exam ID' });

    const examResult = await pool.request()
      .input('id', sql.Int, examId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT * FROM Exams WHERE id = @id AND student_id = @studentId');

    if (examResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const exam = examResult.recordset[0];

    // Get questions (without correct answers for in-progress exams)
    const questionsResult = await pool.request()
      .input('examId', sql.Int, examId)
      .query('SELECT id, question_number, question_text, question_type, options, concept_name FROM ExamQuestions WHERE exam_id = @examId ORDER BY question_number');

    // Get submitted answers (filtered by student for defense-in-depth)
    const answersResult = await pool.request()
      .input('examId', sql.Int, examId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT * FROM ExamAnswers WHERE exam_id = @examId AND student_id = @studentId');

    const answers = {};
    answersResult.recordset.forEach(a => {
      answers[a.question_id] = a;
    });

    res.json({
      exam,
      questions: questionsResult.recordset.map(q => ({
        ...q,
        options: JSON.parse(q.options || '[]'),
        student_answer: answers[q.id]?.student_answer || null,
        time_spent_seconds: answers[q.id]?.time_spent_seconds || 0,
      })),
    });
  } catch (err) {
    console.error('Get exam error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit/answer a single question during exam
router.post('/:id/answer', authenticate, async (req, res) => {
  try {
    const examId = parseId(req.params.id);
    if (!examId) return res.status(400).json({ error: 'Invalid exam ID' });
    const questionId = parseId(req.body.questionId);
    if (!questionId) return res.status(400).json({ error: 'Invalid questionId' });
    const answer = sanitizeString(req.body.answer, 2000);
    const timeSpentSeconds = clampInt(req.body.timeSpentSeconds, 0, 7200, 0);
    const pool = await getPool();

    // Verify exam belongs to student and is in progress
    const examResult = await pool.request()
      .input('id', sql.Int, examId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT status FROM Exams WHERE id = @id AND student_id = @studentId');

    if (examResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (examResult.recordset[0].status !== 'in_progress') {
      return res.status(400).json({ error: 'Exam is no longer in progress' });
    }

    // Upsert answer
    await pool.request()
      .input('examId', sql.Int, examId)
      .input('studentId', sql.Int, req.userId)
      .input('questionId', sql.Int, questionId)
      .input('answer', sql.NVarChar, answer)
      .input('timeSpent', sql.Int, timeSpentSeconds)
      .query(`IF EXISTS (SELECT 1 FROM ExamAnswers WHERE exam_id = @examId AND question_id = @questionId AND student_id = @studentId)
        UPDATE ExamAnswers SET student_answer = @answer, time_spent_seconds = @timeSpent, answered_at = GETDATE()
        WHERE exam_id = @examId AND question_id = @questionId AND student_id = @studentId
      ELSE
        INSERT INTO ExamAnswers (exam_id, student_id, question_id, student_answer, time_spent_seconds)
        VALUES (@examId, @studentId, @questionId, @answer, @timeSpent)`);

    res.json({ success: true });
  } catch (err) {
    console.error('Answer question error:', err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// Submit entire exam for grading
router.post('/:id/submit', authenticate, async (req, res) => {
  try {
    const examId = parseId(req.params.id);
    if (!examId) return res.status(400).json({ error: 'Invalid exam ID' });
    const pool = await getPool();

    // Get exam
    const examResult = await pool.request()
      .input('id', sql.Int, examId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT * FROM Exams WHERE id = @id AND student_id = @studentId');

    if (examResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const exam = examResult.recordset[0];
    if (exam.status !== 'in_progress') {
      return res.status(400).json({ error: 'Exam already submitted' });
    }

    // Get all questions with correct answers
    const questionsResult = await pool.request()
      .input('examId', sql.Int, examId)
      .query('SELECT * FROM ExamQuestions WHERE exam_id = @examId');

    // Get all student answers (filtered by student for defense-in-depth)
    const answersResult = await pool.request()
      .input('examId', sql.Int, examId)
      .input('studentId', sql.Int, req.userId)
      .query('SELECT * FROM ExamAnswers WHERE exam_id = @examId AND student_id = @studentId');

    const answers = {};
    answersResult.recordset.forEach(a => {
      answers[a.question_id] = a;
    });

    // Grade each question
    let score = 0;
    const totalQuestions = questionsResult.recordset.length;
    const conceptResults = {};

    for (const question of questionsResult.recordset) {
      const studentAnswer = answers[question.id]?.student_answer || '';
      let isCorrect = false;

      // Simple grading: exact match or close match
      const correct = question.correct_answer.toLowerCase().trim();
      const student = studentAnswer.toLowerCase().trim();

      if (student === correct) {
        isCorrect = true;
      } else if (question.question_type === 'true_false') {
        isCorrect = (student === 'true' && correct.includes('true')) ||
                    (student === 'false' && correct.includes('false'));
      }

      if (isCorrect) score++;

      // Update answer record with correctness (only if it belongs to this student)
      if (answers[question.id]?.id) {
        await pool.request()
          .input('isCorrect', sql.Bit, isCorrect)
          .input('answerId', sql.Int, answers[question.id].id)
          .input('studentId', sql.Int, req.userId)
          .query('UPDATE ExamAnswers SET is_correct = @isCorrect WHERE id = @answerId AND student_id = @studentId');
      }

      // Track concept performance
      const concept = question.concept_name || 'General';
      if (!conceptResults[concept]) {
        conceptResults[concept] = { correct: 0, total: 0 };
      }
      conceptResults[concept].total++;
      if (isCorrect) conceptResults[concept].correct++;
    }

    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    // AI analysis of performance
    const conceptBreakdown = Object.entries(conceptResults)
      .map(([name, data]) => `${name}: ${data.correct}/${data.total} (${Math.round(data.correct / data.total * 100)}%)`)
      .join('\n');

    const weakConcepts = Object.entries(conceptResults)
      .filter(([, data]) => data.correct / data.total < 0.7)
      .map(([name, data]) => `${name} (${Math.round(data.correct / data.total * 100)}%)`)
      .join(', ') || 'None';

    const fallbackAnalysis = {
      strongAreas: Object.entries(conceptResults).filter(([, d]) => d.correct / d.total >= 0.7).map(([n]) => n),
      weakAreas: Object.entries(conceptResults).filter(([, d]) => d.correct / d.total < 0.7).map(([n]) => n),
      detectedIssues: [],
      recommendations: ['Review the weak areas identified above.', 'Try flashcards for topics below 70% mastery.'],
      aiUnavailable: true,
    };

    let analysis = fallbackAnalysis;
    try {
      const analysisPrompt = examAnalysis({
        title: exam.title,
        score,
        total: totalQuestions,
        percentage,
        conceptBreakdown,
        weakConcepts,
      });
      const result = await generateStructured(analysisPrompt, { maxRetries: 1, fallbackData: fallbackAnalysis });
      analysis = result.data;
    } catch (aiErr) {
      console.error('AI analysis failed:', aiErr.detail || aiErr.message);
    }

    // Update exam record (with student_id ownership check)
    await pool.request()
      .input('id', sql.Int, examId)
      .input('studentId', sql.Int, req.userId)
      .input('score', sql.Int, score)
      .input('totalScore', sql.Int, totalQuestions)
      .input('percentage', sql.Float, percentage)
      .input('analysis', sql.NVarChar, JSON.stringify(analysis))
      .query(`UPDATE Exams 
              SET status = 'completed', score = @score, total_score = @totalScore, 
                  percentage = @percentage, analysis = @analysis, submitted_at = GETDATE()
              WHERE id = @id AND student_id = @studentId`);

    // Update KnowledgeProfile for each concept (with ownership checks)
    for (const [conceptName, data] of Object.entries(conceptResults)) {
      // Try to find concept by name from existing Concepts table (linked to student's material)
      const conceptResult = await pool.request()
        .input('name', sql.NVarChar, conceptName)
        .input('studentId', sql.Int, req.userId)
        .query(`SELECT c.id FROM Concepts c 
                JOIN Materials m ON c.material_id = m.id 
                WHERE c.name LIKE @name AND m.student_id = @studentId`);

      if (conceptResult.recordset.length > 0) {
        const conceptId = conceptResult.recordset[0].id;
        const masteryDelta = data.correct / data.total >= 0.7 ? 0.1 : -0.1;
        const newMastery = data.correct / data.total;

        await pool.request()
          .input('studentId', sql.Int, req.userId)
          .input('conceptId', sql.Int, conceptId)
          .input('delta', sql.Float, masteryDelta)
          .input('newMastery', sql.Float, newMastery)
          .query(`IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
            UPDATE KnowledgeProfile SET mastery_level = CASE WHEN mastery_level + @delta > 1 THEN 1 WHEN mastery_level + @delta < 0 THEN 0 ELSE mastery_level + @delta END, last_assessed = GETDATE(), updated_at = GETDATE()
            WHERE student_id = @studentId AND concept_id = @conceptId
          ELSE
            INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level, last_assessed)
            VALUES (@studentId, @conceptId, @newMastery, GETDATE())`);
      }
    }

    res.json({
      score,
      total: totalQuestions,
      percentage,
      conceptResults,
      analysis,
    });
  } catch (err) {
    console.error('Submit exam error:', err);
    res.status(500).json({ error: 'Exam submission failed. Please try again.' });
  }
});

// Get exam history for student
router.get('/', authenticate, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .query(`
        SELECT id, title, total_questions, time_limit_minutes, difficulty, status, 
               score, total_score, percentage, analysis, started_at, submitted_at
        FROM Exams 
        WHERE student_id = @studentId
        ORDER BY created_at DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Get exams error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
