import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useTheme } from '../utils/ThemeContext';
import {
  Brain, Loader2, Plus, ChevronRight, ArrowLeft, RotateCcw,
  CheckCircle, XCircle, BookOpen, Target, TrendingUp, Clock,
  Sparkles, Layers, BarChart3, Eye, EyeOff
} from 'lucide-react';

export default function Flashcards() {
  const navigate = useNavigate();
  const { dark } = useTheme();
  const [materials, setMaterials] = useState([]);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [cardCount, setCardCount] = useState(10);
  const [difficulty, setDifficulty] = useState('');

  const [studyCards, setStudyCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyComplete, setStudyComplete] = useState(false);
  const [sessionResults, setSessionResults] = useState({ correct: 0, incorrect: 0 });
  const [answered, setAnswered] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [materialsData, statsData] = await Promise.all([
        api.getMaterials(),
        api.getFlashcardStats(),
      ]);
      setMaterials(materialsData);
      setStats(statsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleGenerate() {
    if (!selectedMaterial) { setError('Please select a material'); return; }
    setGenerating(true);
    setError('');
    try {
      const result = await api.generateFlashcards({
        materialId: parseInt(selectedMaterial),
        count: cardCount,
        difficulty: difficulty ? parseInt(difficulty) : undefined,
      });
      showToast(result.message);
      setView('dashboard');
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function startStudySession() {
    try {
      const cards = await api.getFlashcardsForReview(20);
      if (cards.length === 0) { showToast('No cards due for review!'); return; }
      setStudyCards(cards);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setStudyComplete(false);
      setSessionResults({ correct: 0, incorrect: 0 });
      setAnswered(false);
      setView('study');
    } catch (err) {
      setError(err.message);
    }
  }

  const handleReview = useCallback(async (correct) => {
    const card = studyCards[currentCardIndex];
    try {
      await api.reviewFlashcard(card.id, correct);
      const newCorrect = sessionResults.correct + (correct ? 1 : 0);
      const newIncorrect = sessionResults.incorrect + (correct ? 0 : 1);
      setSessionResults(prev => ({
        correct: prev.correct + (correct ? 1 : 0),
        incorrect: prev.incorrect + (correct ? 0 : 1),
      }));
      if (currentCardIndex < studyCards.length - 1) {
        setCurrentCardIndex(prev => prev + 1);
        setIsFlipped(false);
        setAnswered(false);
      } else {
        setStudyComplete(true);
        // ─── LEARNING LOOP: Trigger pattern detection on session complete ───
        api.completeFlashcardSession({ correctCount: newCorrect, incorrectCount: newIncorrect })
          .catch(() => {}); // fire-and-forget
      }
    } catch (err) {
      console.error(err);
    }
  }, [studyCards, currentCardIndex, sessionResults]);

  // Keyboard shortcuts for study mode
  useEffect(() => {
    if (view !== 'study' || studyComplete) return;
    const handler = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setIsFlipped(true); setAnswered(true); }
      if (e.key === 'ArrowRight' && answered) { e.preventDefault(); handleReview(true); }
      if (e.key === 'ArrowLeft' && answered) { e.preventDefault(); handleReview(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, studyComplete, answered, handleReview]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary-200 dark:border-primary-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-900 dark:text-primary-100">Flashcards</h1>
        <p className="text-primary-500 dark:text-primary-400 mt-1 font-body">AI-powered spaced repetition for effective learning</p>
      </div>

      {toast && (
        <div role="status" className="bg-green-50 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-clay mb-5 text-sm font-semibold" style={{ boxShadow: '3px 3px 0 0 #BBF7D0' }}>
          {toast}
        </div>
      )}
      {error && (
        <div role="alert" className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-clay mb-5 text-sm font-semibold" style={{ boxShadow: '3px 3px 0 0 #FECACA' }}>
          {error}
        </div>
      )}

      {/* DASHBOARD VIEW */}
      {view === 'dashboard' && (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard icon={Layers} label="Total Cards" value={stats.stats.total_cards} color="primary" />
              <StatCard icon={Target} label="Due Today" value={stats.stats.due_cards} color="accent" alert={stats.stats.due_cards > 0} />
              <StatCard icon={CheckCircle} label="Mastered" value={stats.stats.mastered_cards} color="green" />
              <StatCard icon={TrendingUp} label="Avg Accuracy" value={`${(stats.stats.avg_accuracy * 100).toFixed(0)}%`} color="purple" />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-purple-100 dark:bg-purple-900/40 p-3 rounded-clay"><Sparkles size={24} className="text-purple-600 dark:text-purple-400" /></div>
                <div>
                  <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100">Generate Cards</h2>
                  <p className="text-sm text-primary-500 dark:text-primary-400">Create flashcards from your materials</p>
                </div>
              </div>
              <button onClick={() => setView('generate')} className="clay-btn-primary w-full flex items-center justify-center gap-2">
                <Plus size={18} /> Generate Flashcards
              </button>
            </div>

            <div className={`clay-card p-6 animate-slide-up ${stats?.stats.due_cards > 0 ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''}`} style={{ animationDelay: '200ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-primary-100 dark:bg-primary-800 p-3 rounded-clay"><BookOpen size={24} className="text-primary-600 dark:text-primary-400" /></div>
                <div>
                  <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100">Study Session</h2>
                  <p className="text-sm text-primary-500 dark:text-primary-400">
                    {stats?.stats.due_cards > 0 ? `${stats.stats.due_cards} cards due for review` : 'Review cards due for practice'}
                  </p>
                </div>
              </div>
              <button onClick={startStudySession} className="clay-btn-primary w-full flex items-center justify-center gap-2">
                <RotateCcw size={18} /> Start Review ({stats?.stats.due_cards || 0} due)
              </button>
            </div>
          </div>

          {stats?.recentPerformance?.length > 0 && (
            <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '300ms' }}>
              <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
                <BarChart3 size={20} className="text-primary-500" /> Recent Performance
              </h2>
              <div className="space-y-3">
                {stats.recentPerformance.map((card, i) => {
                  const total = card.times_correct + card.times_incorrect;
                  const accuracy = total > 0 ? Math.round(card.times_correct / total * 100) : 0;
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 bg-primary-50/50 dark:bg-primary-800/50 rounded-clay border border-primary-200 dark:border-primary-700">
                      <div className={`w-10 h-10 rounded-clay flex items-center justify-center flex-shrink-0 ${
                        accuracy >= 80 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                        accuracy >= 50 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                        'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        <span className="text-xs font-bold">{accuracy}%</span>
                      </div>
                      <p className="text-sm font-semibold text-primary-800 dark:text-primary-200 truncate flex-1">{card.front}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-600 dark:text-green-400 font-bold">{card.times_correct}✓</span>
                        <span className="text-red-500 dark:text-red-400 font-bold">{card.times_incorrect}✗</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* GENERATE VIEW */}
      {view === 'generate' && (
        <div className="max-w-2xl mx-auto">
          <button onClick={() => setView('dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-primary-500 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors mb-6">
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <div className="clay-card p-6 md:p-8 animate-slide-up">
            <h2 className="font-display font-bold text-xl text-primary-900 dark:text-primary-100 mb-6 flex items-center gap-2">
              <Sparkles size={22} className="text-purple-500" /> Generate Flashcards
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Select Material</label>
                <select value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)} className="clay-input">
                  <option value="">Choose a material...</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Number of Cards</label>
                  <input type="number" min="5" max="30" value={cardCount} onChange={(e) => setCardCount(parseInt(e.target.value) || 10)} className="clay-input" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Difficulty (Optional)</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="clay-input">
                    <option value="">Mixed</option>
                    <option value="1">Easy (1)</option>
                    <option value="2">Medium-Easy (2)</option>
                    <option value="3">Medium (3)</option>
                    <option value="4">Medium-Hard (4)</option>
                    <option value="5">Hard (5)</option>
                  </select>
                </div>
              </div>
              <button onClick={handleGenerate} disabled={generating || !selectedMaterial} className="clay-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                {generating ? <Loader2 size={18} className="animate-spin" /> : <Brain size={18} />}
                {generating ? 'Generating Flashcards...' : 'Generate Flashcards'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STUDY VIEW — Focused experience */}
      {view === 'study' && studyCards.length > 0 && (
        <div className="max-w-2xl mx-auto">
          {!studyComplete ? (
            <>
              {/* Compact progress bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm font-semibold text-primary-500 dark:text-primary-400 mb-2">
                  <span className="flex items-center gap-1.5">
                    <span className="text-primary-800 dark:text-primary-200">{currentCardIndex + 1}</span>
                    <span className="text-primary-400">/</span>
                    <span>{studyCards.length}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle size={13} /> {sessionResults.correct}</span>
                    <span className="flex items-center gap-1 text-red-500 dark:text-red-400"><XCircle size={13} /> {sessionResults.incorrect}</span>
                  </div>
                </div>
                <div className="w-full bg-primary-100 dark:bg-primary-800 rounded-full h-2 border border-primary-200 dark:border-primary-700">
                  <div className="bg-primary-500 dark:bg-primary-400 h-2 rounded-full transition-all duration-500" style={{ width: `${((currentCardIndex + 1) / studyCards.length) * 100}%` }} />
                </div>
              </div>

              {/* Flashcard — Clean, centered */}
              <div
                className="relative bg-white dark:bg-primary-900 rounded-clay-xl p-8 md:p-12 min-h-[320px] flex flex-col items-center justify-center cursor-pointer select-none border-2 border-primary-200 dark:border-primary-700 transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-600"
                onClick={() => { if (!answered) { setIsFlipped(true); setAnswered(true); } }}
                style={{ boxShadow: dark ? '6px 6px 0 0 #312E81' : '6px 6px 0 0 #C7D2FE' }}
              >
                {/* Card type badge */}
                {studyCards[currentCardIndex].card_type && (
                  <span className="absolute top-4 left-4 text-xs font-bold text-primary-400 dark:text-primary-500 uppercase tracking-wider">{studyCards[currentCardIndex].card_type}</span>
                )}

                {!isFlipped ? (
                  <>
                    <p className="text-xs text-primary-400 dark:text-primary-500 font-bold uppercase tracking-widest mb-6">Question</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-primary-900 dark:text-primary-100 text-center leading-relaxed max-w-lg">
                      {studyCards[currentCardIndex].front}
                    </p>
                    <div className="mt-8 flex items-center gap-2 text-sm text-primary-400 dark:text-primary-500">
                      <Eye size={16} /> Click or press Space to reveal
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase tracking-widest mb-6">Answer</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-primary-900 dark:text-primary-100 text-center leading-relaxed max-w-lg">
                      {studyCards[currentCardIndex].back}
                    </p>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              {answered && (
                <div className="flex gap-4 mt-6 animate-fade-in">
                  <button onClick={() => handleReview(false)} className="clay-btn flex-1 flex items-center justify-center gap-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-2 border-red-200 dark:border-red-800 py-3 text-base" style={{ boxShadow: '4px 4px 0 0 #FECACA' }}>
                    <XCircle size={20} /> Incorrect <span className="text-xs opacity-60 ml-1">←</span>
                  </button>
                  <button onClick={() => handleReview(true)} className="clay-btn flex-1 flex items-center justify-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-2 border-green-200 dark:border-green-800 py-3 text-base" style={{ boxShadow: '4px 4px 0 0 #BBF7D0' }}>
                    <CheckCircle size={20} /> Correct <span className="text-xs opacity-60 ml-1">→</span>
                  </button>
                </div>
              )}

              <button onClick={() => setView('dashboard')} className="mt-4 w-full clay-btn-outline text-sm py-2">
                Exit Session
              </button>
            </>
          ) : (
            /* Study Complete */
            <div className="clay-card p-8 text-center animate-slide-up">
              <div className="bg-green-100 dark:bg-green-900/30 w-20 h-20 rounded-clay-xl mx-auto mb-6 flex items-center justify-center">
                <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="font-display font-bold text-2xl text-primary-900 dark:text-primary-100 mb-2">Session Complete!</h2>
              <p className="text-primary-500 dark:text-primary-400 mb-6">You reviewed {studyCards.length} cards</p>

              <div className="flex justify-center gap-8 mb-8">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{sessionResults.correct}</p>
                  <p className="text-sm text-primary-500 dark:text-primary-400">Correct</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-500 dark:text-red-400">{sessionResults.incorrect}</p>
                  <p className="text-sm text-primary-500 dark:text-primary-400">Incorrect</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                    {((sessionResults.correct / studyCards.length) * 100).toFixed(0)}%
                  </p>
                  <p className="text-sm text-primary-500 dark:text-primary-400">Accuracy</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={startStudySession} className="clay-btn-primary flex-1 flex items-center justify-center gap-2">
                  <RotateCcw size={18} /> Study Again
                </button>
                <button onClick={() => { setView('dashboard'); loadData(); }} className="clay-btn-outline flex-1">
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, alert }) {
  const colors = {
    primary: { bg: 'bg-primary-100 dark:bg-primary-800', text: 'text-primary-600 dark:text-primary-400' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400' },
    green: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-600 dark:text-green-400' },
    accent: { bg: 'bg-accent-100 dark:bg-accent-900/40', text: 'text-accent-600 dark:text-accent-400' },
  };
  const c = colors[color] || colors.primary;

  return (
    <div className={`clay-card p-5 animate-slide-up relative ${alert ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''}`}>
      {alert && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse" />}
      <div className={`inline-flex p-2.5 rounded-clay ${c.bg} ${c.text} mb-3 border-2 border-current/10`} style={{ boxShadow: '3px 3px 0 0 var(--clay-card-shadow)' }}>
        <Icon size={20} />
      </div>
      <p className="text-3xl font-display font-bold text-primary-900 dark:text-primary-100" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="text-sm text-primary-500 dark:text-primary-400 font-semibold mt-0.5">{label}</p>
    </div>
  );
}
