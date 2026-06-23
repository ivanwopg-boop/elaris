'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink, X, MessageCircle, Check, Sparkles, Lock,
  RefreshCw, Clock, ChevronRight, BookUser,
} from 'lucide-react';
import { api, MomentOut, MomentListResponse } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import TabBar from '@/components/TabBar';
import { useLangStore, translations, type Lang } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

// ── Emotion → color mapping (Apple-feel) ─────────────────────
const EMOTION_COLORS: Record<string, { ring: string; bg: string; label: string; dot: string }> = {
  reflecting:   { ring: 'from-[#A78BFA] to-[#60A5FA]', bg: 'bg-[#F5F3FF]', label: 'moments_emotion_reflecting',   dot: 'bg-[#A78BFA]' },
  praising:     { ring: 'from-[#34C759] to-[#00C7BE]', bg: 'bg-[#F0FDF4]', label: 'moments_emotion_praising',     dot: 'bg-[#34C759]' },
  criticizing:  { ring: 'from-[#FF6B35] to-[#FF2D55]', bg: 'bg-[#FFF7F0]', label: 'moments_emotion_criticizing',  dot: 'bg-[#FF6B35]' },
  questioning:  { ring: 'from-[#FF9500] to-[#FF2D55]', bg: 'bg-[#FFFBEB]', label: 'moments_emotion_questioning',  dot: 'bg-[#FF9500]' },
  celebrating:  { ring: 'from-[#FFD60A] to-[#FF9500]', bg: 'bg-[#FFFBEA]', label: 'moments_emotion_celebrating',  dot: 'bg-[#FFD60A]' },
};

const EMOTION_FALLBACK = { ring: 'from-[#A78BFA] to-[#60A5FA]', bg: 'bg-[#F5F3FF]', label: 'moments_emotion_reflecting', dot: 'bg-[#A78BFA]' };

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}

function dayBucket(iso: string, t: Record<string, string>): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((todayStart.getTime() - dayStart.getTime()) / 86400000);
  if (diffDays === 0) return t.moments_today;
  if (diffDays === 1) return t.moments_yesterday;
  if (diffDays < 7) return t.moments_this_week;
  return t.moments_earlier;
}

function sourceLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').replace(/\.(com|org|net|io|co|cc|cn|world)$/, '');
  } catch { return ''; }
}

// ── App Bar ──────────────────────────────────────────────────
function AppBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-white/98 backdrop-blur-md border-b border-[rgba(0,0,0,0.06)]">
      <div className="h-12 flex items-center justify-center px-4 relative">
        {right && <div className="absolute right-4">{right}</div>}
        <h1 className="text-base font-medium tracking-wide text-[#1D1D1F]">{title}</h1>
      </div>
    </header>
  );
}

