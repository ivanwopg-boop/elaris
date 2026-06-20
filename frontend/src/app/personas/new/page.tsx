"use client";

import { useState, useEffect, useRef } from "react";
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
  const [progress, setProgress] = useState(0);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [createdPersonaId, setCreatedPersonaId] = useState<string | null>(null);
  const progressRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  // Smooth organic progress bar — never feels stuck
  useEffect(() => {
    if (stage !== "creating" && stage !== "distilling") {
      setProgress(0);
      return;
    }
    const startTime = Date.now();
    // Sigmoid curve: slow → fast → slow, naturally approaches 99%
    // Real distillation takes 70-80s, so target 80s for full curve
    const totalDuration = 80000; // 80s sigmoid midpoint
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / totalDuration, 1.5); // allow overshoot past midpoint
      // Logistic sigmoid: smooth S-curve, 0→99% over ~80s
      // k=6 gives gentle slope, midpoint at 0.4 (32s to 50%)
      const sigmoid = 99 / (1 + Math.exp(-6 * (t - 0.4)));
      // Very slow creep after 85% so it never looks frozen
      const pct = Math.min(sigmoid, 99);
      setProgress(pct);
      // Keep animating until stage changes (cleanup handles stop)
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [stage]);

  const handleGo = async () => {
    const n = name.trim();
    if (!n) return;
    setStage("creating");
    setError("");
    let persona: any = null;
    try {
      persona = await api.createPersona({ name: n, source_name: n, category: "other" });
      setCreatedPersonaId(persona.id);
      if (keywords.trim()) {
        try { await api.addManualInput(persona.id, { title: keywords.trim(), background: keywords.trim() }) } catch {}
      }
      if (searchEnabled) {
        setStage("distilling");
        // Always trigger web search first — backend requires search results
        // in web_search_results table before allowing distillation.
        try {
          const queries = [n, keywords.trim() ? `${n} ${keywords.trim()}` : n].filter(Boolean);
          await api.triggerWebSearch(persona.id, queries);
        } catch (e) {
          // Non-fatal: backend has fallback (ensure_web_search_results)
          console.warn("web search pre-trigger failed:", e);
        }
        await api.distill(persona.id, lang);
      }
      try { await api.addContact(persona.id); } catch {}
      setProgress(100);
      setStage("done");
      // Brief pause so user sees completion
      setTimeout(() => {
        router.replace("/persona/" + persona.id);
      }, 800);
    } catch (e: any) {
      setStage("error");
      let msg = e._detail || e.message || (t.distill_failed || "Something went wrong");
      if (typeof msg === 'string') {
        msg = msg.replace(/^API error \d+:\s*/, '').replace(/^Distillation failed:\s*/, '').trim();
      }
      setError(msg);
    }
  };

  const stepText = () => {
    if (stage === "creating") return lang === "zh-CN" ? "正在创建分身..." : "Creating persona...";
    if (progress < 20) return lang === "zh-CN" ? "正在搜索公开信息..." : "Searching public information...";
    if (progress < 50) return lang === "zh-CN" ? "正在分析特征与思维模式..." : "Analyzing traits and thinking patterns...";
    if (progress < 80) return lang === "zh-CN" ? "正在构建认知图谱..." : "Building cognitive profile...";
    return lang === "zh-CN" ? "即将完成..." : "Almost done...";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] px-6">
      <div className="w-full max-w-[360px] text-center">
        {stage === "idle" && (
          <>
            <h1 className="text-xl font-light text-[#1D1D1F] tracking-[-0.01em] mb-8">
              {t.create_ai_persona || "Create new AI persona"}
            </h1>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && name.trim()) handleGo(); }}
              placeholder={lang === "zh-CN" ? "人物全名" : "Full name"}
              className="w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-5 py-4 text-base text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light text-center"
            />
            <textarea
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder={lang === "zh-CN" ? "关键描述" : "Key description"}
              rows={2}
              className="mt-2 w-full bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-5 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#1D1D1F] transition-colors font-light resize-none text-center"
            />
            <button
              onClick={handleGo}
              disabled={!name.trim()}
              className="mt-3 w-full py-3.5 rounded-xl bg-[#1D1D1F] text-white text-sm font-light hover:bg-[#3C3C3E] active:bg-[#000] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {t.create_button || "Create"}
            </button>
            {/* Web search toggle */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="text-xs font-light text-[#86868B]">
                {lang === "zh-CN" ? "联网蒸馏" : "Online distill"}
              </span>
              <button
                onClick={() => setSearchEnabled(!searchEnabled)}
                className={`relative w-[26px] h-4 rounded-full transition-colors duration-200 ${searchEnabled ? "bg-[#34C759]" : "bg-[#E5E5EA]"}`}
              >
                <span className={`absolute top-[1.5px] left-[1.5px] w-[13px] h-[13px] rounded-full bg-white shadow-sm transition-transform duration-200 ${searchEnabled ? "translate-x-[10px]" : "translate-x-0"}`} />
              </button>
            </div>
            <p className="text-[10px] text-[#B0B0B5] font-light mt-5 leading-relaxed">
              {lang === "zh-CN"
                ? "所有分身均为AI模拟。不代表、未声称是、不为任何真实人物发言。不暗示任何背书。"
                : "All personas are AI simulations. They do not claim to be, speak for, or represent any real person. No endorsement is implied."}
            </p>
          </>
        )}

        {(stage === "creating" || stage === "distilling") && (
          <div className="flex flex-col items-center gap-4 w-full max-w-[280px]">
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-[#E8E8ED] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${progress > 85 ? "animate-pulse bg-gradient-to-r from-[#34C759] to-[#1D1D1F]" : "bg-gradient-to-r from-[#1D1D1F] to-[#3C3C3E]"}`}
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

            {/* Step text */}
            <p className="text-sm text-[#1D1D1F] font-light">{stepText()}</p>

            {/* Detail hint */}
            <p className="text-xs text-[#AEAEB2] font-light leading-relaxed text-center">
              {lang === "zh-CN"
                ? "AI正在搜索公开信息并构建认知图谱，请稍候。"
                : "AI is searching public information and building a cognitive profile. Please wait."}
            </p>
          </div>
        )}

        {stage === "done" && (
          <div className="flex flex-col items-center gap-4 w-full max-w-[280px]">
            <div className="w-12 h-12 rounded-full bg-[#34C759] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <p className="text-sm text-[#1D1D1F] font-light">
              {lang === "zh-CN" ? "\u5206\u8eab\u521b\u5efa\u6210\u529f\uff01" : "Persona created!"}
            </p>
            <p className="text-xs text-[#AEAEB2] font-light">
              {lang === "zh-CN" ? "\u6b63\u5728\u8df3\u8f6c..." : "Redirecting..."}
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-red-500 font-light">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={() => createdPersonaId ? router.replace("/persona/" + createdPersonaId) : setStage("idle")}
                className="text-sm px-5 py-2 rounded-xl bg-[#1D1D1F] text-white font-light hover:bg-[#3C3C3E] transition-colors"
              >
                {lang === "zh-CN" ? "查看分身" : "View Persona"}
              </button>
              <button
                onClick={() => setStage("idle")}
                className="text-sm text-[#1D1D1F] hover:underline font-light"
              >
                {t.try_again || "Try again"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
