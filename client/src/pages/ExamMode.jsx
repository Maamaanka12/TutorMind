import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../utils/auth';
import { useTheme } from '../utils/ThemeContext';
import {
  Clock, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Trophy, Target, TrendingUp, BookOpen, AlertCircle,
  FileText, Settings, Play, RotateCcw, Loader2, ArrowLeft, Flame,
  BarChart3, Lightbulb
} from 'lucide-react';

export default function ExamMode() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const navigate = useNavigate();

  const [view, setView] = useState('setup'); // setup | taking | results
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Setup state
  const [title, setTitle] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [timeLimit, setTimeLimit] = useState(30);
  const [difficulty, setDifficulty] = useState('adaptive');

  // Exam state
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [showUnansweredWarning, setShowUnansweredWarning] = useState(false);

  // Results state
  const [results, setResults] = useState(null);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Load materials
  useEffect(() => {
    api.getMaterials().then(setMaterials).catch(console.error);
  }, []);

  // Timer logic
  useEffect(() => {
    if (view !== 'taking' || timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [view, timeLeft]);

  // Save answers to server as student types
  const saveAnswer = useCallback(async (questionId, answer) => {
    if (!exam) return;
    const timeSpent = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
    try {
      await api.answerExamQuestion(exam.id, { questionId, answer, timeSpentSeconds: timeSpent });
    } catch (err) {
      console.error('Failed to save answer:', err);
    }
  }, [exam]);

  // Generate exam
  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await api.generateExam({
        title: title || undefined,
        materialId: materialId || undefined,
        totalQuestions,
        timeLimitMinutes: timeLimit,
        difficulty,
      });
      setExam(data.exam);
      setQuestions(data.questions);
      setAnswers({});
      setTimeLeft(data.exam.time_limit_minutes * 60);
      setCurrentIndex(0);
      startTimeRef.current = Date.now();
      setView('taking');
    } catch (err) {
      setError(err.aiError ? err.message : 'Failed to generate exam: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update answer
  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    saveAnswer(questionId, answer);
  };

  // Submit exam
  const handleSubmitExam = async () => {
    clearInterval(timerRef.current);

    const unanswered = questions.filter(q => !answers[q.id]);
    if (unanswered.length > 0 && view === 'taking') {
      setShowUnansweredWarning(true);
      return;
    }

    setLoading(true);
    try {
      const data = await api.submitExam(exam.id);
      setResults(data);
      setView('results');
    } catch (err) {
      setError(err.aiError ? err.message : 'Failed to submit exam: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmSubmit = async () => {
    setShowUnansweredWarning(false);
    setLoading(true);
    try {
      const data = await api.submitExam(exam.id);
      setResults(data);
      setView('results');
    } catch (err) {
      setError(err.aiError ? err.message : 'Failed to submit exam: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const answeredCount = questions.filter(q => answers[q.id]).length;
  const unansweredCount = questions.length - answeredCount;

  // ─── SETUP VIEW ──────────────────────────────────────────
  if (view === 'setup') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-red-500 text-white p-3 rounded-clay" style={{ boxShadow: dark ? '3px 3px 0 0 #7F1D1D' : '3px 3px 0 0 #FCA5A5' }}>
            <Flame size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-primary-900 dark:text-primary-100">Exam Mode</h1>
            <p className="text-primary-500 dark:text-primary-400 text-sm">Focused assessment — no hints, no explanations</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-clay text-red-700 dark:text-red-300 text-sm font-semibold flex items-start gap-3">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{error}</p>
              {error.includes('temporarily') && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-normal">Please wait a few minutes and try again.</p>
              )}
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
          </div>
        )}

        <div className="bg-white dark:bg-primary-900 rounded-clay p-6 border-2 border-primary-200 dark:border-primary-700 space-y-5" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
          <div>
            <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">Exam Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Database Systems Midterm"
              className="w-full px-4 py-2.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-900 dark:text-primary-100 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">Source Material</label>
            <select
              value={materialId}
              onChange={e => setMaterialId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-900 dark:text-primary-100 focus:outline-none focus:border-primary-400"
            >
              <option value="">— Select material (optional) —</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">Number of Questions</label>
              <select
                value={totalQuestions}
                onChange={e => setTotalQuestions(parseInt(e.target.value))}
                className="w-full px-4 py-2.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-900 dark:text-primary-100 focus:outline-none focus:border-primary-400"
              >
                {[5, 10, 15, 20, 30, 40, 50].map(n => (
                  <option key={n} value={n}>{n} questions</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">Time Limit</label>
              <select
                value={timeLimit}
                onChange={e => setTimeLimit(parseInt(e.target.value))}
                className="w-full px-4 py-2.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-900 dark:text-primary-100 focus:outline-none focus:border-primary-400"
              >
                {[10, 15, 20, 30, 45, 60, 90, 120].map(n => (
                  <option key={n} value={n}>{n} minutes</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">Difficulty</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'easy', label: 'Easy', desc: 'Basic concepts' },
                { value: 'adaptive', label: 'Adaptive', desc: 'Based on your level' },
                { value: 'hard', label: 'Hard', desc: 'Advanced questions' },
              ].map(d => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`p-3 rounded-clay border-2 text-center transition-all duration-150 ${
                    difficulty === d.value
                      ? 'border-primary-500 bg-primary-100 dark:bg-primary-800 text-primary-900 dark:text-primary-100'
                      : 'border-primary-200 dark:border-primary-700 hover:border-primary-300 dark:hover:border-primary-600 text-primary-600 dark:text-primary-400'
                  }`}
                >
                  <div className="font-semibold text-sm">{d.label}</div>
                  <div className="text-xs opacity-70 mt-0.5">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 rounded-clay bg-red-500 text-white font-bold text-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ boxShadow: dark ? '3px 3px 0 0 #7F1D1D' : '3px 3px 0 0 #FCA5A5' }}
          >
            {loading ? (
              <><Loader2 size={20} className="animate-spin" /> Generating Exam...</>
            ) : (
              <><Play size={20} /> Start Exam</>
            )}
          </button>
        </div>

        {/* Exam history */}
        <ExamHistory />
      </div>
    );
  }

  // ─── TAKING VIEW ─────────────────────────────────────────
  if (view === 'taking') {
    const question = questions[currentIndex];
    const isTimeLow = timeLeft < 300; // less than 5 minutes
    const isTimeCritical = timeLeft < 60;

    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="font-display font-bold text-primary-900 dark:text-primary-100 text-lg">{exam.title}</h2>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-clay font-mono font-bold text-lg border-2 ${
            isTimeCritical ? 'bg-red-100 dark:bg-red-900/30 border-red-400 text-red-600 dark:text-red-400 animate-pulse' :
            isTimeLow ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 text-yellow-600 dark:text-yellow-400' :
            'bg-primary-100 dark:bg-primary-800 border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
          }`}>
            <Clock size={18} />
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-primary-500 dark:text-primary-400 mb-1">
            <span>Question {currentIndex + 1} of {questions.length}</span>
            <span>{answeredCount} answered · {unansweredCount} remaining</span>
          </div>
          <div className="h-2 bg-primary-200 dark:bg-primary-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 dark:bg-primary-400 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div className="bg-white dark:bg-primary-900 rounded-clay p-6 border-2 border-primary-200 dark:border-primary-700 mb-4" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
          <div className="flex items-center gap-2 mb-4">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              question.question_type === 'multiple_choice' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
              question.question_type === 'true_false' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
              question.question_type === 'code_output' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
              'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
            }`}>
              {question.question_type === 'multiple_choice' ? 'Multiple Choice' :
               question.question_type === 'true_false' ? 'True / False' :
               question.question_type === 'code_output' ? 'Code Output' : 'Short Answer'}
            </span>
            {question.concept_name && (
              <span className="text-xs text-primary-400 dark:text-primary-500">{question.concept_name}</span>
            )}
          </div>

          <p className="text-primary-900 dark:text-primary-100 text-lg font-medium mb-5 leading-relaxed">{question.question_text}</p>

          {/* Answer input based on type */}
          {question.question_type === 'multiple_choice' && (
            <div className="space-y-2">
              {question.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(question.id, option)}
                  className={`w-full text-left px-4 py-3 rounded-clay border-2 transition-all duration-150 ${
                    answers[question.id] === option
                      ? 'border-primary-500 bg-primary-100 dark:bg-primary-800 text-primary-900 dark:text-primary-100'
                      : 'border-primary-200 dark:border-primary-700 hover:border-primary-300 dark:hover:border-primary-600 text-primary-700 dark:text-primary-300'
                  }`}
                >
                  <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>
                  {option}
                </button>
              ))}
            </div>
          )}

          {question.question_type === 'true_false' && (
            <div className="grid grid-cols-2 gap-3">
              {['True', 'False'].map(option => (
                <button
                  key={option}
                  onClick={() => handleAnswer(question.id, option)}
                  className={`py-3 rounded-clay border-2 font-semibold text-center transition-all duration-150 ${
                    answers[question.id] === option
                      ? option === 'True'
                        ? 'border-green-500 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'border-red-500 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'border-primary-200 dark:border-primary-700 hover:border-primary-300 text-primary-700 dark:text-primary-300'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {(question.question_type === 'short_answer' || question.question_type === 'code_output') && (
            <textarea
              value={answers[question.id] || ''}
              onChange={e => handleAnswer(question.id, e.target.value)}
              placeholder={question.question_type === 'code_output' ? 'Write the expected output...' : 'Type your answer...'}
              rows={4}
              className="w-full px-4 py-3 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-900 dark:text-primary-100 focus:outline-none focus:border-primary-400 font-mono text-sm resize-y"
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-4 py-2.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 text-primary-600 dark:text-primary-400 font-semibold disabled:opacity-30 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors"
          >
            <ChevronLeft size={18} /> Previous
          </button>

          <div className="flex items-center gap-2">
            {currentIndex < questions.length - 1 ? (
              <button
                onClick={() => setCurrentIndex(prev => prev + 1)}
                className="flex items-center gap-1 px-4 py-2.5 rounded-clay bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors"
                style={{ boxShadow: dark ? '2px 2px 0 0 #312E81' : '2px 2px 0 0 #A5B4FC' }}
              >
                Next <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmitExam}
                disabled={loading}
                className="flex items-center gap-1 px-6 py-2.5 rounded-clay bg-red-500 text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                style={{ boxShadow: dark ? '2px 2px 0 0 #7F1D1D' : '2px 2px 0 0 #FCA5A5' }}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                Submit Exam
              </button>
            )}
          </div>
        </div>

        {/* Question navigator */}
        <div className="mt-6 bg-white dark:bg-primary-900 rounded-clay p-4 border-2 border-primary-200 dark:border-primary-700">
          <p className="text-xs font-semibold text-primary-500 dark:text-primary-400 mb-2">Question Navigator</p>
          <div className="flex flex-wrap gap-2">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                className={`w-9 h-9 rounded-clay text-xs font-bold transition-all duration-150 border-2 ${
                  i === currentIndex
                    ? 'border-primary-500 bg-primary-500 text-white'
                    : answers[q.id]
                    ? 'border-green-400 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : 'border-primary-200 dark:border-primary-700 text-primary-400 dark:text-primary-500 hover:border-primary-300'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Unanswered warning modal */}
        {showUnansweredWarning && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-primary-900 rounded-clay p-6 max-w-md w-full border-2 border-primary-200 dark:border-primary-700" style={{ boxShadow: dark ? '6px 6px 0 0 #312E81' : '6px 6px 0 0 #C7D2FE' }}>
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="text-yellow-500" size={24} />
                <h3 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100">Unanswered Questions</h3>
              </div>
              <p className="text-primary-600 dark:text-primary-400 mb-2">
                You have <strong>{unansweredCount}</strong> unanswered question{unansweredCount > 1 ? 's' : ''}:
              </p>
              <div className="flex flex-wrap gap-1 mb-5">
                {questions.filter(q => !answers[q.id]).map(q => (
                  <span key={q.id} className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded text-xs font-bold">
                    Q{q.question_number}
                  </span>
                ))}
              </div>
              <p className="text-sm text-primary-500 dark:text-primary-400 mb-5">
                Unanswered questions will be marked as incorrect. Are you sure you want to submit?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUnansweredWarning(false)}
                  className="flex-1 py-2.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 text-primary-600 dark:text-primary-400 font-semibold hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={confirmSubmit}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-clay bg-red-500 text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Submit Anyway'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── RESULTS VIEW ────────────────────────────────────────
  if (view === 'results') {
    const analysis = results.analysis || {};
    const conceptEntries = Object.entries(results.conceptResults || {});
    const strongConcepts = conceptEntries.filter(([, d]) => d.correct / d.total >= 0.7);
    const weakConcepts = conceptEntries.filter(([, d]) => d.correct / d.total < 0.7);

    const getGradeColor = (pct) => {
      if (pct >= 90) return 'text-green-600 dark:text-green-400';
      if (pct >= 70) return 'text-blue-600 dark:text-blue-400';
      if (pct >= 50) return 'text-yellow-600 dark:text-yellow-400';
      return 'text-red-600 dark:text-red-400';
    };

    const getGradeBg = (pct) => {
      if (pct >= 90) return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700';
      if (pct >= 70) return 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700';
      if (pct >= 50) return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700';
      return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700';
    };

    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => { setView('setup'); setResults(null); setExam(null); setQuestions([]); setAnswers({}); }}
          className="flex items-center gap-1 text-primary-500 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 mb-6 font-semibold text-sm"
        >
          <ArrowLeft size={16} /> Back to Exam Setup
        </button>

        {/* Score card */}
        <div className={`rounded-clay p-6 border-2 mb-6 ${getGradeBg(results.percentage)}`} style={{ boxShadow: dark ? '4px 4px 0 0 #1E1B4B' : '4px 4px 0 0 #C7D2FE' }}>
          <div className="flex items-center gap-3 mb-4">
            <Trophy className={getGradeColor(results.percentage)} size={32} />
            <div>
              <h1 className="font-display font-bold text-2xl text-primary-900 dark:text-primary-100">Exam Complete</h1>
              <p className="text-primary-500 dark:text-primary-400 text-sm">{exam?.title}</p>
            </div>
          </div>
          <div className="text-center py-4">
            <div className={`text-6xl font-display font-bold ${getGradeColor(results.percentage)}`}>
              {results.percentage}%
            </div>
            <p className="text-primary-600 dark:text-primary-400 text-lg mt-1">
              {results.score} / {results.total} correct
            </p>
          </div>
        </div>

        {/* Concept breakdown */}
        <div className="bg-white dark:bg-primary-900 rounded-clay p-6 border-2 border-primary-200 dark:border-primary-700 mb-6" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
          <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
            <BarChart3 size={20} /> Performance by Topic
          </h2>
          <div className="space-y-3">
            {conceptEntries.map(([name, data]) => {
              const pct = Math.round((data.correct / data.total) * 100);
              const isStrong = pct >= 70;
              return (
                <div key={name} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0 w-40">
                    {isStrong ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" /> : <AlertCircle size={16} className="text-yellow-500 flex-shrink-0" />}
                    <span className="font-semibold text-sm text-primary-800 dark:text-primary-200 truncate">{name}</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-3 bg-primary-200 dark:bg-primary-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isStrong ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className={`font-mono font-bold text-sm ${isStrong ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {data.correct}/{data.total} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Analysis */}
        {(analysis.strongAreas?.length > 0 || analysis.weakAreas?.length > 0 || analysis.recommendations?.length > 0) && (
          <div className="bg-white dark:bg-primary-900 rounded-clay p-6 border-2 border-primary-200 dark:border-primary-700 mb-6" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
            <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
              <Lightbulb size={20} className="text-yellow-500" /> AI Analysis
              {analysis.aiUnavailable && (
                <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400">Basic Analysis</span>
              )}
            </h2>

            {analysis.aiUnavailable && (
              <p className="text-xs text-primary-500 dark:text-primary-400 mb-4 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-clay border border-yellow-200 dark:border-yellow-800">
                AI analysis was temporarily unavailable. Showing basic performance breakdown based on grading data.
              </p>
            )}

            {analysis.strongAreas?.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-green-600 dark:text-green-400 mb-2 flex items-center gap-1">
                  <CheckCircle2 size={14} /> Strong Areas
                </h3>
                <ul className="space-y-1">
                  {analysis.strongAreas.map((area, i) => (
                    <li key={i} className="text-sm text-primary-700 dark:text-primary-300 flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span> {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.weakAreas?.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-yellow-600 dark:text-yellow-400 mb-2 flex items-center gap-1">
                  <AlertTriangle size={14} /> Needs Improvement
                </h3>
                <ul className="space-y-1">
                  {analysis.weakAreas.map((area, i) => (
                    <li key={i} className="text-sm text-primary-700 dark:text-primary-300 flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">⚠</span> {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.detectedIssues?.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                  <XCircle size={14} /> Detected Issues
                </h3>
                <ul className="space-y-1">
                  {analysis.detectedIssues.map((issue, i) => (
                    <li key={i} className="text-sm text-primary-700 dark:text-primary-300 flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✕</span> {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recommendations?.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                  <Target size={14} /> Recommended Next Steps
                </h3>
                <ul className="space-y-1">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-primary-700 dark:text-primary-300 flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">→</span> {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { setView('setup'); setResults(null); setExam(null); setQuestions([]); setAnswers({}); }}
            className="flex-1 py-3 rounded-clay border-2 border-primary-200 dark:border-primary-700 text-primary-600 dark:text-primary-400 font-semibold hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw size={18} /> Take Another Exam
          </button>
          <button
            onClick={() => navigate('/flashcards')}
            className="flex-1 py-3 rounded-clay bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors flex items-center justify-center gap-2"
            style={{ boxShadow: dark ? '2px 2px 0 0 #312E81' : '2px 2px 0 0 #A5B4FC' }}
          >
            <BookOpen size={18} /> Practice Flashcards
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── EXAM HISTORY COMPONENT ────────────────────────────────
function ExamHistory() {
  const { dark } = useTheme();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api.getExamHistory().then(data => {
      setExams(data.filter(e => e.status === 'completed'));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (exams.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-4">Exam History</h2>
      <div className="space-y-3">
        {exams.map(exam => {
          const analysis = exam.analysis ? JSON.parse(exam.analysis) : {};
          const isExpanded = expandedId === exam.id;
          return (
            <div key={exam.id} className="bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700 overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : exam.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`text-xl font-display font-bold ${
                    exam.percentage >= 90 ? 'text-green-600 dark:text-green-400' :
                    exam.percentage >= 70 ? 'text-blue-600 dark:text-blue-400' :
                    exam.percentage >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {exam.percentage}%
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-primary-800 dark:text-primary-200 text-sm">{exam.title}</div>
                    <div className="text-xs text-primary-400">{exam.score}/{exam.total_questions} · {new Date(exam.submitted_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <ChevronRight size={18} className={`text-primary-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-primary-100 dark:border-primary-800 pt-3">
                  {analysis.weakAreas?.length > 0 && (
                    <p className="text-xs text-primary-500 dark:text-primary-400 mb-1">
                      <strong className="text-yellow-600 dark:text-yellow-400">Weak:</strong> {analysis.weakAreas.join(', ')}
                    </p>
                  )}
                  {analysis.strongAreas?.length > 0 && (
                    <p className="text-xs text-primary-500 dark:text-primary-400">
                      <strong className="text-green-600 dark:text-green-400">Strong:</strong> {analysis.strongAreas.join(', ')}
                    </p>
                  )}
                  {analysis.recommendations?.length > 0 && (
                    <p className="text-xs text-primary-500 dark:text-primary-400 mt-2">
                      <strong className="text-blue-600 dark:text-blue-400">Next:</strong> {analysis.recommendations[0]}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
