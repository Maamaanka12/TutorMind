import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../utils/auth';
import { LogIn, Mail, Lock, ArrowRight } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="clay-card p-8 md:p-10 w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="bg-primary-500 dark:bg-primary-400 text-white dark:text-primary-950 p-3 rounded-clay" style={{ boxShadow: '3px 3px 0 0 #312E81' }}>
            <LogIn size={22} />
          </div>
        </div>
        <h1 className="text-2xl font-display font-bold text-center mb-1 text-primary-900 dark:text-primary-100">Welcome Back</h1>
        <p className="text-primary-500 dark:text-primary-400 text-center text-sm mb-8">Sign in to continue your learning</p>

        {error && (
          <div role="alert" aria-live="polite" className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-clay mb-6 text-sm font-semibold flex items-center gap-2"
            style={{ boxShadow: '3px 3px 0 0 #FECACA' }}>
            <span className="text-lg">⚠️</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-300 dark:text-primary-600" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="clay-input pl-10"
                autoComplete="email"
                spellCheck={false}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-300 dark:text-primary-600" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="clay-input pl-10"
                autoComplete="current-password"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="clay-btn-primary w-full flex items-center justify-center gap-2 py-3.5 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Sign In
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="clay-divider my-6" />

        <p className="text-center text-sm text-primary-500 dark:text-primary-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary-600 dark:text-primary-300 font-bold hover:text-primary-700 dark:hover:text-primary-200 transition-colors underline decoration-primary-200 dark:decoration-primary-700 underline-offset-2">
            Sign up for free
          </Link>
        </p>
      </div>
    </div>
  );
}