// ── Stories Bar ─────────────────────────────────────────────
function StoriesBar({
  moments, onClickMoment,
}: {
  moments: MomentOut[];
  onClickMoment: (m: MomentOut) => void;
}) {
  // Dedupe by persona: show the most recent moment per persona with unread status
  const seen = new Set<string>();
  const stories: MomentOut[] = [];
  // Sort so unread come first
  const sorted = [...moments].sort((a, b) => {
    if (a.status === 'unread' && b.status !== 'unread') return -1;
    if (b.status === 'unread' && a.status !== 'unread') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  for (const m of sorted) {
    if (seen.has(m.persona_id)) continue;
    seen.add(m.persona_id);
    stories.push(m);
  }

  if (stories.length === 0) return null;

  return (
    <div className="border-b border-[rgba(0,0,0,0.04)] py-3">
      <div className="flex gap-3 overflow-x-auto px-4 scrollbar-hide" style={{ scrollSnapType: 'x mandatory' }}>
        {stories.map((m) => {
          const emo = EMOTION_COLORS[m.emotion || ''] || EMOTION_FALLBACK;
          const isUnread = m.status === 'unread';
          return (
            <button
              key={`story-${m.id}`}
              onClick={() => onClickMoment(m)}
              className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform"
              style={{ scrollSnapAlign: 'start' }}
            >
              <div
                className={cn(
                  'p-[2.5px] rounded-full',
                  isUnread ? 'bg-gradient-to-tr' : 'bg-[#E5E5EA]',
                  isUnread ? emo.ring : '',
                )}
              >
                <div className="p-[2px] bg-white rounded-full">
                  <Avatar
                    name={m.persona_name || '?'}
                    url={m.persona_avatar_url}
                    size="lg"
                    className="border-0"
                  />
                </div>
              </div>
              <span className={cn(
                'text-[10px] max-w-[60px] truncate',
                isUnread ? 'text-[#1D1D1F] font-normal' : 'text-[#86868B] font-light',
              )}>
                {m.persona_name || '?'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Moment Card ─────────────────────────────────────────────
function MomentCard({
  m, t, onOpenChat, onMarkRead, onDismiss, onOpenSource,
}: {
  m: MomentOut;
  t: Record<string, string>;
  onOpenChat: () => void;
  onMarkRead: () => void;
  onDismiss: () => void;
  onOpenSource: () => void;
}) {
  const emo = EMOTION_COLORS[m.emotion || ''] || EMOTION_FALLBACK;
  const isUnread = m.status === 'unread';
  return (
    <article
      className={cn(
        'mx-4 my-2 rounded-2xl overflow-hidden border transition-colors',
        isUnread
          ? 'bg-white border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
          : 'bg-white/60 border-[rgba(0,0,0,0.04)]',
      )}
    >
      {/* Header: avatar + name + emotion + time */}
      <header className="flex items-center gap-3 px-4 pt-3.5 pb-2">
        <Avatar name={m.persona_name || '?'} url={m.persona_avatar_url} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-medium text-[#1D1D1F] truncate">
              {m.persona_name}
            </span>
            {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] shrink-0" />}
          </div>
          {m.watch_topic && (
            <div className="flex items-center gap-1 text-[11px] text-[#86868B] font-light truncate">
              <Sparkles size={10} strokeWidth={1.5} className="shrink-0" />
              <span className="truncate">{m.watch_topic}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className={cn('text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full', emo.bg, 'text-[#1D1D1F]')}>
            {t[emo.label] || m.emotion}
          </span>
          <span className="text-[10px] text-[#86868B] font-light flex items-center gap-0.5">
            <Clock size={9} strokeWidth={1.5} />
            {timeAgo(m.created_at)}
          </span>
        </div>
      </header>

      {/* Persona comment — the main text */}
      <div className={cn('mx-4 rounded-xl px-3.5 py-3', emo.bg)}>
        <p className={cn(
          'text-[15px] leading-[22px] text-[#1D1D1F]',
          isUnread ? 'font-normal' : 'font-light text-[#3C3C43]',
        )}>
          {m.persona_comment}
        </p>
        {m.hook_question && (
          <p className="mt-2 text-[13px] leading-[18px] text-[#0071E3] font-normal">
            {m.hook_question}
          </p>
        )}
      </div>

      {/* News source footer */}
      <button
        onClick={onOpenSource}
        className="block w-full text-left px-4 py-2.5 active:bg-[rgba(0,0,0,0.02)] transition-colors"
      >
        <div className="flex items-start gap-2">
          <ExternalLink size={12} strokeWidth={1.5} className="text-[#86868B] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[#86868B] font-light uppercase tracking-wider">
              {t.moments_source}{sourceLabel(m.source_url) && ` · ${sourceLabel(m.source_url)}`}
            </div>
            <div className="text-[13px] text-[#1D1D1F] font-light leading-[18px] line-clamp-2">
              {m.source_title}
            </div>
          </div>
        </div>
      </button>

      {/* Actions */}
      <footer className="flex items-center gap-1 px-2 py-1.5 border-t border-[rgba(0,0,0,0.04)]">
        {isUnread && (
          <button
            onClick={onMarkRead}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] text-[#0071E3] font-normal active:bg-[rgba(0,113,227,0.08)] rounded-lg transition-colors"
          >
            <Check size={14} strokeWidth={1.5} />
            {t.moments_mark_read}
          </button>
        )}
        <button
          onClick={onOpenChat}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] text-[#1D1D1F] font-normal active:bg-[rgba(0,0,0,0.04)] rounded-lg transition-colors"
        >
          <MessageCircle size={14} strokeWidth={1.5} />
          {t.moments_open_chat}
        </button>
        <button
          onClick={onDismiss}
          className="flex items-center justify-center w-9 h-7 text-[#86868B] active:bg-[rgba(0,0,0,0.04)] rounded-lg transition-colors"
          aria-label={t.moments_dismiss}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </footer>
    </article>
  );
}

// ── Daily limit banner (Free users) ────────────────────────
function LimitBanner({
  viewed, limit, isPaid, t,
}: {
  viewed: number; limit: number | null; isPaid: boolean; t: Record<string, string>;
}) {
  if (isPaid || limit === null) {
    if (isPaid) {
      return (
        <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-gradient-to-r from-[#FFF7F0] to-[#F5F3FF] flex items-center gap-2">
          <Sparkles size={14} strokeWidth={1.5} className="text-[#FF9500] shrink-0" />
          <span className="text-[12px] text-[#1D1D1F] font-light flex-1">
            {t.moments_daily_limit_pro.replace('{n}', String(viewed))}
          </span>
        </div>
      );
    }
    return null;
  }
  const pct = Math.min(100, (viewed / limit) * 100);
  const hitLimit = viewed >= limit;
  return (
    <div className={cn(
      'mx-4 mt-2 px-3 py-2.5 rounded-xl flex items-center gap-2.5',
      hitLimit ? 'bg-[#FFF7F0]' : 'bg-[#F5F5F7]',
    )}>
      <Lock size={14} strokeWidth={1.5} className={hitLimit ? 'text-[#FF9500]' : 'text-[#86868B]'} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-[#1D1D1F] font-light">
          {t.moments_daily_limit.replace('{n}', String(viewed)).replace('{limit}', String(limit))}
        </div>
        <div className="mt-1 h-1 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
          <div
            className={cn('h-full transition-all', hitLimit ? 'bg-[#FF9500]' : 'bg-[#0071E3]')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function MomentsPage() {
  const router = useRouter();
  const { lang } = useLangStore() as { lang: Lang };
  const t = translations[lang];
  const { toast } = useToast();

  const [data, setData] = useState<MomentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef<{ y: number; t: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api.listMoments(100);
      setData(res);
    } catch (e: any) {
      toast(e.message || 'Failed to load moments', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Mark read with optimistic update
  const handleMarkRead = async (m: MomentOut) => {
    if (m.status !== 'unread') return;
    // Optimistic
    setData((prev) => prev ? {
      ...prev,
      moments: prev.moments.map((x) => x.id === m.id ? { ...x, status: 'read' as const, read_at: new Date().toISOString() } : x),
      unread_count: Math.max(0, prev.unread_count - 1),
      daily_viewed_count: (prev.daily_viewed_count || 0) + 1,
    } : prev);
    try {
      await api.markMomentRead(m.id);
    } catch (e: any) {
      // Roll back on error
      if (e.status === 403) {
        toast(t.moments_limit_hit, 'error');
        load(false);
      } else {
        toast(e.message || 'Failed', 'error');
        load(false);
      }
    }
  };

  // Dismiss with optimistic update
  const handleDismiss = async (m: MomentOut) => {
    setData((prev) => prev ? {
      ...prev,
      moments: prev.moments.filter((x) => x.id !== m.id),
      unread_count: m.status === 'unread' ? Math.max(0, prev.unread_count - 1) : prev.unread_count,
    } : prev);
    try { await api.dismissMoment(m.id); } catch { /* no-op */ }
  };

  // Open chat with persona (mark replied)
  const handleOpenChat = async (m: MomentOut) => {
    try {
      await api.momentToChat(m.id);
    } catch { /* navigate anyway */ }
    // Mark as read in the local state too
    if (m.status === 'unread') {
      setData((prev) => prev ? {
        ...prev,
        moments: prev.moments.map((x) => x.id === m.id ? { ...x, status: 'replied' as const, read_at: new Date().toISOString() } : x),
        unread_count: Math.max(0, prev.unread_count - 1),
        daily_viewed_count: (prev.daily_viewed_count || 0) + 1,
      } : prev);
    }
    router.push(`/chat/${m.persona_id}`);
  };

  const handleOpenSource = (m: MomentOut) => {
    if (typeof window !== 'undefined') window.open(m.source_url, '_blank', 'noopener,noreferrer');
    // Also mark as read in case user goes to read it
    if (m.status === 'unread') handleMarkRead(m);
  };

  const onStoryClick = (m: MomentOut) => {
    // Scroll to the corresponding card and pulse highlight
    const el = document.getElementById(`moment-${m.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[#0071E3]');
      setTimeout(() => el.classList.remove('ring-2', 'ring-[#0071E3]'), 1500);
    }
  };

  // Pull-to-refresh (basic)
  const onTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      pullStart.current = { y: e.touches[0].clientY, t: Date.now() };
    }
  };
  const onTouchEnd = async (e: React.TouchEvent) => {
    if (!pullStart.current || !containerRef.current) return;
    const dy = e.changedTouches[0].clientY - pullStart.current.y;
    pullStart.current = null;
    if (dy > 80 && containerRef.current.scrollTop === 0) {
      setRefreshing(true);
      await load(false);
    }
  };

  // Group moments by day bucket for the feed
  const groups: { label: string; items: MomentOut[] }[] = [];
  if (data?.moments) {
    for (const m of data.moments) {
      const label = dayBucket(m.created_at, t);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.items.push(m);
      } else {
        groups.push({ label, items: [m] });
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="min-h-screen bg-[#FBFBFD] pb-20"
      style={{ maxWidth: '100vw', overflowX: 'hidden' }}
    >
      <AppBar
        title={t.moments_title}
        right={
          <button
            onClick={() => { setRefreshing(true); load(false); }}
            className="text-[#0071E3] p-1 active:scale-95 transition-transform"
            aria-label="Refresh"
          >
            <RefreshCw size={18} strokeWidth={1.5} className={refreshing ? 'animate-spin' : ''} />
          </button>
        }
      />

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-[rgba(0,0,0,0.1)] border-t-[#0071E3] animate-spin mb-3" />
          <p className="text-sm text-[#86868B] font-light">{t.loading}</p>
        </div>
      ) : !data || data.moments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-4">
            <BookUser size={28} strokeWidth={1.5} className="text-[#86868B]" />
          </div>
          <p className="text-[15px] text-[#1D1D1F] font-light max-w-[280px]">
            {t.moments_empty}
          </p>
        </div>
      ) : (
        <>
          <StoriesBar moments={data.moments} onClickMoment={onStoryClick} />
          <LimitBanner
            viewed={data.daily_viewed_count}
            limit={data.daily_viewed_limit}
            isPaid={data.is_paid}
            t={t}
          />
          {groups.map((g, gi) => (
            <section key={gi}>
              <h2 className="px-4 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-[#86868B]">
                {g.label}
              </h2>
              {g.items.map((m) => (
                <div key={m.id} id={`moment-${m.id}`} className="rounded-2xl transition-all">
                  <MomentCard
                    m={m}
                    t={t}
                    onOpenChat={() => handleOpenChat(m)}
                    onMarkRead={() => handleMarkRead(m)}
                    onDismiss={() => handleDismiss(m)}
                    onOpenSource={() => handleOpenSource(m)}
                  />
                </div>
              ))}
            </section>
          ))}
          <div className="h-6" />
        </>
      )}

      <TabBar active="moments" onTabChange={(k) => {
        if (k === 'moments') return;
        if (k === 'chat') router.push('/chats?tab=chat');
        else router.push(`/chats?tab=${k}`);
      }} />
    </div>
  );
}
