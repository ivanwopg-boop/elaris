"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLangStore, translations } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { api, PersonaDetail } from "@/lib/api";
import { ChevronLeft, Copy, Trash2, X, Check, ClipboardCheck, Share2 } from "lucide-react";

function ft(t: number) {
  if (!t) return "";
  const d = new Date(t);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function TypeText({ text, speed = 20, animate = false }: { text: string; speed?: number; animate?: boolean }) {
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

const LEVEL_LABEL = ["", "Lv1", "Lv2", "Lv3", "Lv4", "Lv5"];
const LEVEL_COLOR = ["", "#86868B", "#6B7FD6", "#D676A6", "#E8913A", "#E04A3A"];

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const convId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("conv") : null;
  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [msgs, setMsgs] = useState<{ role: string; content: string; id: string; time?: number }[]>([]);
  const [input, setInput] = useState("");
  const { lang } = useLangStore();
  const tl = translations[lang];
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [intimacy, setIntimacy] = useState<{level:number;level_name:string;xp:number;next_level_xp:number;message_count:number} | null>(null);
  const [liveContent, setLiveContent] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const liveRef = useRef("");

  // Selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (convId) {
      fetch(`/api/v1/conversations/${convId}/messages`)
        .then(r => r.json())
        .then((data) => setMsgs(data.map((m: any) => ({ role: m.role, content: m.content, id: m.id || m.role + "-" + Date.now(), time: m.created_at ? new Date(m.created_at).getTime() : undefined }))))
        .catch(() => {});
    }
    // Mark conversation as read when opened
    const urlConvId = new URLSearchParams(window.location.search).get("conv");
    if (urlConvId) {
      api.request(`/conversations/${urlConvId}/mark-read`, { method: "POST" }).catch(() => {});
    }
    api.getPersona(id).then((p) => {
      setPersona(p);
      if (!p.has_soul) {
        setBuilding(true);
        // Backend auto-distills in background — just poll until ready
        // Poll until soul is ready
        const poll = setInterval(() => {
          api.getPersona(id).then((pp) => {
            if (pp.has_soul) {
              clearInterval(poll);
              setPersona(pp);
              setBuilding(false);
              // Show greeting as first message if available
              const greet = pp.soul?._meta?.greeting || pp.souls_by_lang?.[lang]?.soul?._meta?.greeting || "";
              setMsgs(greet ? [{ role: "assistant", content: greet, id: `greeting-${Date.now()}`, time: Date.now() }] : []);
            }
          }).catch(() => {});
        }, 3000);
        setTimeout(() => clearInterval(poll), 120000);
      }
    }).catch(() => router.push("/"));
  }, [id, router, convId]);

  useEffect(() => {
    if (!id) return;
    api.getIntimacy(id as string).then(setIntimacy).catch(() => {});
  }, [id]);

  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, liveContent, sending]);

  // Auto-focus input on mount & after AI finishes (unless in select mode)
  useEffect(() => {
    if (!sending && !selectMode) {
      // small delay so mobile keyboards don't jump on page load
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [sending, selectMode]);
  useEffect(() => { liveRef.current = liveContent; }, [liveContent]);

  const send = () => {
    setStreamError(null);
    if (!input.trim() || sending) return;
    if (selectMode) return; // Don't send in select mode
    const text = input.trim(); setInput(""); setSending(true); setLiveContent("");
    esRef.current?.close();
    setMsgs((p) => [...p, { role: "user", content: text, id: `u-${Date.now()}`, time: Date.now() }]);

    const es = new EventSource(`/api/v1/chat/${id}/stream?message=${encodeURIComponent(text)}${convId ? "&conv=" + convId : ""}`);
    esRef.current = es;

    es.addEventListener("chat_message", (e) => {
      try { const ev = JSON.parse(e.data); const c = ev.content || ev.text || ""; setLiveContent(c); liveRef.current = c; } catch {}
    });

    es.addEventListener("done", (e) => {
      es.close(); setSending(false);
      let realUserMsgId = null, realAsstMsgId = null;
      try { const ev = JSON.parse(e.data); realUserMsgId = ev.user_msg_id; realAsstMsgId = ev.assistant_msg_id; } catch {}
      const c = liveRef.current;
      if (c) {
        setMsgs((p) => {
          const updated = [...p];
          // Replace temp user message ID with real one
          if (realUserMsgId) {
            const lastUser = updated.findLast(m => m.role === "user");
            if (lastUser && lastUser.id.startsWith("u-")) {
              lastUser.id = realUserMsgId;
            }
          }
          // Add assistant message with real ID
          updated.push({ role: "assistant", content: c, id: realAsstMsgId || `a-${Date.now()}`, time: Date.now() });
          return updated;
        });
        setLiveContent(""); liveRef.current = "";
      }
    });

    es.onerror = () => {
      es.close();
      setSending(false);
      setLiveContent("");
      liveRef.current = "";
      setStreamError(tl.error_occurred || "Connection lost. Please try again.");
    };
  };

  // ── Selection model ──
  //  - Desktop: double-click to enter select mode (single click = no-op)
  //  - Mobile: long-press (~500ms) to enter select mode (tap = no-op)
  //  - In select mode: any click toggles selection
  const enterSelectMode = (msgId: string) => {
    if (selectMode) {
      toggleSelect(msgId);
    } else {
      window.history.pushState({ selectMode: true }, '');
      if (navigator.vibrate) navigator.vibrate(8);
      inputRef.current?.blur();
      setSelectMode(true);
      toggleSelect(msgId);
    }
  };

  // Long-press detection (mobile)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handlePressStart = (msgId: string) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      enterSelectMode(msgId);
    }, 500);
  };
  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = (msgId: string) => {
    // Desktop single click does nothing — no more accidental select mode
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectMode) {
      toggleSelect(msgId);
    }
    // else: desktop single click = no-op (use double-click)
  };
  const handleDoubleClick = (msgId: string) => {
    if (!selectMode) enterSelectMode(msgId);
    else toggleSelect(msgId);
  };
  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    enterSelectMode(msgId);
  };

  const toggleSelect = (msgId: string) => {
    if (navigator.vibrate) navigator.vibrate(5);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
        if (next.size === 0) setSelectMode(false);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const shareSelected = async () => { const sel = msgs.filter(m => selectedIds.has(m.id)); if (!sel.length) return; const n = persona?.name || "AI"; const t = sel.map(m => m.content.slice(0, 200)).join(" | "); const text = n + ": " + t + " - Chat at elaris.ai"; if (navigator.share) { try { await navigator.share({ text }); return; } catch(e) {} } try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch(e) {} };
  const selectAll = () => {
    const allIds = msgs.map(m => m.id);
    setSelectedIds(new Set(allIds));
  };

  // Back button exits select mode first (TG-style)
  const selectModeRef = useRef(selectMode);
  selectModeRef.current = selectMode;
  useEffect(() => {
    const onPop = () => {
      if (selectModeRef.current) {
        window.history.pushState({ selectMode: true }, '');
        exitSelectMode();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  };

  const copySelected = async () => {
    const texts = msgs
      .filter(m => selectedIds.has(m.id))
      .map(m => m.content)
      .join("\n\n");

    let ok = false;
    // Try modern clipboard API first (requires HTTPS)
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(texts); ok = true; } catch {}
    }
    // Fallback for HTTP: use textarea trick
    if (!ok) {
      const ta = document.createElement("textarea");
      ta.value = texts;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); ok = true; } catch {}
      document.body.removeChild(ta);
    }

    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
    exitSelectMode();
  };

  const deleteSelected = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteSelected = async () => {
    setShowDeleteConfirm(false);
    const ids = Array.from(selectedIds);
    setMsgs(prev => prev.filter(m => !selectedIds.has(m.id)));
    exitSelectMode();
    try {
      for (const mid of ids) {
        await fetch(`/api/v1/conversations/${convId}/messages/${mid}`, { method: "DELETE" }).catch(() => {});
      }
    } catch {}
  };

  const n = persona?.name || "person";

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className={`shrink-0 border-b bg-white/95 z-20 ${selectMode ? "border-[#0071E3]" : "border-[rgba(0,0,0,0.06)]"}`}>
        {selectMode ? (
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={exitSelectMode} className="text-[#0071E3] hover:text-[#005BB5] p-1.5 -ml-1.5 rounded-full hover:bg-[rgba(0,113,227,0.06)] transition-colors">
              <X size={20} strokeWidth={1.5} />
            </button>
            <span className="bg-[#0071E3] text-white text-xs font-medium px-2.5 py-1 rounded-full">{selectedIds.size}</span>
            <span className="text-sm font-light text-[#1D1D1F]">selected</span>
            <div className="flex-1" />
            <button onClick={selectAll} className="text-xs text-[#0071E3] font-light px-2 py-1 rounded-md hover:bg-[rgba(0,113,227,0.06)] transition-colors">Select All</button>
            <button onClick={shareSelected} className="text-xs text-[#0071E3] font-light px-2 py-1 rounded-md hover:bg-[rgba(0,113,227,0.06)] transition-colors flex items-center gap-1"><Share2 size={14} strokeWidth={1.5}/>Share</button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => router.push("/chats")} className="text-[#86868B] hover:text-[#1D1D1F] p-1.5 -ml-1.5 rounded-full hover:bg-[rgba(0,0,0,0.04)] active:bg-[rgba(0,0,0,0.08)] transition-colors">
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
            <button onClick={() => router.push(`/persona/${id}`)} className="shrink-0 active:scale-95 transition-transform" title="View profile">
              <Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0" />
            </button>
            <button onClick={() => router.push(`/persona/${id}`)} className="text-sm font-light truncate text-left hover:text-[#0071E3] transition-colors" title="View profile">{n}</button><span className="text-[10px] text-[#AEAEB2] font-light shrink-0">AI persona</span>
            {intimacy && intimacy.message_count > 0 && <span className="text-[11px] font-light shrink-0 px-1.5 py-0.5 rounded-full" style={{backgroundColor:LEVEL_COLOR[intimacy.level]||LEVEL_COLOR[1],color:"#fff"}} title={intimacy.level_name}>{LEVEL_LABEL[intimacy.level]||""}</span>}
            <div className="flex-1" />
          </div>
        )}
      </header>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto px-4 py-6 ${selectMode ? "pb-32" : ""}`}>
        <div className="max-w-3xl mx-auto">
          {msgs.length === 0 && !liveContent && !building && persona?.soul?._meta?.greeting && (() => { setMsgs([{ role: "assistant", content: persona.soul._meta.greeting, id: "greeting-" + Date.now(), time: Date.now() }]); return null; })()}
          {msgs.length === 0 && !liveContent && !building && !persona?.soul?._meta?.greeting && (
            <div className="text-center pt-24">
              <p className="text-sm text-[#86868B] font-light">Start a conversation with {n}</p>
            </div>
          )}
          {building && (
            <div className="flex flex-col items-center justify-center pt-20 gap-4">
              <div className="w-10 h-10 rounded-full bg-[#F5F5F7] flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-sm text-[#1D1D1F] font-light">Preparing your conversation.</p>
              <p className="text-xs text-[#86868B] font-light">Just a moment.</p>
            </div>
          )}
          {msgs.map((m) => {
            const isSelected = selectedIds.has(m.id);
            return (
              <div
                key={m.id}
                className={`flex mb-5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                onClick={() => handleClick(m.id)}
                onDoubleClick={() => handleDoubleClick(m.id)}
                onContextMenu={(e) => handleContextMenu(e, m.id)}
                onTouchStart={() => handlePressStart(m.id)}
                onTouchEnd={handlePressEnd}
                onTouchCancel={handlePressEnd}
              >
                {m.role !== "user" && (
                  <button onClick={() => router.push(`/persona/${id}`)} className="shrink-0 self-end active:scale-95 transition-transform" title="View profile"><Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0 mr-2" /></button>
                )}
                <div
                 
                  className={`relative group max-w-[78%] rounded-[14px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light transition-all ${
                    m.role === "user"
                      ? `bg-[#1D1D1F] text-white rounded-br-[4px] ${isSelected ? "ring-2 ring-[#0071E3] ring-offset-1" : ""} ${selectMode ? "cursor-pointer active:scale-[0.97] transition-transform duration-75" : ""}`
                      : `bg-[rgba(0,0,0,0.03)] text-[#1D1D1F] border border-[rgba(0,0,0,0.06)] rounded-bl-[4px] ${isSelected ? "ring-2 ring-[#0071E3] ring-offset-1" : ""} ${selectMode ? "cursor-pointer active:scale-[0.97] transition-transform duration-75" : ""}`
                  }`}
                >
                  {m.role === "user" ? m.content : (
                    <>
                      <TypeText text={m.content} animate={false} />
                      <p className="text-[9px] text-[#ACACB2] mt-1 font-light italic opacity-60">AI-generated content</p>
                    </>
                  )}
                  {m.time && <p className={`text-[10px] mt-1 font-light ${m.role === "user" ? "opacity-40 text-white" : "text-[#ACACB2]"}`}>{ft(m.time)}</p>}
                  {selectMode && (
                    <div className={`absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center shadow-md transition-all ${
                      isSelected
                        ? "bg-[#0071E3] scale-100"
                        : "bg-white border-2 border-[#C7C7CC] scale-90"
                    }`}>
                      {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {liveContent && (
            <div className="flex justify-start mb-5">
              <button onClick={() => router.push(`/persona/${id}`)} className="shrink-0 self-end active:scale-95 transition-transform" title="View profile"><Avatar name={persona?.name || "?"} url={persona?.avatar_url} size="sm" className="shrink-0 mr-2" /></button>
              <div className="max-w-[78%] rounded-[14px] rounded-bl-[4px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-light bg-[rgba(0,0,0,0.03)] text-[#1D1D1F] border border-[rgba(0,0,0,0.06)]">
                <TypeText text={liveContent} animate={true} />
              </div>
            </div>
          )}
          {streamError && (
    <div className="fixed top-12 left-0 right-0 z-30 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs font-light text-center">
      {streamError}
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
                {tl.thinking || "Thinking..."}
              </div>
            </div>
          )}
          <div ref={ref} />
        </div>
      </div>

      {/* Footer: Selection actions or input */}
      {selectMode ? (
        <div className="shrink-0 border-t border-[rgba(0,0,0,0.06)] bg-white/95">
          <div className="max-w-3xl mx-auto px-4 py-3">
            {showDeleteConfirm ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-[#1D1D1F] font-light">Delete {selectedIds.size} message{selectedIds.size > 1 ? 's' : ''}?</p>
                <div className="flex gap-3 w-full max-w-[280px]">
                  <button onClick={confirmDeleteSelected} className="flex-1 py-2.5 rounded-xl bg-[#0071E3] text-white text-sm font-light hover:bg-[#005BB5] transition-colors">Delete</button>
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-[#F5F5F7] text-[#1D1D1F] text-sm font-light hover:bg-[#E8E8ED] transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 justify-center">
                <Button onClick={copySelected} className="flex-1 max-w-[160px] bg-[#0071E3] hover:bg-[#005BB5] text-white rounded-xl h-11 text-sm font-light">
                  {copied ? <><ClipboardCheck size={16} strokeWidth={1.5} className="mr-2" /> Copied ✓</> : <><Copy size={16} strokeWidth={1.5} className="mr-2" /> Copy ({selectedIds.size})</>}
                </Button>
                <Button onClick={deleteSelected} className="flex-1 max-w-[160px] bg-white border border-[#0071E3] text-[#0071E3] hover:bg-[rgba(0,113,227,0.05)] rounded-xl h-11 text-sm font-light">
                  <Trash2 size={16} strokeWidth={1.5} className="mr-2" /> Delete ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <footer className="shrink-0 border-t border-[rgba(0,0,0,0.06)] bg-white/95" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="max-w-3xl mx-auto px-4 py-4 flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize: reset then grow to scrollHeight (1-4 lines)
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 144) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={building ? "Building your conversation partner..." : tl.input_placeholder}
              rows={1}
              className="flex-1 resize-none bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-base text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light leading-snug" style={{ fontSize: "16px", maxHeight: "144px" }}
              disabled={sending}
            />
            <Button onClick={send} loading={sending} disabled={!input.trim() || building}>{tl.send}</Button>
          </div>
        </footer>
      )}
    </div>
  );
}
