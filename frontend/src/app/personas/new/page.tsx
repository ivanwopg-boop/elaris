"use client";

import { useState } from "react";
import { useLangStore, translations } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Stage = "idle" | "creating" | "distilling" | "done" | "error";

export default function CreatePersonaPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const router = useRouter();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");

  const handleGo = async () => {
    const n = name.trim();
    if (!n) return;
    setStage("creating");
    setError("");
    try {
      const persona = await api.createPersona({ name: n, source_name: n, category: "other" });
      if (keywords.trim()) {
        try { await api.addManualInput(persona.id, { title: keywords.trim(), background: keywords.trim() }) } catch {}
      }
      // Fire-and-forget distillation — no waiting, no blocking
      api.distill(persona.id, lang).catch(() => {});
      if (lang !== "en") {
        api.distill(persona.id, "en").catch(() => {});
      }
      router.push("/chat/" + persona.id);
    } catch (e: any) {
      setStage("error");
      setError(e.message || (t.distill_failed || "Something went wrong"));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] px-6">
      <div className="w-full max-w-[360px] text-center">
        {stage === "idle" && (
          <>
            <h1 className="text-xl font-light text-[#1D1D1F] tracking-[-0.01em] mb-2">
              Invite someone to chat
            </h1>
            <p className="text-xs text-[#86868B] font-light mb-8 leading-relaxed">
              An icon. A legend. Someone you are curious about.
            </p>

            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && keywords.trim()) handleGo(); }}
              placeholder="Name"
              className="w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-5 py-4 text-base text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light text-center"
            />

            <textarea
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="What are they known for? (optional)"
              rows={2}
              className="mt-2 w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-5 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light resize-none text-center"
            />

            <button
              onClick={handleGo}
              disabled={!name.trim()}
              className="mt-3 w-full py-3.5 rounded-xl bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Invite
            </button>

            <p className="text-[11px] text-[#AEAEB2] font-light mt-4">
              Taylor Swift · Musk · Feynman · Jobs
            </p>
          </>
        )}

        {(stage === "creating" || stage === "distilling") && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-[#1D1D1F] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#1D1D1F] font-light">
              {stage === "creating"
                ? "Creating..."
                : "Searching the web & building your conversation partner..."}
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-red-500 font-light">{error}</p>
            <button
              onClick={() => setStage("idle")}
              className="text-sm text-[#1D1D1F] hover:underline font-light"
            >
              {t.try_again || "Try again"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
