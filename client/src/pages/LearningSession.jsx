import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { BookOpen, Brain, Loader2, ChevronRight, ArrowLeft, Sparkles, Target, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react';

export default function LearningSession() {
  const { materialId } = useParams();
  const navigate = useNavigate();
  const [material, setMaterial] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState('');
  const [learningProfile, setLearningProfile] = useState([]);
  const [misconceptions, setMisconceptions] = useState([]);
  const [learningContext, setLearningContext] = useState(null);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => {
    loadMaterial();
  }, [materialId]);

  async function loadMaterial() {
    try {
      const data = await api.getMaterial(materialId);
      setMaterial(data);
      const materialConcepts = data.concepts || [];
      setConcepts(materialConcepts);

      // Fetch learning twin context for this material's concepts
      fetchLearningContext(materialConcepts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLearningContext(materialConcepts) {
    try {
      // Fetch knowledge profile and misconceptions in parallel
      const [profileData, misconceptionsData, contextData] = await Promise.allSettled([
        api.getProfile(),
        api.getMisconceptions(),
        api.getLearningContext(),
      ]);

      // Filter profile to only concepts in this material
      if (profileData.status === 'fulfilled' && materialConcepts.length > 0) {
        const materialConceptIds = materialConcepts.map(c => c.id);
        const relevant = profileData.value.filter(p => materialConceptIds.includes(p.concept_id));
        setLearningProfile(relevant);
      }

      // Filter misconceptions to only concepts in this material
      if (misconceptionsData.status === 'fulfilled' && materialConcepts.length > 0) {
        const materialConceptNames = materialConcepts.map(c => c.name.toLowerCase());
        const relevantMisconceptions = misconceptionsData.value.filter(m =>
          materialConceptNames.includes((m.concept_name || '').toLowerCase())
        );
        setMisconceptions(relevantMisconceptions);
      }

      // Store the full learning context string for display
      if (contextData.status === 'fulfilled' && contextData.value?.context) {
        setLearningContext(contextData.value.context);
      }
    } catch (err) {
      // Graceful failure — learning context is supplementary
      console.warn('Could not load learning context:', err.message);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await api.analyzeMaterial(parseInt(materialId));
      await loadMaterial();
    } catch (err) {
      showToast(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary-200 dark:border-primary-700 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="clay-card p-10 animate-slide-up">
          <BookOpen size={48} className="text-primary-300 dark:text-primary-600 mx-auto mb-4" />
          <p className="text-primary-500 dark:text-primary-400 font-semibold mb-4">Material not found.</p>
          <Link to="/materials" className="clay-btn-primary text-sm py-2 px-4 inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            Back to Materials
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {toast && (
        <div role="status" aria-live="polite" className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-clay mb-5 text-sm font-semibold"
          style={{ boxShadow: '3px 3px 0 0 #FECACA' }}>
          {toast}
        </div>
      )}
      {/* Back link */}
      <Link
        to="/materials"
        className="inline-flex items-center gap-1 text-sm font-bold text-primary-500 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Back to Materials
      </Link>

      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-900 dark:text-primary-100">
          {material.title}
        </h1>
        <p className="text-primary-500 dark:text-primary-400 mt-1 font-body">Learning Session</p>
      </div>

      {/* Material Content */}
      <div className="clay-card p-6 md:p-8 mb-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-4 flex items-center gap-2">
          <div className="bg-primary-100 dark:bg-primary-800 p-2 rounded-clay-sm">
            <BookOpen size={18} className="text-primary-600 dark:text-primary-400" />
          </div>
          Content
        </h2>
        <div className="bg-primary-50/50 dark:bg-primary-800/50 border border-primary-200 dark:border-primary-700 rounded-clay p-5 text-primary-800 dark:text-primary-200 whitespace-pre-wrap text-sm leading-relaxed max-h-72 overflow-y-auto font-body">
          {material.content}
        </div>
      </div>

      {/* Learning Profile — Learning Twin context for this material */}
      {(learningProfile.length > 0 || misconceptions.length > 0) && (
        <div className="clay-card p-6 md:p-8 mb-8 animate-slide-up" style={{ animationDelay: '150ms' }}>
          <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-5 flex items-center gap-2">
            <div className="bg-emerald-100 dark:bg-emerald-900/40 p-2 rounded-clay-sm">
              <BarChart3 size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            Your Learning State
            <span className="text-xs font-semibold text-primary-400 dark:text-primary-500 ml-auto">powered by Learning Twin</span>
          </h2>

          {/* Mastery per concept */}
          {learningProfile.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold text-primary-600 dark:text-primary-400 mb-3 flex items-center gap-1.5">
                <Target size={14} />
                Concept Mastery
              </h3>
              <div className="space-y-3">
                {learningProfile.map((p) => {
                  const pct = Math.round((p.mastery_level || 0) * 100);
                  const color = pct >= 70 ? 'bg-green-500 dark:bg-green-400' : pct >= 40 ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-red-400 dark:bg-red-500';
                  const label = pct >= 70 ? 'Strong' : pct >= 40 ? 'Developing' : 'Needs Focus';
                  const labelColor = pct >= 70 ? 'text-green-600 dark:text-green-400' : pct >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400';
                  return (
                    <div key={p.concept_id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-primary-800 dark:text-primary-200">{p.concept_name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${labelColor}`}>{label}</span>
                          <span className="text-xs font-bold text-primary-500 dark:text-primary-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-primary-100 dark:bg-primary-800 rounded-full h-2.5 border border-primary-200 dark:border-primary-700">
                        <div
                          className={`${color} h-2.5 rounded-full transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {p.misconceptions && (
                        <p className="text-xs text-red-400 dark:text-red-500 mt-1 font-semibold">⚠ Has recorded misconception</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active misconceptions for this material */}
          {misconceptions.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-primary-600 dark:text-primary-400 mb-3 flex items-center gap-1.5">
                <AlertTriangle size={14} />
                Active Misconceptions ({misconceptions.length})
              </h3>
              <div className="space-y-2">
                {misconceptions.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="bg-red-50/60 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-clay p-3"
                  >
                    <p className="text-sm font-bold text-red-700 dark:text-red-400">{m.concept_name}</p>
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1 leading-relaxed">{m.misconception}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Adaptive tutoring note */}
          {learningContext && (
            <div className="mt-4 bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-clay p-3">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                <TrendingUp size={12} />
                The AI tutor is adapting to your learning profile for this material.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Concepts */}
      <div className="clay-card p-6 md:p-8 animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 flex items-center gap-2">
            <div className="bg-purple-100 dark:bg-purple-900/40 p-2 rounded-clay-sm">
              <Brain size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            Extracted Concepts
          </h2>
          {concepts.length === 0 && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="clay-btn bg-purple-600 dark:bg-purple-400 text-white dark:text-purple-950 border-2 border-purple-500 dark:border-purple-600 text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50"
              style={{ boxShadow: '3px 3px 0 0 #581C87' }}
            >
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              {analyzing ? 'Analyzing...' : 'AI Analyze'}
            </button>
          )}
        </div>

        {concepts.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-purple-50 dark:bg-purple-900/30 w-16 h-16 rounded-clay-lg mx-auto mb-4 flex items-center justify-center">
              <Sparkles size={28} className="text-purple-300 dark:text-purple-500" />
            </div>
            <p className="text-primary-400 dark:text-primary-500 font-semibold">No concepts extracted yet</p>
            <p className="text-primary-300 dark:text-primary-600 text-sm mt-1">Click "AI Analyze" to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {concepts.map((concept) => (
              <div
                key={concept.id}
                className="bg-primary-50/50 dark:bg-primary-800/50 border border-primary-200 dark:border-primary-700 rounded-clay p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors duration-150"
              >
                <div className="flex-1">
                  <p className="font-display font-bold text-primary-900 dark:text-primary-100">{concept.name}</p>
                  <p className="text-sm text-primary-500 dark:text-primary-400 mt-1 leading-relaxed">{concept.description}</p>
                  <div className="flex items-center gap-1.5 mt-3">
                    {[1, 2, 3, 4, 5].map((d) => (
                      <span
                        key={d}
                        className={`w-2.5 h-2.5 rounded-full ${
                          d <= concept.difficulty_level
                            ? 'bg-primary-500 dark:bg-primary-400 border border-primary-400 dark:border-primary-500'
                            : 'bg-primary-200 dark:bg-primary-700 border border-primary-300 dark:border-primary-600'
                        }`}
                      />
                    ))}
                    <span className="text-xs text-primary-400 dark:text-primary-500 font-bold ml-1">difficulty</span>
                  </div>
                </div>
                <Link
                  to={`/assessment/${concept.id}`}
                  className="clay-btn-primary text-sm py-2 px-4 flex items-center gap-1 shrink-0"
                >
                  Test
                  <ChevronRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
