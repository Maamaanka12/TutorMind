import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../utils/auth';
import { useTheme } from '../utils/ThemeContext';
import {
  Brain, Target, TrendingUp, AlertTriangle, CheckCircle2, Lightbulb,
  Layers, BookOpen, BarChart3, Zap, ArrowRight, RefreshCw, Loader2,
  ChevronRight, Activity, Eye, Sparkles, Clock, XCircle, User,
  Flame, Shield, Award, AlertCircle
} from 'lucide-react';

export default function LearningTwin() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [patternError, setPatternError] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.getLearningTwin();
      setData(result);
    } catch (err) {
      console.error('Failed to load learning twin:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDetectPatterns = async () => {
    setDetecting(true);
    setPatternError('');
    try {
      await api.detectPatterns();
      await loadData();
    } catch (err) {
      setPatternError(err.aiError ? err.message : 'Pattern detection failed. Please try again later.');
    } finally {
      setDetecting(false);
    }
  };

  const handleResolveMisconception = async (id) => {
    try {
      await api.resolveMisconception(id);
      await loadData();
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary-200 dark:border-primary-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <Brain size={48} className="mx-auto text-primary-300 dark:text-primary-600 mb-4" />
        <h2 className="font-display font-bold text-xl text-primary-900 dark:text-primary-100 mb-2">No Learning Data Yet</h2>
        <p className="text-primary-500 dark:text-primary-400">Start studying to build your Learning Twin!</p>
      </div>
    );
  }

  const masteryColor = (pct) => {
    if (pct >= 80) return 'text-green-600 dark:text-green-400';
    if (pct >= 60) return 'text-blue-600 dark:text-blue-400';
    if (pct >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const masteryBarColor = (pct) => {
    if (pct >= 80) return 'bg-green-500';
    if (pct >= 60) return 'bg-blue-500';
    if (pct >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const masteryBg = (pct) => {
    if (pct >= 80) return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700';
    if (pct >= 60) return 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700';
    if (pct >= 40) return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700';
    return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700';
  };

  const masteryLabel = (pct) => {
    if (pct >= 80) return 'Mastered';
    if (pct >= 60) return 'Proficient';
    if (pct >= 40) return 'Developing';
    return 'Needs Work';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Student Identity Card — This IS the Learning Twin */}
      <div className="rounded-clay-xl p-6 md:p-8 border-2 border-primary-200 dark:border-primary-700 mb-8 bg-gradient-to-br from-primary-50 via-white to-purple-50 dark:from-primary-900 dark:via-primary-900 dark:to-purple-900/30" style={{ boxShadow: dark ? '6px 6px 0 0 #312E81' : '6px 6px 0 0 #C7D2FE' }}>
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className="relative">
            <div className="w-20 h-20 rounded-clay-xl bg-gradient-to-br from-purple-500 to-primary-600 flex items-center justify-center text-white text-3xl font-display font-bold shadow-lg">
              {user?.name?.charAt(0)?.toUpperCase() || 'S'}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white dark:border-primary-900 flex items-center justify-center ${
              data.overallMastery >= 70 ? 'bg-green-500' : data.overallMastery >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            }`}>
              {data.overallMastery >= 70 ? <CheckCircle2 size={12} className="text-white" /> : <AlertCircle size={12} className="text-white" />}
            </div>
          </div>

          {/* Student Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-bold text-primary-900 dark:text-primary-100 mb-1">
              {user?.name || 'Student'}'s Learning Twin
            </h1>
            <p className="text-sm text-primary-500 dark:text-primary-400 mb-3">
              Digital model of your learning state — continuously updated from your study activity
            </p>

            {/* Mastery Ring */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-primary-200 dark:text-primary-700" />
                  <circle cx="32" cy="32" r="28" fill="none" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${data.overallMastery * 1.76} 176`}
                    className={data.overallMastery >= 70 ? 'stroke-green-500' : data.overallMastery >= 40 ? 'stroke-yellow-500' : 'stroke-red-500'}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-sm font-display font-bold ${masteryColor(data.overallMastery)}`}>{data.overallMastery}%</span>
                </div>
              </div>
              <div className="flex gap-5">
                <StatBadge icon={Award} label="Strong" count={data.strongTopics.length} color="green" />
                <StatBadge icon={Target} label="Review" count={data.reviewTopics.length} color="yellow" />
                <StatBadge icon={AlertTriangle} label="Weak" count={data.weakTopics.length} color="red" />
                <StatBadge icon={Shield} label="Misconceptions" count={data.misconceptions.length} color="orange" />
              </div>
            </div>
          </div>

          {/* Detect Patterns Button */}
          <button
            onClick={handleDetectPatterns}
            disabled={detecting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 text-primary-600 dark:text-primary-400 font-semibold hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors text-sm disabled:opacity-50 self-start"
          >
            {detecting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Detect Patterns
          </button>
        </div>
      </div>

      {patternError && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-clay text-red-700 dark:text-red-300 text-sm font-semibold flex items-start gap-3">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1"><p>{patternError}</p></div>
          <button onClick={() => setPatternError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'misconceptions', label: 'Misconceptions', icon: AlertTriangle, badge: data.misconceptions.length },
          { id: 'patterns', label: 'Patterns', icon: Activity },
          { id: 'loop', label: 'Learning Loop', icon: Zap },
          { id: 'actions', label: 'Actions', icon: Target },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-clay font-semibold text-sm whitespace-nowrap transition-all duration-150 ${
              activeTab === tab.id
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-primary-900 border-2 border-primary-200 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-800'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
            {tab.badge > 0 && (
              <span className={`ml-1 text-xs rounded-full w-5 h-5 flex items-center justify-center ${activeTab === tab.id ? 'bg-white/20' : 'bg-red-500 text-white'}`}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat icon={Layers} label="Flashcards" value={data.flashcardStats.total} sub={`${data.flashcardStats.mastered} mastered`} color="primary" />
            <MiniStat icon={Target} label="Card Accuracy" value={`${data.flashcardStats.accuracy}%`} sub={`${data.flashcardStats.due} due`} color="green" />
            <MiniStat icon={BookOpen} label="Exams Taken" value={data.examStats.total} sub={`Avg: ${data.examStats.avgScore}%`} color="purple" />
            <MiniStat icon={TrendingUp} label="Best Score" value={`${data.examStats.bestScore}%`} sub={data.examStats.lastExam ? 'Has exams' : 'No exams yet'} color="blue" />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Topic Mastery */}
            <div className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
              <h3 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
                <BarChart3 size={18} className="text-primary-500" /> Topic Mastery
              </h3>
              {data.topicMastery.length === 0 ? (
                <p className="text-primary-400 dark:text-primary-500 text-sm text-center py-6">No topics tracked yet</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {data.topicMastery.map((topic, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold text-primary-800 dark:text-primary-200 truncate max-w-[200px]">{topic.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${masteryColor(topic.mastery)}`}>{masteryLabel(topic.mastery)}</span>
                          <span className={`font-bold ${masteryColor(topic.mastery)}`}>{topic.mastery}%</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-primary-200 dark:bg-primary-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${masteryBarColor(topic.mastery)}`} style={{ width: `${topic.mastery}%` }} />
                      </div>
                      {topic.hasMisconception && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 flex items-center gap-1">
                          <AlertTriangle size={10} /> Has recorded misconception
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
              <h3 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
                <Clock size={18} className="text-primary-500" /> Recent Activity
              </h3>
              {data.recentActivity.length === 0 ? (
                <p className="text-primary-400 dark:text-primary-500 text-sm text-center py-6">No activity yet</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {data.recentActivity.map((activity, i) => (
                    <div key={i} className={`flex items-start gap-2 p-2 rounded-clay-sm ${activity.is_correct ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                      {activity.is_correct ? (
                        <CheckCircle2 size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-primary-700 dark:text-primary-300 truncate">{activity.concept_name}</p>
                        <p className="text-xs text-primary-400 dark:text-primary-500 truncate">{activity.question_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Misconceptions Tab */}
      {activeTab === 'misconceptions' && (
        <div className="space-y-4">
          {data.misconceptions.length === 0 ? (
            <div className="bg-white dark:bg-primary-900 rounded-clay p-8 border-2 border-primary-200 dark:border-primary-700 text-center">
              <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
              <h3 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-1">No Active Misconceptions</h3>
              <p className="text-primary-500 dark:text-primary-400 text-sm">Great job! No misconceptions have been recorded.</p>
            </div>
          ) : (
            data.misconceptions.map((m, i) => (
              <div key={m.id || i} className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700 border-l-4 border-l-yellow-400">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        m.severity === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                        m.severity === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                        'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      }`}>
                        {m.severity}
                      </span>
                      <span className="text-xs text-primary-400 dark:text-primary-500">{m.occurrences}x detected</span>
                    </div>
                    <h4 className="font-semibold text-primary-800 dark:text-primary-200 mb-1">{m.topic}</h4>
                    <p className="text-sm text-primary-600 dark:text-primary-400 leading-relaxed">{m.misconception}</p>
                  </div>
                  <button
                    onClick={() => handleResolveMisconception(m.id)}
                    className="ml-3 px-3 py-1.5 rounded-clay text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center gap-1 flex-shrink-0"
                  >
                    <CheckCircle2 size={12} /> Resolve
                  </button>
                </div>
              </div>
            ))
          )}
          {data.resolvedMisconceptions.length > 0 && (
            <div className="mt-6">
              <h3 className="font-display font-bold text-primary-700 dark:text-primary-300 text-sm mb-3">Resolved ({data.resolvedMisconceptions.length})</h3>
              {data.resolvedMisconceptions.slice(0, 5).map((m, i) => (
                <div key={m.id || i} className="bg-primary-50 dark:bg-primary-800/50 rounded-clay p-3 mb-2 opacity-60">
                  <p className="text-xs font-semibold text-primary-600 dark:text-primary-400">{m.topic}</p>
                  <p className="text-xs text-primary-400 dark:text-primary-500 line-through">{m.misconception}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Patterns Tab */}
      {activeTab === 'patterns' && (
        <div className="space-y-4">
          {data.patterns.length === 0 ? (
            <div className="bg-white dark:bg-primary-900 rounded-clay p-8 border-2 border-primary-200 dark:border-primary-700 text-center">
              <Activity size={40} className="mx-auto text-primary-300 dark:text-primary-600 mb-3" />
              <h3 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-1">No Patterns Detected</h3>
              <p className="text-primary-500 dark:text-primary-400 text-sm mb-4">Study more and then click "Detect Patterns" to analyze your learning behavior.</p>
              <button onClick={handleDetectPatterns} disabled={detecting} className="px-4 py-2 rounded-clay bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50">
                {detecting ? 'Analyzing...' : 'Detect Patterns Now'}
              </button>
            </div>
          ) : (
            data.patterns.map((p, i) => (
              <div key={p.id || i} className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-clay flex-shrink-0 ${
                    p.pattern_type === 'performance' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                    p.pattern_type === 'error_pattern' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                    p.pattern_type === 'difficulty' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                    'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>
                    <Eye size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-400">{p.pattern_type}</span>
                      <span className="text-xs text-primary-400">{Math.round(p.confidence * 100)}% confidence</span>
                    </div>
                    <p className="text-sm text-primary-800 dark:text-primary-200 leading-relaxed">{p.pattern_text}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Learning Loop Tab */}
      {activeTab === 'loop' && (
        <LearningLoopTab user={user} navigate={navigate} />
      )}

      {/* Actions Tab */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          {data.recommendations.length === 0 ? (
            <div className="bg-white dark:bg-primary-900 rounded-clay p-8 border-2 border-primary-200 dark:border-primary-700 text-center">
              <Sparkles size={40} className="mx-auto text-green-500 mb-3" />
              <h3 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-1">All Caught Up!</h3>
              <p className="text-primary-500 dark:text-primary-400 text-sm">No urgent recommendations right now. Keep up the good work!</p>
            </div>
          ) : (
            data.recommendations.map((rec, i) => (
              <div key={i} className={`bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700 border-l-4 ${
                rec.priority === 'high' ? 'border-l-red-400' : rec.priority === 'medium' ? 'border-l-yellow-400' : 'border-l-green-400'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-clay flex-shrink-0 ${
                    rec.icon === 'alert' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                    rec.icon === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                    rec.icon === 'cards' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                    rec.icon === 'exam' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                    'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  }`}>
                    {rec.icon === 'alert' ? <AlertTriangle size={16} /> :
                     rec.icon === 'cards' ? <Layers size={16} /> :
                     rec.icon === 'exam' ? <BookOpen size={16} /> :
                     rec.icon === 'trending' ? <TrendingUp size={16} /> :
                     <Lightbulb size={16} />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-primary-800 dark:text-primary-200">{rec.text}</h4>
                    <p className="text-sm text-primary-500 dark:text-primary-400 mt-0.5">{rec.detail}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    rec.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {rec.priority}
                  </span>
                </div>
              </div>
            ))
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <button onClick={() => navigate('/flashcards')} className="p-4 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-white dark:bg-primary-900 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors text-left">
              <Layers size={20} className="text-primary-500 mb-2" />
              <p className="font-semibold text-primary-800 dark:text-primary-200 text-sm">Flashcards</p>
              <p className="text-xs text-primary-400">Practice with spaced repetition</p>
            </button>
            <button onClick={() => navigate('/exam')} className="p-4 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-white dark:bg-primary-900 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors text-left">
              <BookOpen size={20} className="text-purple-500 mb-2" />
              <p className="font-semibold text-primary-800 dark:text-primary-200 text-sm">Exam Mode</p>
              <p className="text-xs text-primary-400">Take a focused assessment</p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({ icon: Icon, label, count, color }) {
  const colors = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  };
  return (
    <div className="text-center">
      <div className={`w-10 h-10 rounded-clay flex items-center justify-center mx-auto mb-1 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <p className="text-lg font-display font-bold text-primary-900 dark:text-primary-100">{count}</p>
      <p className="text-xs text-primary-500 dark:text-primary-400 font-semibold">{label}</p>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub, color }) {
  const colors = {
    primary: 'bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-400',
    green: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
    purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
    blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  };
  return (
    <div className="bg-white dark:bg-primary-900 rounded-clay p-4 border-2 border-primary-200 dark:border-primary-700">
      <div className={`inline-flex p-1.5 rounded-clay ${colors[color]} mb-2`}>
        <Icon size={14} />
      </div>
      <p className="text-xl font-display font-bold text-primary-900 dark:text-primary-100">{value}</p>
      <p className="text-xs text-primary-500 dark:text-primary-400 font-semibold">{label}</p>
      {sub && <p className="text-xs text-primary-400 dark:text-primary-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Learning Loop Tab Component ──────────────────────────
function LearningLoopTab({ user, navigate }) {
  const { dark } = useTheme();
  const [cycleData, setCycleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { loadCycle(); }, []);

  const loadCycle = async () => {
    try {
      const data = await api.getLearningCycle();
      setCycleData(data);
    } catch (err) {
      console.error('Failed to load cycle:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.syncLearningTwin();
      await loadCycle();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" size={24} /></div>;
  }

  if (!cycleData) {
    return (
      <div className="bg-white dark:bg-primary-900 rounded-clay p-8 border-2 border-primary-200 dark:border-primary-700 text-center">
        <Zap size={40} className="mx-auto text-primary-300 dark:text-primary-600 mb-3" />
        <h3 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-1">No Learning Data Yet</h3>
        <p className="text-primary-500 dark:text-primary-400 text-sm">Start studying to activate the learning loop!</p>
      </div>
    );
  }

  const { study, practice, mistakes, understanding, twin, adaptation, loopHealth } = cycleData;

  return (
    <div className="space-y-6">
      {/* Loop Health Overview */}
      <div className="bg-white dark:bg-primary-900 rounded-clay p-6 border-2 border-primary-200 dark:border-primary-700" style={{ boxShadow: dark ? '4px 4px 0 0 #312E81' : '4px 4px 0 0 #C7D2FE' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-primary-900 dark:text-primary-100 flex items-center gap-2">
            <Zap size={20} className="text-primary-500" /> Learning Loop Status
          </h3>
          <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-clay border-2 border-primary-200 dark:border-primary-700 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors disabled:opacity-50">
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync
          </button>
        </div>

        <p className="text-sm text-primary-500 dark:text-primary-400 mb-4">
          Your learning data flows through a continuous loop: Study → Practice → Make Mistakes → Understand Why → Update Twin → Adapt → Improve.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {loopHealth.steps.map((step, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-clay border-2 transition-all ${
              step.done
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-primary-50 dark:bg-primary-800/30 border-primary-200 dark:border-primary-700 opacity-60'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                step.done ? 'bg-green-500 text-white' : 'bg-primary-200 dark:bg-primary-700 text-primary-500'
              }`}>
                {step.done ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary-800 dark:text-primary-200">{step.name}</p>
                <p className="text-xs text-primary-400 dark:text-primary-500 truncate">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-3 bg-primary-200 dark:bg-primary-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary-500 to-green-500 rounded-full transition-all duration-500" style={{ width: `${loopHealth.percentage}%` }} />
          </div>
          <span className="text-sm font-bold text-primary-600 dark:text-primary-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{loopHealth.percentage}%</span>
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700">
          <h4 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
            <BookOpen size={16} className="text-green-500" /> Study Phase
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-primary-500">Materials uploaded</span><span className="font-bold text-primary-800 dark:text-primary-200">{study.materialsUploaded}</span></div>
            <div className="flex justify-between text-sm"><span className="text-primary-500">Flashcards created</span><span className="font-bold text-primary-800 dark:text-primary-200">{study.flashcardsStudied}</span></div>
            <div className="flex justify-between text-sm"><span className="text-primary-500">Cards reviewed</span><span className="font-bold text-primary-800 dark:text-primary-200">{study.flashcardsReviewed}</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700">
          <h4 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
            <Flame size={16} className="text-red-500" /> Practice Phase
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-primary-500">Exams taken</span><span className="font-bold text-primary-800 dark:text-primary-200">{practice.examsTaken}</span></div>
            <div className="flex justify-between text-sm"><span className="text-primary-500">Avg exam score</span><span className="font-bold text-primary-800 dark:text-primary-200">{practice.avgExamScore}%</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700">
          <h4 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-500" /> Mistakes & Understanding
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-primary-500">Active misconceptions</span><span className="font-bold text-red-500 dark:text-red-400">{mistakes.activeMisconceptions}</span></div>
            <div className="flex justify-between text-sm"><span className="text-primary-500">Resolved misconceptions</span><span className="font-bold text-green-500 dark:text-green-400">{mistakes.resolvedMisconceptions}</span></div>
            <div className="flex justify-between text-sm"><span className="text-primary-500">Why Engine sessions</span><span className="font-bold text-primary-800 dark:text-primary-200">{understanding.whyEngineSessions}</span></div>
            <div className="flex justify-between text-sm"><span className="text-primary-500">Sessions resolved</span><span className="font-bold text-green-500 dark:text-green-400">{understanding.resolvedSessions}</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700">
          <h4 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
            <Brain size={16} className="text-purple-500" /> Adaptation
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-primary-500">Overall mastery</span><span className="font-bold text-primary-800 dark:text-primary-200">{twin.overallMastery}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-primary-500">Patterns detected</span><span className="font-bold text-primary-800 dark:text-primary-200">{twin.patternsDetected}</span></div>
            {adaptation.examTrend !== 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-primary-500">Performance trend</span>
                <span className={`font-bold ${adaptation.examTrend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {adaptation.examTrend > 0 ? '+' : ''}{adaptation.examTrend}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exam History Trend */}
      {adaptation.recentExams.length > 1 && (
        <div className="bg-white dark:bg-primary-900 rounded-clay p-5 border-2 border-primary-200 dark:border-primary-700">
          <h4 className="font-display font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" /> Exam Score Trend
          </h4>
          <div className="flex items-end gap-2 h-24">
            {adaptation.recentExams.map((exam, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-primary-600 dark:text-primary-400">{exam.percentage}%</span>
                <div className={`w-full rounded-t transition-all ${
                  exam.percentage >= 70 ? 'bg-green-400' : exam.percentage >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                }`} style={{ height: `${Math.max(exam.percentage * 0.8, 8)}px` }} />
                <span className="text-[10px] text-primary-400">{new Date(exam.date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
