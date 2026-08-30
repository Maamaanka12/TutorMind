import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { BookOpen, Brain, Loader2, ChevronRight, ArrowLeft, Sparkles } from 'lucide-react';

export default function LearningSession() {
  const { materialId } = useParams();
  const navigate = useNavigate();
  const [material, setMaterial] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState('');

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
      setConcepts(data.concepts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
