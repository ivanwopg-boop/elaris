"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SoulCard } from "@/components/SoulCard";
import { DistillProgress } from "@/components/DistillProgress";
import { Avatar } from "@/components/Avatar";
import { api, PersonaDetail, FileOut } from "@/lib/api";
import { useLangStore, translations } from "@/lib/i18n";
import { useAuthStore } from "@/lib/auth-store";

export default function PersonaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [files, setFiles] = useState<FileOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [soul, setSoul] = useState<any>(null);
  const [soulVersion, setSoulVersion] = useState<number | null>(null);
  const [distillStatus, setDistillStatus] = useState<"idle" | "distilling" | "done" | "error">("idle");
  const [distillError, setDistillError] = useState<string>();
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMsg, setUploadMsg] = useState<string>("");
  const [intimacy, setIntimacy] = useState<{level:number;level_name:string;xp:number;next_level_xp:number;message_count:number;next_level:string|null} | null>(null);
  const [activeTab, setActiveTab] = useState<"soul" | "files" | "search">("soul");
  const { lang } = useLangStore();
  const { token } = useAuthStore();
    const { toast } = useToast();
  const t = translations[lang];

  const loadData = useCallback(async () => {
    try {
      const p = await api.getPersona(id);
      setPersona(p);
      // Use soul for current language from souls_by_lang
      const langSoul = p.souls_by_lang?.[lang];
      if (langSoul?.has_soul && langSoul?.soul) {
        setSoul(langSoul.soul);
        setSoulVersion(langSoul.version);
      } else {
        // Fallback to default soul
        setSoul(p.soul || null);
        setSoulVersion(p.soul_version ?? null);
      }
      api.getIntimacy(id).then(setIntimacy).catch(() => {});
      const f = await api.listFiles(id);
      setFiles(f);
    } catch (e: any) {
      toast((t.load_failed || "Load failed: ") + e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [id, lang]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!persona || !persona.has_soul) return;
    const langSoul = persona.souls_by_lang?.[lang];
    if (langSoul?.has_soul) return;
    const interval = setInterval(async () => {
      try {
        const p = await api.getPersona(id);
        setPersona(p);
        const ls = p.souls_by_lang?.[lang];
        if (ls?.has_soul && ls?.soul) {
          setSoul(ls.soul);
          setSoulVersion(ls.version);
          setDistillStatus("done");
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [persona?.has_soul, persona?.id, lang]);

  const handleDistill = async () => {
    setDistillStatus("distilling");
    setDistillError(undefined);
    try {
      const result = await api.distill(id, lang);
      setSoul(result.soul);
      setSoulVersion(result.version);
      setDistillStatus("done");
      loadData();
    } catch (e: any) {
      setDistillStatus("error");
      setDistillError(e.message);
    }
  };

  const handleNameConfirm = async (displayName: string) => {
    try {
      await api.updatePersona(id, { name: displayName });
      loadData();
    } catch (e: any) {
      // name update failed silently — still shows the old name
    }
  };

  const handleUploadFiles = async (newFiles: File[], urls: string[]) => {
    if (newFiles.length === 0 && urls.length === 0) return;
    setUploadStatus("uploading");
    setUploadMsg("");
    try {
      const result = await api.uploadFiles(id, newFiles, []);
      const count = result.files.length;
      const failed = result.files.filter((f: any) => f.parsed_content?.startsWith("[not supported")).length;
      if (failed > 0) {
        setUploadMsg(`Uploaded ${count - failed} files, {failed} format not supported`);
        setUploadStatus("done");
      } else {
        setUploadMsg(`Upload done! {count} files`);
        setUploadStatus("done");
      }
      loadData();
    } catch (e: any) {
      setUploadMsg((t.upload_failed || "Upload failed: ") + (e?.message || e?.detail || "Unknown error"));
      setUploadStatus("error");
    }
  };

  const handleManualInput = async (fields: Record<string, string>) => {
    try {
      await api.addManualInput(id, fields);
      toast(t.saved, "success");
    } catch (e: any) {
      toast((t.save_failed || "Save failed: ") + e.message, "error");
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm(t.delete_confirm)) return;
    try {
      await api.deleteFile(id, fileId);
      loadData();
    } catch (e: any) {
      toast((t.delete || "Delete") + " failed: " + e.message, "error");
    }
  };

if (loading) {
    return <div className="text-center text-[#86868B] text-sm font-light py-24">{t.loading}</div>;
  }

  if (!persona) {
    return <div className="text-center text-[#86868B] text-sm font-light py-24">{t.persona_not_found}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-10">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <Avatar name={persona.name} url={persona.avatar_url} size="lg" className="w-16 h-16 text-2xl" />
            {persona.source_name && (
              <span className="absolute -bottom-0.5 -right-0.5 px-1.5 py-0.5 rounded-full bg-[#0071E3] text-white text-[9px] font-medium leading-none border-2 border-white z-10">AI</span>
            )}
            <label className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center cursor-pointer transition-opacity">
              <span className="text-white text-xs font-light">{t.edit}</span>
              <input type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const res = await api.uploadAvatar(id, file);
                    setPersona((p) => p ? { ...p, avatar_url: res.avatar_url } : p);
                  } catch (err: any) { toast((t.upload_failed || "Upload failed") + ": " + (err?.detail || err?.message || err), "error"); }
                }} />
            </label>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">{persona.name}</h1>
            <p className="text-xs text-[#AEAEB2] font-light mt-0.5">AI persona · Not the real person</p>
            {persona.description && !soul && <p className="text-sm text-[#86868B] font-light mt-1 hidden">{persona.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" className="sm:size-md" onClick={() => window.location.href = token ? `/chat/${id}` : '/login'}>{t.chat || "Chat"}</Button>
        </div>
      </div>

      {/* Intimacy Progress */}
      {intimacy && intimacy.message_count > 0 && (
        <div className="max-w-2xl mx-auto px-4 pb-2">
          {(() => {
            const thresholds = [0, 100, 500, 2000, 5000];
            const level = intimacy.level || 1;
            const curXP = intimacy.xp || 0;
            const levelStart = thresholds[Math.min(level - 1, 4)];
            const levelEnd = thresholds[Math.min(level, 5)];
            const totalXP = levelEnd - levelStart;
            const progressXP = Math.max(0, curXP - levelStart);
            const pct = level >= 5 ? 100 : Math.min(100, Math.round((progressXP / totalXP) * 100));
            return (
              <div className="rounded-xl bg-white border border-[rgba(0,0,0,0.06)] px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[#1D1D1F]">Relationship Level {level}/5 — {intimacy.level_name}</span>
                  <span className="text-[10px] text-[#AEAEB2] font-light">{curXP} XP · {intimacy.message_count || 0} chats</span>
                </div>
                <div className="h-1.5 bg-[#F5F5F7] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#6B7FD6] to-[#D676A6] transition-all duration-500"
                       style={{width: pct + "%"}}></div>
                </div>
                {intimacy.next_level && <p className="text-[10px] text-[#AEAEB2] font-light mt-1">Next: {intimacy.next_level} · {intimacy.next_level_xp} XP to go</p>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Blueprint */}      {/* Blueprint */}
      <div className="max-w-2xl mx-auto space-y-5">
        <SoulCard soul={soul} version={soulVersion ?? undefined} name={persona?.name} />
        {persona.user_id && (
          <>
            <DistillProgress status={distillStatus} error={distillError} version={soulVersion ?? undefined} onNameConfirm={handleNameConfirm} defaultName={persona?.name} />
            <div className="flex gap-2">
              <Button onClick={handleDistill} loading={distillStatus === "distilling"}>
                {soul ? t.redistill : t.start_distillation}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}