'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

function HomeRegisterForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await api.register(email.trim(), password, name.trim() || undefined);
      setAuth(res.access_token, res.user);
      router.push('/chats');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] px-4">
      <div className="relative w-full max-w-[340px]">
        {/* Logo */}
        <div className="text-center mb-14">
          <h1 className="text-3xl font-extralight tracking-[0.2em] text-[#1D1D1F] uppercase mb-3">ELARIS</h1>
          <p className="text-xs text-[#86868B] font-light tracking-wider">
            Turn the people who shaped the world<br />into AI personas you can talk to.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[rgba(0,0,0,0.06)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-xs text-red-500 text-center py-2">
                {error}
              </div>
            )}

            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-3.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light"
              placeholder="Display name (optional)"
              autoComplete="name"
            />

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-3.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light"
              placeholder="Email address"
              autoComplete="email"
            />

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#F5F5F7] border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-3.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light"
              placeholder="Password (min. 6 characters)"
              autoComplete="new-password"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#1D1D1F] text-white hover:bg-[#3C3C3E] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-light rounded-xl transition-colors mt-2"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        {/* Sign in link */}
        <div className="mt-6 text-center">
          <Link href="/login" className="text-xs text-[#86868B] hover:text-[#1D1D1F] font-light transition-colors">
            Already have an account? Sign in →
          </Link>
        </div>

        {/* Legal */}
        <div className="mt-10 text-center">
          <p className="text-[10px] text-[#B0B0B5] font-light leading-relaxed">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="underline hover:text-[#86868B] transition-colors">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="underline hover:text-[#86868B] transition-colors">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="text-[#86868B] text-sm font-light">Loading...</div>
      </div>
    }>
      <HomeRegisterForm />
    </Suspense>
  );
}