import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { AlertTriangle, CheckCircle, XCircle, ArrowRight, RotateCcw, History, BarChart3, Brain, ChevronRight, Lightbulb, Target, Search } from 'lucide-react';

const CONFIDENCE_COLORS = {
  high: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-700' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-700' },
  low: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700' },
};

const STATUS_STYLES = {
  resolved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircle },
  improving: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: ArrowRight },
  in_progress: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: RotateCcw },
};

export default function WhyEngine() {
  const [activeTab, setActiveTab] = useState('practice');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Practice mode state
  const [questionText, setQuestionText] = useState('');
  const [studentAnswer, setStudentAnswer] = useState('');
  const [topic, setTopic] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [followUpResult, setFollowUpResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // History & stats
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [expandedSession, setExpandedSession] = useState(null);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
    if (activeTab === 'stats') loadStats();
  }, [activeTab]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getWhyEngineHistory(30);
      setHistory(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await api.getWhyEngineStats();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!questionText.trim() || !studentAnswer.trim()) {
      setError('Please enter both the question and your answer');
      return;
    }

    try {
      setIsAnalyzing(true);
      setError('');
      setAnalysis(null);
      setFollowUpResult(null);
      setFollowUpAnswer('');

      const data = await api.freeFormAnalysis({
        questionText: questionText.trim(),
        studentAnswer: studentAnswer.trim(),
        topic: topic.trim() || undefined,
      });

      setAnalysis(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUpAnswer.trim() || !analysis) return;

    try {
      setLoading(true);
      setError('');

      const data = await api.resolveFollowUp({
        sessionId: analysis.sessionId,
        followUpAnswer: followUpAnswer.trim(),
      });

      setFollowUpResult(data);

      if (!data.isCorrect && data.nextFollowUp) {
        // Reset for another follow-up
        setAnalysis(prev => ({
          ...prev,
          explanation: data.nextFollowUp.explanation,
          followUpQuestion: data.nextFollowUp.followUpQuestion,
          followUpOptions: data.nextFollowUp.followUpOptions,
          followUpCorrectAnswer: data.nextFollowUp.followUpCorrectAnswer,
        }));
        setFollowUpAnswer('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPractice = () => {
    setQuestionText('');
    setStudentAnswer('');
    setTopic('');
    setAnalysis(null);
    setFollowUpAnswer('');
    setFollowUpResult(null);
    setError('');
  };

  const loadSession = async (sessionId) => {
    try {
      const data = await api.getWhyEngineSession(sessionId);
      setExpandedSession(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const confidenceStyle = (c) => CONFIDENCE_COLORS[c] || CONFIDENCE_COLORS.medium;
  const statusStyle = (s) => STATUS_STYLES[s] || STATUS_STYLES.in_progress;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-clay">
            <Search size={24} className="text-red-600 dark:text-red-400" />
          </div>
          <h1 className="font-display text-3xl font-bold text-primary-900 dark:text-primary-100">
            Why Engine
          </h1>
        </div>
        <p className="text-primary-600 dark:text-primary-400 ml-12">
          Goes beyond "wrong answer" — identifies <em>why</em> you made a mistake and helps you fix it.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b-2 border-primary-200 dark:border-primary-700 pb-2">
        {[
          { id: 'practice', label: 'Practice', icon: Target },
          { id: 'history', label: 'History', icon: History },
          { id: 'stats', label: 'Stats', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-clay font-semibold text-sm transition-colors duration-150 ${
              activeTab === tab.id
                ? 'bg-primary-500 text-white shadow-clay'
                : 'text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-800'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-clay text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ==================== PRACTICE TAB ==================== */}
      {activeTab === 'practice' && (
        <div className="space-y-6">
          {/* Input Section */}
          {!analysis && (
            <div className="bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700 p-6 shadow-clay">
              <h2 className="font-display text-xl font-bold text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
                <Lightbulb size={20} className="text-yellow-500" />
                Analyze a Wrong Answer
              </h2>
              <p className="text-sm text-primary-500 dark:text-primary-400 mb-4">
                Enter a question you got wrong, and your incorrect answer. The Why Engine will identify the misconception.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">
                    Question
                  </label>
                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="e.g., What is the purpose of a base case in recursion?"
                    className="w-full px-4 py-3 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-900 dark:text-primary-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-700 outline-none resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">
                    Your (Wrong) Answer
                  </label>
                  <textarea
                    value={studentAnswer}
                    onChange={(e) => setStudentAnswer(e.target.value)}
                    placeholder="e.g., It causes the function to call itself again."
                    className="w-full px-4 py-3 rounded-clay border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 text-primary-900 dark:text-primary-100 focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-700 outline-none resize-none"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">
                    Topic <span className="text-primary-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Recursion, SQL JOINs, Variables"
                    className="w-full px-4 py-2 rounded-clay border-2 border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-900 dark:text-primary-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-700 outline-none"
                  />
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !questionText.trim() || !studentAnswer.trim()}
                  className="clay-btn-primary flex items-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      Analyze My Mistake
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Analysis Result */}
          {analysis && (
            <div className="space-y-4">
              {/* Confidence Badge */}
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-clay border-2 ${confidenceStyle(analysis.confidence).bg} ${confidenceStyle(analysis.confidence).text} ${confidenceStyle(analysis.confidence).border} font-semibold text-sm`}>
                <Brain size={16} />
                Confidence: {analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1)}
                {analysis.confidence === 'low' && ' — Reasoning not provided'}
              </div>

              {/* Misconception */}
              <div className="bg-white dark:bg-primary-900 rounded-clay border-2 border-red-200 dark:border-red-800 p-5 shadow-clay">
                <h3 className="font-display text-lg font-bold text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                  <AlertTriangle size={18} />
                  Misconception Identified
                </h3>
                <p className="text-primary-800 dark:text-primary-200 font-medium">{analysis.misconception}</p>
                {analysis.reasoningAnalysis && (
                  <p className="text-sm text-primary-500 dark:text-primary-400 mt-2 italic">
                    Reasoning analysis: {analysis.reasoningAnalysis}
                  </p>
                )}
              </div>

              {/* Explanation */}
              <div className="bg-white dark:bg-primary-900 rounded-clay border-2 border-green-200 dark:border-green-800 p-5 shadow-clay">
                <h3 className="font-display text-lg font-bold text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
                  <Lightbulb size={18} />
                  Targeted Explanation
                </h3>
                <p className="text-primary-800 dark:text-primary-200 whitespace-pre-line">{analysis.explanation}</p>
              </div>

              {/* Follow-up Question */}
              {!followUpResult?.isCorrect && analysis.followUpQuestion && (
                <div className="bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700 p-5 shadow-clay">
                  <h3 className="font-display text-lg font-bold text-primary-700 dark:text-primary-300 mb-2 flex items-center gap-2">
                    <Target size={18} />
                    Follow-up Question
                  </h3>
                  <p className="text-primary-800 dark:text-primary-200 font-medium mb-4">{analysis.followUpQuestion}</p>
                  
                  {analysis.followUpOptions && (
                    <div className="space-y-2 mb-4">
                      {analysis.followUpOptions.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => setFollowUpAnswer(opt)}
                          className={`w-full text-left px-4 py-3 rounded-clay border-2 font-medium transition-all duration-150 ${
                            followUpAnswer === opt
                              ? 'border-primary-500 bg-primary-100 dark:bg-primary-800 text-primary-900 dark:text-primary-100'
                              : 'border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-800 text-primary-700 dark:text-primary-300 hover:border-primary-400 dark:hover:border-primary-600'
                          }`}
                        >
                          <span className="font-bold text-primary-400 dark:text-primary-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleFollowUp}
                    disabled={!followUpAnswer.trim() || loading}
                    className="clay-btn-primary flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <ArrowRight size={16} />
                        Submit Answer
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Follow-up Result */}
              {followUpResult && (
                <div className={`rounded-clay border-2 p-5 shadow-clay ${
                  followUpResult.isCorrect
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {followUpResult.isCorrect ? (
                      <>
                        <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
                        <span className="font-bold text-green-700 dark:text-green-300">Correct!</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={20} className="text-red-600 dark:text-red-400" />
                        <span className="font-bold text-red-700 dark:text-red-300">Still incorrect</span>
                      </>
                    )}
                  </div>
                  <p className="text-primary-700 dark:text-primary-300 text-sm">{followUpResult.responseMessage}</p>
                  
                  <div className={`inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-clay text-xs font-semibold ${statusStyle(followUpResult.resolutionStatus).bg} ${statusStyle(followUpResult.resolutionStatus).text}`}>
                    Status: {followUpResult.resolutionStatus}
                  </div>
                </div>
              )}

              {/* Reset button */}
              <button
                onClick={resetPractice}
                className="clay-btn-outline flex items-center gap-2 text-sm"
              >
                <RotateCcw size={14} />
                Try Another Question
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== HISTORY TAB ==================== */}
      {activeTab === 'history' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 dark:border-primary-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700">
              <Search size={48} className="mx-auto text-primary-300 dark:text-primary-600 mb-3" />
              <h3 className="font-display text-lg font-bold text-primary-700 dark:text-primary-300 mb-1">No investigations yet</h3>
              <p className="text-primary-500 dark:text-primary-400 text-sm">Switch to Practice mode to analyze your first wrong answer.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(session => {
                const st = statusStyle(session.resolution_status);
                const StatusIcon = st.icon;
                return (
                  <div key={session.id} className="bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700 shadow-clay overflow-hidden">
                    <button
                      onClick={() => expandedSession?.id === session.id ? setExpandedSession(null) : loadSession(session.id)}
                      className="w-full text-left p-4 flex items-center gap-3 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors"
                    >
                      <StatusIcon size={18} className={st.text} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-primary-900 dark:text-primary-100 truncate">{session.topic}</div>
                        <div className="text-sm text-primary-500 dark:text-primary-400 truncate">{session.identified_misconception}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${confidenceStyle(session.confidence).bg} ${confidenceStyle(session.confidence).text}`}>
                          {session.confidence}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${st.bg} ${st.text}`}>
                          {session.resolution_status}
                        </span>
                        <ChevronRight size={16} className={`text-primary-400 transition-transform ${expandedSession?.id === session.id ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    {expandedSession?.id === session.id && (
                      <div className="border-t-2 border-primary-200 dark:border-primary-700 p-4 bg-primary-50 dark:bg-primary-800/50 space-y-3">
                        <div>
                          <span className="text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase">Original Question</span>
                          <p className="text-primary-800 dark:text-primary-200 text-sm mt-1">{expandedSession.original_question}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-xs font-semibold text-red-500 dark:text-red-400 uppercase">Your Answer</span>
                            <p className="text-primary-800 dark:text-primary-200 text-sm mt-1">{expandedSession.student_answer}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-green-500 dark:text-green-400 uppercase">Correct Answer</span>
                            <p className="text-primary-800 dark:text-primary-200 text-sm mt-1">{expandedSession.correct_answer}</p>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase">Explanation</span>
                          <p className="text-primary-800 dark:text-primary-200 text-sm mt-1">{expandedSession.explanation}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-primary-500 dark:text-primary-400">
                          <span>Steps: {expandedSession.steps_count}</span>
                          <span>•</span>
                          <span>{new Date(expandedSession.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== STATS TAB ==================== */}
      {activeTab === 'stats' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-200 dark:border-primary-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin" />
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Overall Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Investigations', value: stats.overall.total_investigations, color: 'text-primary-700 dark:text-primary-300' },
                  { label: 'Resolved', value: stats.overall.resolved, color: 'text-green-600 dark:text-green-400' },
                  { label: 'In Progress', value: stats.overall.in_progress, color: 'text-yellow-600 dark:text-yellow-400' },
                  { label: 'Avg Steps', value: typeof stats.overall.avg_steps === 'number' ? stats.overall.avg_steps.toFixed(1) : '0', color: 'text-blue-600 dark:text-blue-400' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700 p-4 shadow-clay text-center">
                    <div className={`font-display text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs font-semibold text-primary-500 dark:text-primary-400 uppercase mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Resolution Rate */}
              {stats.overall.total_investigations > 0 && (
                <div className="bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700 p-5 shadow-clay">
                  <h3 className="font-display text-lg font-bold text-primary-900 dark:text-primary-100 mb-3">Resolution Rate</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-6 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((stats.overall.resolved / stats.overall.total_investigations) * 100)}%` }}
                      />
                    </div>
                    <span className="font-bold text-primary-700 dark:text-primary-300">
                      {Math.round((stats.overall.resolved / stats.overall.total_investigations) * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-primary-500 dark:text-primary-400 mt-2">
                    {stats.overall.resolved} of {stats.overall.total_investigations} misconceptions resolved
                  </p>
                </div>
              )}

              {/* By Topic */}
              {stats.byTopic.length > 0 && (
                <div className="bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700 p-5 shadow-clay">
                  <h3 className="font-display text-lg font-bold text-primary-900 dark:text-primary-100 mb-3">By Topic</h3>
                  <div className="space-y-3">
                    {stats.byTopic.map((topic, i) => {
                      const resolutionRate = topic.investigations > 0 ? Math.round((topic.resolved / topic.investigations) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-sm text-primary-800 dark:text-primary-200">{topic.topic}</span>
                              <span className="text-xs text-primary-500 dark:text-primary-400">
                                {topic.investigations} investigations • {resolutionRate}% resolved
                              </span>
                            </div>
                            <div className="h-3 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full"
                                style={{ width: `${resolutionRate}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {stats.overall.total_investigations === 0 && (
                <div className="text-center py-12 bg-white dark:bg-primary-900 rounded-clay border-2 border-primary-200 dark:border-primary-700">
                  <BarChart3 size={48} className="mx-auto text-primary-300 dark:text-primary-600 mb-3" />
                  <h3 className="font-display text-lg font-bold text-primary-700 dark:text-primary-300 mb-1">No data yet</h3>
                  <p className="text-primary-500 dark:text-primary-400 text-sm">Complete some investigations in Practice mode to see stats.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
