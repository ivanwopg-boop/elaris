"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useLangStore, translations, getLocalizedPresetName } from '@/lib/i18n';
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { api, PersonaDetail } from "@/lib/api";

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

export default function ChatPage() {
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
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const liveRef = useRef("");
  // Separate effect to load messages - runs after mount
  useEffect(() => {
    // Load conversation messages after component mounts (client-side only)
    const timer = setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const convId = urlParams.get('conv');
      console.log('[DEBUG] chat page loaded, convId:', convId, 'full URL:', window.location.href);
      if (convId) {
        console.log('[DEBUG] fetching messages for convId:', convId);
        api.request<any[]>(`/conversations/${convId}/messages`)
          .then(data => {
            console.log('[DEBUG] messages loaded:', data);
            if (Array.isArray(data) && data.length > 0) {
              console.log('[DEBUG] setting msgs state with', data.length, 'messages');
              setMsgs(data.map((m: any) => ({ role: m.role, content: m.content, id: m.id })));
            } else {
              console.log('[DEBUG] no messages in response');
            }
          })
          .catch((err: any) => console.error('[DEBUG] load messages failed:', err));
      } else {
        console.log('[DEBUG] no convId in URL');
      }
    }, 500); // Small delay to ensure client-side rendering
    return () => clearTimeout(timer);
  }, []);

  // Effect to load persona (separate from messages)
  useEffect(() => {
    api.getPersona(id).then(setPersona).catch(() => router.push("/"));
  }, [id, router]);
  // Scroll to bottom using the container's scrollHeight
  // Padding on the container itself ensures last message clears the fixed footer
  const scrollToBottom = () => {
    const el = msgContainerRef.current;
    if (!el) return;
    // Use setTimeout to ensure DOM has been fully rendered
    setTimeout(() => {
      el.scrollTop = el.scrollHeight + 200;
    }, 0);
  };

  useEffect(() => {
    if (msgs.length === 0) return;
    scrollToBottom();
  }, [msgs.length]);

  useEffect(() => {
    scrollToBottom();
  }, [liveContent]);

  useEffect(() => { liveRef.current = liveContent; }, [liveContent]);

  const send = () => {
    if (!input.trim() || sending) return;
    const text = input.trim(); setInput(""); setSending(true); setLiveContent("");
    esRef.current?.close();
    setMsgs((p) => [...p, { role: "user", content: text, id: `u-${Date.now()}` }]);

    const _token = (() => { try { const s = localStorage.getItem('auth-storage'); if (s) return JSON.parse(s).state?.token; } catch {} return null; })();
    const _params = new URLSearchParams({ message: text });
    if (_token) _params.set('token', _token);
    const es = new EventSource(`/api/v1/chat/${id}/stream?${_params.toString()}`);
    esRef.current = es;

    let msgKey = `u-${Date.now()}`;
    const appendMsg = (role: string, content: string) => {
      setMsgs((p) => {
        const last = p[p.length - 1];
        if (last && last.role === role && last.content === content) return p;
        return [...p, { role, content, id: role === "user" ? msgKey : `a-${Date.now()}` }];
      });
    };

    es.addEventListener("chat_message", (e) => {
      try { const ev = JSON.parse((e as any).data); const c = ev.content || ev.text || ""; setLiveContent(c); liveRef.current = c; } catch {}
    });

    es.addEventListener("error", (e) => {
      es.close(); setSending(false);
      setLiveContent(''); liveRef.current = '';
    });

    es.addEventListener("done", () => {
      es.close(); setSending(false);
      const content = liveRef.current;
      if (content) { appendMsg("assistant", content); setLiveContent(""); liveRef.current = ""; }
    });

    es.onopen = () => {};
    es.onerror = () => {
      es.close();
      setSending(false);
      setLiveContent('');
      liveRef.current = '';
    };
  };

  const n = persona?.name || "person";

  return (
    <div className="flex flex-col bg-white overflow-hidden" style={{ height: '100dvh' }}>
      <header className="shrink-0 border-b border-[rgba(0,0,0,0.06)] bg-white/95 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push("/chats")} className="text-[#86868B] hover:text-[#1D1D1F] p-1.5 -ml-1.5 rounded-full hover:bg-[rgba(0,0,0,0.04)] active:bg-[rgba(0,0,0,0.08)] transition-colors">
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0" />
          <div className="text-sm font-light flex-1 truncate">{getLocalizedPresetName(n, lang)}</div>
        </div>
      </header>

      <div ref={msgContainerRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ overscrollBehavior: 'contain', paddingBottom: 'calc(env(safe-area-inset-bottom) + 120px)', WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-3xl mx-auto">
          {msgs.length === 0 && !liveContent && (
            <div className="text-center pt-24">
              <p className="text-sm text-[#86868B] font-light">Start a conversation with {getLocalizedPresetName(n, lang)}</p>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`flex mb-5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role !== "user" && (
                <Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0 mr-2 self-end" />
              )}
              <div className={`max-w-[78%] rounded-[14px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light ${
                m.role === "user" ? "bg-[#1D1D1F] text-white rounded-br-[4px]" : "bg-[rgba(0,0,0,0.03)] text-[#1D1D1F] border border-[rgba(0,0,0,0.06)] rounded-bl-[4px]"
              }`}>
                {m.role === "user" ? m.content : <TypeText text={m.content} />}
              </div>
            </div>
          ))}
          {liveContent && (
            <div className="flex justify-start mb-5">
              <Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0 mr-2 self-end" />
              <div className="max-w-[78%] rounded-[14px] rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light bg-[rgba(0,0,0,0.03)] text-[#1D1D1F] border border-[rgba(0,0,0,0.06)]">
                <TypeText text={liveContent} />
              </div>
            </div>
          )}
          {sending && !liveContent && (
            <div className="flex justify-start mb-5">
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-[#86868B] font-light">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:200ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:400ms]" />
                </span>
                {n} Thinking...
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[rgba(0,0,0,0.06)] bg-white/95" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Type a message..."
            className="flex-1 bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light"
            disabled={sending} />
          <Button onClick={send} loading={sending} disabled={!input.trim()}>Send</Button>
        </div>
      </footer>
    </div>
  );
}