import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../utils/auth';
import { useTheme } from '../utils/ThemeContext';
import {
  BarChart3, AlertTriangle, BookOpen, TrendingUp, ArrowRight, Sparkles,
  Layers, Clock, Target, Brain, Flame, CheckCircle2, ChevronRight, Zap
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const [profile, setProfile] = useState([]);
  const [misconceptions, setMisconceptions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [flashcardStats, setFlashcardStats] = useState(null);
  const [examHistory, setExamHistory] = useState([]);
  const [twinData, setTwinData] = useState(null);
  const [cycleData, setCycleData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [p, m, mat, fc, exams, twin, cycle] = await Promise.allSettled([
          api.getProfile(),
          api.getMisconceptions(),
          api.getMaterials(),
          api.getFlashcardStats(),
          api.getExamHistory(),
          api.getLearningTwin(),
          api.getLearningCycle(),
        ]);
        if (p.status === 'fulfilled') setProfile(p.value);
        if (m.status === 'fulfilled') setMisconceptions(m.value);
        if (mat.status === 'fulfilled') setMaterials(mat.value);
        if (fc.status === 'fulfilled') setFlashcardStats(fc.value);
        if (exams.status === 'fulfilled') setExamHistory(exams.value.filter(e => e.status === 'completed'));
        if (twin.status === 'fulfilled') setTwinData(twin.value);
        if (cycle.status === 'fulfilled') setCycleData(cycle.value);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary-200 dark:border-primary-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin" />
      </div>
    );
  }

  const avgMastery = profile.length > 0
    ? Math.round(profile.reduce((sum, p) => sum + p.mastery_level, 0) / profile.length * 100)
    : 0;

  const weakTopics = profile.filter(p => p.mastery_level < 0.5);
  const dueCards = flashcardStats?.stats?.due_cards || 0;
  const masteredCards = flashcardStats?.stats?.mastered_cards || 0;
  const recentExam = examHistory[0];
  const avgExamScore = examHistory.length > 0
    ? Math.round(examHistory.reduce((s, e) => s + e.percentage, 0) / examHistory.length)
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-900 dark:text-primary-100">
          Welcome back, <span className="text-primary-500 dark:text-primary-400">{user.name}</span>
        </h1>
        <p className="text-primary-500 dark:text-primary-400 mt-1 font-body">Here's your learning progress overview</p>
      </div>

      {/* Mastery Overview — Hero Card */}
      <div className={`rounded-clay p-6 border-2 mb-8 ${
        avgMastery >= 70 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
        avgMastery >= 40 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
        'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`} style={{ boxShadow: dark ? '4px 4px 0 0 #1E1B4B' : '4px 4px 0 0 #C7D2FE' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-clay-xl flex items-center justify-center text-2xl font-display font-bold ${
              avgMastery >= 70 ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' :
              avgMastery >= 40 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400' :
              'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
            }`}>
              {avgMastery}%
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">Overall Mastery</p>
              <p className="text-primary-800 dark:text-primary-200 font-bold">
                {profile.length} concept{profile.length !== 1 ? 's' : ''} tracked
              </p>
              {weakTopics.length > 0 && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 flex items-center gap-1">
                  <AlertTriangle size={10} /> {weakTopics.length} topic{weakTopics.length !== 1 ? 's' : ''} need attention
                </p>
              )}
            </div>
          </div>
          <Link
            to="/learning-twin"
            className="flex items-center gap-1.5 px-4 py-2 rounded-clay border-2 border-primary-200 dark:border-primary-700 text-primary-600 dark:text-primary-400 font-semibold text-sm hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors"
          >
            <Brain size={14} />
            View Learning Twin
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* ─── LEARNING LOOP: Study → Practice → Mistakes → Understand → Adapt ─── */}
      {cycleData && cycleData.loopHealth && (
        <div className="clay-card p-6 border-2 border-primary-200 dark:border-primary-700 mb-8 animate-slide-up" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 flex items-center gap-2">
              <Zap size={18} className="text-primary-500" /> Learning Loop
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-400">
                {cycleData.loopHealth.percentage}% complete
              </span>
            </h2>
            <button
              onClick={async () => { try { await api.syncLearningTwin(); loadData(); } catch(e) { console.error(e); } }}
              className="text-xs font-semibold text-primary-500 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 flex items-center gap-1"
            >
              <RefreshCw size={12} /> Sync
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cycleData.loopHealth.steps.map((step, i) => (
              <div key={i} className={`text-center p-3 rounded-clay border-2 transition-all ${
                step.done
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-primary-50 dark:bg-primary-800/30 border-primary-200 dark:border-primary-700 opacity-70'
              }`}>
                <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-sm font-bold ${
                  step.done ? 'bg-green-500 text-white' : 'bg-primary-200 dark:bg-primary-700 text-primary-500 dark:text-primary-400'
                }`}>
                  {i + 1}
                </div>
                <p className="text-xs font-bold text-primary-800 dark:text-primary-200 mb-0.5">{step.name}</p>
                <p className="text-[10px] text-primary-400 dark:text-primary-500 leading-tight">{step.detail}</p>
              </div>
            ))}
          </div>
          {cycleData.adaptation.examTrend !== 0 && (
            <div className={`mt-4 flex items-center gap-2 text-sm font-semibold ${cycleData.adaptation.examTrend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              <TrendingUp size={14} className={cycleData.adaptation.examTrend < 0 ? 'rotate-180' : ''} />
              Exam performance trend: {cycleData.adaptation.examTrend > 0 ? '+' : ''}{cycleData.adaptation.examTrend}%
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <QuickAction
          to="/flashcards"
          icon={Layers}
          label="Flashcards"
          detail={dueCards > 0 ? `${dueCards} due` : 'All caught up'}
          color="purple"
          alert={dueCards > 0}
        />
        <QuickAction
          to="/exam"
          icon={Flame}
          label="Take Exam"
          detail={avgExamScore !== null ? `Last: ${avgExamScore}%` : 'No exams yet'}
          color="red"
        />
        <QuickAction
          to="/learning-twin"
          icon={Brain}
          label="Learning Twin"
          detail={twinData?.weakTopics?.length > 0 ? `${twinData.weakTopics.length} weak areas` : 'Looking good'}
          color="blue"
          alert={twinData?.weakTopics?.length > 0}
        />
        <QuickAction
          to="/materials"
          icon={BookOpen}
          label="Materials"
          detail={`${materials.length} uploaded`}
          color="green"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Weak Topics — Priority Card */}
        <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 flex items-center gap-2">
              <Target size={18} className="text-red-500" /> Needs Focus
            </h2>
          </div>
          {weakTopics.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 size={28} className="mx-auto text-green-400 mb-2" />
              <p className="text-sm text-primary-400 dark:text-primary-500 font-semibold">No weak topics!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weakTopics.slice(0, 5).map((p) => {
                const pct = Math.round(p.mastery_level * 100);
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-primary-800 dark:text-primary-200 truncate">{p.concept_name}</span>
                      <span className="text-red-500 dark:text-red-400 font-bold">{pct}%</span>
                    </div>
                    <div className="w-full bg-red-100 dark:bg-red-900/30 rounded-full h-2 border border-red-200/50 dark:border-red-800/50">
                      <div className="bg-red-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Exam Performance */}
        <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 flex items-center gap-2">
              <Flame size={18} className="text-orange-500" /> Exam Performance
            </h2>
          </div>
          {recentExam ? (
            <div className="space-y-3">
              <div className="text-center py-3">
                <div className={`text-4xl font-display font-bold ${
                  recentExam.percentage >= 80 ? 'text-green-600 dark:text-green-400' :
                  recentExam.percentage >= 60 ? 'text-blue-600 dark:text-blue-400' :
                  recentExam.percentage >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-red-600 dark:text-red-400'
                }`}>
                  {recentExam.percentage}%
                </div>
                <p className="text-xs text-primary-400 dark:text-primary-500 font-semibold mt-1">Latest Score</p>
              </div>
              <div className="flex justify-between text-xs text-primary-500 dark:text-primary-400">
                <span>{recentExam.title}</span>
                <span>{recentExam.score}/{recentExam.total_questions}</span>
              </div>
              {examHistory.length > 1 && (
                <div className="pt-2 border-t border-primary-100 dark:border-primary-800">
                  <div className="flex items-center gap-1 text-xs text-primary-400">
                    <TrendingUp size={12} />
                    {examHistory.length} exams taken · Avg: {avgExamScore}%
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <Flame size={28} className="mx-auto text-primary-300 dark:text-primary-600 mb-2" />
              <p className="text-sm text-primary-400 dark:text-primary-500 font-semibold mb-2">No exams yet</p>
              <Link to="/exam" className="text-xs text-primary-500 dark:text-primary-400 font-semibold hover:underline">Take your first exam →</Link>
            </div>
          )}
        </div>

        {/* Flashcard Stats */}
        <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 flex items-center gap-2">
              <Layers size={18} className="text-purple-500" /> Flashcards
            </h2>
          </div>
          {flashcardStats?.stats?.total_cards > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 bg-primary-50 dark:bg-primary-800/50 rounded-clay">
                  <p className="text-xl font-display font-bold text-primary-900 dark:text-primary-100">{flashcardStats.stats.total_cards}</p>
                  <p className="text-xs text-primary-400 font-semibold">Total</p>
                </div>
                <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-clay">
                  <p className="text-xl font-display font-bold text-green-600 dark:text-green-400">{masteredCards}</p>
                  <p className="text-xs text-primary-400 font-semibold">Mastered</p>
                </div>
              </div>
              {dueCards > 0 && (
                <div className="text-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded-clay border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                    <Clock size={14} /> {dueCards} cards due for review
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-xs text-primary-400">Accuracy: <span className="font-bold text-primary-600 dark:text-primary-400">{Math.round((flashcardStats.stats.avg_accuracy || 0) * 100)}%</span></p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Layers size={28} className="mx-auto text-primary-300 dark:text-primary-600 mb-2" />
              <p className="text-sm text-primary-400 dark:text-primary-500 font-semibold mb-2">No flashcards yet</p>
              <Link to="/flashcards" className="text-xs text-primary-500 dark:text-primary-400 font-semibold hover:underline">Generate your first set →</Link>
            </div>
          )}
        </div>
      </div>

      {/* Knowledge Profile — Full Width */}
      <div className="clay-card p-6 animate-slide-up mb-8" style={{ animationDelay: '400ms' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100">Knowledge Profile</h2>
          <div className="bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-400 p-2 rounded-clay-sm">
            <BarChart3 size={18} />
          </div>
        </div>
        {profile.length === 0 ? (
          <div className="text-center py-10">
            <div className="bg-primary-50 dark:bg-primary-800 w-16 h-16 rounded-clay-lg mx-auto mb-4 flex items-center justify-center">
              <BookOpen size={28} className="text-primary-300 dark:text-primary-600" />
            </div>
            <p className="text-primary-400 dark:text-primary-500 font-semibold mb-3">No concepts tracked yet</p>
            <Link to="/materials" className="clay-btn-primary text-sm py-2 px-4 inline-flex items-center gap-1">
              Upload your first material
              <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
            {profile.map((p) => {
              const pct = Math.round(p.mastery_level * 100);
              const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
              const bgColor = pct >= 70 ? 'bg-green-100 dark:bg-green-900/40' : pct >= 40 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-red-100 dark:bg-red-900/40';
              return (
                <div key={p.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-bold text-primary-800 dark:text-primary-200">{p.concept_name}</span>
                    <div className="flex items-center gap-2">
                      {p.misconceptions && (
                        <span className="text-red-400 dark:text-red-500" title="Has misconception">
                          <AlertTriangle size={12} />
                        </span>
                      )}
                      <span className="text-primary-500 dark:text-primary-400 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                    </div>
                  </div>
                  <div className={`w-full ${bgColor} rounded-full h-2.5 border border-primary-200/50 dark:border-primary-700/50`}>
                    <div className={`${color} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Misconceptions */}
      {misconceptions.length > 0 && (
        <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '500ms' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              Recent Misconceptions
              <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs px-2 py-0.5 rounded-full font-bold">{misconceptions.length}</span>
            </h2>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
            {misconceptions.slice(0, 8).map((m) => (
              <div key={m.id} className="border-l-4 border-accent-400 dark:border-accent-500 pl-4 py-3 bg-accent-50/50 dark:bg-accent-900/20 rounded-r-clay">
                <p className="text-sm font-bold text-primary-800 dark:text-primary-200">{m.concept_name}</p>
                <p className="text-sm text-primary-600 dark:text-primary-400 mt-1 leading-relaxed">{m.misconception}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAction({ to, icon: Icon, label, detail, color, alert }) {
  const colorMap = {
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
  };

  return (
    <Link
      to={to}
      className={`clay-card p-4 group hover:translate-y-[-2px] transition-all duration-150 relative ${alert ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''}`}
    >
      {alert && (
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
      )}
      <div className={`inline-flex p-2 rounded-clay ${colorMap[color]} mb-3 border`}>
        <Icon size={18} />
      </div>
      <p className="font-display font-bold text-sm text-primary-900 dark:text-primary-100">{label}</p>
      <p className="text-xs text-primary-400 dark:text-primary-500 mt-0.5">{detail}</p>
    </Link>
  );
}
