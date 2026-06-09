"use client";

import { useEffect, useState } from "react";
import { useLangStore, translations } from '@/lib/i18n';
import { useRouter } from "next/navigation"
import { useToast } from "@/components/Toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/FileUploader";
import { api, PersonaOut } from "@/lib/api";

export default function NewBrainstormPage() {
  const { lang } = useLangStore();
  const { toast } = useToast();
  const t = translations[lang];
  const router = useRouter();
  const [personas, setPersonas] = useState<PersonaOut[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [maxRounds, setMaxRounds] = useState(8);
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listPersonas().then((ps) => {
      setPersonas(ps);
      setLoading(false);
    }).catch(console.error);
  }, []);

  const readyPersonas = personas.filter((p) => p.has_soul);

  const togglePersona = (id: string) => {
    setSelectedPersonas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) { toast(t.enter_title || "Please enter a title", "error"); return; }
    if (!topic.trim()) { toast(t.enter_topic || "Please enter a topic", "error"); return; }
    if (selectedPersonas.length < 2) { toast(t.select_at_least_2 || "Select at least 2 personas", "error"); return; }

    setCreating(true);
    try {
      const session = await api.createBrainstorm({
        title: title.trim(),
        topic: topic.trim(),
        persona_ids: selectedPersonas,
        persona_roles: roles,
        max_rounds: maxRounds,
      });

      if (files.length > 0) {
        await api.uploadBrainstormFiles(session.id, files);
      }

      router.push(`/brainstorm/${session.id}`);
    } catch (e: any) {
      toast((t.creation_failed || "Creation failed") + ": " + e.message, "error");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-center text-[#86868B] text-sm font-light py-24">Loading...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <button onClick={() => router.push("/brainstorms")} className="text-xs text-[#86868B] font-light hover:text-[#6E6E73] mb-6">
        {t.back}
      </button>
      <h1 className="text-2xl font-extralight tracking-tight mb-10">New Brainstorm</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: main form */}
        <div className="lg:col-span-3 space-y-5">
          <Card>
            <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">Discussion Title</h3>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g.: Product strategy brainstorm"
              className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light" />
          </Card>

          <Card>
            <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">Discussion Topic</h3>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter discussion topic, e.g.: Should we enter Southeast Asia?"
              rows={3}
              className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light resize-none" />
          </Card>

          <Card>
            <h3 className="text-xs font-light text-[#86868B] mb-2 tracking-wide">Reference Materials (optional)</h3>
            <p className="text-xs text-[#86868B] font-light mb-3 leading-relaxed">Upload related files or images and AI personas will reference these materials during discussion</p>
            <FileUploader onFilesSelected={(fs) => setFiles((prev) => [...prev, ...fs])} />
            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[#86868B] font-light">
                    <span>·</span>
                    <span className="flex-1 truncate">{f.name}</span>
                    <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 font-light">{t.close}</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#86868B] font-light">Each persona speaks in turn, </label>
              <input type="number" min={2} max={20} value={maxRounds}
                onChange={(e) => setMaxRounds(Number(e.target.value))}
                className="w-16 bg-white border border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-1.5 text-sm text-center text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] font-light" />
              <label className="text-xs text-[#86868B] font-light">rounds</label>
            </div>
          </Card>
        </div>

        {/* Right: Persona selection */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">Select Personas <span className="font-light">(at least 2)</span></h3>
            {readyPersonas.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-[#86868B] font-light">{t.no_distilled || "No distilled personas"}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.push("/personas/new")}>{t.create_persona || "Create Persona"}</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {readyPersonas.map((p) => (
                  <div key={p.id}
                    className={`p-3 rounded-[10px] border transition-all cursor-pointer ${
                      selectedPersonas.includes(p.id) ? "border-[#0071E3] bg-[rgba(0,113,227,0.03)]" : "border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.15)]"
                    }`}
                    onClick={() => togglePersona(p.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-light text-[#86868B]">·</span>
                      <span className="font-light text-sm text-[#1D1D1F]">{p.name}</span>
                      {selectedPersonas.includes(p.id) && <span className="text-xs text-[#0071E3] font-light ml-auto">✓</span>}
                    </div>
                    {selectedPersonas.includes(p.id) && (
                      <input value={roles[p.id] || ""} onChange={(e) => setRoles((r) => ({ ...r, [p.id]: e.target.value }))}
                        placeholder="Role (e.g.: Technical Expert)"
                        className="w-full mt-2 bg-white border border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-1.5 text-xs text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light"
                        onClick={(e) => e.stopPropagation()} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Button className="w-full" size="lg" onClick={handleCreate} loading={creating}
            disabled={!title.trim() || !topic.trim() || selectedPersonas.length < 2}>
            Start Brainstorm
          </Button>
        </div>
      </div>
    </div>
  );
}