import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPool, sql } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import 'dotenv/config';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Generate an exam using AI
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { title, materialId, totalQuestions = 10, timeLimitMinutes = 30, difficulty = 'adaptive' } = req.body;
    const pool = await getPool();

    // Get material content
    let materialContent = '';
    let materialTitle = title || 'Exam';
    if (materialId) {
      const matResult = await pool.request()
        .input('id', sql.Int, materialId)
        .input('studentId', sql.Int, req.userId)
        .query('SELECT content, title FROM Materials WHERE id = @id AND student_id = @studentId');

      if (matResult.recordset.length > 0) {
        materialContent = matResult.recordset[0].content;
        materialTitle = title || matResult.recordset[0].title;
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

    const weakAreasText = weakAreas.recordset.length > 0
      ? `\nFocus extra questions on these weak areas: ${weakAreas.recordset.map(w => `${w.name} (mastery: ${Math.round(w.mastery_level * 100)}%)`).join(', ')}`
      : '';

    // AI generates the exam questions
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Generate an exam with ${totalQuestions} questions from the following material.
Mix of question types: multiple choice, true/false, short answer, and code/output questions where appropriate.
Difficulty level: ${difficulty}${weakAreasText}

Material title: ${materialTitle}
Material content:
${materialContent.substring(0, 10000)}

Return a JSON array of objects with:
- "question" (the question text)
- "type" (one of: "multiple_choice", "true_false", "short_answer", "code_output")
- "options" (array of 4 choices for multiple_choice, ["True","False"] for true_false, empty array for others)
- "correctAnswer" (the correct answer)
- "conceptName" (related concept/topic name)

Make questions genuinely useful for assessment. Cover different aspects of the material.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI could not generate exam questions' });
    }

    const questions = JSON.parse(jsonMatch[0]);

    // Create exam record
    const examResult = await pool.request()
      .input('studentId', sql.Int, req.userId)
      .input('title', sql.NVarChar, materialTitle)
      .input('materialId', sql.Int, materialId || null)
      .input('totalQuestions', sql.Int, questions.length)
      .input('timeLimitMinutes', sql.Int, timeLimitMinutes)
      .input('difficulty', sql.NVarChar, difficulty)
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
        time_limit_minutes: timeLimitMinutes,
        difficulty,
        started_at: exam.started_at,
      },
      questions: savedQuestions,
    });
  } catch (err) {
    console.error('Generate exam error:', err);
    res.status(500).json({ error: 'Exam generation failed' });
  }
});

