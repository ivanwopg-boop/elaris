'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { MessageSquare, Compass, User, LogOut, ChevronRight, Plus, Users, Sparkles, Settings, HelpCircle, Info } from 'lucide-react';
import TabBar from '@/components/TabBar';
import { Avatar } from '@/components/Avatar';
import { SwipeableRow } from '@/components/SwipeableRow';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useLangStore, translations, type Lang, getLocalizedPresetName } from '@/lib/i18n';
import { useToast } from '@/components/Toast';

interface PersonaSummary {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  has_soul: boolean;
  category?: string | null;
}

type TabKey = 'chat' | 'contacts' | 'discover' | 'me';


const PRESET_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "tech", label: "Tech" },
  { key: "chinese", label: "Chinese" },
  { key: "world", label: "World Leaders" },
  { key: "sports", label: "Sports" },
  { key: "entertainment", label: "Entertainment" },
  { key: "business", label: "Business" },
  { key: "thinker", label: "Thinkers" },
];



// ── Helpers ───────────────────────────────────────────────────

function LoadingSpinner({ message }: { message?: string }) {
  const { lang } = useLangStore() as { lang: Lang };
  const t = translations[lang];
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-[rgba(0,0,0,0.1)] border-t-[#0071E3] animate-spin mb-3" />
      <p className="text-sm text-[#86868B] font-light">{message || t.loading}</p>
    </div>
  );
}

// ── App Bar ────────────────────────────────────────────────────

function AppBar({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-40 bg-white/98 backdrop-blur-md border-b border-[rgba(0,0,0,0.06)]"
      style={{ maxWidth: '100vw', overflowX: 'hidden' }}
    >
      <div className="h-12 flex items-center justify-center px-4">
        {action && <div className="absolute right-4">{action}</div>}
        <h1 className="text-base font-medium tracking-wide text-[#1D1D1F]">{title}</h1>
      </div>
    </header>
  );
}

// ── Conversation type ───────────────────────────────────────────
interface ConversationItem {
  id: string;
  persona_id: string;
  persona_name: string;
  persona_avatar: string | null;
  last_message: string | null;
  updated_at: string;
  type?: string;
  name?: string | null;
  participant_ids?: string[];
}

// ── Chat Tab (Conversation List) ─────────────────────────────

