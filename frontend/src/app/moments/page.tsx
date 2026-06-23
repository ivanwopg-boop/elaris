'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink, X, MessageCircle, Check, Sparkles,
  RefreshCw, Clock, BookUser, ChevronRight,
} from 'lucide-react';
import { api, MomentOut, MomentListResponse } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import TabBar from '@/components/TabBar';
import { useLangStore, translations, type Lang } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/* ───────────────────────────────────────────────────────────────
   Design philosophy
   ───────────────────────────────────────────────────────────────
   Target: 9/10 Apple HIG (System Settings / Health / Notes grade).
   Key decisions:
   - System grouped-list background (#F2F2F7) with white cards, 12pt radius
   - 16px horizontal padding throughout (Apple's standard inset)
   - Thin hairline separators between card zones (not full borders)
   - Emotion chip as a small inline pill, not a loud badge
   - Stories bar: Apple iMessage-style circles (thin outline, no gradients)
   - Limit banner: ultra-subtle iOS Settings footer pattern
   - Actions: system-blue text buttons (iOS table-row action style)
   - No bold shadows, no Instagram gradient rings
   - Consistent 8pt spacing grid
   ─────────────────────────────────────────────────────────────── */

/* ── Emotion → subtle pill colors ──────────────────────────── */
const EMOTION_PILL: Record<string, { text: string; bg: string }> = {
  reflecting:   { text: 'text-[#5856D6]', bg: 'bg-[#F0EFFF]' },
  praising:     { text: 'text-[#34A759]', bg: 'bg-[#E8F8ED]' },
  criticizing:  { text: 'text-[#FF6B35]', bg: 'bg-[#FFF2ED]' },
  questioning:  { text: 'text-[#FF9500]', bg: 'bg-[#FFF6EB]' },
  celebrating:  { text: 'text-[#FFD60A]', bg: 'bg-[#FFFBE5]' },
};
const EMOTION_FALLBACK = { text: 'text-[#5856D6]', bg: 'bg-[#F0EFFF]' };

/* ── Helpers ────────────────────────────────────────────────── */
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

/* ── App Bar ────────────────────────────────────────────────── */
function AppBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-[#F9F9F9]/95 backdrop-blur-xl border-b border-[rgba(0,0,0,0.06)]">
      <div className="h-11 flex items-center justify-center relative px-4">
        {right && <div className="absolute right-3">{right}</div>}
        <h1 className="text-[17px] font-semibold tracking-tight text-[#000000]">
          {title}
        </h1>
      </div>
    </header>
  );
}

/* ── Stories Bar ──────────────────────────────────────────────
   iMessage / Photos Memories style: clean circles, thin outline,
   tiny unread dot. No Instagram gradient rings.
   ────────────────────────────────────────────────────────────── */
