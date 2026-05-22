"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, PersonaOut, BrainstormSessionOut } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function BrainstormsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<BrainstormSessionOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listBrainstorms().then(setSessions).catch(console.error).finally(() => setLoading(false));
  }, []);

  const statusLabel = (s: BrainstormSessionOut) => {
    switch (s.status) {
      case "created": return { text: "Pending", color: "text-[#86868B]", bg: "bg-transparent" };
      case "running": return { text: "Discussing", color: "text-[#6E6E73]", bg: "bg-transparent" };
      case "completed": return { text: "Completed", color: "text-[#86868B]", bg: "bg-transparent" };
      case "failed": return { text: "Failed", color: "text-red-400", bg: "bg-transparent" };
      default: return { text: s.status, color: "text-[#86868B]", bg: "bg-transparent" };
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-extralight tracking-tight">Brainstorm</h1>
          <p className="text-sm text-[#86868B] font-light mt-1">Multiple personas discuss a topic autonomously</p>
        </div>
        <Button onClick={() => router.push("/brainstorms/new")}>New Discussion</Button>
      </div>

      {loading && <p className="text-center text-[#86868B] text-sm font-light py-12">Loading...</p>}

      {!loading && sessions.length === 0 && (
        <div className="text-center py-24">
          <p className="text-[#86868B] text-sm font-light mb-4">No discussions yet</p>
          <Button onClick={() => router.push("/brainstorms/new")}>Start Your First Brainstorm</Button>
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((s) => {
          const st = statusLabel(s);
          return (
            <Card
              key={s.id}
              hover
              onClick={() => router.push(`/brainstorm/${s.id}`)}
              className="flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-light text-sm">{s.title}</h3>
                <p className="text-xs text-[#86868B] font-light mt-1">
                  {s.topics.map((t: any) => t.title).join(" · ")} — {formatDate(s.created_at)}
                </p>
                <p className="text-xs text-[#86868B] font-light">
                  {s.persona_ids.length} people · {s.completed_rounds}/{s.max_rounds} rounds
                  {s.message_count > 0 && ` · ${s.message_count} messages`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-light ${st.color} ${st.bg}`}>
                  {st.text}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this discussion?")) api.deleteBrainstorm(s.id).then(() => setSessions((prev) => prev.filter((x) => x.id !== s.id)));
                  }}
                  className="text-[#86868B] hover:text-red-400 text-lg font-light leading-none transition-colors"
                >
                  ×
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}