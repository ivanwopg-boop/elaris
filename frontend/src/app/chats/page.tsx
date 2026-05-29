'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Compass, User, Plus, LogOut, ChevronRight } from 'lucide-react';
import TabBar, { TabKey } from '@/components/TabBar';
import { Avatar } from '@/components/Avatar';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface PersonaSummary {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  has_soul: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

function LoadingSpinner({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-[rgba(0,0,0,0.1)] border-t-[#0071E3] animate-spin mb-3" />
      <p className="text-sm text-[#86868B] font-light">{message}</p>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-5">
        <div className="text-[#86868B]">{icon}</div>
      </div>
      <p className="text-base font-light text-[#1D1D1F] mb-1">{title}</p>
      <p className="text-sm text-[#86868B] font-light mb-8 leading-relaxed">{subtitle}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="w-full max-w-xs py-3.5 rounded-full bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] transition-colors flex items-center justify-center gap-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── App Bar (mobile-friendly) ────────────────────────────────

function AppBar({ title }: { title: string }) {
  return (
    <header
      className="sticky top-0 z-40 bg-white/98 backdrop-blur-md border-b border-[rgba(0,0,0,0.06)]"
      style={{ maxWidth: '100vw', overflowX: 'hidden' }}
    >
      <div className="h-12 flex items-center justify-center px-4">
        <h1 className="text-base font-light tracking-wide text-[#1D1D1F]">{title}</h1>
      </div>
    </header>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────

function ChatTab({ personas }: { personas: PersonaSummary[] }) {
  const router = useRouter();

  if (personas.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare size={28} strokeWidth={1.5} />}
        title="暂无对话"
        subtitle="创建你的第一个 persona，开始聊天吧"
        action={{
          label: '创建 Persona',
          onClick: () => router.push('/personas/new'),
        }}
      />
    );
  }

  return (
    <div className="bg-white">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => router.push(`/chat/${p.id}`)}
          className="w-full flex items-center gap-3 px-4 py-4 text-left border-b border-[rgba(0,0,0,0.04)] active:bg-[rgba(0,0,0,0.03)] transition-colors"
          style={{ minHeight: '64px' }}
        >
          <Avatar name={p.name} url={p.avatar_url} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-normal text-[#1D1D1F] truncate">{p.name}</p>
            {p.description && (
              <p className="text-sm text-[#86868B] font-light truncate mt-0.5">{p.description}</p>
            )}
          </div>
          {!p.has_soul && (
            <span className="text-xs text-[#AEAEB2] font-light shrink-0 mr-1">未蒸馏</span>
          )}
          <ChevronRight size={18} className="text-[#C7C7CC] shrink-0" strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

// ── Contacts Tab ──────────────────────────────────────────────

function ContactsTab({ personas }: { personas: PersonaSummary[] }) {
  const router = useRouter();

  if (personas.length === 0) {
    return (
      <EmptyState
        icon={<Compass size={28} strokeWidth={1.5} />}
        title="暂无联系人"
        subtitle="在发现页探索更多 persona"
        action={{
          label: '去发现',
          onClick: () => {/* switch tab via parent */},
        }}
      />
    );
  }

  return (
    <div className="bg-white">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => router.push(`/chat/${p.id}`)}
          className="w-full flex items-center gap-3 px-4 py-4 text-left border-b border-[rgba(0,0,0,0.04)] active:bg-[rgba(0,0,0,0.03)] transition-colors"
          style={{ minHeight: '64px' }}
        >
          <Avatar name={p.name} url={p.avatar_url} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-normal text-[#1D1D1F] truncate">{p.name}</p>
            {p.description && (
              <p className="text-sm text-[#86868B] font-light truncate mt-0.5">{p.description}</p>
            )}
          </div>
          <ChevronRight size={18} className="text-[#C7C7CC] shrink-0" strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

// ── Discover Tab ──────────────────────────────────────────────

function DiscoverTab() {
  const router = useRouter();
  const [presets, setPresets] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listPresets()
      .then(setPresets)
      .catch(() => setPresets([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (presets.length === 0) {
    return (
      <EmptyState
        icon={<Compass size={28} strokeWidth={1.5} />}
        title="暂无预设"
        subtitle="稍后再来看看有什么可探索的"
      />
    );
  }

  return (
    <div className="p-4 grid grid-cols-1 gap-3">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => router.push(`/chat/${p.id}`)}
          className="w-full text-left p-4 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white active:bg-[rgba(0,0,0,0.02)] transition-all"
        >
          <div className="flex items-start gap-4">
            <Avatar name={p.name} url={p.avatar_url} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-normal text-[#1D1D1F] mb-1">{p.name}</p>
              {p.description && (
                <p className="text-sm text-[#86868B] font-light leading-relaxed line-clamp-2">{p.description}</p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Me Tab ────────────────────────────────────────────────────

function MeTab() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    clearAuth();
    router.push('/login');
  };

  const menuItems = [
    { label: '我的 Personas', onClick: () => router.push('/personas'), icon: '👤' },
    { label: '创建 Persona', onClick: () => router.push('/personas/new'), icon: '✨' },
  ];

  return (
    <div className="px-4 py-6 bg-[#F9F9F9] min-h-full">
      {/* User Card */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-5 mb-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#F5F5F7] flex items-center justify-center shrink-0">
          <User size={22} className="text-[#86868B]" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-normal text-[#1D1D1F]">{user?.name || '用户'}</p>
          {user?.email && (
            <p className="text-sm text-[#86868B] font-light mt-0.5 truncate">{user.email}</p>
          )}
        </div>
      </div>

      {/* Menu Items */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] overflow-hidden mb-4">
        {menuItems.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            className="w-full flex items-center gap-3 px-5 py-4 text-left border-b border-[rgba(0,0,0,0.04)] last:border-b-0 active:bg-[rgba(0,0,0,0.02)] transition-colors"
            style={{ minHeight: '52px' }}
          >
            <span className="text-base">{item.icon}</span>
            <span className="text-sm font-normal text-[#1D1D1F]">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="w-full py-3.5 rounded-full border border-[rgba(0,0,0,0.12)] text-sm font-normal text-[#1D1D1F] bg-white active:bg-[rgba(0,0,0,0.03)] transition-colors flex items-center justify-center gap-2"
      >
        <LogOut size={16} strokeWidth={1.5} />
        退出登录
      </button>
    </div>
  );
}

// ── Tab Titles (Chinese) ─────────────────────────────────────

const TAB_TITLES: Record<TabKey, string> = {
  chat: '聊天',
  contacts: '通讯录',
  discover: '发现',
  me: '我',
};

// ── Main Page ─────────────────────────────────────────────────

export default function ChatsPage() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [myPersonas, setMyPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect if not logged in
  useEffect(() => {
    if (!token) router.replace('/login');
  }, [token, router]);

  // Load user's personas
  useEffect(() => {
    if (!token) return;
    api.listPersonas()
      .then((all) => {
        setMyPersonas(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  if (!token) return null;

  return (
    <div
      className="flex flex-col bg-[#F9F9F9]"
      style={{
        minHeight: '100dvh',       // dynamic viewport height for mobile
        maxWidth: '100vw',
        overflowX: 'hidden',
      }}
    >
      {/* App Bar */}
      <AppBar title={TAB_TITLES[activeTab]} />

      {/* Content — fills remaining height */}
      <main
        className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom,0px))]"
        style={{ overscrollBehavior: 'contain' }}
      >
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {activeTab === 'chat' && <ChatTab personas={myPersonas} />}
            {activeTab === 'contacts' && <ContactsTab personas={myPersonas} />}
            {activeTab === 'discover' && <DiscoverTab />}
            {activeTab === 'me' && <MeTab />}
          </>
        )}
      </main>

      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}