function StoriesBar({
  moments, onClickMoment,
}: {
  moments: MomentOut[];
  onClickMoment: (m: MomentOut) => void;
}) {
  const seen = new Set<string>();
  const stories: MomentOut[] = [];
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
    <div className="px-4 py-3.5">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide">
        {stories.map((m) => {
          const isUnread = m.status === 'unread';
          return (
            <button
              key={`story-${m.id}`}
              onClick={() => onClickMoment(m)}
              className="flex flex-col items-center gap-1.5 shrink-0 active:opacity-70 transition-opacity"
            >
              <div className="relative">
                <div className={cn(
                  'rounded-full p-[2px]',
                  isUnread ? 'ring-[1.5px] ring-[#1D1D1F]' : 'ring-[1px] ring-[#E5E5EA]',
                )}>
                  <Avatar
                    name={m.persona_name || '?'}
                    url={m.persona_avatar_url}
                    size="lg"
                    className="border-0"
                  />
                </div>
                {isUnread && (
                  <span className="absolute -top-0.5 -right-0.5 w-[10px] h-[10px] rounded-full bg-[#FF3B30] ring-[3px] ring-[#F9F9F9]" />
                )}
              </div>
              <span className={cn(
                'text-[10px] max-w-[56px] truncate leading-tight',
                isUnread ? 'text-[#1D1D1F] font-medium' : 'text-[#8E8E93] font-normal',
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

/* ── Limit Banner ─────────────────────────────────────────────
   iOS Settings footer pattern: ultra-subtle, no loud colors,
   no underlines. Just a quiet note with a system-blue action.
   ───────────────────────────────────────────────────────────── */
function LimitBanner({
  viewed, limit, isPaid, t,
}: {
  viewed: number; limit: number | null; isPaid: boolean; t: Record<string, string>;
}) {
  if (isPaid) {
    return (
      <div className="mx-4 mt-2 px-0 py-1.5 flex items-center justify-between">
        <span className="text-[12px] text-[#8E8E93] font-normal">
          {t.moments_daily_limit_pro.replace('{n}', String(viewed))}
        </span>
        <span className="text-[10px] text-[#8E8E93] font-medium uppercase tracking-wider">Plus</span>
      </div>
    );
  }
  if (limit === null) return null;

  const pct = Math.min(100, (viewed / limit) * 100);
  const hitLimit = viewed >= limit;

  return (
    <div className="mx-4 mt-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-[#8E8E93] font-normal">
          {t.moments_daily_limit.replace('{n}', String(viewed)).replace('{limit}', String(limit))}
        </span>
        {hitLimit && (
          <span className="text-[12px] text-[#007AFF] font-normal">
            {t.moments_upgrade}
            <span className="inline-block ml-0.5 align-middle"><ChevronRight size={12} strokeWidth={2} /></span>
          </span>
        )}
      </div>
      <div className="h-[3px] rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            hitLimit ? 'bg-[#FF9500]/70' : 'bg-[#1D1D1F]/15',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Moment Card ──────────────────────────────────────────────
   4-zone: identity | content | source | actions
   Apple grouped-table style: 12pt radius, 16px inset padding,
   hairline separators between zones, no card shadow.
   ────────────────────────────────────────────────────────────── */
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
  const pill = EMOTION_PILL[m.emotion || ''] || EMOTION_FALLBACK;
  const isUnread = m.status === 'unread';

  return (
    <article
      className={cn(
        'mx-4 my-2 rounded-[14px] bg-white border-[0.5px] transition-colors',
        isUnread
          ? 'border-[rgba(0,0,0,0.08)]'
          : 'border-[rgba(0,0,0,0.05)] bg-white/80',
      )}
    >
      {/* ═══ Zone 1: Identity ═══ */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <Avatar name={m.persona_name || '?'} url={m.persona_avatar_url} size="lg" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[16px] font-semibold text-[#000000] tracking-[-0.01em] leading-snug truncate">
            {m.persona_name}
            {isUnread && <span className="inline-block ml-1.5 mb-0.5 w-[7px] h-[7px] rounded-full bg-[#FF3B30] align-middle" />}
          </h3>
          <p className="text-[12px] text-[#8E8E93] font-normal mt-0.5 leading-tight">
            {m.watch_topic && <span className="truncate">{m.watch_topic}</span>}
            <span className="mx-1.5 text-[#D1D1D6]">·</span>
            {timeAgo(m.created_at)}
          </p>
        </div>
        <span className={cn(
          'shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em] px-2 py-1 rounded-full',
          pill.bg, pill.text,
        )}>
          {t[EMOTION_PILL_LABEL[m.emotion || '']] || m.emotion}
        </span>
      </header>

      {/* ═══ Zone 2: Content ═══ */}
      <div className="px-4 pt-1 pb-3">
        <p className={cn(
          'text-[15px] leading-[1.55] tracking-[-0.01em]',
          isUnread ? 'text-[#1D1D1F] font-normal' : 'text-[#3C3C434D] font-normal',
        )}>
          {m.persona_comment}
        </p>
        {m.hook_question && (
          <p className="mt-2.5 text-[14px] leading-[1.45] text-[#007AFF] font-normal">
            {m.hook_question}
          </p>
        )}
      </div>

      {/* ═══ Zone 3: Source ═══ */}
      <button
        onClick={onOpenSource}
        className="block w-full text-left px-4 py-2.5 border-t border-[rgba(0,0,0,0.05)] active:bg-[rgba(0,0,0,0.015)] transition-colors"
      >
        <div className="text-[10px] text-[#AEAEB2] font-medium uppercase tracking-[0.05em] mb-1">
          {sourceLabel(m.source_url) || t.moments_source}
        </div>
        <p className="text-[13px] text-[#1D1D1F]/80 font-normal leading-[18px] line-clamp-2">
          {m.source_title}
        </p>
      </button>

      {/* ═══ Zone 4: Actions ═══ */}
      <footer className="flex items-center border-t border-[rgba(0,0,0,0.05)]">
        {isUnread && (
          <button
            onClick={onMarkRead}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 text-[13px] text-[#007AFF] font-normal active:bg-[rgba(0,122,255,0.06)] rounded-bl-[14px] transition-colors"
          >
            <Check size={15} strokeWidth={2} />
            {t.moments_mark_read}
          </button>
        )}
        {isUnread && <div className="w-[0.5px] h-5 bg-[rgba(0,0,0,0.06)]" />}
        <button
          onClick={onOpenChat}
          className={cn(
            'flex items-center justify-center gap-1.5 h-10 text-[13px] text-[#3C3C43] font-normal active:bg-[rgba(0,0,0,0.03)] transition-colors',
            isUnread ? 'flex-1' : 'flex-[2] rounded-bl-[14px]',
          )}
        >
          <MessageCircle size={15} strokeWidth={1.5} />
          {t.moments_open_chat}
        </button>
        <div className="w-[0.5px] h-5 bg-[rgba(0,0,0,0.06)]" />
        <button
          onClick={onDismiss}
          className="w-10 h-10 flex items-center justify-center text-[#AEAEB2] active:bg-[rgba(0,0,0,0.03)] rounded-br-[14px] transition-colors"
          aria-label={t.moments_dismiss}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </footer>
    </article>
  );
}

/* Emotion pill → i18n label key lookup */
const EMOTION_PILL_LABEL: Record<string, string> = {
  reflecting: 'moments_emotion_reflecting',
  praising: 'moments_emotion_praising',
  criticizing: 'moments_emotion_criticizing',
  questioning: 'moments_emotion_questioning',
  celebrating: 'moments_emotion_celebrating',
};

/* ── Empty State ────────────────────────────────────────────── */
function EmptyState({ t }: { t: Record<string, string> }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-[72px] h-[72px] rounded-full bg-[#F2F2F7] flex items-center justify-center mb-5">
        <BookUser size={32} strokeWidth={1} className="text-[#AEAEB2]" />
      </div>
      <p className="text-[15px] text-[#8E8E93] font-normal leading-relaxed max-w-[260px]">
        {t.moments_empty}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-5 text-[14px] text-[#007AFF] font-normal flex items-center gap-1"
      >
        <RefreshCw size={14} strokeWidth={1.5} />
        {t.retry || "Refresh"}
      </button>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────── */
export default function MomentsPage() {
  const router = useRouter();
  const { lang } = useLangStore() as { lang: Lang };
  const t = translations[lang];
  const { toast } = useToast();

  const [data, setData] = useState<MomentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Data fetching ────────────────────────────────────── */
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

  /* ── Mark read (optimistic) ──────────────────────────── */
  const handleMarkRead = async (m: MomentOut) => {
    if (m.status !== 'unread') return;
    setData((prev) => prev ? {
      ...prev,
      moments: prev.moments.map((x) => x.id === m.id ? { ...x, status: 'read' as const, read_at: new Date().toISOString() } : x),
      unread_count: Math.max(0, prev.unread_count - 1),
      daily_viewed_count: (prev.daily_viewed_count || 0) + 1,
    } : prev);
    try {
      await api.markMomentRead(m.id);
    } catch (e: any) {
      if (e.status === 403) {
        toast(t.moments_limit_hit, 'error');
      }
      load(false);
    }
  };

  /* ── Dismiss (optimistic) ────────────────────────────── */
  const handleDismiss = async (m: MomentOut) => {
    setData((prev) => prev ? {
      ...prev,
      moments: prev.moments.filter((x) => x.id !== m.id),
      unread_count: m.status === 'unread' ? Math.max(0, prev.unread_count - 1) : prev.unread_count,
    } : prev);
    try { await api.dismissMoment(m.id); } catch { /* no-op */ }
  };

  /* ── Open chat ────────────────────────────────────────── */
  const handleOpenChat = async (m: MomentOut) => {
    try { await api.momentToChat(m.id); } catch { /* navigate anyway */ }
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

  /* ── Open source link ─────────────────────────────────── */
  const handleOpenSource = (m: MomentOut) => {
    if (typeof window !== 'undefined') window.open(m.source_url, '_blank', 'noopener,noreferrer');
    if (m.status === 'unread') handleMarkRead(m);
  };

  /* ── Story click → scroll to card ────────────────────── */
  const onStoryClick = (m: MomentOut) => {
    const el = document.getElementById(`moment-${m.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[#007AFF]/30', 'rounded-[14px]');
      setTimeout(() => el.classList.remove('ring-2', 'ring-[#007AFF]/30', 'rounded-[14px]'), 1800);
    }
  };

  /* ── Group by day bucket ──────────────────────────────── */
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
    <div ref={containerRef} className="min-h-screen bg-[#F2F2F7] pb-20" style={{ maxWidth: '100vw', overflowX: 'hidden' }}>
      <AppBar
        title={t.moments_title}
        right={
          <button
            onClick={() => { setRefreshing(true); load(false); }}
            className="w-8 h-8 flex items-center justify-center active:opacity-60 transition-opacity"
            aria-label="Refresh"
          >
            <RefreshCw size={18} strokeWidth={1.5} className={cn('text-[#007AFF]', refreshing && 'animate-spin')} />
          </button>
        }
      />

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-[18px] h-[18px] rounded-full border-[2.5px] border-[rgba(0,0,0,0.08)] border-t-[#007AFF] animate-spin mb-4" />
          <p className="text-[13px] text-[#8E8E93] font-normal">{t.loading}</p>
        </div>
      ) : !data || data.moments.length === 0 ? (
        <EmptyState t={t} />
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
              <h2 className="px-4 pt-4 pb-1.5 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-[0.06em]">
                {g.label}
              </h2>
              {g.items.map((m) => (
                <div key={m.id} id={`moment-${m.id}`} className="transition-all">
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
