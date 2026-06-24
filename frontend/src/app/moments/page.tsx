'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, RefreshCw, BookUser } from 'lucide-react';
import { api, MomentOut, MomentListResponse } from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import TabBar from '@/components/TabBar';
import { useLangStore, translations, type Lang } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/* ── Helpers ──────────────────────────────────────────── */
function formatTime(iso: string, lang: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const zh = lang === 'zh-CN';

  if (diffMin < 1) return zh ? '刚刚' : 'now';
  if (diffMin < 60) return zh ? `${diffMin}分钟前` : `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return zh ? `${diffHr}小时前` : `${diffHr}h ago`;

  // Check if same day → show time only
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.floor((today.getTime() - dDay.getTime()) / 86400000);

  if (dayDiff === 1) {
    const time = d.toLocaleTimeString(zh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return zh ? `昨天 ${time}` : `Yesterday ${time}`;
  }

  if (dayDiff < 7) {
    const days = zh ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }

  // Older → show date
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return d.toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(zh ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function sourceHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function dayBucket(iso: string, t: Record<string, string>): string {
  const d = new Date(iso), now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((ts.getTime() - ds.getTime()) / 86400000);
  if (diff === 0) return t.pulse_today; if (diff === 1) return t.pulse_yesterday;
  if (diff < 7) return t.pulse_this_week; return t.pulse_earlier;
}

/* ── Interleave: round-robin by persona ──────────────── */
function interleaveMoments(moments: MomentOut[]): MomentOut[] {
  const groups = new Map<string, MomentOut[]>();
  for (const m of moments) {
    const g = groups.get(m.persona_id) || [];
    g.push(m); groups.set(m.persona_id, g);
  }
  for (const [, g] of groups) g.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const sorted = [...groups.entries()].sort(([,a], [,b]) =>
    new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime()
  );
  const result: MomentOut[] = [];
  const indices = new Map<string, number>();
  for (const [pid] of sorted) indices.set(pid, 0);
  while (true) {
    let added = false;
    for (const [pid, items] of sorted) {
      const i = indices.get(pid)!;
      if (i >= items.length) continue;
      result.push(items[i]);
      indices.set(pid, i + 1);
      added = true;
    }
    if (!added) break;
  }
  return result;
}

/* ── Social proof: same-article discussion ────────────── */
function buildDiscussionMap(moments: MomentOut[]): Map<string, { count: number; names: string[]; url: string }> {
  const map = new Map<string, { pids: Set<string>; names: Map<string, string> }>();
  for (const m of moments) {
    const key = m.source_url;
    const entry = map.get(key) || { pids: new Set(), names: new Map() };
    entry.pids.add(m.persona_id);
    entry.names.set(m.persona_id, m.persona_name || '?');
    map.set(key, entry);
  }
  const out = new Map<string, { count: number; names: string[]; url: string }>();
  for (const [url, entry] of map) {
    if (entry.pids.size > 1) {
      out.set(url, { count: entry.pids.size, names: [...entry.names.values()].slice(0, 3), url });
    }
  }
  return out;
}

/* ── App Bar ──────────────────────────────────────────── */
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

/* ── Moment Card — hook-first ─────────────────────────── */
function MomentCard({
  m, t, lang, discussion, onOpenChat, onOpenSource, onBecameVisible,
}: {
  m: MomentOut; t: Record<string, string>; lang: string; discussion: string | null;
  onOpenChat: () => void; onOpenSource: () => void; onBecameVisible: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const hasFired = useRef(false);

  useEffect(() => {
    if (m.status !== 'unread' || hasFired.current || !ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        const t = setTimeout(() => { if (!hasFired.current) { hasFired.current = true; onBecameVisible(); } }, 1500);
        obs.disconnect(); return () => clearTimeout(t);
      }
    }, { threshold: [0.5] });
    obs.observe(ref.current!); return () => obs.disconnect();
  }, [m.status, onBecameVisible]);


  return (
    <article ref={ref} className="mx-4 my-2 bg-white rounded-xl border border-black/5 overflow-hidden">
      {/* ── Header ──────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-1">
        <Avatar name={m.persona_name || '?'} url={m.persona_avatar_url} size="sm" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-[#576B95] truncate">{m.persona_name}</h3>
        </div>
        <span className="text-[12px] text-black/25 shrink-0">{formatTime(m.created_at, lang)}</span>
      </header>

      {/* ── Body ─────────────────────────────────── */}

      <div className="px-4 pt-1 pb-2">
        <p className="text-[16px] leading-[1.6] text-black/80 break-words">
          {m.persona_comment}
        </p>
      </div>

      {/* ── Article preview ───────────────────────── */}
      <button onClick={onOpenSource}
        className="block w-full text-left border-t border-black/5 bg-[#F6F7F9] active:bg-[#ECEEF2] transition-colors"
      >
        <div className="px-4 py-4">
          <p className="text-[15px] font-semibold text-black/85 leading-[1.5] line-clamp-2">
            {m.source_title}
          </p>
          <p className="text-[12px] text-black/35 mt-2 flex items-center gap-1">
            {sourceHost(m.source_url)}
            <span className="text-black/20 text-[13px]">→</span>
          </p>
        </div>
      </button>

      {/* ── Chat ─────────────────────────────────── */}
      <footer className="border-t border-black/5">
        {discussion && (
          <p className="px-4 pt-3 pb-1 text-[11px] text-[#576B95]/60">{discussion}</p>
        )}
        <button onClick={onOpenChat}
          className="w-full h-11 flex items-center justify-center gap-2 text-[13px] text-[#576B95] font-normal active:bg-black/[0.02] rounded-b-xl transition-colors">
          <MessageCircle size={15} strokeWidth={1.5} />
          {t.pulse_open_chat}
        </button>
      </footer>
    </article>
  );
}

/* ── Empty ──────────────────────────────────────────── */
function EmptyState({ t }: { t: Record<string, string> }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-[72px] h-[72px] rounded-full bg-black/[0.03] flex items-center justify-center mb-5">
        <BookUser size={32} strokeWidth={1} className="text-black/30" />
      </div>
      <p className="text-[15px] text-black/50 font-normal max-w-[260px]">{t.pulse_empty}</p>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────── */
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
    try { const res = await api.listMoments(100, lang); setData(res); }
    catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [toast, lang]);
  useEffect(() => { load(); }, [load]);

  /* ── Interleaved + discussion map ───── */
  const moments = data?.moments || [];
  const interleaved = useMemo(() => interleaveMoments(moments), [moments]);
  const discussionMap = useMemo(() => buildDiscussionMap(moments), [moments]);

  /* ── Handlers ───────────────────────── */
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
  const handleMarkAllRead = async () => {
    const prev = data;
    setData((prev) => prev ? { ...prev, unread_count: 0, moments: prev.moments.map((x) => ({ ...x, status: 'read' as const })) } : prev);
    try {
      await api.markAllMomentsRead();
      load(false);
    } catch {
      setData(prev);
    }
  };

  // Auto-mark first screen as read after 3s
  useEffect(() => {
    if (!data?.unread_count || data.unread_count === 0) return;
    const timer = setTimeout(() => { handleMarkAllRead(); }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenSource = (m: MomentOut) => {
    if (typeof window !== 'undefined') window.open(m.source_url, '_blank', 'noopener,noreferrer');
  };

  /* ── Group by day ────────────────────── */
  const groups: { label: string; items: MomentOut[] }[] = [];
  for (const m of interleaved) {
    const label = dayBucket(m.created_at, t);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div className="min-h-screen bg-[#EDEDED] pb-20" style={{ maxWidth: '100vw', overflowX: 'hidden' }}>
      <AppBar title={t.pulse_title}
        right={
          <div className="flex items-center gap-1">
            {data && data.unread_count > 0 && (
              <button onClick={handleMarkAllRead}
                className="text-[11px] text-[#576B95] font-normal px-2 py-1 active:opacity-60">
                {t.pulse_mark_all_read || '全部已读'}
              </button>
            )}
            <button onClick={() => { setRefreshing(true); load(false); }}
              className="w-8 h-8 flex items-center justify-center active:opacity-60" aria-label="Refresh">
              <RefreshCw size={18} strokeWidth={1.5} className={cn('text-[#576B95]', refreshing && 'animate-spin')} />
            </button>
          </div>
        }
      />

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-[18px] h-[18px] rounded-full border-[2.5px] border-black/[0.06] border-t-[#576B95] animate-spin mb-4" />
          <p className="text-[13px] text-black/50">{t.loading}</p>
        </div>
      ) : !data || interleaved.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <>
          {groups.map((g, gi) => (
            <section key={gi}>
              <h2 className="px-4 pt-5 pb-2 text-[11px] font-semibold text-black/25 uppercase tracking-[0.06em]">
                {g.label}
              </h2>
              {g.items.map((m) => {
                const disc = discussionMap.get(m.source_url);
                const discLabel = disc
                  ? `${disc.names.filter((n: string) => n !== m.persona_name).join('、')} 也在关注`
                  : null;
                return (
                  <div key={m.id}>
                    <MomentCard m={m} t={t} lang={lang} discussion={discLabel}
                      onOpenChat={() => handleOpenChat(m)}
                      onOpenSource={() => handleOpenSource(m)}
                      onBecameVisible={() => handleBecameVisible(m)}
                    />
                  </div>
                );
              })}
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
