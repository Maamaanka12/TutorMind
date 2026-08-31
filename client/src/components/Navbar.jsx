import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/auth';
import { useTheme } from '../utils/ThemeContext';
import { BookOpen, LogOut, User, Sparkles, Menu, X, Sun, Moon, Layers, Flame, Brain, Search, LayoutDashboard, GraduationCap } from 'lucide-react';
import { useState } from 'react';

const navGroups = [
  {
    label: 'Learn',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/materials', label: 'Materials', icon: BookOpen },
      { to: '/flashcards', label: 'Flashcards', icon: Layers },
    ],
  },
  {
    label: 'Assess',
    items: [
      { to: '/exam', label: 'Exam Mode', icon: Flame },
    ],
  },
  {
    label: 'Profile',
    items: [
      { to: '/learning-twin', label: 'Learning Twin', icon: Brain },
      { to: '/why-engine', label: 'Why Engine', icon: Search },
    ],
  },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { dark, toggleDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMobileOpen(false);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-white dark:bg-primary-900 border-b-2 border-primary-200 dark:border-primary-700 sticky top-0 z-50" onKeyDown={handleKeyDown} style={{ boxShadow: dark ? '0 4px 0 0 #312E81' : '0 4px 0 0 #C7D2FE' }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="bg-primary-500 text-white p-2 rounded-clay group-hover:rotate-3 transition-transform duration-200" style={{ boxShadow: dark ? '3px 3px 0 0 #1E1B4B' : '3px 3px 0 0 #A5B4FC' }}>
            <GraduationCap size={20} strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-xl text-primary-900 dark:text-primary-100">TutorMind</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {user ? (
            <>
              {navGroups.map((group) => (
                <div key={group.label} className="flex items-center">
                  <div className="flex items-center gap-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item.to);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={`relative px-3 py-2 rounded-clay font-semibold text-sm transition-all duration-150 flex items-center gap-1.5 ${
                            active
                              ? 'bg-primary-500 text-white shadow-sm'
                              : 'text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-800'
                          }`}
                        >
                          <item.icon size={15} />
                          {item.label}
                          {active && (
                            <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary-500 rounded-full" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                  <div className="w-px h-5 bg-primary-200 dark:bg-primary-700 mx-2" />
                </div>
              ))}

              <div className="flex items-center gap-2 ml-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-100 dark:bg-primary-800 rounded-clay text-xs font-semibold text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700">
                  <div className="bg-primary-200 dark:bg-primary-700 p-0.5 rounded-full">
                    <User size={12} />
                  </div>
                  {user.name}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-clay text-primary-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150"
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </div>
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

          <button
            onClick={toggleDark}
            className="p-2 rounded-clay text-primary-500 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors duration-150 border border-primary-200 dark:border-primary-700 ml-1"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
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
        <div className="md:hidden border-t-2 border-primary-200 dark:border-primary-700 bg-white dark:bg-primary-900 px-4 py-4 space-y-1 animate-fade-in" data-testid="mobile-menu">
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-primary-100 dark:bg-primary-800 rounded-clay text-sm font-semibold text-primary-700 dark:text-primary-300">
                <User size={14} />
                {user.name}
              </div>
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-bold text-primary-400 dark:text-primary-500 uppercase tracking-wider px-3 pt-3 pb-1">{group.label}</p>
                  {group.items.map((item) => {
                    const active = isActive(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-clay font-semibold text-sm transition-colors ${
                          active
                            ? 'bg-primary-500 text-white'
                            : 'text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-800'
                        }`}
                      >
                        <item.icon size={16} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
              <div className="border-t border-primary-200 dark:border-primary-700 pt-2 mt-2">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2.5 rounded-clay font-semibold text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
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
