"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { useAppStore } from "@/store";
import { api } from "@/lib/api";

export default function PersonaListPage() {
  const router = useRouter();
  const { personas, loading, error, loadPersonas, clearError } = useAppStore();

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  useEffect(() => {
    if (error) {
      alert("Load failed: " + error);
      clearError();
    }
  }, [error, clearError]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-2xl font-extralight tracking-tight">My Personas</h1>
        <Button onClick={() => router.push("/personas/new")}>Create Persona</Button>
      </div>

      {loading && <p className="text-center text-[#86868B] text-sm font-light py-16">Loading...</p>}

      {!loading && personas.length === 0 && (
        <div className="text-center py-24">
          <p className="text-[#86868B] text-sm font-light mb-4">No personas yet</p>
          <Button onClick={() => router.push("/personas/new")}>Create Your First Persona</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {personas.map((p) => (
          <Card
            key={p.id}
            hover
            onClick={() => router.push(`/persona/${p.id}`)}
          >
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={p.name} url={p.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <h3 className="font-light text-sm text-[#1D1D1F] truncate">{p.name}</h3>
                {p.has_soul && <p className="text-[11px] text-[#0071E3] font-light">Distilled</p>}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!confirm(`Delete persona "{p.name}"? This cannot be undone.`)) return;
                  api.deletePersona(p.id).then(() => loadPersonas()).catch((err: any) => alert("DeleteFailed: " + (err?.detail || err?.message || err)));
                }}
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[#86868B] hover:text-red-500 hover:bg-red-50 transition-all text-xs font-light"
                title="DeletePersonas"
              >✕</button>
            </div>
            {p.description && (
              <p className="text-xs text-[#86868B] font-light line-clamp-2">{p.description}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}