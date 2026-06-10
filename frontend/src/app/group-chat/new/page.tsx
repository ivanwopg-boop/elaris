"use client";

import { useEffect, useState } from "react";
import { useLangStore, translations, getLocalizedPresetName } from '@/lib/i18n';
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { api, PersonaOut } from "@/lib/api";

export default function NewGroupChatPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const router = useRouter();
  const [personas, setPersonas] = useState<PersonaOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listPersonas().then((ps) => { setPersonas(ps); setLoading(false); }).catch(console.error);
  }, []);

  const ready = personas.filter((p) => p.has_soul);
  const toggle = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const handleCreate = async () => {
    if (!title.trim()) { alert(t.enter_group_name); return; }
    if (selected.length < 1) { alert(t.select_at_least_one); return; }
    setCreating(true);
    try {
      const chat = await api.createGroupChat({ title: title.trim(), persona_ids: selected, persona_roles: roles });
      router.push(`/group-chat/${chat.id}`);
    } catch (e: any) { alert(t.creation_failed + ": " + e.message); }
    finally { setCreating(false); }
  };

  if (loading) return <div className="text-center py-24 text-[#86868B] text-sm font-light">{t.loading || "Loading..."}</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <button onClick={() => router.push("/group-chat")} className="text-xs text-[#86868B] font-light hover:text-[#6E6E73] mb-6">{t.back}</button>
      <h1 className="text-2xl font-extralight tracking-tight mb-10">{t.create_group_chat || "Create Group Chat"}</h1>

      <div className="space-y-6">
        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">{t.group_chat_name || "Group Chat Name"}</h3>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t.group_chat_placeholder || "E.g.: Product Brain Trust"}
            className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light" />
        </Card>

        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">{t.select_personas || "Select Personas"} <span className="text-[#86868B] font-light">{t.at_least_one || "(at least 1)"}</span></h3>
          {ready.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-[#86868B] font-light">{t.no_distilled || "No distilled personas"}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.push("/personas/new")}>{t.create_persona || "Create Persona"}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {ready.map((p) => (
                <div key={p.id}
                  className={`p-3 rounded-[10px] border transition-all cursor-pointer ${
                    selected.includes(p.id) ? "border-[#0071E3] bg-[rgba(0,113,227,0.03)]" : "border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.15)]"
                  }`}
                  onClick={() => toggle(p.id)}>
                  <div className="flex items-center gap-2">
                    <Avatar name={getLocalizedPresetName(p.name, lang)} url={p.avatar_url} size="sm" />
                    <span className="text-sm font-light text-[#1D1D1F] flex-1 truncate">{getLocalizedPresetName(p.name, lang)}</span>
                    {selected.includes(p.id) && <span className="text-xs text-[#0071E3] font-light">✓</span>}
                  </div>
                  {selected.includes(p.id) && (
                    <input value={roles[p.id] || ""} onChange={(e) => setRoles((r) => ({ ...r, [p.id]: e.target.value }))}
                      placeholder={t.role_placeholder || "Role (e.g.: Technical Advisor)"}
                      className="w-full mt-2 bg-white border border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-1.5 text-xs text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light"
                      onClick={(e) => e.stopPropagation()} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Button className="w-full" size="lg" onClick={handleCreate} loading={creating}
          disabled={!title.trim() || selected.length < 1}>
          {t.create_group_chat || "Create Group Chat"}
        </Button>
      </div>
    </div>
  );
}