'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useLangStore, translations } from '@/lib/i18n';
import { api } from '@/lib/api';
import type { Lang } from '@/lib/i18n/translations';

const LANG_LABELS: Record<Lang, string> = {
  'en': 'EN',
  'zh-CN': '简',
};

const LANG_DROPDOWN: { label: string; value: Lang }[] = [
  { label: 'English', value: 'en' },
  { label: '简体中文', value: 'zh-CN' },
];

export default function Navbar({ hideWhenNoAuth }: { hideWhenNoAuth?: boolean }) {
  const router = useRouter();
  const { token, user, clearAuth } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const t = translations[lang];
  const [langOpen, setLangOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch { /* ignore */ }
    clearAuth();
    router.push('/login');
  };

  if (hideWhenNoAuth && !token) return null;

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/chats" className="flex items-center gap-2 h-8">
          <img src="/logo.png" alt="ELARIS" className="h-3 w-24" />
        </Link>

        <div className="flex items-center gap-6">
          {/* Language switcher */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors flex items-center gap-1"
            >
              {LANG_LABELS[lang]}
              <span className="text-xs">▾</span>
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-[rgba(0,0,0,0.08)] rounded-xl shadow-lg py-1 w-28 z-20">
                  {LANG_DROPDOWN.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setLang(opt.value); setLangOpen(false); }}
                      className={"w-full text-left px-4 py-2 text-sm font-light hover:bg-[rgba(0,0,0,0.04)] transition-colors " + (lang === opt.value ? "text-[#1D1D1F] font-normal" : "text-[#6E6E73]")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {token ? (
            <>
              <span className="text-sm font-light text-[#6E6E73]">
                {user?.name || ''}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
              >
                {t.sign_out}
              </button>
            </>
          ) : (
            <Link href="/login" className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">
              {t.sign_in}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
