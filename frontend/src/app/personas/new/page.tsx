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
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [personaId, setPersonaId] = useState("");

  const handleGo = async () => {
    const n = name.trim();
    if (!n) return;
    setStage("creating");
    setError("");
    try {
      // Create persona — name is both display name and search source
      const persona = await api.createPersona({ name: n, source_name: n, category: "other" });
      setPersonaId(persona.id);
      setStage("distilling");
      // Distill in current language only (faster), other lang follows async
      await api.distill(persona.id, lang);
      if (lang !== "en") {
        try { await api.distill(persona.id, "en"); } catch {}
      }
      // Navigate directly to the chat page
      router.push("/chat/" + persona.id);
    } catch (e: any) {
      setStage("error");
      setError(e.message || (t.distill_failed || "Something went wrong"));
    }
  };

  const stageText: Record<Stage, string> = {
    idle: "",
    creating: "Creating...",
    distilling: "Searching the web and building your conversation partner...",
    done: "",
    error: "",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] px-6">
      <div className="w-full max-w-[360px] text-center">
        {stage === "idle" && (
          <>
            <h1 className="text-xl font-light text-[#1D1D1F] tracking-[-0.01em] mb-2">
              Who do you want to talk to?
            </h1>
            <p className="text-xs text-[#86868B] font-light mb-8">
              Anyone you can think of.
            </p>
            <div className="relative">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleGo(); }}
                placeholder="Enter a name"
                className="w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-5 py-4 text-base text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light text-center"
              />
            </div>
            <button
              onClick={handleGo}
              disabled={!name.trim()}
              className="mt-3 w-full py-3.5 rounded-xl bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Go
            </button>
            <p className="text-[11px] text-[#AEAEB2] font-light mt-4">
              Musk · Miyazaki · Austen · Turing
            </p>
          </>
        )}

        {(stage === "creating" || stage === "distilling") && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-[#1D1D1F] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#86868B] font-light">{stageText[stage]}</p>
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