function ChatTab({ tabStrings, conversations, setConversations, onNavigate }: { tabStrings: Record<string, string>; conversations: ConversationItem[]; setConversations: any; onNavigate: () => void }) {
  const { lang } = useLangStore() as { lang: Lang };
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadConversations = async () => {
    try {
      const [data, groupData] = await Promise.all([
        api.listConversations(),
        api.listGroupChats().catch(() => []),
      ]);
      // Convert group chats to ConversationItem format
      const groupItems: ConversationItem[] = groupData.map((g: any) => ({
        id: g.id,
        persona_id: g.persona_ids?.[0] || '',
        persona_name: g.title || 'Group Chat',
        persona_avatar: null,
        last_message: null,
        updated_at: g.created_at,
        type: 'group' as const,
        name: g.title,
        participant_ids: g.persona_ids,
      }));
      // Merge and sort by updated_at desc
      const merged = [...data, ...groupItems].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setConversations(merged as ConversationItem[]);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConversations(); }, []);

  const handleDelete = async (convId: string) => {
    if (!confirm(tabStrings.delete_confirm_conv || "Delete this conversation?")) return;
    setDeletingId(convId);
    try {
      await api.deleteConversation(convId);
      setConversations((prev: ConversationItem[]) => prev.filter((c: ConversationItem) => c.id !== convId));
    } catch (err: any) {
      alert((tabStrings.delete_failed || "Delete failed: ") + (err?.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (iso: string) => {
    // DB stores UTC time; append Z so JS parses as UTC, then toLocale converts to local
    const utcIso = iso.endsWith('Z') || iso.includes('+') ? iso : iso.replace(' ', 'T') + 'Z';
    const d = new Date(utcIso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#E8E8ED] to-[#F5F5F7] flex items-center justify-center mb-6">
          <MessageSquare size={40} strokeWidth={1} className="text-[#86868B]" />
        </div>
        <p className="text-lg font-medium text-[#1D1D1F] mb-2">{tabStrings.no_chats}</p>
        <p className="text-sm text-[#86868B] font-light mb-10 leading-relaxed max-w-[240px]">{tabStrings.chat_with_them}</p>
        <button
          onClick={onNavigate}
          className="px-10 py-3.5 rounded-full bg-[#1D1D1F] text-white text-sm font-medium hover:bg-[#3C3C3E] active:bg-[#000] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/10"
        >
          {tabStrings.go_discover}
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>

    );
  }

  return (
    <div className="bg-white">
      {conversations.map((conv) => (
        <SwipeableRow
          key={conv.id}
          onDelete={() => handleDelete(conv.id)}
          deleteLabel={tabStrings.delete || "Delete"}
          deleting={deletingId === conv.id}
        >
          <div
            className="flex items-center gap-3 px-4 py-4 border-b border-[rgba(0,0,0,0.04)] active:bg-[rgba(0,0,0,0.02)] active:scale-[0.98] transition-all cursor-pointer"
            style={{ minHeight: '64px' }}
            onClick={() => router.push(conv.type === 'group' ? `/group-chat/${conv.id}` : `/chat/${conv.persona_id}?conv=${conv.id}`)}
            onContextMenu={(e) => { e.preventDefault(); handleDelete(conv.id); }}
          >
            {conv.type === 'group' ? (
              <div className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.04)] flex items-center justify-center shrink-0">
                <Users size={18} className="text-[#86868B]" strokeWidth={1.5} />
              </div>
            ) : (
              <Avatar name={getLocalizedPresetName(conv.persona_name, lang)} url={conv.persona_avatar} size="md" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-[#1D1D1F] truncate">{getLocalizedPresetName(conv.persona_name, lang)}</p>
              {conv.last_message && (
                <p className="text-sm text-[#86868B] font-light truncate mt-0.5">{conv.last_message}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[#AEAEB2] font-light">{formatTime(conv.updated_at)}</span>
              <ChevronRight size={18} className="text-[#C7C7CC]" strokeWidth={1.5} />
            </div>
          </div>
        </SwipeableRow>
      ))}
    </div>
  );
}


// ── Contacts Tab ──────────────────────────────────────────────

function ContactsTab({ isActive, onNavigate, tabStrings, contacts, setContacts, token }: { isActive?: boolean; onNavigate: () => void; tabStrings: Record<string, string>; contacts?: any[]; setContacts?: any; token?: string | null }) {
  const { lang } = useLangStore();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loading = false; // ChatsContent handles fetching

  const handleDelete = async (personaId: string) => {
    if (!confirm(tabStrings.delete_confirm_contact || "Delete this contact?")) return;
    setDeletingId(personaId);
    try {
      const res = await fetch(`/api/v1/personas/contacts/${personaId}`, { method: 'DELETE' });
      if (res.ok) {
        setContacts((prev: any[]) => prev.filter((p: any) => p.id !== personaId));
        setLocalContacts((prev: any[]) => prev.filter((p: any) => p.id !== personaId));
      } else alert(tabStrings.delete_failed || 'Delete failed');
    } catch {
      alert(tabStrings.delete_failed || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  // Fetch contacts from API if not provided via prop
  const [localContacts, setLocalContacts] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    if (contacts && contacts.length > 0) return; // already have contacts from parent
    fetch('/api/v1/personas/contacts')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) setLocalContacts(data);
        // Check for pending contact from new-persona flow
        const pendingRaw = sessionStorage.getItem("pending-contact-add");
        if (pendingRaw) {
          sessionStorage.removeItem("pending-contact-add");
          try {
            const pending = JSON.parse(pendingRaw);
            if (pending && pending.id) {
              setLocalContacts((prev: any[]) => {
                if (prev.some((c: any) => c.id === pending.id)) return prev;
                return [...prev, pending];
              });
              setContacts?.((prev: any[]) => {
                if (!prev) return [pending];
                if (prev.some((c: any) => c.id === pending.id)) return prev;
                return [...prev, pending];
              });
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, [token]);

  // Listen for contact-added event from DiscoverTab (fired on successful POST)
  useEffect(() => {
    const handler = (e: Event) => {
      const p = (e as CustomEvent).detail;
      if (p) {
        setLocalContacts(prev => [...prev, p]);
        setContacts?.((prev: any[]) => prev ? [...prev, p] : [p]);
      }
    };
    window.addEventListener('contact-added', handler);
    return () => window.removeEventListener('contact-added', handler);
  }, []);

  const displayContacts = contacts && contacts.length > 0 ? contacts : localContacts;

  if (displayContacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#E8E8ED] to-[#F5F5F7] flex items-center justify-center mb-6">
          <Compass size={40} strokeWidth={1} className="text-[#86868B]" />
        </div>
        <p className="text-lg font-medium text-[#1D1D1F] mb-2">{tabStrings.no_contacts}</p>
        <p className="text-sm text-[#86868B] font-light mb-10 leading-relaxed max-w-[240px]">{tabStrings.add_contacts_hint}</p>
        <button
          onClick={onNavigate}
          className="px-10 py-3.5 rounded-full bg-[#1D1D1F] text-white text-sm font-medium hover:bg-[#3C3C3E] active:bg-[#000] active:scale-[0.98] transition-all shadow-lg shadow-black/10"
        >
          {tabStrings.go_discover}
        </button>
      </div>

    );
  }

  return (
    <div className="bg-white">
      {displayContacts.map((p: any) => (
        <SwipeableRow
          key={p.id}
          onDelete={() => handleDelete(p.id)}
          deleteLabel={tabStrings.delete || "Delete"}
          deleting={deletingId === p.id}
        >
          <div
            className="flex items-center gap-3 px-4 py-4 border-b border-[rgba(0,0,0,0.04)] active:bg-[rgba(0,0,0,0.02)] active:scale-[0.98] transition-all cursor-pointer"
            style={{ minHeight: '64px' }}
            onClick={() => window.location.href = `/persona/${p.id}`}
            onContextMenu={(e) => { e.preventDefault(); handleDelete(p.id); }}
          >
            <Avatar name={getLocalizedPresetName(p.name, lang)} url={p.avatar_url} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-[#1D1D1F] truncate">{getLocalizedPresetName(p.name, lang)}</p>
              {p.description && (
                <p className="text-sm text-[#86868B] font-light truncate mt-0.5">{p.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ChevronRight size={18} className="text-[#C7C7CC]" strokeWidth={1.5} />
            </div>
          </div>
        </SwipeableRow>
      ))}
    </div>
  );
}

// ── Discover Tab ──────────────────────────────────────────────

const FEATURED_IDS = ["338103d3-2555-4e17-9bb6-2801521d5e36",
    "c5effabc-cfd0-4bdb-8222-6baa7b5e365c",
    "65b2c442-d15c-42bb-8f2d-c4d8e25ca3fe",
    "254072df-98f4-437d-bfd6-bdb64db5ea52",
    "2acdfdd2-9b03-4cc7-8fb5-0438ead2dc05"];

function DiscoverTab({ tabStrings, onContactAdded }: { tabStrings: Record<string, string>; onContactAdded?: (p?: any) => void }) {
  const { lang } = useLangStore();
  const CATEGORIES = [
    { key: "all", label: lang === "zh-CN" ? "全部" : "All" },
    { key: "tech", label: lang === "zh-CN" ? "科技" : "Tech" },
    { key: "business", label: lang === "zh-CN" ? "商业" : "Business" },
    { key: "entertainment", label: lang === "zh-CN" ? "文艺" : "Arts" },
    { key: "sports", label: lang === "zh-CN" ? "体育" : "Sports" },
    { key: "politics", label: lang === "zh-CN" ? "政界" : "Politics" },
    { key: "science", label: lang === "zh-CN" ? "科学" : "Science" },
    { key: "other", label: lang === "zh-CN" ? "其他" : "Other" },
  ];
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const [presets, setPresets] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState("all");

  useEffect(() => {
    api.listPresets(lang)
      .then((all) => {
        // Guests (no token): only show 5 featured. Logged-in: show all.
        const list = !token ? all.filter((p: any) => FEATURED_IDS.includes(p.id)) : all;
        setPresets(list);
      })
      .catch(() => setPresets([]))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingSpinner />;

  if (presets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#E8E8ED] to-[#F5F5F7] flex items-center justify-center mb-6">
          <Sparkles size={40} strokeWidth={1} className="text-[#86868B]" />
        </div>
        <p className="text-lg font-medium text-[#1D1D1F] mb-2">{tabStrings.no_presets}</p>
        <p className="text-sm text-[#86868B] font-light leading-relaxed max-w-[240px]">{tabStrings.check_back_later}</p>
      </div>

    );
  }

  const handleAddToContacts = async (e: React.MouseEvent, p: PersonaSummary) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/v1/personas/contacts/${p.id}`, { method: 'POST' });
      if (res.ok) {
        if (onContactAdded) onContactAdded(p);
        toast(p.name + " added to contacts", "success");
      }
    } catch {
      toast("Add to contacts failed", "error");
    }
  };

  const handleDeletePreset = async (e: React.MouseEvent, p: PersonaSummary) => {
    e.stopPropagation();

    try {
      const res = await fetch(`/api/v1/personas/presets/${p.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPresets(prev => prev.filter(x => x.id !== p.id));
      } else {
        alert(tabStrings.delete_failed || 'Delete failed');
      }
    } catch {
      alert(tabStrings.delete_failed || 'Delete failed');
    }
  };
  const handleSwipeDelete = (p: PersonaSummary) => {
    handleDeletePreset(new MouseEvent('click') as any, p);
  };

  const filtered = activeCat === "all" ? presets : presets.filter((p) => (p.category || "other") === activeCat);

  return (
    <div>
      <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-[rgba(0,0,0,0.04)]">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCat(cat.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-light transition-all active:scale-[0.98] ${activeCat === cat.key ? 'bg-[#0071E3] text-white' : 'bg-[#F5F5F7] text-[#86868B]'}`}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="p-4 grid grid-cols-1 gap-3">
        {filtered.map((p) => (
          <SwipeableRow
            key={p.id}
            onDelete={() => handleSwipeDelete(p)}
            deleteLabel={tabStrings.delete || "Delete"}
          >
            <div key={p.id} className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden">
            <button
              onClick={() => window.location.href = `/persona/${p.id}`}
              className="w-full text-left p-4 active:bg-[rgba(0,0,0,0.02)] active:scale-[0.98] transition-all"
            >
              <div className="flex items-start gap-4">
                <Avatar name={getLocalizedPresetName(p.name, lang)} url={p.avatar_url} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-[#1D1D1F] mb-1">{getLocalizedPresetName(p.name, lang)}</p>
                  {p.description && (
                    <p className="text-sm text-[#86868B] font-light leading-relaxed line-clamp-2">{p.description}</p>
                  )}
                </div>
              </div>
            </button>
            <div className="px-4 pb-4 flex gap-2">
              {token && (
                <button
                  onClick={(e) => handleAddToContacts(e, p)}
                  className="flex-1 py-2.5 rounded-full border border-[rgba(0,0,0,0.12)] text-sm font-light text-[#1D1D1F] bg-white active:bg-[rgba(0,0,0,0.04)] active:scale-[0.98] transition-all"
                >
                  {tabStrings.add_to_contacts}
                </button>
              )}
              <button
                onClick={() => token ? window.location.href = `/chat/${p.id}` : window.location.href = '/login'}
                className="flex-1 py-2.5 rounded-full bg-[#1D1D1F] text-white text-sm font-light active:bg-[#3C3C3E] active:scale-[0.98] transition-all"
              >
                {tabStrings.start_chat}
              </button>
            </div>
          </div>
          </SwipeableRow>
        ))}
      </div>
    </div>
  );
}

// ── Me Tab ────────────────────────────────────────────────────
// ── Me Tab ────────────────────────────────────────────────────

function MeTab({ tabStrings }: { tabStrings: Record<string, string> }) {
  const router = useRouter();
  const { user, token, clearAuth, setAuth } = useAuthStore();

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    clearAuth();
    router.push('/login');
  };

  const menuItems = [
    { label: tabStrings.my_personas, onClick: () => window.location.href = '/personas', icon: <User size={20} strokeWidth={1.5} /> },
    { label: tabStrings.create_persona, onClick: () => window.location.href = '/personas/new', icon: <Sparkles size={20} strokeWidth={1.5} /> },
    { label: tabStrings.account_settings, onClick: () => window.location.href = '/settings', icon: <Settings size={20} strokeWidth={1.5} /> },
    { label: tabStrings.help_feedback, onClick: () => window.location.href = 'mailto:support@elaris.ai', icon: <HelpCircle size={20} strokeWidth={1.5} /> },
    { label: tabStrings.about, onClick: () => window.location.href = '/about', icon: <Info size={20} strokeWidth={1.5} /> },
  ];

  return (
    <div className="px-4 py-6 bg-[#F9F9F9] min-h-full">
      <div className="bg-white rounded-3xl border border-[rgba(0,0,0,0.06)] p-5 mb-4 flex items-center gap-4">
        <label className="cursor-pointer shrink-0 relative group">
          <Avatar name={user?.name || "?"} url={user?.avatar_url} size="lg" className="shrink-0 group-hover:opacity-80 transition-opacity" />
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const form = new FormData();
              form.append('file', file);
              const res = await fetch('/api/v1/auth/me/avatar', { method: 'POST', body: form, headers: { Authorization: 'Bearer ' + token } });
              if (res.ok) {
                const data = await res.json();
                setAuth(token!, { ...user!, avatar_url: data.avatar_url });
                window.location.reload();
              }
            } catch {}
          }} />
        </label>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-medium text-[#1D1D1F]">{user?.name || tabStrings.guest}</p>
          {user?.email && (
            <p className="text-sm text-[#86868B] font-light mt-0.5 truncate">{user.email}</p>
          )}
          {!user && (
            <p className="text-sm text-[#86868B] font-light mt-0.5">{tabStrings.not_logged_in}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-[rgba(0,0,0,0.06)] overflow-hidden">
        {menuItems.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            className="w-full flex items-center gap-3 px-5 py-4 text-left border-b border-[rgba(0,0,0,0.04)] last:border-b-0 active:bg-[rgba(0,0,0,0.02)] active:scale-[0.98] transition-all"
            style={{ minHeight: '52px' }}
          >
            <span className="text-[#86868B]">{item.icon}</span>
            <span className="text-sm font-medium text-[#1D1D1F]">{item.label}</span>
          </button>
        ))}
      </div>

      {user && (
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-full border border-[rgba(0,0,0,0.08)] text-sm font-light text-[#86868B] bg-white hover:text-[#1D1D1F] hover:border-[rgba(0,0,0,0.15)] active:bg-[rgba(0,0,0,0.02)] active:scale-[0.98] transition-all"
        >
          {tabStrings.logout}
        </button>
      )}
    </div>
  );
}



// ── Main Page ─────────────────────────────────────────────────

function ChatsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const { lang } = useLangStore() as { lang: Lang };
  const t = translations[lang];
  const initialTab = (searchParams.get('tab') as TabKey) || 'chat';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  // contactsRefresh removed
  // Pre-compute all tab-specific strings
  const TAB_STRINGS = {
    no_chats: t.no_chats,
    chat_with_them: t.chat_with_them,
    go_discover: t.go_discover,
    no_contacts: t.no_contacts,
    add_contacts_hint: t.add_contacts_hint,
    no_presets: t.no_presets,
    check_back_later: t.check_back_later,
    added_to_contacts: t.added_to_contacts,
    add_failed: t.add_failed,
    add_to_contacts: t.add_to_contacts,
    start_chat: t.start_chat,
    guest: t.guest,
    not_logged_in: t.not_logged_in,
    logout: t.logout,
    my_personas: t.my_personas,
    create_persona: t.create_persona,
    account_settings: t.account_settings,
    help_feedback: t.help_feedback,
    about: t.about,
  };
  const TAB_TITLES: Record<TabKey, string> = {
    chat: t.tab_chat,
    contacts: t.tab_contacts,
    discover: t.tab_discover,
    me: t.tab_me,
  };
  const [myPersonas, setMyPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  // Contacts are fetched directly via ContactsTab when it mounts
  const [conversations, setConversations] = useState<ConversationItem[]>([]);

  // Keep URL in sync with activeTab state (after state update, push to URL)
  useEffect(() => {
    const url = new URL(window.location.href);
    const currentTab = url.searchParams.get('tab');
    if (currentTab !== activeTab) {
      url.searchParams.set('tab', activeTab);
      window.history.replaceState({}, '', url.toString());
    }
  }, [activeTab]);

  const loadMyPersonas = () => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.listPersonas()
      .then((all) => setMyPersonas(all.filter((p: any) => p.user_id !== null)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMyPersonas(); }, [token]);

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
      <AppBar
        title={TAB_TITLES[activeTab]}
        action={
          (activeTab === 'chat' || activeTab === 'contacts') ? (
            <button
              onClick={() => setShowActionSheet(true)}
              className="w-7 h-7 rounded-full bg-[#1D1D1F] text-white flex items-center justify-center hover:bg-[#3C3C3E] active:bg-[#000] transition-colors"
              style={{ lineHeight: 1 }}
            >
              <Plus size={15} strokeWidth={2} />
            </button>
          ) : undefined
        }
      />

      <main
        className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom,0px))]"
        style={{ overscrollBehavior: 'contain' }}
      >
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {activeTab === 'chat' && <ChatTab tabStrings={TAB_STRINGS} conversations={conversations} setConversations={setConversations} onNavigate={handleNavigateToDiscover} />}
            {activeTab === 'contacts' && <ContactsTab isActive={activeTab === 'contacts'} onNavigate={handleNavigateToDiscover} tabStrings={TAB_STRINGS} contacts={contacts} setContacts={setContacts} token={token} />}
            {activeTab === 'discover' && <DiscoverTab tabStrings={TAB_STRINGS} onContactAdded={(p) => { window.dispatchEvent(new CustomEvent('contact-added', { detail: p })); }} />}
            {activeTab === 'me' && <MeTab tabStrings={TAB_STRINGS} />}
          </>
        )}
      </main>

      {showActionSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowActionSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-white rounded-t-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-10 rounded-full bg-[#D1D1D6] absolute top-2 left-1/2 -translate-x-1/2" />
            <div className="pt-6 pb-8 px-4">
              <p className="text-center text-sm font-light text-[#86868B] mb-4">{t.choose_action || "Choose an action"}</p>
              <div className="space-y-2">
                <button
                  onClick={() => { setShowActionSheet(false); router.push('/group-chat/new'); }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-[#F5F5F7] hover:bg-[#EDEDED] active:bg-[#E5E5E5] transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-[#1D1D1F] flex items-center justify-center">
                    <Users size={20} strokeWidth={1.5} className="text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-[#1D1D1F]">{t.create_group_chat || "Create Group Chat"}</p>
                    <p className="text-xs text-[#86868B] font-light">{t.chat_with_multi || "Chat with multiple personas"}</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowActionSheet(false); router.push('/personas/new'); }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-[#F5F5F7] hover:bg-[#EDEDED] active:bg-[#E5E5E5] transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-[#1D1D1F] flex items-center justify-center">
                    <Sparkles size={20} strokeWidth={1.5} className="text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-[#1D1D1F]">{t.create_persona || "Create Persona"}</p>
                    <p className="text-xs text-[#86868B] font-light">{t.distill_twin || "Distill your own AI twin"}</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TabBar active={activeTab} onTabChange={(tab) => setActiveTab(tab as TabKey)} />
    </div>
  );
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 rounded-full border-2 border-[rgba(0,0,0,0.1)] border-t-[#0071E3] animate-spin" /></div>}>
      <ChatsContent />
    </Suspense>
  );
}