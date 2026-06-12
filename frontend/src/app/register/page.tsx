'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useLangStore, translations } from '@/lib/i18n';

function RegisterForm() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError(t.please_fill_all || 'Please fill in all fields');
      return;
    }
    if (!/^([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(email.trim())) {
      setError(t.invalid_email || "Please enter a valid email address");
      return;
    }
    if (!birthDate) {
      setError('Please enter your date of birth for age verification');
      return;
    }
    if (password.length < 6) {
      setError(t.password_min_6 || 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await api.register(name.trim(), email.trim(), password, undefined, birthDate);
      setAuth(res.access_token, res.user);
      window.location.href = '/chats';
    } catch (err: any) {
      setError(err.message || (t.register_failed || 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F7]">
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)] px-6 pt-12 pb-10 text-center">
        <h1 className="text-2xl font-light text-[#1D1D1F] mb-2 tracking-wide">{t.create_account || 'Create Account'}</h1>
        <p className="text-sm text-[#86868B] font-light">{t.join_elaris || 'Join Elaris and start chatting'}</p>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pt-8">
        <div className="w-full max-w-[360px]">
          <form onSubmit={handleEmailRegister} className="space-y-4">
            {error && (
              <div className="text-xs text-red-500 text-center py-2">
                {error}
              </div>
            )}
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-3.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light"
              placeholder={t.your_name || 'Your name'}
              autoComplete="name"
            />
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
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#1D1D1F] text-white hover:bg-[#3C3C3E] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-light rounded-xl transition-colors mt-2"
            >
              {loading ? (t.creating_account || 'Creating account...') : (t.create_account || 'Create account')}
            </button>
          </form>

          <div className="mt-8 text-center">
            <a className="block text-sm text-[#86868B] hover:text-[#1D1D1F] font-light transition-colors" href="/login">
              {t.already_have_account || 'Already have an account?'} <span className="text-[#1D1D1F]">{t.sign_in || 'Sign in'}</span>
            </a>
            <a className="block text-sm text-[#86868B] hover:text-[#1D1D1F] font-light transition-colors mt-2" href="/chats">
              {t.continue_as_guest || 'Continue as guest →'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return <RegisterForm />;
}