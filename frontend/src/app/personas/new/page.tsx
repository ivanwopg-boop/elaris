"use client";

import { useState } from "react";
import { useLangStore, translations } from '@/lib/i18n';
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type DistillStage = "idle" | "searching" | "analyzing" | "distilling" | "done" | "error";

export default function CreatePersonaPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const router = useRouter();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [stage, setStage] = useState<DistillStage>("idle");
  const [error, setError] = useState<string>("");

  const handleDistill = async () => {
    if (!name.trim()) { alert(t.enter_name || "Please enter a name"); return; }
    if (!keywords.trim()) { alert(t.enter_keywords || "Please enter keywords to help AI search"); return; }
    setStage("searching");
    setError("");
    try {
      // 1. Create persona with name
      const persona = await api.createPersona({ name: name.trim() });

      // 2. Add keywords as background for web search query generation
      await api.addManualInput(persona.id, {
        title: keywords.trim(),
        background: keywords.trim(),
      });

      // 3. Trigger distillation — AI will auto-search using name+keywords
      setStage("analyzing");
      const result = await api.distill(persona.id, lang);

      setStage("done");
      // Add to contacts & notify tabs BEFORE navigation
      const addRes = await fetch(`/api/v1/personas/contacts/${persona.id}`, { method: "POST" });
      if (addRes.ok) {
        // Store in sessionStorage so ContactsTab catches it after navigation
        sessionStorage.setItem("pending-contact-add", JSON.stringify({ id: persona.id, name: persona.name }));
        window.dispatchEvent(new CustomEvent("contact-added", { detail: { id: persona.id, name: persona.name } }));
      }
      // Navigate to contacts tab
      setTimeout(() => router.push("/chats?tab=contacts"), 1500);
    } catch (e: any) {
      setStage("error");
      setError(e.message || (t.distill_failed || "Distillation failed"));
    }
  };

  const stageLabels: Record<DistillStage, string> = {
    idle: "",
    searching: t.stage_searching || "Searching the web for information...",
    analyzing: t.stage_analyzing || "Analyzing search results and extracting cognitive traits...",
    distilling: t.stage_distilling || "Generating persona soul...",
    done: t.stage_done || "Persona created! Redirecting...",
    error: "",
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <button onClick={() => router.push("/personas")} className="text-xs text-[#86868B] font-light hover:text-[#6E6E73] mb-6">{t.back}</button>
      <h1 className="text-2xl font-extralight tracking-tight mb-2">{t.one_click_title || "One-Click Distillation"}</h1>
      <p className="text-xs text-[#86868B] font-light mb-10">
        Enter a name and keywords. AI will search the web and create the persona automatically.
      </p>

      <div className="space-y-5">
        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">{t.name_label || "Name"} <span className="text-red-400">*</span></h3>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t.name_placeholder || "E.g., Elon Musk, 张一鸣, 稻盛和夫"}
            className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light" />
        </Card>

        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">{t.keywords_label || "Keywords"} <span className="text-red-400">*</span></h3>
          <p className="text-xs text-[#86868B] font-light mb-3 leading-relaxed">
            Describe this person in a few keywords or a short sentence. AI uses this to generate search queries.
          </p>
          <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)}
            placeholder={t.keywords_placeholder || "E.g., Tesla CEO, SpaceX founder, tech entrepreneur, born 1971, South Africa"}
            rows={4}
            className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light resize-none" />
        </Card>

        {stage !== "idle" && stage !== "done" && stage !== "error" && (
          <div className="text-center py-4">
            <div className="inline-block w-5 h-5 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-[#86868B] font-light">{stageLabels[stage]}</p>
          </div>
        )}

        {stage === "done" && (
          <div className="text-center py-4">
            <p className="text-xs text-green-600 font-light">✓ {stageLabels.done}</p>
          </div>
        )}

        {stage === "error" && (
          <div className="text-center py-4">
            <p className="text-xs text-red-500 font-light">✗ {error}</p>
            <button onClick={() => setStage("idle")} className="mt-2 text-xs text-[#0071E3] hover:underline">{t.try_again || "Try again"}</button>
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          onClick={handleDistill}
          disabled={stage !== "idle" || !name.trim() || !keywords.trim()}
          loading={stage !== "idle" && stage !== "done" && stage !== "error"}
        >
          {stage === "idle" ? (t.start_distillation || "Start Distillation") : stageLabels[stage] || (t.processing || "Processing...")}
        </Button>
      </div>
    </div>
  );
}