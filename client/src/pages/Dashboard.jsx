import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../utils/auth';
import { BarChart3, AlertTriangle, BookOpen, TrendingUp, ArrowRight, Sparkles } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState([]);
  const [misconceptions, setMisconceptions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [p, m, mat] = await Promise.all([
          api.getProfile(),
          api.getMisconceptions(),
          api.getMaterials(),
        ]);
        setProfile(p);
        setMisconceptions(m);
        setMaterials(mat);
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
    ? (profile.reduce((sum, p) => sum + p.mastery_level, 0) / profile.length * 100).toFixed(0)
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-primary-900 dark:text-primary-100">
          Welcome back, <span className="text-primary-500 dark:text-primary-400">{user.name}</span>
        </h1>
        <p className="text-primary-500 dark:text-primary-400 mt-1 font-body">Here's your learning progress overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={BookOpen} label="Materials" value={materials.length} color="primary" delay={0} />
        <StatCard icon={BarChart3} label="Concepts" value={profile.length} color="purple" delay={80} />
        <StatCard icon={TrendingUp} label="Avg Mastery" value={`${avgMastery}%`} color="green" delay={160} />
        <StatCard icon={AlertTriangle} label="Misconceptions" value={misconceptions.length} color="accent" delay={240} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Knowledge Profile */}
        <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
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
            <div className="space-y-4">
              {profile.map((p) => {
                const pct = (p.mastery_level * 100).toFixed(0);
                const color = p.mastery_level >= 0.7 ? 'bg-green-500' : p.mastery_level >= 0.4 ? 'bg-amber-400' : 'bg-red-400';
                const bgColor = p.mastery_level >= 0.7 ? 'bg-green-100 dark:bg-green-900/40' : p.mastery_level >= 0.4 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-red-100 dark:bg-red-900/40';
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-bold text-primary-800 dark:text-primary-200">{p.concept_name}</span>
                      <span className="text-primary-500 dark:text-primary-400 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                    </div>
                    <div className={`w-full ${bgColor} rounded-full h-3 border border-primary-200/50 dark:border-primary-700/50`} role="progressbar" aria-valuenow={Math.round(p.mastery_level * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.concept_name} mastery`}>
                      <div
                        className={`${color} h-3 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Misconceptions */}
        <div className="clay-card p-6 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100">Recent Misconceptions</h2>
            <div className="bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400 p-2 rounded-clay-sm">
              <AlertTriangle size={18} />
            </div>
          </div>
          {misconceptions.length === 0 ? (
            <div className="text-center py-10">
              <div className="bg-green-50 dark:bg-green-900/30 w-16 h-16 rounded-clay-lg mx-auto mb-4 flex items-center justify-center">
                <Sparkles size={28} className="text-green-400 dark:text-green-500" />
              </div>
              <p className="text-primary-400 dark:text-primary-500 font-semibold">No misconceptions yet</p>
              <p className="text-primary-300 dark:text-primary-600 text-sm mt-1">Keep learning - you're doing great!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {misconceptions.slice(0, 10).map((m) => (
                <div
                  key={m.id}
                  className="border-l-4 border-accent-400 dark:border-accent-500 pl-4 py-3 bg-accent-50/50 dark:bg-accent-900/20 rounded-r-clay"
                >
                  <p className="text-sm font-bold text-primary-800 dark:text-primary-200">{m.concept_name}</p>
                  <p className="text-sm text-primary-600 dark:text-primary-400 mt-1 leading-relaxed">{m.misconception}</p>
                  <p className="text-xs text-primary-400 dark:text-primary-500 mt-1.5 font-semibold">
                    {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(m.created_at))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, delay }) {
  const colors = {
    primary: { bg: 'bg-primary-100 dark:bg-primary-800', text: 'text-primary-600 dark:text-primary-400' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400' },
    green: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-600 dark:text-green-400' },
    accent: { bg: 'bg-accent-100 dark:bg-accent-900/40', text: 'text-accent-600 dark:text-accent-400' },
  };
  const c = colors[color] || colors.primary;

  return (
    <div className="clay-card p-5 animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className={`inline-flex p-2.5 rounded-clay ${c.bg} ${c.text} mb-3 border-2 border-current/10`}
        style={{ boxShadow: '3px 3px 0 0 var(--clay-card-shadow)' }}>
        <Icon size={20} />
      </div>
      <p className="text-3xl font-display font-bold text-primary-900 dark:text-primary-100" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="text-sm text-primary-500 dark:text-primary-400 font-semibold mt-0.5">{label}</p>
    </div>
  );
}
