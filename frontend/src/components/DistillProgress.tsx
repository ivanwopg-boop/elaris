"use client";

import React from "react";
import { Card } from "./ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { useLangStore, translations } from "@/lib/i18n";

interface DistillProgressProps {
  status: "idle" | "distilling" | "done" | "error";
  error?: string;
  version?: number;
}

export function DistillProgress({ status, error, version }: DistillProgressProps) {
  const { lang } = useLangStore();
  const t = translations[lang];

  if (status === "idle") return null;

  return (
    <Card className="text-center py-6">
      {status === "distilling" && (
        <div>
          <div className="flex justify-center mb-3">
            <Loader2 size={28} strokeWidth={1.5} className="text-[#86868B] animate-spin" />
          </div>
          <p className="text-[#1D1D1F] text-sm font-light">{t.distilling || "Distilling soul..."}</p>
          <p className="text-xs text-[#86868B] mt-1 font-light">{t.analyzing_materials}</p>
        </div>
      )}

      {status === "done" && (
        <div>
          <div className="flex justify-center mb-3">
            <Sparkles size={26} strokeWidth={1.5} className="text-[#86868B]" />
          </div>
          <p className="text-[#1D1D1F] text-sm font-light">{t.distill_success || "Distillation complete!"}</p>
          {version && <p className="text-xs text-[#0071E3] mt-1">v{version}</p>}
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