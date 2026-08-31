/**
 * PROMPTS SERVICE
 * Centralized, structured prompt templates for every AI feature.
 * Each function returns { system, user, responseFormat } so the AI service
 * can send the system message + user message and parse structured JSON.
 */

// ─── 1. FLASHCARD GENERATION ──────────────────────────────────
export function flashcardGeneration({ title, content, count, difficulty }) {
  const diffLine = difficulty ? `Difficulty level: ${difficulty}/5` : 'Vary difficulty levels between 1-5';
  return {
    system: 'You are an expert educator creating study flashcards. Generate high-quality flashcards that test understanding of important concepts. Avoid trivial or duplicate cards. Return ONLY a JSON array.',
    user: `Generate ${count} flashcards from this material.

${diffLine}

Material title: ${title}
Material content:
${content.substring(0, 10000)}

Return a JSON array where each object has:
- "front": question or concept to learn (string)
- "back": answer or explanation (string)
- "difficulty": 1-5 scale (number)
- "cardType": one of "qa", "definition", "concept", "formula", "comparison" (string)
- "conceptName": related concept name or empty string (string)`,
    responseFormat: 'array',
    requiredFields: ['front', 'back', 'difficulty', 'cardType'],
  };
}

// ─── 2. CONCEPT EXTRACTION ────────────────────────────────────
export function conceptExtraction({ content }) {
  return {
    system: 'You are an expert educator analyzing educational material. Extract the key concepts a student needs to learn. Return ONLY a JSON array.',
    user: `Analyze this educational material and extract the key concepts.

Material:
${content.substring(0, 8000)}

Return a JSON array where each object has:
- "name": concept name (string)
- "description": brief explanation (string)
- "difficulty": 1-5 scale (number)`,
    responseFormat: 'array',
    requiredFields: ['name', 'description', 'difficulty'],
  };
}

// ─── 3. EXAM GENERATION ──────────────────────────────────────
export function examGeneration({ title, content, totalQuestions, difficulty, weakAreas }) {
  const weakLine = weakAreas?.length
    ? `\nFocus extra questions on these weak areas: ${weakAreas.map(w => `${w.name} (mastery: ${w.mastery}%)`).join(', ')}`
    : '';
  return {
    system: 'You are an expert exam designer. Generate rigorous, fair questions that test genuine understanding. Return ONLY a JSON array.',
    user: `Generate an exam with ${totalQuestions} questions from the following material.
Mix of question types: multiple choice, true/false, short answer, and code/output where appropriate.
Difficulty level: ${difficulty}${weakLine}

Material title: ${title}
Material content:
${content.substring(0, 10000)}

Return a JSON array where each object has:
- "question": the question text (string)
- "type": one of "multiple_choice", "true_false", "short_answer", "code_output" (string)
- "options": array of 4 choices for MC, ["True","False"] for T/F, [] for others (array)
- "correctAnswer": the correct answer (string)
- "conceptName": related topic name (string)`,
    responseFormat: 'array',
    requiredFields: ['question', 'type', 'options', 'correctAnswer', 'conceptName'],
  };
}

// ─── 4. EXAM ANALYSIS ────────────────────────────────────────
export function examAnalysis({ title, score, total, percentage, conceptBreakdown, weakConcepts }) {
  return {
    system: 'You are an expert educational analyst. Analyze exam performance and provide actionable insights. Return ONLY a JSON object.',
    user: `A student just completed an exam on "${title}".
Score: ${score}/${total} (${percentage}%)

Concept breakdown:
${conceptBreakdown}

Weak areas: ${weakConcepts}

Analyze and return a JSON object with:
- "strongAreas": concepts above 70% (array of strings)
- "weakAreas": concepts below 70% (array of strings)
- "detectedIssues": specific misconceptions or patterns (array of strings)
- "recommendations": 2-3 targeted next steps (array of strings)`,
    responseFormat: 'object',
    requiredFields: ['strongAreas', 'weakAreas', 'detectedIssues', 'recommendations'],
  };
}

// ─── 5. QUESTION GENERATION (Diagnostic Assessment) ──────────
export function questionGeneration({ conceptName, description, difficulty, count }) {
  return {
    system: 'You are an expert assessment designer creating diagnostic questions. Return ONLY a JSON array.',
    user: `Generate ${count} multiple-choice assessment questions for the concept: "${conceptName}".
Description: ${description}
Difficulty level: ${difficulty}/5

Return a JSON array where each object has:
- "question": the question text (string)
- "options": array of exactly 4 answer choices (array of strings)
- "correctAnswer": the correct option text, matching one of the options exactly (string)
- "explanation": why it is correct (string)`,
    responseFormat: 'array',
    requiredFields: ['question', 'options', 'correctAnswer', 'explanation'],
  };
}

