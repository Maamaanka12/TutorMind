import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/auth';
import { useTheme } from '../utils/ThemeContext';
import { BookOpen, LogOut, User, Sparkles, Menu, X, Sun, Moon } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { dark, toggleDark } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on Escape key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && mobileOpen) {
      setMobileOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMobileOpen(false);
  };

  return (
    <nav className="bg-white dark:bg-primary-900 border-b-2 border-primary-200 dark:border-primary-700 sticky top-0 z-50" onKeyDown={handleKeyDown} style={{ boxShadow: dark ? '0 4px 0 0 #312E81' : '0 4px 0 0 #C7D2FE' }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="bg-primary-500 text-white p-2 rounded-clay group-hover:rotate-3 transition-transform duration-200" style={{ boxShadow: dark ? '3px 3px 0 0 #1E1B4B' : '3px 3px 0 0 #A5B4FC' }}>
            <BookOpen size={20} strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-xl text-primary-900 dark:text-primary-100">AdaptLearn</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="px-4 py-2 rounded-clay font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors duration-150"
              >
                Dashboard
              </Link>
              <Link
                to="/materials"
                className="px-4 py-2 rounded-clay font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors duration-150"
              >
                Materials
              </Link>
              <div className="flex items-center gap-2 px-3 py-2 bg-primary-100 dark:bg-primary-800 rounded-clay text-sm font-semibold text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700">
                <div className="bg-primary-200 dark:bg-primary-700 p-1 rounded-full">
                  <User size={14} />
                </div>
                {user.name}
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-clay text-primary-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="clay-btn-outline text-sm py-2 px-4">
                Sign In
              </Link>
              <Link to="/register" className="clay-btn-primary text-sm py-2 px-4 flex items-center gap-1">
                <Sparkles size={14} />
                Get Started
              </Link>
            </>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleDark}
            className="p-2 rounded-clay text-primary-500 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors duration-150 border border-primary-200 dark:border-primary-700"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={toggleDark}
            className="p-2 rounded-clay text-primary-500 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors border border-primary-200 dark:border-primary-700"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-clay hover:bg-primary-50 dark:hover:bg-primary-800 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t-2 border-primary-200 dark:border-primary-700 bg-white dark:bg-primary-900 px-4 py-4 space-y-3 animate-fade-in" data-testid="mobile-menu">
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-primary-100 dark:bg-primary-800 rounded-clay text-sm font-semibold text-primary-700 dark:text-primary-300">
                <User size={14} />
                {user.name}
              </div>
              <Link
                to="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2 rounded-clay font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-800"
              >
                Dashboard
              </Link>
              <Link
                to="/materials"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2 rounded-clay font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-800"
              >
                Materials
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 rounded-clay font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMobileOpen(false)} className="block clay-btn-outline text-center">
                Sign In
              </Link>
              <Link to="/register" onClick={() => setMobileOpen(false)} className="block clay-btn-primary text-center">
                Get Started
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
