'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, X, MessageCircle, RefreshCw, BookUser } from 'lucide-react';
import { api, MomentOut, MomentListResponse } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import TabBar from '@/components/TabBar';
import { useLangStore, translations, type Lang } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/* ── Helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const d = new Date(iso); const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now'; if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
function dayBucket(iso: string, t: Record<string, string>): string {
  const d = new Date(iso), now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((ts.getTime() - ds.getTime()) / 86400000);
  if (diff === 0) return t.moments_today; if (diff === 1) return t.moments_yesterday;
  if (diff < 7) return t.moments_this_week; return t.moments_earlier;
}
function sourceHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/* ── App Bar ────────────────────────────────────────────────── */
function AppBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-[#F9F9F9]/95 backdrop-blur-xl border-b border-[rgba(0,0,0,0.06)]">
      <div className="h-11 flex items-center justify-center relative px-4">
        {right && <div className="absolute right-3">{right}</div>}
        <h1 className="text-[17px] font-semibold tracking-tight text-[#000000]">{title}</h1>
      </div>
    </header>
  );
}

/* ── Stories Bar ──────────────────────────────────────────────
   WeChat Moments proportion: 44px avatar, 10px name, tight gap,
   hairline ring for unread, no ring for read.
   ────────────────────────────────────────────────────────────── */
