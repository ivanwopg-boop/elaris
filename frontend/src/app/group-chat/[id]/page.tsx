"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useLangStore, translations } from '@/lib/i18n';
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { api, GroupChatOut, GroupChatMessageOut } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const COLORS = ["#0071E3","#7c3aed","#22c55e","#eab308","#ec4899","#06b6d4"];

function TypeText({ text, speed = 35, animate = false }: { text: string; speed?: number; animate?: boolean }) {
  const [d, setD] = useState(animate ? "" : text);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!animate) { setD(text); return; }
    if (doneRef.current) { setD(text); return; }
    setD("");
    let i = 0;
    const t = window.setInterval(() => {
      if (i < text.length) { setD(text.slice(0, i + 1)); i++; }
      else { window.clearInterval(t); doneRef.current = true; }
    }, speed);
    return () => window.clearInterval(t);
  }, [text, speed, animate]);
  return <span>{d}</span>;
}

function Bubble({ name, content, ci, avatarUrl, isUser, isFresh }: { name: string; content: string; ci: number; avatarUrl?: string; isUser?: boolean; isFresh?: boolean }) {
  const c = COLORS[ci % COLORS.length];
  // For user bubbles, ci is irrelevant — use a neutral grey so the bubble stays dark.
  return (
    <div className={`flex items-end gap-2 mb-5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden" style={!isUser ? { backgroundColor: `${c}10` } : {}}>
        {isUser
          ? <Avatar name={name || "Me"} url={avatarUrl} size="sm" />
          : <Avatar name={name} url={avatarUrl} size="sm" />}
      </div>
      <div className={`max-w-[78%] ${isUser ? "items-end" : ""} flex flex-col`}>
        {!isUser && <span className="text-[11px] font-light mb-1 block" style={{ color: c, opacity: 0.7 }}>{name}</span>}
        <div className={`rounded-[12px] rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light ${isUser ? "bg-[#1D1D1F] text-white rounded-br-[4px] rounded-bl-none" : ""}`}
          style={!isUser ? { backgroundColor: `${c}06`, border: `1px solid ${c}10` } : {}}>
          {isFresh ? <TypeText text={content} /> : content}
        </div>
      </div>
    </div>
  );
}

export default function GroupChatRoom() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const params = useParams(); const router = useRouter();
  const id = params.id as string;

  const [chat, setChat] = useState<GroupChatOut | null>(null);
  const [allMsgs, setAllMsgs] = useState<any[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteList, setInviteList] = useState<any[]>([]);
  const [inviting, setInviting] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [memberPersonas, setMemberPersonas] = useState<any[]>([]);
  const [personaNameMap, setPersonaNameMap] = useState<Record<string, {name: string; avatar_url?: string}>>({});
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionFilter, setMentionFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCount = useRef(0);

  // Current logged-in user (for user-bubble avatar)
  const currentUser = useAuthStore((s) => s.user);
  const userName = currentUser?.name || currentUser?.email?.split("@")[0] || "Me";
  const userAvatarUrl = currentUser?.avatar_url || undefined;

  useEffect(() => {
    api.getGroupChat(id).then(async (d) => {
      setChat(d.chat); setAllMsgs(d.messages); lastCount.current = d.messages.length;
      // Fetch all personas to get their avatar_url (the message API does not include it)
      let personaIdToAvatar: Record<string, string | null> = {};
      try {
        const allPersonas = await api.listPersonas();
        allPersonas.forEach((p: any) => { personaIdToAvatar[p.id] = p.avatar_url; });
      } catch {}
      // Build name map from API response + messages
      const nameMap: Record<string, {name: string; avatar_url?: string}> = {};
      const pnames = d.chat.persona_names || {};
      Object.entries(pnames).forEach(([pid, name]) => {
        nameMap[pid] = { name: name as string, avatar_url: personaIdToAvatar[pid] || undefined };
      });
      d.messages.forEach((m: any) => {
        if (m.sender_type === "persona" && m.sender_id && m.sender_name) {
          const existing = nameMap[m.sender_id];
          nameMap[m.sender_id] = {
            name: m.sender_name,
            avatar_url: existing?.avatar_url || personaIdToAvatar[m.sender_id] || undefined,
          };
        } else if (m.sender_type === "system" && m.sender_name) {
          const match = m.sender_name.match(/^(.+?)\s+joined/);
          if (match) { const pid = m.sender_id || m.sender_name; if (!nameMap[pid]) nameMap[pid] = { name: match[1] }; }
        }
      });
      setPersonaNameMap(nameMap);
      setFreshIds(new Set());
    }).catch(() => router.push("/chats")).finally(() => setLoading(false));
  }, [id, router]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@([\w\u4e00-\u9fa5]*)$/);
    if (atMatch) {
      setMentionFilter(atMatch[1]);
      setShowMentions(true);
      setMentionIdx(0);
    } else {
      setShowMentions(false);
    }
  }, []);

  const insertMention = (name: string) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const before = input.slice(0, cursorPos);
    const after = input.slice(cursorPos);
    const newValue = before.replace(/@[\w\u4e00-\u9fa5]*$/, `@${name} `) + after;
    setInput(newValue);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const allPersonaNames = [...new Set(
    chat?.persona_ids.map((pid: string) => (personaNameMap[pid]?.name) || pid) || []
  )];
  // Filter out UUIDs (fallback when name not yet known) but keep all real names
  // regardless of length or hyphens. UUIDs match 8-4-4-4-12 hex pattern.
  const isUuid = (n: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n);
  const filteredMentions = allPersonaNames
    .filter((n: string) => !isUuid(n))
    .filter((n: string) =>
      n.toLowerCase().includes(mentionFilter.toLowerCase())
    );

  // Scroll to bottom on initial load and when messages change
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [allMsgs.length, thinking]);
  // Scroll to bottom on initial history load
  useEffect(() => { if (allMsgs.length > 0) { setTimeout(() => ref.current?.scrollIntoView(), 50); } }, []);

  const startPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const intervalId = setInterval(async () => {
      try {
        const d = await api.getGroupChat(id);
        if (d.messages.length > lastCount.current) {
          const newMsgs = d.messages.slice(lastCount.current);
          lastCount.current = d.messages.length;
          setFreshIds((prev) => { const next = new Set(prev); newMsgs.forEach((m: any) => next.add(m.id)); return next; });
          setAllMsgs((prev) => {
            const existingIds = new Set(prev.map((m: any) => m.id));
            const unique = newMsgs.filter((m: any) => !existingIds.has(m.id));
            return [...prev, ...unique];
          });
          setPersonaNameMap((prev) => { const next = { ...prev }; newMsgs.forEach((m: any) => { if (m.sender_type === "persona" && m.sender_id && m.sender_name) { const existing = next[m.sender_id]; next[m.sender_id] = { name: m.sender_name, avatar_url: existing?.avatar_url }; } }); return next; });
          setThinking(null);
        }
      } catch {}
    }, 1000);
    pollRef.current = intervalId;
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim(); setInput(""); setSending(true); setThinking(t.waiting);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    lastCount.current += 1;
    setAllMsgs((p) => [...p, { id: `u-${Date.now()}`, sender_type: "user", sender_name: "Me", content: text }]);
    startPolling();
    try {
      await fetch(`/api/v1/group-chat/${id}/send-blocking`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const updated = await api.getGroupChat(id);
      if (updated.messages.length > lastCount.current) {
        const newMsgs = updated.messages.slice(lastCount.current);
        lastCount.current = updated.messages.length;
        setAllMsgs((prev) => {
          const existingIds = new Set(prev.map((m: any) => m.id));
          const unique = newMsgs.filter((m: any) => !existingIds.has(m.id));
          return [...prev, ...unique];
        });
      }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    } catch {}
    setSending(false); setThinking(null);
  };

  if (loading) return <div className="flex items-center justify-center flex-col" style={{ height: "100dvh" }}><p className="text-sm text-[#86868B] font-light">Loading...</p></div>;
  if (!chat) return <div className="flex items-center justify-center flex-col" style={{ height: "100dvh" }}><p className="text-sm text-[#86868B] font-light">Group chat not found</p></div>;

  return (
    <div className="flex flex-col bg-white relative" style={{ height: "100dvh" }}>
      <header className="shrink-0 border-b border-[rgba(0,0,0,0.06)] bg-white/95 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push("/chats")} className="text-[#86868B] hover:text-[#1D1D1F] text-sm font-light leading-none"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
          <div className="text-sm font-light flex-1 truncate">{chat.title}</div>
          
          <button onClick={async () => {
            const allP = await api.listPersonas();
            const inChat = new Set(chat.persona_ids);
            setInviteList(allP.filter((p: any) => !inChat.has(p.id)));
            setShowInvite(true);
          }} className="text-[11px] text-[#0071E3] hover:text-[#1D1D1F] px-2.5 py-1 border border-[rgba(0,113,227,0.2)] rounded-[8px] transition-colors font-light">{t.invite}</button>
          <button onClick={async () => {
            const allP = await api.listPersonas();
            setMemberPersonas(allP.filter((p: any) => chat.persona_ids.includes(p.id)));
            setShowMembers(true);
          }} className="text-[11px] text-[#86868B] hover:text-[#1D1D1F] px-2.5 py-1 border border-[rgba(0,0,0,0.08)] rounded-[8px] transition-colors font-light">{chat.persona_ids.length} {t.people}</button>
        </div>
      </header>

      {/* Members Panel */}
      {showMembers && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10" onClick={() => setShowMembers(false)}>
          <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-[12px] w-72 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
              <span className="text-sm font-light text-[#1D1D1F]">Group Members</span>
              <button onClick={() => setShowMembers(false)} className="text-[#86868B] hover:text-[#1D1D1F] text-sm">{t.close}</button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {memberPersonas.map((p: any) => (
                <div key={p.id} className="px-4 py-3 flex items-center gap-3 border-b border-[rgba(0,0,0,0.04)] last:border-0">
                  <Avatar name={p.name || '?'} url={p.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-light text-[#1D1D1F] truncate">{p.name}</div>
                  </div>
                  <button onClick={() => {
                    if (!confirm(`Remove {p.name} from group?`)) return;
                    api.removePersona(chat.id, p.id).then(async () => {
                      const d = await api.getGroupChat(chat.id);
                      setAllMsgs(d.messages); lastCount.current = d.messages.length;
                      setMemberPersonas((prev) => prev.filter((m: any) => m.id !== p.id));
                    }).catch((err) => alert(t.remove_failed + (err?.message || err?.detail || err)));
                  }} className="text-[11px] text-[#86868B] hover:text-red-500 px-2 py-1 rounded-[8px] border border-[rgba(0,0,0,0.08)] hover:border-red-500/30 transition-colors font-light">Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      {showInvite && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10">
          <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-[12px] w-72 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
            <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
              <span className="text-sm font-light text-[#1D1D1F]">Invite Persona</span>
              <button onClick={() => setShowInvite(false)} className="text-[#86868B] hover:text-[#1D1D1F] text-sm">{t.close}</button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {inviteList.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#86868B] font-light">No personas available to invite</div>
              ) : inviteList.map((p: any) => (
                <button
                  type="button" key={p.id}
                  onClick={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    setInviting(true);
                    api.invitePersona(chat.id, p.id)
                      .then(async () => {
                        const d = await api.getGroupChat(chat.id);
                        setChat(d.chat); setAllMsgs(d.messages); lastCount.current = d.messages.length;
                        setPersonaNameMap((prev) => ({ ...prev, [p.id]: { name: p.name, avatar_url: p.avatar_url } }));
                        setShowInvite(false);
                      })
                      .catch((err) => alert(t.invite_failed + (err?.detail || "Unknown error")))
                      .finally(() => setInviting(false));
                  }}
                  disabled={inviting}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[rgba(0,0,0,0.02)] transition-colors border-b border-[rgba(0,0,0,0.04)] last:border-0"
                >
                  <Avatar name={p.name || '?'} url={p.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-light text-[#1D1D1F] truncate">{p.name}</div>
                    <div className="text-xs text-[#86868B] font-light truncate">{p.description || ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-20" style={{ overscrollBehavior: 'contain' }}>
        <div className="max-w-3xl mx-auto">
          {allMsgs.length === 0 && (
            <div className="text-center pt-24">
              <p className="text-sm text-[#86868B] font-light">Type a message, all personas will respond together</p>
            </div>
          )}
          {allMsgs.map((m: any) => {
            const fresh = freshIds.has(m.id);
            if (m.sender_type === "user" || m.sender_name === "Me")
              return <Bubble key={m.id} name={userName} content={m.content} ci={99} avatarUrl={userAvatarUrl} isUser isFresh={fresh} />;
            if (m.sender_type === "system")
              return <div key={m.id} className="text-center text-xs text-[#86868B] py-2 italic font-light">{m.content}</div>;
            const ci = chat.persona_ids.indexOf(m.sender_id || "");
            return <Bubble key={m.id} name={m.sender_name} content={m.content} ci={ci >= 0 ? ci : 0} avatarUrl={personaNameMap[m.sender_id]?.avatar_url} isFresh={fresh} />;
          })}
          {thinking && (
            <div className="flex items-center gap-2 py-4 pl-1">
              <span className="text-sm text-[#86868B] italic font-light">{thinking}</span>
              <div className="flex gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:200ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:400ms]" />
              </div>
            </div>
          )}
          <div ref={ref} />
        </div>
      </div>

      
            <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[rgba(0,0,0,0.06)] bg-white/95" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2 items-end">
          <div className="flex-1 relative">
            {showMentions && filteredMentions.length > 0 && (
              <div className="absolute bottom-full mb-2 left-0 w-48 bg-white border border-[rgba(0,0,0,0.06)] rounded-[10px] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-20">
                {filteredMentions.slice(0, 5).map((n: string, i: number) => (
                  <button key={n} onClick={() => insertMention(n)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[rgba(0,0,0,0.02)] transition-colors font-light ${i === mentionIdx ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>
                    @{n}
                  </button>
                ))}
              </div>
            )}
            <input ref={inputRef} value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !showMentions) send();
                if (e.key === "Tab" && showMentions && filteredMentions.length > 0) { e.preventDefault(); insertMention(filteredMentions[mentionIdx]); }
                if (e.key === "ArrowDown" && showMentions) { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, filteredMentions.length - 1)); }
                if (e.key === "ArrowUp" && showMentions) { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); }
                if (e.key === "Escape") setShowMentions(false);
              }}
              placeholder={t.input_placeholder}
              className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light"
              disabled={sending} />
          </div>
          <Button onClick={send} loading={sending} disabled={!input.trim()} className="shrink-0 px-5">{t.send}</Button>
        </div>
      </footer>
    </div>
  );
}