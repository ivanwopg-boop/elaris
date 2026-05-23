'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

export default function Navbar() {
  const router = useRouter();
  const { token, user, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch { /* ignore */ }
    clearAuth();
    router.push('/login');
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-base font-extralight tracking-[0.15em] text-[#1D1D1F] uppercase">
          Elaris
        </Link>
        <div className="flex items-center gap-8">
          {token && user ? (
            <>
              <span className="text-sm font-light text-[#6E6E73]">
                {user.name || user.email}
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
              <button onClick={handleLogout}
                className="text-sm font-light text-[#86868B] hover:text-[#1D1D1F] transition-colors">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-light text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">
                Log in
              </Link>
              <Link href="/register"
                className="text-sm font-light bg-[#1D1D1F] hover:bg-[#2a2a2e] text-white px-4 py-1.5 rounded-[8px] transition-colors">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
