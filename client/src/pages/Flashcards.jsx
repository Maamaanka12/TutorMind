import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { 
  Brain, Loader2, Plus, ChevronRight, ArrowLeft, RotateCcw, 
  CheckCircle, XCircle, BookOpen, Target, TrendingUp, Clock,
  Sparkles, Layers, BarChart3
} from 'lucide-react';

export default function Flashcards() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard, generate, study
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Generate form state
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [cardCount, setCardCount] = useState(10);
  const [difficulty, setDifficulty] = useState('');

  // Study state
  const [studyCards, setStudyCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyComplete, setStudyComplete] = useState(false);
  const [sessionResults, setSessionResults] = useState({ correct: 0, incorrect: 0 });

  useEffect(() => {
    loadData();
  }, []);

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
    if (!selectedMaterial) {
      setError('Please select a material');
      return;
    }

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
      if (cards.length === 0) {
        showToast('No cards due for review!');
        return;
      }
      setStudyCards(cards);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setStudyComplete(false);
      setSessionResults({ correct: 0, incorrect: 0 });
      setView('study');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReview(correct) {
    const card = studyCards[currentCardIndex];
    
    try {
      await api.reviewFlashcard(card.id, correct);
      
      setSessionResults(prev => ({
        correct: prev.correct + (correct ? 1 : 0),
        incorrect: prev.incorrect + (correct ? 0 : 1),
      }));

      if (currentCardIndex < studyCards.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
        setIsFlipped(false);
      } else {
        setStudyComplete(true);
      }
    } catch (err) {
      console.error(err);
    }
  }

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
        <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-900 dark:text-primary-100">
          Flashcards
        </h1>
        <p className="text-primary-500 dark:text-primary-400 mt-1 font-body">
          AI-powered spaced repetition for effective learning
        </p>
      </div>

      {toast && (
        <div role="status" aria-live="polite" className="bg-green-50 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-clay mb-5 text-sm font-semibold"
          style={{ boxShadow: '3px 3px 0 0 #BBF7D0' }}>
          {toast}
        </div>
      )}

      {error && (
        <div role="alert" aria-live="polite" className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-clay mb-5 text-sm font-semibold"
          style={{ boxShadow: '3px 3px 0 0 #FECACA' }}>
          {error}
        </div>
      )}

      {/* View: Dashboard */}
      {view === 'dashboard' && (
        <>
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard icon={Layers} label="Total Cards" value={stats.stats.total_cards} color="primary" />
              <StatCard icon={Target} label="Due Today" value={stats.stats.due_cards} color="accent" />
              <StatCard icon={CheckCircle} label="Mastered" value={stats.stats.mastered_cards} color="green" />
              <StatCard icon={TrendingUp} label="Avg Accuracy" value={`${(stats.stats.avg_accuracy * 100).toFixed(0)}%`} color="purple" />
            </div>
          )}

          {/* Actions */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Generate New Cards */}
            <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-purple-100 dark:bg-purple-900/40 p-3 rounded-clay">
                  <Sparkles size={24} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100">Generate Cards</h2>
                  <p className="text-sm text-primary-500 dark:text-primary-400">Create flashcards from your materials</p>
                </div>
              </div>
              <button
                onClick={() => setView('generate')}
                className="clay-btn-primary w-full flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                Generate Flashcards
              </button>
            </div>

            {/* Study Session */}
            <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-primary-100 dark:bg-primary-800 p-3 rounded-clay">
                  <BookOpen size={24} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100">Study Session</h2>
                  <p className="text-sm text-primary-500 dark:text-primary-400">Review cards due for practice</p>
                </div>
              </div>
              <button
                onClick={startStudySession}
                className="clay-btn-primary w-full flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} />
                Start Review ({stats?.stats.due_cards || 0} due)
              </button>
            </div>
          </div>

          {/* Recent Performance */}
          {stats?.recentPerformance?.length > 0 && (
            <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '300ms' }}>
              <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
                <BarChart3 size={20} className="text-primary-500" />
                Recent Performance
              </h2>
              <div className="space-y-3">
                {stats.recentPerformance.map((card, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-primary-50/50 dark:bg-primary-800/50 rounded-clay border border-primary-200 dark:border-primary-700">
                    <p className="text-sm font-semibold text-primary-800 dark:text-primary-200 truncate flex-1">{card.front}</p>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-green-600 dark:text-green-400">{card.times_correct}✓</span>
                      <span className="text-red-500 dark:text-red-400">{card.times_incorrect}✗</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* View: Generate */}
      {view === 'generate' && (
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setView('dashboard')}
            className="inline-flex items-center gap-1 text-sm font-bold text-primary-500 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors mb-6"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>

          <div className="clay-card p-6 md:p-8 animate-slide-up">
            <h2 className="font-display font-bold text-xl text-primary-900 dark:text-primary-100 mb-6 flex items-center gap-2">
              <Sparkles size={22} className="text-purple-500" />
              Generate Flashcards
            </h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">
                  Select Material
                </label>
                <select
                  value={selectedMaterial}
                  onChange={(e) => setSelectedMaterial(e.target.value)}
                  className="clay-input"
                >
                  <option value="">Choose a material...</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">
                    Number of Cards
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="30"
                    value={cardCount}
                    onChange={(e) => setCardCount(parseInt(e.target.value) || 10)}
                    className="clay-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">
                    Difficulty (Optional)
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="clay-input"
                  >
                    <option value="">Mixed</option>
                    <option value="1">Easy (1)</option>
                    <option value="2">Medium-Easy (2)</option>
                    <option value="3">Medium (3)</option>
                    <option value="4">Medium-Hard (4)</option>
                    <option value="5">Hard (5)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !selectedMaterial}
                className="clay-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {generating ? <Loader2 size={18} className="animate-spin" /> : <Brain size={18} />}
                {generating ? 'Generating Flashcards...' : 'Generate Flashcards'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View: Study */}
      {view === 'study' && studyCards.length > 0 && (
        <div className="max-w-2xl mx-auto">
          {!studyComplete ? (
            <>
              {/* Progress */}
              <div className="mb-6">
                <div className="flex justify-between text-sm font-semibold text-primary-500 dark:text-primary-400 mb-2">
                  <span>Card {currentCardIndex + 1} of {studyCards.length}</span>
                  <span>{sessionResults.correct} correct • {sessionResults.incorrect} incorrect</span>
                </div>
                <div className="w-full bg-primary-100 dark:bg-primary-800 rounded-full h-3 border border-primary-200 dark:border-primary-700">
                  <div
                    className="bg-primary-500 dark:bg-primary-400 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${((currentCardIndex + 1) / studyCards.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Flashcard */}
              <div 
                className="clay-card p-8 md:p-12 min-h-[300px] flex flex-col items-center justify-center cursor-pointer select-none animate-slide-up"
                onClick={() => setIsFlipped(!isFlipped)}
                style={{ animationDelay: '100ms' }}
              >
                {!isFlipped ? (
                  <>
                    <p className="text-sm text-primary-400 dark:text-primary-500 font-semibold mb-4">QUESTION</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-primary-900 dark:text-primary-100 text-center leading-relaxed">
                      {studyCards[currentCardIndex].front}
                    </p>
                    <p className="text-sm text-primary-400 dark:text-primary-500 mt-6">Click to reveal answer</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-green-600 dark:text-green-400 font-semibold mb-4">ANSWER</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-primary-900 dark:text-primary-100 text-center leading-relaxed">
                      {studyCards[currentCardIndex].back}
                    </p>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              {isFlipped && (
                <div className="flex gap-4 mt-6 animate-fade-in">
                  <button
                    onClick={() => handleReview(false)}
                    className="clay-btn flex-1 flex items-center justify-center gap-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-2 border-red-200 dark:border-red-800"
                    style={{ boxShadow: '4px 4px 0 0 #FECACA' }}
                  >
                    <XCircle size={20} />
                    Incorrect
                  </button>
                  <button
                    onClick={() => handleReview(true)}
                    className="clay-btn flex-1 flex items-center justify-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-2 border-green-200 dark:border-green-800"
                    style={{ boxShadow: '4px 4px 0 0 #BBF7D0' }}
                  >
                    <CheckCircle size={20} />
                    Correct
                  </button>
                </div>
              )}

              {/* Exit Button */}
              <button
                onClick={() => setView('dashboard')}
                className="mt-4 w-full clay-btn-outline text-sm py-2"
              >
                Exit Session
              </button>
            </>
          ) : (
            /* Study Complete */
            <div className="clay-card p-8 text-center animate-slide-up">
              <div className="bg-green-100 dark:bg-green-900/30 w-20 h-20 rounded-clay-xl mx-auto mb-6 flex items-center justify-center">
                <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="font-display font-bold text-2xl text-primary-900 dark:text-primary-100 mb-2">
                Session Complete!
              </h2>
              <p className="text-primary-500 dark:text-primary-400 mb-6">
                You reviewed {studyCards.length} cards
              </p>
              
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
                <button
                  onClick={startStudySession}
                  className="clay-btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={18} />
                  Study Again
                </button>
                <button
                  onClick={() => { setView('dashboard'); loadData(); }}
                  className="clay-btn-outline flex-1"
                >
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

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    primary: { bg: 'bg-primary-100 dark:bg-primary-800', text: 'text-primary-600 dark:text-primary-400' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400' },
    green: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-600 dark:text-green-400' },
    accent: { bg: 'bg-accent-100 dark:bg-accent-900/40', text: 'text-accent-600 dark:text-accent-400' },
  };
  const c = colors[color] || colors.primary;

  return (
    <div className="clay-card p-5 animate-slide-up">
      <div className={`inline-flex p-2.5 rounded-clay ${c.bg} ${c.text} mb-3 border-2 border-current/10`}
        style={{ boxShadow: '3px 3px 0 0 var(--clay-card-shadow)' }}>
        <Icon size={20} />
      </div>
      <p className="text-3xl font-display font-bold text-primary-900 dark:text-primary-100" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="text-sm text-primary-500 dark:text-primary-400 font-semibold mt-0.5">{label}</p>
    </div>
  );
}
