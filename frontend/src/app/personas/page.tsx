"use client";

import { useEffect } from "react";
import { Sparkles } from 'lucide-react';
import { useLangStore, translations, getLocalizedPresetName } from '@/lib/i18n';
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { SwipeableRow } from "@/components/SwipeableRow";
import { useAppStore } from "@/store";
import { api } from "@/lib/api";

export default function PersonaListPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const router = useRouter();
  const { personas, loading, error, loadPersonas, clearError } = useAppStore();

  useEffect(() => {
    loadPersonas(lang);
  }, [loadPersonas, lang]);

  useEffect(() => {
    if (error) {
      alert((t.load_failed || "Load failed:") + error);
      clearError();
    }
  }, [error, clearError]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-2xl font-medium tracking-tight">{t.my_personas}</h1>
        <Button onClick={() => router.push("/personas/new")}>{t.create_persona}</Button>
      </div>

      {loading && <p className="text-center text-[#86868B] text-sm font-light py-16">Loading...</p>}

      {!loading && personas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#E8E8ED] to-[#F5F5F7] flex items-center justify-center mb-6">
            <Sparkles size={40} strokeWidth={1} className="text-[#86868B]" />
          </div>
          <p className="text-lg font-medium text-[#1D1D1F] mb-2">{t.no_personas || "No personas yet"}</p>
          <p className="text-sm text-[#86868B] font-light mb-10 leading-relaxed max-w-[240px]">{t.create_first_persona || "Create your first AI persona to start chatting"}</p>
          <Button onClick={() => router.push("/personas/new")} className="active:scale-[0.98] transition-transform">{t.create_first_btn || "Create Your First Persona"}</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {personas.map((p) => (
          <SwipeableRow
            key={p.id}
            onDelete={() => {
              api.deletePersona(p.id).then(() => loadPersonas(lang)).catch((err: any) => alert((t.delete_failed || "Delete failed:") + (err?.detail || err?.message || err)));
            }}
            deleteLabel={t.delete || "Delete"}
          >
            <Card
              hover
              onClick={() => router.push(`/persona/${p.id}`)}
            >
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={getLocalizedPresetName(p.name, lang)} url={p.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-[#1D1D1F] truncate">{getLocalizedPresetName(p.name, lang)}</h3>
                  {p.has_soul && <p className="text-[11px] text-[#0071E3] font-light">{t.distilled}</p>}
                </div>
              </div>
              {p.description && (
                <p className="text-xs text-[#86868B] font-light line-clamp-2">{p.description}</p>
              )}
            </Card>
          </SwipeableRow>
        ))}
      </div>
    </div>
  );
}
