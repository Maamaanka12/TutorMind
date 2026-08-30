import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../utils/auth';
import { UserPlus, Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
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
          <div className="bg-accent-500 dark:bg-accent-400 text-white dark:text-accent-700 p-3 rounded-clay" style={{ boxShadow: '3px 3px 0 0 #9A3412' }}>
            <UserPlus size={22} />
          </div>
        </div>
        <h1 className="text-2xl font-display font-bold text-center mb-1 text-primary-900 dark:text-primary-100">Create Your Account</h1>
        <p className="text-primary-500 dark:text-primary-400 text-center text-sm mb-8">Start learning smarter today</p>

        {error && (
          <div role="alert" aria-live="polite" className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-clay mb-6 text-sm font-semibold flex items-center gap-2"
            style={{ boxShadow: '3px 3px 0 0 #FECACA' }}>
            <span className="text-lg">!</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="register-name" className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Your Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-300 dark:text-primary-600" size={18} />
              <input
                id="register-name"
                name="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="clay-input pl-10"
                autoComplete="name"
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="register-email" className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-300 dark:text-primary-600" size={18} />
              <input
                id="register-email"
                name="email"
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
            <label htmlFor="register-password" className="block text-sm font-bold text-primary-700 dark:text-primary-300 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-300 dark:text-primary-600" size={18} />
              <input
                id="register-password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="clay-input pl-10"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="clay-btn-accent w-full flex items-center justify-center gap-2 py-3.5 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles size={18} />
                Create Account
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="clay-divider my-6" />

        <p className="text-center text-sm text-primary-500 dark:text-primary-400">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 dark:text-primary-300 font-bold hover:text-primary-700 dark:hover:text-primary-200 transition-colors underline decoration-primary-200 dark:decoration-primary-700 underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
