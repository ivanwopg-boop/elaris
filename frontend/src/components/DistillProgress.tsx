"use client";

import React, { useState } from "react";
import { Card } from "./ui/card";
import { Loader2, Sparkles, Check } from "lucide-react";
import { useLangStore, translations } from "@/lib/i18n";

interface DistillProgressProps {
  status: "idle" | "distilling" | "done" | "error";
  error?: string;
  version?: number;
  onNameConfirm?: (name: string) => void;
  defaultName?: string;
}

export function DistillProgress({ status, error, version, onNameConfirm, defaultName }: DistillProgressProps) {
  const { lang } = useLangStore();
  const t = translations[lang];
  const [customName, setCustomName] = useState("");
  const [namingDone, setNamingDone] = useState(false);

  if (status === "idle") return null;

  const trimmed = customName.trim();
  const nameTooSimilar = defaultName && trimmed.toLowerCase() === defaultName.toLowerCase();
  const nameValid = trimmed.length > 0 && !nameTooSimilar;

  const handleConfirm = () => {
    if (!nameValid || !onNameConfirm) return;
    setNamingDone(true);
    onNameConfirm(trimmed);
  };

  return (
    <Card className="text-center py-6">
      {status === "distilling" && (
        <div>
          <div className="flex justify-center mb-3">
            <Loader2 size={28} strokeWidth={1.5} className="text-[#86868B] animate-spin" />
          </div>
          <p className="text-[#1D1D1F] text-sm font-light">{t.distilling || "Forging soul..."}</p>
          <p className="text-xs text-[#86868B] mt-1 font-light">{t.analyzing_materials}</p>
        </div>
      )}

      {status === "done" && (
        <div>
          {namingDone ? (
            <>
              <div className="flex justify-center mb-3">
                <Check size={26} strokeWidth={1.5} className="text-[#34C759]" />
              </div>
              <p className="text-[#1D1D1F] text-sm font-light">{t.distill_success || "Soul forged!"}</p>
              {version && <p className="text-xs text-[#0071E3] mt-1">v{version}</p>}
            </>
          ) : (
            <>
              <div className="flex justify-center mb-3">
                <Sparkles size={26} strokeWidth={1.5} className="text-[#86868B]" />
              </div>
              <p className="text-[#1D1D1F] text-sm font-light mb-4">{t.distill_success || "Soul forged!"}</p>
              {onNameConfirm && (
                <div className="space-y-3">
                  <p className="text-xs text-[#86868B] font-light">Name your AI persona</p>
                  <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && nameValid && handleConfirm()}
                    className={`w-full bg-[#F5F5F7] border rounded-xl px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none transition-colors font-light text-center ${
                      nameTooSimilar ? "border-red-300" : "border-[rgba(0,0,0,0.1)] focus:border-[#1D1D1F]"
                    }`}
                    placeholder="Give them a unique name..."
                    autoFocus
                  />
                  {nameTooSimilar && (
                    <p className="text-xs text-red-400 font-light">This name is too similar to the source person. Choose a unique name.</p>
                  )}
                  <button
                    onClick={handleConfirm}
                    disabled={!nameValid}
                    className="w-full py-2.5 bg-[#1D1D1F] text-white hover:bg-[#3C3C3E] disabled:opacity-30 disabled:cursor-not-allowed text-sm font-light rounded-xl transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {status === "error" && (
        <div>
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-red-400 text-sm">{error || (t.distill_error || "Distillation Failed")}</p>
        </div>
      )}
    </Card>
  );
}