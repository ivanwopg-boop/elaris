'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

type Tab = 'email' | 'google';

function LoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [tab, setTab] = useState<Tab>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      setAuth(res.access_token, res.user);
      router.push('/personas');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Redirect to backend Google OAuth endpoint
    window.location.href = '/api/v1/auth/google';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      {/* Subtle background grid */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, #ffffff 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-[340px]">
        {/* Logo */}
        <div className="text-center mb-14">
          <h1 className="text-3xl font-extralight tracking-[0.2em] text-white uppercase mb-3">ELARIS</h1>
          <p className="text-xs text-[#86868B] font-light tracking-wider">Intelligence made persistent.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-[rgba(255,255,255,0.06)] p-1 mb-8">
          <button
            onClick={() => setTab('email')}
            className={`flex-1 py-2.5 text-xs font-light rounded-lg transition-all ${
              tab === 'email'
                ? 'bg-white text-[#0a0a0f]'
                : 'text-[#86868B] hover:text-white'
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setTab('google')}
            className={`flex-1 py-2.5 text-xs font-light rounded-lg transition-all ${
              tab === 'google'
                ? 'bg-white text-[#0a0a0f]'
                : 'text-[#86868B] hover:text-white'
            }`}
          >
            Google
          </button>
        </div>

        {/* Email login form */}
        {tab === 'email' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {error && (
              <div className="text-xs text-red-400 text-center py-2">
                {error}
              </div>
            )}

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[#86868B] focus:outline-none focus:border-[#4285F4] transition-colors font-light"
              placeholder="Email address"
              autoComplete="email"
            />

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[#86868B] focus:outline-none focus:border-[#4285F4] transition-colors font-light"
              placeholder="Password"
              autoComplete="current-password"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-white text-[#0a0a0f] hover:bg-[#f0f0f0] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-light rounded-xl transition-colors mt-2"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        {/* Google login */}
        {tab === 'google' && (
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-3.5 bg-white hover:bg-[#f5f5f5] rounded-xl transition-colors"
            >
              {/* Google icon SVG */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.123 15.983 5.114 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.114 0 2.123 2.017.957 4.958L3.967 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              <span className="text-sm font-light text-[#3C4043]">Continue with Google</span>
            </button>
            <p className="text-[10px] text-[#86868B] text-center leading-relaxed">
              Google OAuth coming soon.<br />Email login is available now.
            </p>
          </div>
        )}

        {/* Links */}
        <div className="mt-10 text-center space-y-3">
          <Link href="/register" className="block text-xs text-[#86868B] hover:text-white font-light transition-colors">
            Create an account →
          </Link>
          <Link href="/" className="block text-xs text-[#86868B] hover:text-white font-light transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-[#86868B] text-sm font-light">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}