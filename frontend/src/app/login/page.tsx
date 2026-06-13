'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useLangStore, translations } from '@/lib/i18n';

function LoginForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError(t.please_fill_all || 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      setAuth(res.access_token, res.user);
      window.location.href = '/chats';
    } catch (err: any) {
      setError(err.message || (t.login_failed || 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F7]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)] px-6 pt-12 pb-10 text-center">
        <h1 className="text-2xl font-light text-[#1D1D1F] mb-2 tracking-wide">{t.welcome_to_elaris || 'Welcome to Elaris'}</h1>
        <p className="text-sm text-[#86868B] font-light">{t.tagline || 'Intelligence made persistent.'}</p>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pt-8">
        <div className="w-full max-w-[360px]">
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {error && (
              <div className="text-xs text-red-500 text-center py-2">
                {error}
              </div>
            )}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-3.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light"
              placeholder={t.email_address || 'Email address'}
              autoComplete="email"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-3.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light"
              placeholder={t.password || 'Password'}
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#1D1D1F] text-white hover:bg-[#3C3C3E] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-light rounded-xl transition-colors mt-2"
            >
              {loading ? (t.signing_in || 'Signing in...') : (t.sign_in || 'Sign in')}
            </button>
          </form>

          <div className="mt-8 text-center">
            <a className="block text-sm text-[#86868B] hover:text-[#1D1D1F] font-light transition-colors" href="/register">
              {t.no_account || 'No account?'} <span className="text-[#1D1D1F]">{t.create_one || 'Create one'}</span>
            </a>
</div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}