// ─── 6. MISCONCEPTION DETECTION (Why Engine — Analyze) ───────
export function misconceptionDetection({ questionText, options, correctAnswer, studentAnswer, existingMisconceptions, masteryContext }) {
  const knownMisc = existingMisconceptions?.length
    ? `\nKNOWN MISCONCEPTIONS for this topic:\n${existingMisconceptions.map(m => `- "${m.misconception}" (severity: ${m.severity}, seen ${m.occurrences} times)`).join('\n')}\nConsider whether the student's error is related to any known misconception.`
    : '';

  return {
    system: 'You are the "Why Engine" of an adaptive learning system. Identify WHY a student got a question wrong — not just say "wrong answer." Be specific, educational, and constructive. Return ONLY a JSON object.',
    user: `QUESTION: ${questionText}
${options ? `OPTIONS: ${options}` : ''}
CORRECT ANSWER: ${correctAnswer}
STUDENT'S WRONG ANSWER: ${studentAnswer}
${knownMisc}
${masteryContext}

TASK:
1. Identify the likely misconception or knowledge gap.
2. Estimate confidence: "high" (clear evidence), "medium" (likely), or "low" (uncertain).
3. Generate a targeted explanation that corrects the misconception.
4. Generate a follow-up question testing the corrected concept.

Return a JSON object with:
- "misconception": what the student misunderstood (string)
- "confidence": "high", "medium", or "low" (string)
- "explanation": targeted explanation (string)
- "followUpQuestion": tests the corrected concept (string)
- "followUpOptions": exactly 4 answer choices (array of strings)
- "followUpCorrectAnswer": correct option (string)`,
    responseFormat: 'object',
    requiredFields: ['misconception', 'confidence', 'explanation', 'followUpQuestion', 'followUpOptions', 'followUpCorrectAnswer'],
  };
}

// ─── 7. QUIZ MISCONCEPTION DETECTION (Evaluate endpoint) ─────
export function quizMisconception({ questionText, options, correctAnswer, studentAnswer }) {
  return {
    system: 'You are an expert tutor analyzing why a student answered incorrectly. Identify the misconception, explain it, and generate a follow-up question. Return ONLY a JSON object.',
    user: `A student was asked this question and answered incorrectly.
Question: ${questionText}
Options: ${options}
Student's answer: ${studentAnswer}
Correct answer: ${correctAnswer}

Analyze why the student got this wrong and return a JSON object with:
- "misconception": what the student misunderstood (string)
- "explanation": targeted explanation (string)
- "followUpQuestion": object with "question", "options" (4 strings), "correctAnswer" (object)`,
    responseFormat: 'object',
    requiredFields: ['misconception', 'explanation', 'followUpQuestion'],
  };
}

// ─── 8. TARGETED REMEDIATION (Why Engine — Follow-up) ────────
export function targetedRemediation({ originalQuestion, studentOriginalAnswer, correctAnswer, misconception, explanationGiven, studentFollowUpAnswer }) {
  return {
    system: 'You are a patient, expert tutor. The student is struggling after your first explanation. Generate a SIMPLER or DIFFERENT approach using examples, analogies, or step-by-step breakdowns. Return ONLY a JSON object.',
    user: `The student still has a misconception after one remediation attempt.

Original question: ${originalQuestion}
Student's original wrong answer: ${studentOriginalAnswer}
Correct answer: ${correctAnswer}
Misconception identified: ${misconception}
Explanation already given: ${explanationGiven}
Student's follow-up answer: ${studentFollowUpAnswer} (also wrong)

Generate a simpler approach and return a JSON object with:
- "explanation": new, simpler explanation using examples/analogies (string)
- "followUpQuestion": a simpler or differently-worded question (string)
- "followUpOptions": exactly 4 answer choices (array of strings)
- "followUpCorrectAnswer": correct option (string)`,
    responseFormat: 'object',
    requiredFields: ['explanation', 'followUpQuestion', 'followUpOptions', 'followUpCorrectAnswer'],
  };
}

