"use client";

import { useEffect, useState, useRef } from "react";
import { useLangStore, translations } from '@/lib/i18n';
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { api, PersonaDetail } from "@/lib/api";

// Store/retrieve guest messages from localStorage
function getGuestMessages(personaId: string): { role: string; content: string; id: string }[] {
  try {
    const raw = localStorage.getItem(`guest_msgs_${personaId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveGuestMessages(personaId: string, msgs: { role: string; content: string; id: string }[]) {
  localStorage.setItem(`guest_msgs_${personaId}`, JSON.stringify(msgs));
}

function TypeText({ text, speed = 35 }: { text: string; speed?: number }) {
  const [d, setD] = useState("");
  useEffect(() => {
    setD(""); let i = 0;
    const t = window.setInterval(() => {
      if (i < text.length) { setD(text.slice(0, i + 1)); i++; } else window.clearInterval(t);
    }, speed);
    return () => window.clearInterval(t);
  }, [text, speed]);
  return <>{d}{d.length < text.length && <span className="animate-pulse opacity-40">▊</span>}</>;
}

export default function GuestChatPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const params = useParams(); const router = useRouter();
  const id = params.id as string;
  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [msgs, setMsgs] = useState<{ role: string; content: string; id: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [liveContent, setLiveContent] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const liveRef = useRef("");

  // Load guest messages from localStorage on mount
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('auth-storage');
    if (t) {
      try {
        const state = JSON.parse(t).state;
        setIsLoggedIn(!!state?.token);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    const saved = getGuestMessages(id);
    if (saved.length > 0) setMsgs(saved);
  }, [id]);


  // After 5 rounds, show registration prompt (only for guests)
  useEffect(() => {
    if (msgs.length >= 10 && !isLoggedIn) {
      setShowRegisterPrompt(true);
    }
  }, [msgs.length, isLoggedIn]);

  useEffect(() => {
    if (!id) return;
    api.getPersona(id).then(setPersona).catch(() => router.push('/chats'));
  }, [id]);

  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, liveContent]);
  useEffect(() => { liveRef.current = liveContent; }, [liveContent]);

  const send = () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput(""); setSending(true); setLiveContent("");
    esRef.current?.close();

    const msgId = `u-${Date.now()}`;
    const newMsgs = [...msgs, { role: "user", content: text, id: msgId }];
    setMsgs(newMsgs);
    saveGuestMessages(id, newMsgs);

    const _token = (() => { try { const s = localStorage.getItem('auth-storage'); if (s) return JSON.parse(s).state?.token; } catch {} return null; })();
    const _params = new URLSearchParams({ message: text });
    if (_token) _params.set('token', _token);
    const es = new EventSource(`/api/v1/chat/${id}/stream?${_params.toString()}`);
    esRef.current = es;

    const appendMsg = (role: string, content: string) => {
      setMsgs(prev => {
        const updated = [...prev, { role, content, id: role === "user" ? msgId : `a-${Date.now()}` }];
        saveGuestMessages(id, updated);
        return updated;
      });
    };

    es.addEventListener("chat_message", (e) => {
      try { const ev = JSON.parse((e as any).data); const c = ev.content || ev.text || ""; setLiveContent(c); liveRef.current = c; } catch {}
    });

    es.addEventListener("error", (e) => {
      es.close(); setSending(false);
      setLiveContent(''); liveRef.current = '';
      let msg = "Request failed. Please try again.";
      try { const ev = JSON.parse((e as any).data); if (ev.message) msg = "⚠️ " + ev.message; } catch {}
    });
    es.addEventListener("done", () => {
      es.close(); setSending(false);
      const content = liveRef.current;
      if (content) {
        appendMsg("assistant", content);
        setLiveContent(""); liveRef.current = "";
      }
    });

    es.onopen = () => { /* connected */ };
    es.onerror = () => {
      es.close();
      setSending(false);
      setLiveContent('');
      liveRef.current = '';
    };
  };

  const n = persona?.name || "person";
  const t2 = translations[lang];

  return (
    <div className="flex flex-col bg-white" style={{ height: "100dvh" }}>
      <header className="shrink-0 border-b border-[rgba(0,0,0,0.06)] bg-white/95 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push("/chats")} className="text-[#86868B] hover:text-[#1D1D1F] p-1.5 -ml-1.5 rounded-full hover:bg-[rgba(0,0,0,0.04)] active:bg-[rgba(0,0,0,0.08)] transition-colors">
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0" />
          <div className="text-sm font-light flex-1 truncate">{n}</div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        <div className="max-w-3xl mx-auto p-4 space-y-4 pb-2">
          {msgs.length === 0 && !liveContent && (
            <div className="text-center py-16 text-[#86868B] text-sm font-light">
              {t2.start_conversation?.replace('{name}', n) || `Start a conversation with ${n}`}
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {m.role === "assistant" && <Avatar name={n} url={persona?.avatar_url} size="sm" />}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[#1D1D1F] text-white"
                  : "bg-[#F5F5F7] text-[#1D1D1F]"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {liveContent && (
            <div className="flex gap-3">
              <Avatar name={n} url={persona?.avatar_url} size="sm" />
              <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-[#F5F5F7] text-[#1D1D1F] text-sm leading-relaxed">
                <TypeText text={liveContent} />
              </div>
            </div>
          )}
          {sending && !liveContent && (
            <div className="flex gap-3">
              <Avatar name={n} url={persona?.avatar_url} size="sm" />
              <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-[#F5F5F7] text-[#86868B] text-sm">
                {t2.thinking || "thinking..."}
              </div>
            </div>
          )}
          <div ref={ref} />
        </div>
      </main>

      {showRegisterPrompt && (
        <div className="bg-[#F5F5F7] border-t border-[rgba(0,0,0,0.06)] px-4 py-3 flex items-center gap-3">
          <p className="flex-1 text-xs text-[#86868B] font-light">
            Sign up to save your conversations and unlock all 100+ personas
          </p>
          <a href="/register" className="px-4 py-2 rounded-full bg-[#1D1D1F] text-white text-xs font-light shrink-0">
            Sign up free
          </a>
        </div>
      )}

      <div className="h-20" /> {/* spacer for fixed footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[rgba(0,0,0,0.06)] bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <textarea
              className="flex-1 resize-none rounded-2xl border border-[rgba(0,0,0,0.1)] px-4 py-3 text-sm focus:outline-none focus:border-[#1D1D1F] transition-colors"
              placeholder={t2.type_message || "Type a message..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              disabled={sending}
            />
            <Button onClick={send} loading={sending} disabled={!input.trim()}>{t2.send || "Send"}</Button>
          </div>
        </div>
      </footer>
    </div>
  );
}