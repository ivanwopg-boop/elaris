"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/FileUploader";
import { ManualInputForm } from "@/components/ManualInputForm";
import { WebSearchPanel } from "@/components/WebSearchPanel";
import { SoulCard } from "@/components/SoulCard";
import { DistillProgress } from "@/components/DistillProgress";
import { Avatar } from "@/components/Avatar";
import { api, PersonaDetail, FileOut } from "@/lib/api";
import { useLangStore, translations } from "@/lib/i18n";
import { formatDate, fileIcon } from "@/lib/utils";

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
  const [activeTab, setActiveTab] = useState<"soul" | "files" | "search">("soul");
  const { lang } = useLangStore();
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
      const f = await api.listFiles(id);
      setFiles(f);
    } catch (e: any) {
      alert(t.load_failed || "Load failed: " + e.message);
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
      alert(t.saved);
    } catch (e: any) {
      alert((t.save_failed || "Save failed: ") + e.message);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm(t.delete_confirm)) return;
    try {
      await api.deleteFile(id, fileId);
      loadData();
    } catch (e: any) {
      alert((t.delete || "Delete") + " failed: " + e.message);
    }
  };

if (loading) {
    return <div className="text-center text-[#86868B] text-sm font-light py-24">{t.loading}</div>;
  }

  if (!persona) {
    return <div className="text-center text-[#86868B] text-sm font-light py-24">{t.persona_not_found}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <Avatar name={persona.name} url={persona.avatar_url} size="lg" className="w-16 h-16 text-2xl" />
            <label className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center cursor-pointer transition-opacity">
              <span className="text-white text-xs font-light">{t.edit}</span>
              <input type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const res = await api.uploadAvatar(id, file);
                    setPersona((p) => p ? { ...p, avatar_url: res.avatar_url } : p);
                  } catch (err: any) { alert("Upload failed: " + (err?.detail || err?.message || err)); }
                }} />
            </label>
          </div>
          <div>
            <h1 className="text-3xl font-extralight tracking-tight">{persona.name}</h1>
            {persona.description && <p className="text-sm text-[#86868B] font-light mt-1">{persona.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.location.href = `/guest-chat/${id}`}>{t.chat || "Chat"}</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-[rgba(0,0,0,0.06)] mb-8">
        {[
          { key: "soul" as const, label: t.tab_soul },
          { key: "files" as const, label: `${t.tab_files} (${files.length})` },
          { key: "search" as const, label: t.tab_search },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-light transition-colors border-b-2 ${
              activeTab === tab.key
                ? "text-[#1D1D1F] border-[#1D1D1F]"
                : "text-[#86868B] border-transparent hover:text-[#6E6E73]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Soul */}
      {activeTab === "soul" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <SoulCard soul={soul} version={soulVersion ?? undefined} name={persona?.name} avatar_url={persona?.avatar_url} />
            {persona.user_id && (
              <>
                <DistillProgress status={distillStatus} error={distillError} version={soulVersion ?? undefined} />
                <div className="flex gap-2">
                  <Button onClick={handleDistill} loading={distillStatus === "distilling"}>
                    {soul ? t.redistill : t.start_distillation}
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="space-y-5">
            {persona.user_id && (
              <>
                <ManualInputForm onSave={handleManualInput} />
                <FileUploader onFilesSelected={(files) => handleUploadFiles(files, [])} />
                {uploadStatus !== "idle" && (
                  <div className={`text-xs text-center py-2 rounded-[8px] font-light ${
                    uploadStatus === "done" ? "text-green-600 bg-green-50" : uploadStatus === "error" ? "text-red-500 bg-red-50" : "text-[#86868B]"
                  }`}>
                    {uploadStatus === "uploading" ? t.uploading : uploadMsg}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab: Files */}
      {activeTab === "files" && (
        <div>
          {persona.user_id && (
            <FileUploader onFilesSelected={(files) => handleUploadFiles(files, [])} className="mb-5" />
          )}
          {uploadStatus !== "idle" && (
            <div className={`text-xs text-center py-2 rounded-[8px] mb-4 font-light ${
              uploadStatus === "done" ? "text-green-600 bg-green-50" : uploadStatus === "error" ? "text-red-500 bg-red-50" : "text-[#86868B]"
            }`}>
              {uploadStatus === "uploading" ? t.uploading : uploadMsg}
            </div>
          )}

          {files.length === 0 ? (
            <p className="text-center text-[#86868B] text-xs font-light py-12">No files</p>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <Card key={f.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-[#86868B]">{fileIcon(f.file_type)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-light text-[#1D1D1F] truncate">{f.file_name}</p>
                      <p className="text-xs text-[#86868B] font-light">
                        {formatDate(f.created_at)}
                        {f.parsed_content && ` · ${f.parsed_content.length} ${t.chars}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteFile(f.id)}
                    className="text-[#86868B] hover:text-red-500 text-xs font-light shrink-0"
                  >
                    Delete
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Search */}
      {activeTab === "search" && (
        <WebSearchPanel
          personaId={id}
          onSearch={async (queries) => {
            await api.triggerWebSearch(id, queries);
          }}
          results={[]}
        />
      )}
    </div>
  );
}