// ─── 9. FREE-FORM MISCONCEPTION ANALYSIS ─────────────────────
export function freeFormMisconception({ questionText, studentAnswer, topic, existingMisconceptions }) {
  const knownMisc = existingMisconceptions?.length
    ? `\nKNOWN MISCONCEPTIONS:\n${existingMisconceptions.map(m => `- "${m.misconception}" (severity: ${m.severity})`).join('\n')}`
    : '';

  return {
    system: 'You are the "Why Engine" of an adaptive learning system. Analyze why a student answered incorrectly, even without knowing the "correct" answer. Be honest about uncertainty. Return ONLY a JSON object.',
    user: `A student was asked a question and gave an incorrect answer. Analyze why.

QUESTION: ${questionText}
STUDENT'S ANSWER: ${studentAnswer}
${topic ? `TOPIC: ${topic}` : ''}
${knownMisc}

Analyze the student's reasoning (if inferable). If no reasoning provided, classify confidence as "low" or "medium".

Return a JSON object with:
- "topic": the topic (string)
- "misconception": what the student misunderstood (string)
- "confidence": "high", "medium", or "low" (string)
- "reasoningAnalysis": inference about thought process (string)
- "explanation": targeted explanation (string)
- "followUpQuestion": tests corrected understanding (string)
- "followUpOptions": exactly 4 answer choices (array of strings)
- "followUpCorrectAnswer": correct option (string)`,
    responseFormat: 'object',
    requiredFields: ['topic', 'misconception', 'confidence', 'reasoningAnalysis', 'explanation', 'followUpQuestion', 'followUpOptions', 'followUpCorrectAnswer'],
  };
}

// ─── 10. PATTERN DETECTION (Learning Twin) ───────────────────
export function patternDetection({ recentAnswers, flashcardPerformance, examPerformance }) {
  return {
    system: 'You are a learning analytics expert. Analyze student learning data to identify behavioral patterns. Only report patterns supported by clear evidence. Do NOT make psychological claims. Return ONLY a JSON array.',
    user: `Analyze this student's learning data and identify behavioral patterns.

Recent quiz answers (20 most recent):
${JSON.stringify(recentAnswers, null, 2)}

Flashcard performance:
${JSON.stringify(flashcardPerformance, null, 2)}

Exam performance:
${JSON.stringify(examPerformance, null, 2)}

Look for patterns like:
- Performance difference between question types
- Difficulty level trends
- Topic-specific strengths/weaknesses
- Error patterns (e.g., multi-step reasoning errors)
- Recognition vs recall abilities

Return a JSON array where each object has:
- "type": one of "performance", "difficulty", "question_type", "topic_strength", "error_pattern" (string)
- "text": clear, factual description (string)
- "confidence": 0.0-1.0 (number)
- "evidence": what data supports this (string)

Only include patterns where confidence >= 0.6.`,
    responseFormat: 'array',
    requiredFields: ['type', 'text', 'confidence', 'evidence'],
  };
}

// ─── 11. ADAPTIVE TUTORING CONTEXT ───────────────────────────
export function adaptiveTutoringContext({ topics, misconceptions, patterns, whyEngineData, unresolvedMisconceptions }) {
  const topicStr = topics?.length
    ? topics.map(t => `${t.name}: ${Math.round(t.mastery_level * 100)}%${t.misconceptions ? ' (has misconceptions)' : ''}`).join(', ')
    : 'No topics studied yet';
  const miscStr = misconceptions?.length
    ? misconceptions.map(m => `${m.topic}: ${m.misconception} (severity: ${m.severity})`).join('; ')
    : 'None';
  const patternStr = patterns?.length
    ? patterns.map(p => p.pattern_text).join('; ')
    : 'Not yet detected';
  const whyStr = whyEngineData?.length
    ? whyEngineData.map(w => `${w.topic}: ${w.identified_misconception} (confidence: ${w.confidence}, status: ${w.resolved ? 'resolved' : 'in_progress'})`).join('; ')
    : 'No investigations yet';

  return {
    system: 'You are an adaptive AI tutor. Use the student profile below to personalize your teaching. If mastery is high, skip basics. If misconceptions exist, address them. If patterns suggest example-based learning, use examples.',
    user: `Student learning profile:
Topics: ${topicStr}.
Active misconceptions: ${miscStr}.
Why Engine findings: ${whyStr}.
Learning patterns: ${patternStr}.
${unresolvedMisconceptions?.length > 0 ? `\nIMPORTANT: The student has ${unresolvedMisconceptions.length} unresolved misconception(s). When teaching related topics, proactively address these.` : ''}`,
    responseFormat: null, // Context-only, not a standalone AI call
  };
}
