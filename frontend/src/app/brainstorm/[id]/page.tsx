"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { api, BrainstormMessageOut } from "@/lib/api";

const COLORS = ["#0071E3","#7c3aed","#22c55e","#eab308","#ec4899","#06b6d4"];

// ── Streaming bubble ────────────────────────────────────────────────────────

type PendingMsg = {
  localId: string;
  persona_name: string;
  content: string;
  persona_id: string;
  turn: number;
};

function StreamingBubble({ msg, ci }: { msg: PendingMsg; ci: number }) {
  const c = COLORS[ci % COLORS.length];
  return (
    <div className="flex items-end gap-2 mb-5">
      <Avatar name={msg.persona_name} url={undefined} size="sm" className="shrink-0" />
      <div className="max-w-[78%]">
        <span className="text-[11px] font-light mb-1 block" style={{ color: c, opacity: 0.7 }}>{msg.persona_name}</span>
        <div className="rounded-[12px] rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light"
          style={{ backgroundColor: `${c}06`, border: `1px solid ${c}10` }}>
          {msg.content}
          <span className="animate-pulse opacity-40 ml-0.5">▊</span>
        </div>
      </div>
    </div>
  );
}

// ── Final bubble (from DB) ───────────────────────────────────────────────────

function Bubble({ name, content, ci, avatarUrl }: { name: string; content: string; ci: number; avatarUrl?: string }) {
  const c = COLORS[ci % COLORS.length];
  return (
    <div className="flex items-end gap-2 mb-5">
      <Avatar name={name} url={avatarUrl} size="sm" className="shrink-0" />
      <div className="max-w-[78%]">
        <span className="text-[11px] font-light mb-1 block" style={{ color: c, opacity: 0.7 }}>{name}</span>
        <div className="rounded-[12px] rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light"
          style={{ backgroundColor: `${c}06`, border: `1px solid ${c}10` }}>
          {content}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BrainstormPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // Final messages from DB (rendered without animation)
  const [messages, setMessages] = useState<BrainstormMessageOut[]>([]);
  // Pending/streaming messages (localId → msg data)
  const [pending, setPending] = useState<Record<string, PendingMsg>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading"|"running"|"done"|"failed">("loading");
  const [error, setError] = useState<string|null>(null);
  const [personaMap, setPersonaMap] = useState<Record<string, {name: string; avatar_url: string|null}>>({});
  const ref = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const startedRef = useRef(false);
  const lastCount = useRef(0);
  const esRef = useRef<EventSource|null>(null);

  const getCi = (m: BrainstormMessageOut | PendingMsg) =>
    m.persona_id ? Math.abs(m.persona_id.length) % COLORS.length : 0;

  // ── Start SSE & polling ──────────────────────────────────────────────────

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
        if (n > lastCount.current) {
          lastCount.current = n;
          setMessages(d.messages);
        }
        if (d.session.summary) { setSummary(d.session.summary); setStatus("done"); stopAll(); return; }
        if (d.session.status === "completed" && n > 0) { setStatus("done"); stopAll(); return; }
        if (!triggered) {
          triggered = true;
          // Fire-and-forget blocking start
          fetch(`/api/v1/brainstorm/${id}/start-blocking`, { method: "POST" }).catch(() => {});
        }
        if (waitCount > 300) { setError("Discussion timed out"); setStatus("failed"); stopAll(); }
      } catch {}
    };

    const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    const stopAll = () => { stopPoll(); esRef.current?.close(); };

    const connectSSE = () => {
      const es = new EventSource(`/api/v1/brainstorm/${id}/sse`);
      esRef.current = es;

      es.addEventListener("message", (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === "message") {
            // Final message — move from pending to DB list
            const localId = `temp-${ev.turn}-${ev.persona_name}`;
            setPending(prev => {
              const next = { ...prev };
              delete next[localId];
              return next;
            });
          }
        } catch {}
      });

      es.addEventListener("message_chunk", (e) => {
        try {
          const ev = JSON.parse(e.data);
          const localId = `temp-${ev.turn}-${ev.persona_name}`;
          setPending(prev => {
            if (!prev[localId]) {
              // First chunk — create pending bubble
              return {
                ...prev,
                [localId]: {
                  localId,
                  persona_name: ev.persona_name,
                  persona_id: ev.persona_id,
                  content: ev.content,
                  turn: ev.turn,
                },
              };
            }
            // Subsequent chunks — append
            return {
              ...prev,
              [localId]: {
                ...prev[localId],
                content: prev[localId].content + ev.content,
              },
            };
          });
        } catch {}
      });

      es.addEventListener("done", () => {
        setStatus("done");
        stopAll();
      });

      es.addEventListener("error", (e) => {
        console.warn("SSE error", e);
        // Fall back to polling only
        es.close();
        esRef.current = null;
      });
    };

    api.getBrainstorm(id).then(async (d) => {
      lastCount.current = d.messages.length;
      setMessages(d.messages);
      try {
        const allP = await api.listPersonas();
        const map: Record<string, {name: string; avatar_url: string|null}> = {};
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
        connectSSE();
        pollRef.current = setInterval(doPoll, 2000);
        doPoll();
      }
    }).catch(() => router.push("/brainstorms"));

    return stopAll;
  }, [id, router]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────

  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, Object.keys(pending).length]);

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async (fmt: "docx") => {
    try {
      const res = await fetch(`/api/v1/brainstorm/${id}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format: fmt }) });
      if (!res.ok) { alert("Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `brainstorm.${fmt}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 10000);
    } catch (e: any) { alert("Export failed: " + e.message); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const pendingList = Object.values(pending).sort((a, b) => a.turn - b.turn);

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="shrink-0 border-b border-[rgba(0,0,0,0.06)] bg-white/95 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push("/brainstorms")} className="text-[#86868B] hover:text-[#1D1D1F] text-2xl font-light leading-none">‹</button>
          <div className="text-sm font-light flex-1 truncate">Brainstorm</div>
          {status === "running" && <span className="text-[11px] text-[#6E6E73] animate-pulse font-light">Discussing...</span>}
          {status === "done" && <button onClick={() => handleExport("docx")} className="text-[11px] text-[#86868B] hover:text-[#1D1D1F] px-2 py-1 font-light">DOCX</button>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">

          {messages.length === 0 && pendingList.length === 0 && status === "running" && (
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
            <Bubble key={m.id} name={m.persona_name} content={m.content}
              ci={getCi(m)} avatarUrl={personaMap[m.persona_id]?.avatar_url || undefined} />
          ))}

          {pendingList.map((p) => (
            <StreamingBubble key={p.localId} msg={p} ci={getCi(p)} />
          ))}

          {error && <div className="text-center text-sm text-red-400 py-8 font-light">⚠️ {error}</div>}

          {summary && (
            <div className="mt-6 p-5 rounded-[12px]" style={{ backgroundColor: `${COLORS[0]}06`, border: `1px solid ${COLORS[0]}15` }}>
              <div className="text-xs font-light mb-3 text-[#6E6E73] tracking-wide">Summary</div>
              <div className="text-sm text-[#1D1D1F] font-light whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {summary.split("\n").map((l: string, i: number) =>
                  l.startsWith("#") ? <div key={i} className="font-medium mt-2 mb-1">{l.replace(/#/g, "").trim()}</div>
                    : <div key={i} className="mb-0.5">{l}</div>
                )}
              </div>
              {status === "done" && (
                <div className="mt-5 space-y-3">
                  <button onClick={() => handleExport("docx")} className="w-full py-3 rounded-[10px] text-sm font-light bg-[#1D1D1F] text-white hover:bg-[#2a2a2e] transition-colors">Export DOCX</button>
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