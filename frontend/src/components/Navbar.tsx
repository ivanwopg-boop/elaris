'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

export default function Navbar({ hideWhenNoAuth }: { hideWhenNoAuth?: boolean }) {
  const router = useRouter();
  const { token, user, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch { /* ignore */ }
    clearAuth();
    router.push('/login');
  };

  // Hide nav on homepage when not logged in
  if (hideWhenNoAuth && !token) return null;

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-base font-extralight tracking-[0.15em] text-[#1D1D1F] uppercase">
          Elaris
        </Link>
        <div className="flex items-center gap-8">
          {token ? (
            <>
              <span className="text-sm font-light text-[#6E6E73]">
                {user?.name || ''}
              </span>
              <Link href="/personas" className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">
                Personas
              </Link>
              <Link href="/brainstorms" className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">
                Brainstorm
              </Link>
              <Link href="/group-chat" className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">
                Group Chat
              </Link>
            </>
          ) : (
            <Link href="/login" className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}