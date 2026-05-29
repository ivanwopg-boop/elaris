'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

function RegisterForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
          <p className="text-xs text-[#86868B] font-light tracking-wider">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-xs text-red-400 text-center py-2">
              {error}
            </div>
          )}

          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[#86868B] focus:outline-none focus:border-[#4285F4] transition-colors font-light"
            placeholder="Display name (optional)"
            autoComplete="name"
          />

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
            placeholder="Password (min. 6 characters)"
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-white text-[#0a0a0f] hover:bg-[#f0f0f0] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-light rounded-xl transition-colors mt-2"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        {/* Links */}
        <div className="mt-10 text-center space-y-3">
          <Link href="/login" className="block text-xs text-[#86868B] hover:text-white font-light transition-colors">
            Already have an account? Sign in →
          </Link>
          <Link href="/" className="block text-xs text-[#86868B] hover:text-white font-light transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-[#86868B] text-sm font-light">Loading...</div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}