// Get exam with questions
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const examResult = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('studentId', sql.Int, req.userId)
      .query('SELECT * FROM Exams WHERE id = @id AND student_id = @studentId');

    if (examResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const exam = examResult.recordset[0];

    // Get questions (without correct answers for in-progress exams)
    const questionsResult = await pool.request()
      .input('examId', sql.Int, parseInt(id))
      .query('SELECT id, question_number, question_text, question_type, options, concept_name FROM ExamQuestions WHERE exam_id = @examId ORDER BY question_number');

    // Get any submitted answers
    const answersResult = await pool.request()
      .input('examId', sql.Int, parseInt(id))
      .query('SELECT * FROM ExamAnswers WHERE exam_id = @examId');

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
    const { id } = req.params;
    const { questionId, answer, timeSpentSeconds } = req.body;
    const pool = await getPool();

    // Verify exam belongs to student and is in progress
    const examResult = await pool.request()
      .input('id', sql.Int, parseInt(id))
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
      .input('examId', sql.Int, parseInt(id))
      .input('questionId', sql.Int, questionId)
      .input('answer', sql.NVarChar, answer)
      .input('timeSpent', sql.Int, timeSpentSeconds || 0)
      .query(`IF EXISTS (SELECT 1 FROM ExamAnswers WHERE exam_id = @examId AND question_id = @questionId)
        UPDATE ExamAnswers SET student_answer = @answer, time_spent_seconds = @timeSpent, answered_at = GETDATE()
        WHERE exam_id = @examId AND question_id = @questionId
      ELSE
        INSERT INTO ExamAnswers (exam_id, question_id, student_answer, time_spent_seconds)
        VALUES (@examId, @questionId, @answer, @timeSpent)`);

    res.json({ success: true });
  } catch (err) {
    console.error('Answer question error:', err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// Submit entire exam for grading
router.post('/:id/submit', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Get exam
    const examResult = await pool.request()
      .input('id', sql.Int, parseInt(id))
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
      .input('examId', sql.Int, parseInt(id))
      .query('SELECT * FROM ExamQuestions WHERE exam_id = @examId');

    // Get all student answers
    const answersResult = await pool.request()
      .input('examId', sql.Int, parseInt(id))
      .query('SELECT * FROM ExamAnswers WHERE exam_id = @examId');

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

      // Update answer record with correctness
      await pool.request()
        .input('isCorrect', sql.Bit, isCorrect)
        .input('answerId', sql.Int, answers[question.id]?.id)
        .query('UPDATE ExamAnswers SET is_correct = @isCorrect WHERE id = @answerId');

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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const conceptBreakdown = Object.entries(conceptResults)
      .map(([name, data]) => `${name}: ${data.correct}/${data.total} (${Math.round(data.correct / data.total * 100)}%)`)
      .join('\n');

    const weakConcepts = Object.entries(conceptResults)
      .filter(([, data]) => data.correct / data.total < 0.7)
      .map(([name, data]) => `${name} (${Math.round(data.correct / data.total * 100)}%)`)
      .join(', ') || 'None';

    const analysisPrompt = `A student just completed an exam on "${exam.title}".
Score: ${score}/${totalQuestions} (${percentage}%)

Concept breakdown:
${conceptBreakdown}

Weak areas: ${weakConcepts}

Provide a brief analysis including:
1. Strong areas (concepts above 70%)
2. Weak areas (concepts below 70%)
3. Specific detected issues or misconceptions if apparent
4. 2-3 targeted recommendations for what to study next

Return JSON with: "strongAreas" (array of strings), "weakAreas" (array of strings), "detectedIssues" (array of strings), "recommendations" (array of strings).`;

    let analysis = {};
    try {
      const aiResult = await model.generateContent(analysisPrompt);
      const aiText = aiResult.response.text();
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch (aiErr) {
      console.error('AI analysis failed:', aiErr.message);
      analysis = {
        strongAreas: Object.entries(conceptResults).filter(([, d]) => d.correct / d.total >= 0.7).map(([n]) => n),
        weakAreas: Object.entries(conceptResults).filter(([, d]) => d.correct / d.total < 0.7).map(([n]) => n),
        detectedIssues: [],
        recommendations: ['Review weak areas identified above.'],
      };
    }

    // Update exam record
    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('score', sql.Int, score)
      .input('totalScore', sql.Int, totalQuestions)
      .input('percentage', sql.Float, percentage)
      .input('analysis', sql.NVarChar, JSON.stringify(analysis))
      .query(`UPDATE Exams 
              SET status = 'completed', score = @score, total_score = @totalScore, 
                  percentage = @percentage, analysis = @analysis, submitted_at = GETDATE()
              WHERE id = @id`);

    // Update KnowledgeProfile for each concept
    for (const [conceptName, data] of Object.entries(conceptResults)) {
      // Try to find concept by name from existing Concepts table
      const conceptResult = await pool.request()
        .input('name', sql.NVarChar, conceptName)
        .query('SELECT id FROM Concepts WHERE name LIKE @name');

      if (conceptResult.recordset.length > 0) {
        const conceptId = conceptResult.recordset[0].id;
        const masteryDelta = data.correct / data.total >= 0.7 ? 0.1 : -0.1;

        await pool.request()
          .input('studentId', sql.Int, req.userId)
          .input('conceptId', sql.Int, conceptId)
          .input('delta', sql.Float, masteryDelta)
          .query(`IF EXISTS (SELECT 1 FROM KnowledgeProfile WHERE student_id = @studentId AND concept_id = @conceptId)
            UPDATE KnowledgeProfile SET mastery_level = CASE WHEN mastery_level + @delta > 1 THEN 1 WHEN mastery_level + @delta < 0 THEN 0 ELSE mastery_level + @delta END, last_assessed = GETDATE(), updated_at = GETDATE()
            WHERE student_id = @studentId AND concept_id = @conceptId
          ELSE
            INSERT INTO KnowledgeProfile (student_id, concept_id, mastery_level, last_assessed)
            VALUES (@studentId, @conceptId, ${data.correct / data.total}, GETDATE())`);
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
    res.status(500).json({ error: 'Exam submission failed' });
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
