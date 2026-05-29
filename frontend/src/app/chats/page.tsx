'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Compass, User, Plus, LogOut } from 'lucide-react';
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

// ── Empty state illustrations ─────────────────────────────────

function EmptyChatIllustration() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-16 h-16 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-5">
        <MessageSquare size={24} className="text-[#86868B]" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-[#1D1D1F] font-light mb-1">No conversations yet</p>
      <p className="text-xs text-[#86868B] font-light mb-6">Start by creating a persona.</p>
    </div>
  );
}

function EmptyContactsIllustration() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-16 h-16 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-5">
        <Compass size={24} className="text-[#86868B]" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-[#1D1D1F] font-light mb-1">No contacts yet</p>
      <p className="text-xs text-[#86868B] font-light">Go to Discover to find personas.</p>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────

function ChatTab({ personas }: { personas: PersonaSummary[] }) {
  const router = useRouter();

  if (personas.length === 0) {
    return (
      <div>
        <EmptyChatIllustration />
        <div className="px-8 mb-8">
          <button
            onClick={() => router.push('/personas/new')}
            className="w-full py-3 rounded-full bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} strokeWidth={1.5} />
            Create Persona
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[rgba(0,0,0,0.04)]">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => router.push(`/chat/${p.id}`)}
          className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-[rgba(0,0,0,0.02)] transition-colors"
        >
          <Avatar name={p.name} url={p.avatar_url} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#1D1D1F] truncate">{p.name}</p>
            {p.description && (
              <p className="text-xs text-[#86868B] font-light truncate mt-0.5">{p.description}</p>
            )}
          </div>
          {!p.has_soul && (
            <span className="text-[10px] text-[#86868B] font-light shrink-0">Not distilled</span>
          )}
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
      <div>
        <EmptyContactsIllustration />
        <div className="px-8">
          <button
            onClick={() => router.push('/discover')}
            className="w-full py-3 rounded-full bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] transition-colors flex items-center justify-center gap-2"
          >
            <Compass size={16} strokeWidth={1.5} />
            Explore Personas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-px bg-[rgba(0,0,0,0.04)]">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => router.push(`/chat/${p.id}`)}
          className="w-full flex items-center gap-4 px-6 py-4 text-left bg-white hover:bg-[rgba(0,0,0,0.02)] transition-colors"
        >
          <Avatar name={p.name} url={p.avatar_url} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#1D1D1F] truncate">{p.name}</p>
            {p.description && (
              <p className="text-xs text-[#86868B] font-light truncate mt-0.5">{p.description}</p>
            )}
          </div>
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

  const presetCards = presets.length > 0 ? presets : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-[#86868B] font-light">Loading...</p>
      </div>
    );
  }

  if (presetCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
        <p className="text-sm text-[#86868B] font-light">No preset personas available.</p>
      </div>
    );
  }

  return (
    <div className="p-6 grid grid-cols-1 gap-4">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => router.push(`/chat/${p.id}`)}
          className="w-full text-left p-5 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white hover:border-[rgba(0,0,0,0.12)] hover:shadow-sm transition-all"
        >
          <div className="flex items-start gap-4">
            <Avatar name={p.name} url={p.avatar_url} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-light text-[#1D1D1F]">{p.name}</p>
              {p.description && (
                <p className="text-xs text-[#86868B] font-light mt-1 line-clamp-2">{p.description}</p>
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

  return (
    <div className="px-6 py-8">
      {/* User Info Card */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-6 mb-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-[#F5F5F7] flex items-center justify-center">
            <User size={24} className="text-[#86868B]" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-lg font-light text-[#1D1D1F]">{user?.name || 'User'}</p>
            <p className="text-xs text-[#86868B] font-light">{user?.email || ''}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] divide-y divide-[rgba(0,0,0,0.04)] overflow-hidden">
        <button
          onClick={() => router.push('/personas')}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-light text-[#1D1D1F] hover:bg-[rgba(0,0,0,0.02)] transition-colors"
        >
          <span>My Personas</span>
          <span className="text-[#86868B]">→</span>
        </button>
        <button
          onClick={() => router.push('/personas/new')}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-light text-[#1D1D1F] hover:bg-[rgba(0,0,0,0.02)] transition-colors"
        >
          <span>Create Persona</span>
          <span className="text-[#86868B]">→</span>
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-full border border-[rgba(0,0,0,0.12)] text-sm font-light text-[#1D1D1F] hover:bg-[rgba(0,0,0,0.02)] transition-colors"
      >
        <LogOut size={16} strokeWidth={1.5} />
        Sign out
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function ChatsPage() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [myPersonas, setMyPersonas] = useState<PersonaSummary[]>([]);
  const [allPersonas, setAllPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect if not logged in
  useEffect(() => {
    if (!token) {
      router.replace('/login');
    }
  }, [token, router]);

  // Load personas
  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.listPersonas(),
    ])
      .then(([all]) => {
        setAllPersonas(all);
        // myPersonas: user's own personas (those that have an owner — filtered on backend)
        setMyPersonas(all.filter((p: PersonaSummary) => p.id === p.id));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  // We rely on the backend to filter: listPersonas returns user's own + presets (if premium)
  // For Contacts: show user's own personas
  // For Discover: show preset personas (user_id=NULL)
  // The backend already handles the distinction via include_presets flag, but the flag
  // is tied to user tier. We load ALL and filter client-side.

  const myContacts = myPersonas; // alias
  const presetPersonas = allPersonas.filter((p) => {
    // heuristic: if persona has no recent "owned by me" signal, treat as preset
    // We use a different approach: load ALL, then show presets (user_id=NULL is
    // set on backend but we can't see user_id from frontend). We use allPersonas
    // for Discover since it shows everyone including presets.
    return true; // will be refined below
  });

  // Refine: contacts = myPersonas only
  const contacts = myPersonas;
  // Discover = all personas (including presets and own ones — user can explore)
  const discoverPersonas = allPersonas;

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
  }, []);

  if (!token) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <p className="text-sm text-[#86868B] font-light">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      {/* App Bar */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[rgba(0,0,0,0.06)]">
        <div className="max-w-lg mx-auto h-12 flex items-center justify-center px-6">
          <h1 className="text-sm font-extralight tracking-[0.1em] text-[#1D1D1F] uppercase">
            {activeTab === 'chat' ? 'Chats' :
             activeTab === 'contacts' ? 'Contacts' :
             activeTab === 'discover' ? 'Discover' : 'Me'}
          </h1>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto pb-16" style={{ height: 'calc(100vh - 48px - 56px)' }}>
        {activeTab === 'chat' && <ChatTab personas={myPersonas} />}
        {activeTab === 'contacts' && <ContactsTab personas={contacts} />}
        {activeTab === 'discover' && <DiscoverTab />}
        {activeTab === 'me' && <MeTab />}
      </div>

      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}