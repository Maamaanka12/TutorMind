import { Link } from 'react-router-dom';
import { Brain, Target, RefreshCw, BarChart3, Sparkles, ArrowRight, Zap, BookOpen } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Understand Your Gaps',
    description: 'Our AI analyzes your responses to identify the root cause of misunderstandings - not just wrong answers.',
    color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
  },
  {
    icon: Target,
    title: 'Targeted Explanations',
    description: 'Get personalized explanations that address your specific misconceptions with examples and guiding questions.',
    color: 'bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400',
  },
  {
    icon: RefreshCw,
    title: 'Adaptive Learning Loop',
    description: 'Learn → Assess → Detect → Explain → Practice → Reassess. The system evolves with you.',
    color: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
  },
  {
    icon: BarChart3,
    title: 'Evolving Knowledge Profile',
    description: 'Track your mastery across concepts over time. The AI adjusts difficulty as you improve.',
    color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  },
];

const loopSteps = [
  { label: 'Learn', icon: BookOpen },
  { label: 'Assess', icon: Target },
  { label: 'Detect', icon: Brain },
  { label: 'Explain', icon: Zap },
  { label: 'Practice', icon: RefreshCw },
  { label: 'Reassess', icon: BarChart3 },
  { label: 'Adapt', icon: Sparkles },
];

export default function Landing() {
  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Hero */}
      <section className="pt-16 pb-20 md:pt-24 md:pb-28 text-center relative">
        <div className="inline-flex items-center gap-2 bg-accent-100 dark:bg-accent-900/40 text-accent-700 dark:text-accent-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 border border-accent-200 dark:border-accent-700 animate-fade-in">
          <Sparkles size={14} />
          AI-Powered Learning
        </div>

        <h1 className="text-4xl md:text-6xl font-display font-extrabold text-primary-900 dark:text-primary-100 leading-tight mb-6 text-balance animate-slide-up">
          AI That Understands{' '}
          <span className="text-primary-500 dark:text-primary-400 relative inline-block">
            Why You're Struggling
            <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none" aria-hidden="true">
              <path d="M2 8c50-6 100-6 150-2s100 2 146-2" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
        </h1>

        <p className="text-lg md:text-xl text-primary-600 dark:text-primary-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '100ms' }}>
          Not just right or wrong. Our AI tutor identifies your misconceptions,
          generates targeted explanations, and adapts to your learning pace.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <Link to="/register" className="clay-btn-primary text-lg px-8 py-4 flex items-center gap-2">
            Start Learning
            <ArrowRight size={20} />
          </Link>
          <Link to="/login" className="clay-btn-outline text-lg px-8 py-4">
            Sign In
          </Link>
        </div>

        {/* Floating decorative elements */}
        <div className="hidden md:block">
          <div className="absolute top-32 left-8 w-16 h-16 bg-accent-200 dark:bg-accent-800/30 rounded-clay-lg rotate-12 opacity-60 animate-float" style={{ animationDelay: '0.5s' }} />
          <div className="absolute top-48 right-12 w-12 h-12 bg-primary-200 dark:bg-primary-800/30 rounded-clay -rotate-6 opacity-50 animate-float" style={{ animationDelay: '1.5s' }} />
          <div className="absolute bottom-20 left-16 w-10 h-10 bg-purple-200 dark:bg-purple-800/30 rounded-clay rotate-45 opacity-40 animate-float" style={{ animationDelay: '1s' }} />
        </div>
      </section>

      {/* The Learning Loop */}
      <section className="mb-20">
        <div className="clay-card p-8 md:p-10">
          <h2 className="section-title text-center mb-2">The Learning Loop</h2>
          <p className="text-primary-500 dark:text-primary-400 text-center mb-8 font-body">A cycle designed to turn confusion into confidence</p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {loopSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1 group">
                  <div className="bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-primary-400 w-14 h-14 rounded-clay flex items-center justify-center border-2 border-primary-200 dark:border-primary-700 group-hover:bg-primary-200 dark:group-hover:bg-primary-700 transition-colors duration-200"
                    style={{ boxShadow: '3px 3px 0 0 var(--clay-shadow)' }}>
                    <step.icon size={22} />
                  </div>
                  <span className="text-xs font-bold text-primary-700 dark:text-primary-400 uppercase tracking-wide">{step.label}</span>
                </div>
                {i < loopSteps.length - 1 && (
                  <div className="text-primary-300 dark:text-primary-600 text-xl font-bold mt-[-16px]">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mb-20">
        <h2 className="section-title text-center mb-3">What Makes It Different</h2>
        <p className="text-primary-500 dark:text-primary-400 text-center mb-10 max-w-lg mx-auto">
          Traditional quizzes tell you what you got wrong. AdaptLearn tells you why.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="clay-card p-6 flex gap-5 animate-slide-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className={`shrink-0 w-12 h-12 rounded-clay flex items-center justify-center ${f.color} border-2 border-current/10`}
                style={{ boxShadow: '3px 3px 0 0 var(--clay-card-shadow)' }}>
                <f.icon size={24} />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-primary-900 dark:text-primary-100 mb-1">{f.title}</h3>
                <p className="text-primary-600 dark:text-primary-400 leading-relaxed text-sm">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mb-20">
        <div className="bg-primary-500 dark:bg-primary-800 text-white rounded-clay-xl p-10 md:p-14 text-center border-2 border-primary-400 dark:border-primary-600 relative overflow-hidden"
          style={{ boxShadow: '8px 8px 0 0 #312E81' }}>
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Ready to Learn Smarter?</h2>
            <p className="text-primary-200 text-lg mb-8 max-w-md mx-auto">
              Join AdaptLearn and discover what's really holding you back.
            </p>
            <Link to="/register" className="clay-btn-accent text-lg px-10 py-4 inline-flex items-center gap-2">
              <Sparkles size={20} />
              Get Started Free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t-2 border-primary-200 dark:border-primary-700 text-center">
        <p className="text-primary-400 dark:text-primary-500 text-sm font-semibold">
          Built with AI by AdaptLearn
        </p>
      </footer>
    </div>
  );
}
