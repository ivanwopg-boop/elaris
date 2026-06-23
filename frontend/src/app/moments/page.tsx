'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, RefreshCw, BookUser, ChevronRight } from 'lucide-react';
import { api, MomentOut, MomentListResponse } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import TabBar from '@/components/TabBar';
import { useLangStore, translations, type Lang } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/* ── Helpers ──────────────────────────────────────────────── */
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

/* ── App Bar ──────────────────────────────────────────────── */
function AppBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-[#EDEDED]/95 backdrop-blur-xl border-b border-black/5">
      <div className="h-11 flex items-center justify-center relative px-4">
        {right && <div className="absolute right-3">{right}</div>}
        <h1 className="text-[17px] font-semibold tracking-tight text-black">{title}</h1>
      </div>
    </header>
  );
}

/* ── Moment Card ────────────────────────────────────────────
   Pure WeChat timeline. No gray-out, no stories bar, no
   read/unread visual difference in content. The TabBar badge
   is the only signal. Article is a compact link, not a block.
   ──────────────────────────────────────────────────────────── */
function MomentCard({
  m, t, onOpenChat, onOpenSource, onBecameVisible,
}: {
  m: MomentOut; t: Record<string, string>;
  onOpenChat: () => void; onOpenSource: () => void;
  onBecameVisible: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const hasFired = useRef(false);

  useEffect(() => {
    if (m.status !== 'unread' || hasFired.current || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        const t = setTimeout(() => { if (!hasFired.current) { hasFired.current = true; onBecameVisible(); } }, 1500);
        obs.disconnect(); return () => clearTimeout(t);
      }
    }, { threshold: [0.5] });
    obs.observe(el); return () => obs.disconnect();
  }, [m.status, onBecameVisible]);

  return (
    <article ref={ref} className="mx-4 my-2 bg-white rounded-xl border border-black/5">
      {/* ── Header ────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-1">
        <Avatar name={m.persona_name || '?'} url={m.persona_avatar_url} size="sm" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-[#576B95] truncate">{m.persona_name}</h3>
        </div>
        <span className="text-[12px] text-black/25 shrink-0">{timeAgo(m.created_at)}</span>
      </header>

      {/* ── Comment ───────────────────────────────── */}
      <div className="px-4 pt-1 pb-2">
        <p className="text-[16px] leading-[1.6] text-black/85 break-words">
          {m.persona_comment}
        </p>
        {m.hook_question && (
          <p className="mt-2 text-[15px] leading-[1.55] text-[#576B95]">
            {m.hook_question}
          </p>
        )}
      </div>

      {/* ── Article source ────────────────────────── */}
      <button onClick={onOpenSource}
        className="block w-full px-4 pb-3 active:opacity-70 transition-opacity">
        <div className="flex items-start gap-1.5">
          <ChevronRight size={14} strokeWidth={1.5} className="text-black/20 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-black/50 font-normal leading-[1.4] line-clamp-1">
              {m.source_title}
            </p>
            <p className="text-[11px] text-black/25 mt-0.5">{sourceHost(m.source_url)}</p>
          </div>
        </div>
      </button>

      {/* ── Chat ──────────────────────────────────── */}
      <footer className="border-t border-black/5">
        <button onClick={onOpenChat}
          className="w-full h-10 flex items-center justify-center gap-2 text-[13px] text-[#576B95] font-normal active:bg-black/[0.02] rounded-b-xl transition-colors">
          <MessageCircle size={15} strokeWidth={1.5} />
          {t.moments_open_chat}
        </button>
      </footer>
    </article>
  );
}

/* ── Empty ────────────────────────────────────────────────── */
function EmptyState({ t }: { t: Record<string, string> }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-[72px] h-[72px] rounded-full bg-black/[0.03] flex items-center justify-center mb-5">
        <BookUser size={32} strokeWidth={1} className="text-black/30" />
      </div>
      <p className="text-[15px] text-black/50 font-normal leading-relaxed max-w-[260px]">{t.moments_empty}</p>
      <button onClick={() => window.location.reload()}
        className="mt-5 text-[14px] text-[#576B95] font-normal flex items-center gap-1">
        <RefreshCw size={14} strokeWidth={1.5} />{t.retry || 'Refresh'}
      </button>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
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

  const handleBecameVisible = async (m: MomentOut) => {
    setData((prev) => prev ? {
      ...prev,
      moments: prev.moments.map((x) => x.id === m.id ? { ...x, status: 'read' as const, read_at: new Date().toISOString() } : x),
      unread_count: Math.max(0, prev.unread_count - 1),
    } : prev);
    try { await api.markMomentRead(m.id); } catch {}
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
    <div className="min-h-screen bg-[#EDEDED] pb-20" style={{ maxWidth: '100vw', overflowX: 'hidden' }}>
      <AppBar title={t.moments_title}
        right={<button onClick={() => { setRefreshing(true); load(false); }}
          className="w-8 h-8 flex items-center justify-center active:opacity-60" aria-label="Refresh">
          <RefreshCw size={18} strokeWidth={1.5} className={cn('text-[#576B95]', refreshing && 'animate-spin')} />
        </button>}
      />

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-[18px] h-[18px] rounded-full border-[2.5px] border-black/[0.06] border-t-[#576B95] animate-spin mb-4" />
          <p className="text-[13px] text-black/50">{t.loading}</p>
        </div>
      ) : !data || data.moments.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <>
          {groups.map((g, gi) => (
            <section key={gi}>
              <h2 className="px-4 pt-5 pb-2 text-[11px] font-semibold text-black/25 uppercase tracking-[0.06em]">
                {g.label}
              </h2>
              {g.items.map((m) => (
                <div key={m.id}>
                  <MomentCard m={m} t={t}
                    onOpenChat={() => handleOpenChat(m)}
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
