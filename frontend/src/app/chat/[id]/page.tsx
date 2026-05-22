"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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

  useEffect(() => { api.getPersona(id).then(setPersona).catch(() => router.push("/")); }, [id, router]);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, liveContent]);

  useEffect(() => { liveRef.current = liveContent; }, [liveContent]);

  const send = () => {
    if (!input.trim() || sending) return;
    const text = input.trim(); setInput(""); setSending(true); setLiveContent("");
    esRef.current?.close();
    setMsgs((p) => [...p, { role: "user", content: text, id: `u-${Date.now()}` }]);

    const es = new EventSource(`/api/v1/chat/${id}/stream?message=${encodeURIComponent(text)}`);
    esRef.current = es;

    es.addEventListener("chat_message", (e) => {
      try { const ev = JSON.parse(e.data); const c = ev.content || ev.text || ""; setLiveContent(c); liveRef.current = c; } catch {}
    });

    es.addEventListener("done", () => {
      es.close(); setSending(false);
      const c = liveRef.current;
      if (c) {
        setMsgs((p) => [...p, { role: "assistant", content: c, id: `a-${Date.now()}` }]);
        setLiveContent(""); liveRef.current = "";
      }
    });

    es.onerror = () => { es.close(); setSending(false); };
  };

  const n = persona?.name || "person";

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="shrink-0 border-b border-[rgba(0,0,0,0.06)] bg-white/95 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push(`/persona/${id}`)} className="text-[#86868B] hover:text-[#1D1D1F] text-2xl font-light leading-none">‹</button>
          <Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0" />
          <div className="text-sm font-light flex-1 truncate">{n}</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {msgs.length === 0 && !liveContent && (
            <div className="text-center pt-24">
              <p className="text-sm text-[#86868B] font-light">Start a conversation with {n}</p>
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
          <div ref={ref} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-[rgba(0,0,0,0.06)] bg-white/95">
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