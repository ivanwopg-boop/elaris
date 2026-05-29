'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Compass, User, LogOut, ChevronRight } from 'lucide-react';
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

// ── App Bar ────────────────────────────────────────────────────

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

// ── Chat Tab ────────────────────────────────────────────────────

function ChatTab({ personas, onNavigate }: { personas: PersonaSummary[]; onNavigate: () => void }) {
  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-5">
          <MessageSquare size={28} strokeWidth={1.5} className="text-[#86868B]" />
        </div>
        <p className="text-base font-light text-[#1D1D1F] mb-1">暂无对话</p>
        <p className="text-sm text-[#86868B] font-light mb-8 leading-relaxed">开始探索发现页的 AI persona，和他们对话</p>
        <div className="relative">
          <button
            onClick={onNavigate}
            className="px-8 py-3.5 rounded-full bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] transition-colors flex items-center justify-center gap-2"
          >
            去发现 AI personas
            <span className="text-lg">→</span>
          </button>
          <span className="absolute -top-3 -right-6 animate-bounce text-xl">👇</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => window.location.href = `/chat/${p.id}`}
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

function ContactsTab({ personas, onNavigate }: { personas: PersonaSummary[]; onNavigate: () => void }) {
  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-5">
          <Compass size={28} strokeWidth={1.5} className="text-[#86868B]" />
        </div>
        <p className="text-base font-light text-[#1D1D1F] mb-1">暂无联系人</p>
        <p className="text-sm text-[#86868B] font-light mb-8 leading-relaxed">去发现页添加你感兴趣的 AI persona</p>
        <button
          onClick={onNavigate}
          className="px-8 py-3.5 rounded-full bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] transition-colors"
        >
          去发现
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => window.location.href = `/chat/${p.id}`}
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
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-5">
          <Compass size={28} strokeWidth={1.5} className="text-[#86868B]" />
        </div>
        <p className="text-base font-light text-[#1D1D1F] mb-1">暂无预设</p>
        <p className="text-sm text-[#86868B] font-light leading-relaxed">稍后再来看看有什么可探索的</p>
      </div>
    );
  }

  const handleAddToContacts = async (e: React.MouseEvent, p: PersonaSummary) => {
    e.stopPropagation();
    try {
      await api.createPersona({ name: p.name, description: p.description || '' });
      alert(`${p.name} 已添加到通讯录`);
    } catch {
      alert('添加失败，请重试');
    }
  };

  return (
    <div className="p-4 grid grid-cols-1 gap-3">
      {presets.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden"
        >
          <button
            onClick={() => window.location.href = `/chat/${p.id}`}
            className="w-full text-left p-4 active:bg-[rgba(0,0,0,0.02)] transition-colors"
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
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={(e) => handleAddToContacts(e, p)}
              className="flex-1 py-2.5 rounded-full border border-[rgba(0,0,0,0.12)] text-sm font-light text-[#1D1D1F] bg-white active:bg-[rgba(0,0,0,0.04)] transition-colors"
            >
              ＋ 添加到通讯录
            </button>
            <button
              onClick={() => window.location.href = `/chat/${p.id}`}
              className="flex-1 py-2.5 rounded-full bg-[#1D1D1F] text-white text-sm font-light active:bg-[#3C3C3E] transition-colors"
            >
              开始对话
            </button>
          </div>
        </div>
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
    { label: '我的 Personas', onClick: () => window.location.href = '/personas', icon: '👤' },
    { label: '创建 Persona', onClick: () => window.location.href = '/personas/new', icon: '✨' },
  ];

  return (
    <div className="px-4 py-6 bg-[#F9F9F9] min-h-full">
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-5 mb-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#F5F5F7] flex items-center justify-center shrink-0">
          <User size={22} className="text-[#86868B]" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-normal text-[#1D1D1F]">{user?.name || '访客'}</p>
          {user?.email && (
            <p className="text-sm text-[#86868B] font-light mt-0.5 truncate">{user.email}</p>
          )}
          {!user && (
            <p className="text-sm text-[#86868B] font-light mt-0.5">未登录</p>
          )}
        </div>
      </div>

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

      {user && (
        <button
          onClick={handleLogout}
          className="w-full py-3.5 rounded-full border border-[rgba(0,0,0,0.12)] text-sm font-normal text-[#1D1D1F] bg-white active:bg-[rgba(0,0,0,0.03)] transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={16} strokeWidth={1.5} />
          退出登录
        </button>
      )}
    </div>
  );
}

// ── Tab Titles ─────────────────────────────────────────────────

const TAB_TITLES: Record<TabKey, string> = {
  chat: '聊天',
  contacts: '通讯录',
  discover: '发现',
  me: '我',
};

// ── Main Page ─────────────────────────────────────────────────

export default function ChatsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [myPersonas, setMyPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Support deep-link: /chats?tab=discover
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as TabKey;
    if (tab && ['chat', 'contacts', 'discover', 'me'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Load user's personas (if logged in)
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.listPersonas()
      .then((all) => setMyPersonas(all))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleNavigateToDiscover = () => setActiveTab('discover');

  return (
    <div
      className="flex flex-col bg-[#F9F9F9]"
      style={{
        minHeight: '100dvh',
        maxWidth: '100vw',
        overflowX: 'hidden',
      }}
    >
      <AppBar title={TAB_TITLES[activeTab]} />

      <main
        className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom,0px))]"
        style={{ overscrollBehavior: 'contain' }}
      >
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {activeTab === 'chat' && <ChatTab personas={myPersonas} onNavigate={handleNavigateToDiscover} />}
            {activeTab === 'contacts' && <ContactsTab personas={myPersonas} onNavigate={handleNavigateToDiscover} />}
            {activeTab === 'discover' && <DiscoverTab />}
            {activeTab === 'me' && <MeTab />}
          </>
        )}
      </main>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}