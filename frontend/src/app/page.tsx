'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { useAuthStore } from "@/lib/auth-store";
import { Layers, Globe, MessageSquare } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { personas, loadPersonas } = useAppStore();

  useEffect(() => {
    if (token) {
      loadPersonas();
    }
  }, [token, loadPersonas]);

  return (
    <div className="max-w-5xl mx-auto px-6">
      {/* Hero */}
      <div className="text-center py-32">
        <h1 className="text-6xl font-extralight tracking-[0.12em] text-[#1D1D1F] mb-6">
          Elaris
        </h1>
        <p className="text-base text-[#6E6E73] max-w-md mx-auto font-light leading-relaxed">
          Intelligence made persistent.
        </p>
        {token && (
          <div className="mt-12 flex justify-center gap-3">
            <Button size="lg" onClick={() => router.push("/personas/new")}>
              Create Persona
            </Button>
            {personas.length > 0 && (
              <Button variant="secondary" size="lg" onClick={() => router.push("/personas")}>
                View Personas
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pb-24">
        <Card className="pt-8 pb-8 flex flex-col items-center text-center px-6">
          <div className="w-10 h-10 flex items-center justify-center mb-4">
            <Layers size={22} strokeWidth={1.5} className="text-[#86868B]" />
          </div>
          <h3 className="font-light text-sm text-[#1D1D1F] mb-2 tracking-tight">Cumulative Distillation</h3>
          <p className="text-xs text-[#86868B] leading-relaxed">Upload multiple times and AI enriches the profile incrementally</p>
        </Card>
        <Card className="pt-8 pb-8 flex flex-col items-center text-center px-6">
          <div className="w-10 h-10 flex items-center justify-center mb-4">
            <Globe size={22} strokeWidth={1.5} className="text-[#86868B]" />
          </div>
          <h3 className="font-light text-sm text-[#1D1D1F] mb-2 tracking-tight">Web Search Supplement</h3>
          <p className="text-xs text-[#86868B] leading-relaxed">Auto-searches the web to build a complete three-layer knowledge system</p>
        </Card>
        <Card className="pt-8 pb-8 flex flex-col items-center text-center px-6">
          <div className="w-10 h-10 flex items-center justify-center mb-4">
            <MessageSquare size={22} strokeWidth={1.5} className="text-[#86868B]" />
          </div>
          <h3 className="font-light text-sm text-[#1D1D1F] mb-2 tracking-tight">Three Interaction Modes</h3>
          <p className="text-xs text-[#86868B] leading-relaxed">Chat, Write, and Advising — interact with virtual personas in different scenarios</p>
        </Card>
      </div>

      {/* Recent personas */}
      {token && personas.length > 0 && (
        <div className="pb-20">
          <h2 className="text-xs font-light text-[#86868B] tracking-wide uppercase mb-6">Recent Personas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {personas.slice(0, 4).map((p) => (
              <Card
                key={p.id}
                hover
                onClick={() => router.push(`/persona/${p.id}`)}
                className="pt-4 pb-4 pr-4 pl-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-light text-sm text-[#1D1D1F]">{p.name}</h3>
                    {p.description && (
                      <p className="text-xs text-[#86868B] mt-0.5 truncate">{p.description}</p>
                    )}
                  </div>
                  <span
                    className="shrink-0 text-[11px] font-light px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: p.has_soul ? "rgba(0,113,227,0.06)" : "rgba(0,0,0,0.04)",
                      color: p.has_soul ? "#0071E3" : "#86868B",
                    }}
                  >
                    {p.has_soul ? "Distilled" : "Pending"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}