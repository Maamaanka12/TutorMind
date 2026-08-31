import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { CheckCircle, XCircle, Loader2, ArrowRight, AlertTriangle, HelpCircle } from 'lucide-react';

export default function Assessment() {
  const { conceptId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.generateQuestions(parseInt(conceptId), 3);
        setQuestions(data.questions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conceptId]);

  async function handleSubmit() {
    if (!selectedAnswer) return;
    setSubmitting(true);
    try {
      const question = questions[currentIndex];
      const isFollowUp = typeof question.id === 'string' && question.id.startsWith('followup-');

      if (isFollowUp) {
        // Evaluate follow-up question client-side (not in DB)
        const correct = selectedAnswer === question.correctAnswer;
        setResult({
          isCorrect: correct,
          correctAnswer: question.correctAnswer,
          misconception: null,
          explanation: correct
            ? 'Correct! You understood the follow-up.'
            : 'Not quite. The correct answer is shown above. Try reviewing the concept again.',
          followUpQuestion: null,
        });
      } else {
        const res = await api.evaluate(question.id, selectedAnswer);
        setResult(res);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFollowUp() {
    if (!result?.followUpQuestion) return;
    setGeneratingFollowUp(true);

    const newQuestion = {
      id: `followup-${Date.now()}`,
      question: result.followUpQuestion.question,
      options: result.followUpQuestion.options,
      correctAnswer: result.followUpQuestion.correctAnswer,
    };

    setQuestions([...questions, newQuestion]);
    setCurrentIndex(currentIndex + 1);
    setSelectedAnswer(null);
    setResult(null);
    setGeneratingFollowUp(false);
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setResult(null);
    } else {
      navigate('/dashboard');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 dark:border-primary-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-primary-500 dark:text-primary-400 font-semibold">Generating questions...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="clay-card p-10 animate-slide-up">
          <HelpCircle size={48} className="text-primary-300 dark:text-primary-600 mx-auto mb-4" />
          <p className="text-primary-500 dark:text-primary-400 font-semibold mb-4">No questions could be generated for this concept.</p>
          <button onClick={() => navigate(-1)} className="clay-btn-primary text-sm py-2 px-4">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  const isFollowUp = typeof question.id === 'string' && question.id.startsWith('followup-');
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Progress */}
      <div className="mb-8 animate-slide-up">
        <div className="flex justify-between text-sm font-semibold text-primary-500 dark:text-primary-400 mb-2">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress)}% complete</span>
        </div>
        <div className="w-full bg-primary-100 dark:bg-primary-800 rounded-full h-3 border border-primary-200 dark:border-primary-700" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Quiz progress">
          <div
            className="bg-primary-500 dark:bg-primary-400 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="clay-card p-6 md:p-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
        {isFollowUp && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-clay mb-6 text-sm font-semibold flex items-center gap-2"
            style={{ boxShadow: '3px 3px 0 0 #BFDBFE' }}>
            <AlertTriangle size={16} />
            Follow-up question to verify your understanding
          </div>
        )}

        <h2 className="text-xl font-display font-bold text-primary-900 dark:text-primary-100 mb-6 leading-relaxed">
          {question.question}
        </h2>

        <div className="space-y-3 mb-6">
          {question.options.map((option, i) => {
            const isSelected = selectedAnswer === option;
            const isCorrect = result && option === result.correctAnswer;
            const isWrong = result && isSelected && !result.isCorrect;

            return (
              <button
                key={i}
                onClick={() => !result && setSelectedAnswer(option)}
                disabled={!!result}
                className={`w-full text-left p-4 rounded-clay border-2 transition-all duration-200 flex items-center gap-3 ${
                  isCorrect
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                    : isWrong
                    ? 'border-red-400 bg-red-50 dark:bg-red-900/30'
                    : isSelected
                    ? 'border-primary-400 bg-primary-50 dark:bg-primary-800/50'
                    : 'border-primary-200 dark:border-primary-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-800/30'
                }`}
                style={
                  isCorrect
                    ? { boxShadow: '4px 4px 0 0 #BBF7D0' }
                    : isWrong
                    ? { boxShadow: '4px 4px 0 0 #FECACA' }
                    : isSelected
                    ? { boxShadow: '4px 4px 0 0 #C7D2FE' }
                    : { boxShadow: '3px 3px 0 0 var(--clay-card-shadow)' }
                }
              >
                <span className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${
                  isCorrect
                    ? 'border-green-500 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-400'
                    : isWrong
                    ? 'border-red-400 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-400'
                    : isSelected
                    ? 'border-primary-500 bg-primary-100 dark:bg-primary-700 text-primary-700 dark:text-primary-300'
                    : 'border-primary-200 dark:border-primary-600 bg-white dark:bg-primary-800 text-primary-500 dark:text-primary-400'
                }`}>
                  {isCorrect ? <CheckCircle size={18} /> :
                   isWrong ? <XCircle size={18} /> :
                   String.fromCharCode(65 + i)}
                </span>
                <span className="font-semibold text-primary-800 dark:text-primary-200">{option}</span>
              </button>
            );
          })}
        </div>

        {/* Result */}
        {result && (
          <div className={`p-5 rounded-clay mb-6 border-2 ${
            result.isCorrect ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-accent-50 dark:bg-accent-900/20 border-accent-200 dark:border-accent-800'
          }`}
            style={{
              boxShadow: result.isCorrect
                ? '4px 4px 0 0 #BBF7D0'
                : '4px 4px 0 0 #FED7AA',
            }}>
            <div className="flex items-center gap-2 mb-2">
              {result.isCorrect ? (
                <>
                  <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                  <span className="font-display font-bold text-green-700 dark:text-green-400">Correct!</span>
                </>
              ) : (
                <>
                  <XCircle className="text-red-600 dark:text-red-400" size={20} />
                  <span className="font-display font-bold text-red-700 dark:text-red-400">Not quite</span>
                </>
              )}
            </div>

            {!result.isCorrect && result.misconception && (
              <div className="mt-3 bg-white/60 dark:bg-primary-800/50 rounded-clay p-3">
                <p className="text-sm font-bold text-primary-700 dark:text-primary-300">What you might be misunderstanding:</p>
                <p className="text-sm text-primary-600 dark:text-primary-400 mt-1 leading-relaxed">{result.misconception}</p>
              </div>
            )}

            {result.explanation && (
              <div className="mt-3 bg-white/60 dark:bg-primary-800/50 rounded-clay p-3">
                <p className="text-sm font-bold text-primary-700 dark:text-primary-300">Explanation:</p>
                <p className="text-sm text-primary-600 dark:text-primary-400 mt-1 leading-relaxed">{result.explanation}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {!result ? (
            <button
              onClick={handleSubmit}
              disabled={!selectedAnswer || submitting}
              className="clay-btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 py-3.5"
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
              {submitting ? 'Evaluating...' : 'Submit Answer'}
            </button>
          ) : (
            <div className="flex gap-3 w-full">
              {!result.isCorrect && result.followUpQuestion && (
                <button
                  onClick={handleFollowUp}
                  disabled={generatingFollowUp}
                  className="clay-btn bg-accent-500 dark:bg-accent-400 text-white dark:text-accent-700 border-2 border-accent-400 dark:border-accent-600 flex-1 flex items-center justify-center gap-2 disabled:opacity-50 py-3.5"
                  style={{ boxShadow: '4px 4px 0 0 #9A3412' }}
                >
                  {generatingFollowUp ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <AlertTriangle size={18} />
                  )}
                  Try a Follow-up
                </button>
              )}
              <button
                onClick={handleNext}
                className="clay-btn-primary flex-1 flex items-center justify-center gap-2 py-3.5"
              >
                {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish'}
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
