"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { api, BrainstormMessageOut } from "@/lib/api";

const COLORS = ["#0071E3","#7c3aed","#22c55e","#eab308","#ec4899","#06b6d4"];

function TypeText({ text, speed = 55, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [d, setD] = useState("");
  const doneRef = useRef(false);
  useEffect(() => {
    setD("");
    doneRef.current = false;
    let i = 0;
    const t = window.setInterval(() => {
      if (i < text.length) {
        setD(text.slice(0, i + 1));
        i++;
      } else {
        window.clearInterval(t);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }
    }, speed);
    return () => { window.clearInterval(t); doneRef.current = true; };
  }, [text, speed, onDone]);
  return <>{d}{d.length < text.length && <span className="animate-pulse opacity-40">▊</span>}</>;
}

function Bubble({ name, content, ci, avatarUrl, onDone }: { name: string; content: string; ci: number; avatarUrl?: string; onDone?: () => void }) {
  const c = COLORS[ci % COLORS.length];
  return (
    <div className="flex items-end gap-2 mb-5">
      <Avatar name={name} url={avatarUrl} size="sm" className="shrink-0" />
      <div className="max-w-[78%]">
        <span className="text-[11px] font-light mb-1 block" style={{ color: c, opacity: 0.7 }}>{name}</span>
        <div className="rounded-[12px] rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light"
          style={{ backgroundColor: `${c}06`, border: `1px solid ${c}10` }}>
          <TypeText text={content} onDone={onDone} />
        </div>
      </div>
    </div>
  );
}

export default function BrainstormPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [messages, setMessages] = useState<BrainstormMessageOut[]>([]);
  const [typingIdx, setTypingIdx] = useState(-1);
  // tracks whether typing is currently happening (set by handleTypeDone)
  const isTypingRef = useRef(false);
  // tracks how many messages existed when typing MOST RECENTLY started
  // used to detect "new messages arrived while typing" vs "typing just finished"
  const typingStartedRef = useRef(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "running" | "done" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [personaMap, setPersonaMap] = useState<Record<string, {name: string; avatar_url: string | null}>>({});
  const ref = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);
  const lastCountRef = useRef(0);

  // ── Typing done: advance to next message ───────────────────────────────────
  const handleTypeDone = () => {
    isTypingRef.current = false; // MUST be set before state change
    setTypingIdx(-1);
  };

  // Effect: start / advance typing when state changes
  useEffect(() => {
    // Case 1: typing just finished (typingIdx = -1, isTypingRef just set to false)
    // → DON'T restart; wait for new messages
    if (typingIdx === -1 && !isTypingRef.current) return;

    // Case 2: new message arrived while typing (messages.length > typingStartedRef)
    // → queue it (handled by poll), don't interrupt current typing
    if (isTypingRef.current && messages.length > typingStartedRef.current) return;

    // Case 3: nothing typing && has messages → start typing from typingIdx
    if (messages.length > 0 && typingIdx >= 0) {
      isTypingRef.current = true;
    }
  }, [messages.length, typingIdx]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let waitCount = 0;
    let triggered = false;

    const doPoll = async () => {
      waitCount++;
      try {
        const d = await api.getBrainstorm(id);
        const n = d.messages.length;

        if (n > lastCountRef.current) {
          const newMsgs = d.messages.slice(lastCountRef.current);
          lastCountRef.current = n;
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const unseen = newMsgs.filter((m) => !existingIds.has(m.id));
            return [...prev, ...unseen];
          });
        }

        if (d.session.summary) { setSummary(d.session.summary); setStatus("done"); stopPoll(); return; }
        if (d.session.status === "completed" && n > 0) { setStatus("done"); stopPoll(); return; }

        if (!triggered) {
          triggered = true;
          fetch(`/api/v1/brainstorm/${id}/start-blocking`, { method: "POST" }).catch(() => {});
        }

        if (waitCount > 300) { setError("Discussion timed out"); setStatus("failed"); stopPoll(); }
      } catch {}
    };

    const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

    api.getBrainstorm(id).then(async (d) => {
      lastCountRef.current = d.messages.length;
      setMessages(d.messages);
      try {
        const allP = await api.listPersonas();
        const map: Record<string, {name: string; avatar_url: string | null}> = {};
        d.session.persona_ids.forEach((pid: string) => {
          const p = allP.find((x: any) => x.id === pid);
          if (p) map[pid] = { name: p.name, avatar_url: p.avatar_url };
        });
        setPersonaMap(map);
      } catch {}
      if (d.session.summary) { setSummary(d.session.summary); setStatus("done"); return; }
      if (d.session.status === "completed") { setStatus("done"); return; }
      if (d.session.topics.length > 0 && d.session.status === "created") {
        setStatus("running");
        pollRef.current = setInterval(doPoll, 2000);
        doPoll();
      }
    }).catch(() => router.push("/brainstorms"));

    return stopPoll;
  }, [id, router]);

  const handleExport = async (fmt: "docx") => {
    try {
      const res = await fetch(`/api/v1/brainstorm/${id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: fmt }),
      });
      if (!res.ok) { alert("Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `brainstorm.${fmt}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 10000);
    } catch (e: any) {
      alert("Export failed: " + e.message);
    }
  };

  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, typingIdx]);

  const getCi = (m: BrainstormMessageOut, i: number) => {
    if (m.persona_id) return Math.abs(m.persona_id.length) % COLORS.length;
    return i % COLORS.length;
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="shrink-0 border-b border-[rgba(0,0,0,0.06)] bg-white/95 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push("/brainstorms")} className="text-[#86868B] hover:text-[#1D1D1F] text-2xl font-light leading-none">‹</button>
          <div className="text-sm font-light flex-1 truncate">Brainstorm</div>
          {status === "running" && <span className="text-[11px] text-[#6E6E73] animate-pulse font-light">Discussing...</span>}
          {status === "done" && (
            <div className="flex gap-1">
              <button onClick={() => handleExport("docx")} className="text-[11px] text-[#86868B] hover:text-[#1D1D1F] px-2 py-1 font-light">DOCX</button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && status === "running" && (
            <div className="text-center pt-28">
              <div className="flex justify-center gap-1 mb-4">
                <div className="w-2 h-2 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:0ms]" />
                <div className="w-2 h-2 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:200ms]" />
                <div className="w-2 h-2 rounded-full bg-[#6E6E73] animate-bounce [animation-delay:400ms]" />
              </div>
              <div className="text-sm text-[#86868B] font-light">Personas are preparing for discussion...</div>
            </div>
          )}

          {messages.map((m, i) => (
            <Bubble key={m.id || i}
              name={m.sender_name || m.persona_name}
              content={m.content}
              ci={getCi(m, i)}
              avatarUrl={personaMap[m.persona_id]?.avatar_url || undefined}
              onDone={i === typingIdx ? handleTypeDone : undefined}
            />
          ))}

          {error && <div className="text-center text-sm text-red-400 py-8 font-light">⚠️ {error}</div>}

          {summary && (
            <div className="mt-6 p-5 rounded-[12px]" style={{ backgroundColor: `${COLORS[0]}06`, border: `1px solid ${COLORS[0]}15` }}>
              <div className="text-xs font-light mb-3 text-[#6E6E73] tracking-wide">Summary</div>
              <div className="text-sm text-[#1D1D1F] font-light whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {summary.split("\n").map((l: string, i: number) => {
                  if (l.startsWith("#")) return <div key={i} className="font-medium mt-2 mb-1">{l.replace(/#/g, "").trim()}</div>;
                  return <div key={i} className="mb-0.5">{l}</div>;
                })}
              </div>

              {status === "done" && (
                <div className="mt-5 space-y-3">
                  <button onClick={() => handleExport("docx")}
                    className="w-full py-3 rounded-[10px] text-sm font-light bg-[#1D1D1F] text-white hover:bg-[#2a2a2e] transition-colors">Export DOCX</button>
                  <p className="text-xs text-[#86868B] text-center font-light">To discuss a new topic, go back and create a new session</p>
                </div>
              )}
            </div>
          )}

          <div ref={ref} />
        </div>
      </div>
    </div>
  );
}