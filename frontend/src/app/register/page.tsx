'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

function CodeInput({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const [code, setCode] = useState(initialCode || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode) setCode(urlCode.toUpperCase());
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) {
      setError('Please enter Invite Code');
      return;
    }
    setLoading(true);
    try {
      const res = await api.loginWithInvite(code.trim());
      setAuth(res.access_token, res.user);
      router.push('/personas');
    } catch (err: any) {
      setError(err.message || 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-xs text-red-400 text-center py-2">
          {error}
        </div>
      )}

      <input
        type="text"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] transition-colors font-light tracking-wider text-center uppercase"
        placeholder="Invite Code"
        autoCapitalize="characters"
        spellCheck={false}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-[#1D1D1F] hover:bg-[#2a2a2e] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-light rounded-[10px] transition-colors mt-2"
      >
        {loading ? 'Verifying...' : 'Activate'}
      </button>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] px-4">
        <div className="text-center text-[#86868B] text-sm font-light py-8">Loading...</div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const urlCode = searchParams.get('code') || '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] px-4">
      <div className="w-full max-w-[300px]">
        <div className="text-center mb-16">
          <h1 className="text-3xl font-extralight tracking-[0.15em] text-[#1D1D1F] uppercase mb-3">Elaris</h1>
          <p className="text-xs text-[#86868B] font-light tracking-wide">Activate Invite Code · 30-Day Premium</p>
        </div>

        <CodeInput initialCode={urlCode.toUpperCase()} />

        <div className="mt-12 text-center">
          <Link href="/login" className="text-xs text-[#86868B] hover:text-[#6E6E73] font-light">
            Already activated? Log in
          </Link>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-xs text-[#86868B] hover:text-[#6E6E73] font-light">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