function StoriesBar({ moments, onClickMoment }: { moments: MomentOut[]; onClickMoment: (m: MomentOut) => void }) {
  const seen = new Set<string>(); const stories: MomentOut[] = [];
  const sorted = [...moments].sort((a, b) => {
    if (a.status === 'unread' && b.status !== 'unread') return -1;
    if (b.status === 'unread' && a.status !== 'unread') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  for (const m of sorted) { if (seen.has(m.persona_id)) continue; seen.add(m.persona_id); stories.push(m); }
  if (stories.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <div className="flex gap-5 overflow-x-auto scrollbar-hide">
        {stories.map((m) => {
          const isUnread = m.status === 'unread';
          return (
            <button key={`story-${m.id}`} onClick={() => onClickMoment(m)}
              className="flex flex-col items-center gap-1 shrink-0 active:opacity-70 transition-opacity">
              <div className="relative">
                <div className={cn(
                  'rounded-full p-[1.5px]',
                  isUnread ? 'ring-[1.5px] ring-[#1D1D1F]' : '',
                )}>
                  <Avatar name={m.persona_name || '?'} url={m.persona_avatar_url} size="md" className="border-0" />
                </div>
                {isUnread && (
                  <span className="absolute top-0 right-0 w-[9px] h-[9px] rounded-full bg-[#FF3B30] ring-[2px] ring-[#F9F9F9]" />
                )}
              </div>
              <span className={cn('text-[10px] max-w-[52px] truncate leading-tight',
                isUnread ? 'text-[#1D1D1F] font-medium' : 'text-[#8E8E93] font-normal')}>
                {m.persona_name || '?'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Moment Card ──────────────────────────────────────────────
   WeChat Moments layout:
     [Avatar] Name  ·  time
     关于「topic」
     Comment (persona's voice)
     ↘ Hook question
     ┌──────────────────────────────┐
     │  Article Title               │  ← prominent, tappable
     │  domain.com                  │
     └──────────────────────────────┘
     [Chat]  [Dismiss]             ← only 2 actions; auto-read on view
   ────────────────────────────────────────────────────────────── */
function MomentCard({
  m, t, onOpenChat, onDismiss, onOpenSource, onBecameVisible,
}: {
  m: MomentOut; t: Record<string, string>;
  onOpenChat: () => void; onDismiss: () => void;
  onOpenSource: () => void; onBecameVisible: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const hasFired = useRef(false);
  const isUnread = m.status === 'unread';

  // Auto mark-read: when card is 60% visible for 1s
  useEffect(() => {
    if (!isUnread || hasFired.current || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          const timer = setTimeout(() => {
            if (!hasFired.current) { hasFired.current = true; onBecameVisible(); }
          }, 1200);
          obs.disconnect();
          // Cleanup timer if component unmounts before timeout
          return () => clearTimeout(timer);
        }
      },
      { threshold: [0.6] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isUnread, onBecameVisible]);

  return (
    <article ref={ref}
      className={cn(
        'mx-4 my-2 rounded-[14px] bg-white border-[0.5px] transition-colors',
        isUnread ? 'border-[rgba(0,0,0,0.08)]' : 'border-[rgba(0,0,0,0.05)] bg-white/80',
      )}
    >
      {/* ── Header: avatar + name + time ──────────────────── */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-1.5">
        <Avatar name={m.persona_name || '?'} url={m.persona_avatar_url} size="md" />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <h3 className="text-[15px] font-semibold text-[#576B95] truncate">{m.persona_name}</h3>
          <span className="text-[12px] text-[#B0B0B0] font-normal shrink-0">{timeAgo(m.created_at)}</span>
        </div>
        {isUnread && <span className="w-[7px] h-[7px] rounded-full bg-[#FF3B30] shrink-0" />}
      </header>

      {/* ── Body: comment + hook ──────────────────────────── */}
      <div className="px-4 pt-1 pb-3">
        {m.watch_topic && (
          <p className="text-[13px] text-[#8E8E93] font-normal mb-2">关于「{m.watch_topic}」</p>
        )}
        <p className={cn(
          'text-[16px] leading-[1.6] tracking-[-0.01em]',
          isUnread ? 'text-[#1D1D1F] font-normal' : 'text-[#3C3C434D] font-normal',
        )}>
          {m.persona_comment}
        </p>
        {m.hook_question && (
          <p className={cn('mt-2.5 text-[15px] leading-[1.55]', isUnread ? 'text-[#007AFF]' : 'text-[#7099CC]')}>
            <span className="select-none mr-1">↘</span>{m.hook_question}
          </p>
        )}
      </div>

      {/* ── Article preview card ──────────────────────────── */}
      <button onClick={onOpenSource}
        className="block w-full text-left mx-4 mb-3 rounded-lg border border-[rgba(0,0,0,0.06)] bg-[#F7F7F9] active:bg-[#EFEFF2] transition-colors overflow-hidden"
      >
        <div className="px-3 py-2.5">
          <p className="text-[14px] text-[#1D1D1F] font-normal leading-[1.45] line-clamp-2">
            {m.source_title}
          </p>
          <p className="text-[11px] text-[#8E8E93] font-normal mt-1 flex items-center gap-1">
            <ExternalLink size={10} strokeWidth={1.5} className="shrink-0" />
            {sourceHost(m.source_url)}
          </p>
        </div>
      </button>

      {/* ── Actions ────────────────────────────────────────── */}
      <footer className="flex items-center border-t border-[rgba(0,0,0,0.05)]">
        <button onClick={onOpenChat}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 text-[13px] text-[#576B95] font-normal active:text-[#3A5A8C] active:bg-[rgba(87,107,149,0.04)] rounded-bl-[14px] transition-colors">
          <MessageCircle size={15} strokeWidth={1.5} />
          {t.moments_open_chat}
        </button>
        <div className="w-[0.5px] h-5 bg-[rgba(0,0,0,0.06)]" />
        <button onClick={onDismiss}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 text-[13px] text-[#AEAEB2] font-normal active:text-[#8E8E93] active:bg-[rgba(0,0,0,0.03)] rounded-br-[14px] transition-colors">
          <X size={15} strokeWidth={1.5} />
          {t.moments_dismiss}
        </button>
      </footer>
    </article>
  );
}

/* ── Empty State ────────────────────────────────────────────── */
function EmptyState({ t }: { t: Record<string, string> }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-[72px] h-[72px] rounded-full bg-[#F2F2F7] flex items-center justify-center mb-5">
        <BookUser size={32} strokeWidth={1} className="text-[#AEAEB2]" />
      </div>
      <p className="text-[15px] text-[#8E8E93] font-normal leading-relaxed max-w-[260px]">{t.moments_empty}</p>
      <button onClick={() => window.location.reload()}
        className="mt-5 text-[14px] text-[#007AFF] font-normal flex items-center gap-1">
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

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try { const res = await api.listMoments(100); setData(res); }
    catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  /* ── Auto mark-read (from IntersectionObserver) ────────── */
  const handleBecameVisible = async (m: MomentOut) => {
    setData((prev) => prev ? {
      ...prev,
      moments: prev.moments.map((x) => x.id === m.id ? { ...x, status: 'read' as const, read_at: new Date().toISOString() } : x),
      unread_count: Math.max(0, prev.unread_count - 1),
    } : prev);
    try { await api.markMomentRead(m.id); } catch {}
  };

  const handleDismiss = async (m: MomentOut) => {
    setData((prev) => prev ? {
      ...prev,
      moments: prev.moments.filter((x) => x.id !== m.id),
      unread_count: m.status === 'unread' ? Math.max(0, prev.unread_count - 1) : prev.unread_count,
    } : prev);
    try { await api.dismissMoment(m.id); } catch {}
  };

  const handleOpenChat = async (m: MomentOut) => {
    try { await api.momentToChat(m.id); } catch {}
    if (m.status === 'unread') {
      setData((prev) => prev ? {
        ...prev,
        moments: prev.moments.map((x) => x.id === m.id ? { ...x, status: 'replied' as const, read_at: new Date().toISOString() } : x),
        unread_count: Math.max(0, prev.unread_count - 1),
      } : prev);
    }
    router.push(`/chat/${m.persona_id}`);
  };

  const handleOpenSource = (m: MomentOut) => {
    if (typeof window !== 'undefined') window.open(m.source_url, '_blank', 'noopener,noreferrer');
  };

  const onStoryClick = (m: MomentOut) => {
    const el = document.getElementById(`moment-${m.id}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };

  const groups: { label: string; items: MomentOut[] }[] = [];
  if (data?.moments) {
    for (const m of data.moments) {
      const label = dayBucket(m.created_at, t);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    }
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-20" style={{ maxWidth: '100vw', overflowX: 'hidden' }}>
      <AppBar title={t.moments_title}
        right={<button onClick={() => { setRefreshing(true); load(false); }}
          className="w-8 h-8 flex items-center justify-center active:opacity-60" aria-label="Refresh">
          <RefreshCw size={18} strokeWidth={1.5} className={cn('text-[#007AFF]', refreshing && 'animate-spin')} />
        </button>}
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
          {groups.map((g, gi) => (
            <section key={gi}>
              <h2 className="px-4 pt-4 pb-1.5 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-[0.06em]">{g.label}</h2>
              {g.items.map((m) => (
                <div key={m.id} id={`moment-${m.id}`}>
                  <MomentCard m={m} t={t}
                    onOpenChat={() => handleOpenChat(m)}
                    onDismiss={() => handleDismiss(m)}
                    onOpenSource={() => handleOpenSource(m)}
                    onBecameVisible={() => handleBecameVisible(m)}
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
