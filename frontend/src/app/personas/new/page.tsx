"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/FileUploader";
import { api } from "@/lib/api";

const TITLE_OPTIONS = ["", "CEO", "CTO", "CFO", "COO", "CMO", "Product Manager", "Engineer", "Designer", "Marketing Director", "Sales Director", "Consultant", "Investor", "Researcher", "Writer", "Entrepreneur"];
const COMPANY_OPTIONS = ["", "Tech Company", "Internet Company", "Financial Institution", "Manufacturing", "Healthcare", "Education", "Consulting Firm", "Investment Firm", "Startup"];
const BACKGROUND_OPTIONS = ["", "Serial Entrepreneur", "Tech Expert", "Business Consultant", "Academic Researcher", "Artist/Creator", "Investor", "Executive", "Educator", "Engineer"];

export default function CreatePersonaPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [background, setBackground] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sampleText, setSampleText] = useState("");
  const [thinkingDesc, setThinkingDesc] = useState("");
  const [answers, setAnswers] = useState({bg:"", think:"", values:"", comm:"", decide:"", know:"", limit:""});
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { alert("Please enterName"); return; }
    setSaving(true);
    try {
      const fields: Record<string, string> = {};
      if (title) fields.title = title;
      if (company) fields.company = company;
      if (background) fields.background = background;
      if (sampleText.trim()) fields.sample_text = sampleText.trim();
      if (thinkingDesc.trim()) fields.thinking_desc = thinkingDesc.trim();
      const qaMap: Record<string, string> = {bg:"Background", think:"Thinking Style", values:"Values", comm:"Communication Style", decide:"Decision Mode", know:"Areas of Expertise", limit:"Cognitive Boundaries"};
      for (const [key, label] of Object.entries(qaMap)) {
        const val = (answers as any)[key];
        if (val?.trim()) fields[`questionnaire_${label}`] = val.trim();
      }

      const persona = await api.createPersona({ name: name.trim() });
      if (Object.keys(fields).length > 0) {
        await api.addManualInput(persona.id, fields);
      }
      if (files.length > 0) {
        await api.uploadFiles(persona.id, files, []);
      }
      const token = localStorage.getItem("access_token");
      fetch(`/api/v1/personas/${persona.id}/distill`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: {} }),
      }).catch(() => {});
      router.push(`/persona/${persona.id}`);
    } catch (e: any) {
      alert("Creation failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <button onClick={() => router.push("/personas")} className="text-xs text-[#86868B] font-light hover:text-[#6E6E73] mb-6">← Back</button>
      <h1 className="text-2xl font-extralight tracking-tight mb-10">Create Persona</h1>

      <div className="space-y-5">
        {/* Name */}
        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">Name <span className="text-red-400">*</span></h3>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Enter person's name"
            className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light" />
        </Card>

        {/* Title / Company / Background */}
        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">Basic Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] appearance-none font-light">
              {TITLE_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt || "Title"}</option>))}
            </select>
            <select value={company} onChange={(e) => setCompany(e.target.value)}
              className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] appearance-none font-light">
              {COMPANY_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt || "Company"}</option>))}
            </select>
            <select value={background} onChange={(e) => setBackground(e.target.value)}
              className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] appearance-none font-light">
              {BACKGROUND_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt || "Background"}</option>))}
            </select>
          </div>
        </Card>

        {/* Paste original text */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-light text-[#86868B] tracking-wide">Paste Original Text</h3>
          </div>
          <p className="text-xs text-[#86868B] font-light mb-3 leading-relaxed">
            Paste articles, interviews, speeches, or social media posts. AI analyzes language style, thinking patterns, and expression DNA to give the persona a unique soul.
          </p>
          <textarea value={sampleText} onChange={(e) => setSampleText(e.target.value)}
            placeholder="E.g.: Paste an interview transcript, a blog post, or a few tweets..."
            rows={5}
            className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light resize-none" />
        </Card>

        {/* Deep customization */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-light text-[#0071E3] hover:text-[#1D1D1F] transition-colors p-2 -ml-2 rounded-lg select-none">
            Deep Customization
          </summary>
          <div className="mt-5 space-y-5">
            <Card>
              <h3 className="text-xs font-light text-[#86868B] mb-2 tracking-wide">Thinking Characteristics</h3>
              <p className="text-xs text-[#86868B] font-light mb-3">Describe their thinking style, core principles, and unique perspectives</p>
              <textarea value={thinkingDesc} onChange={(e) => setThinkingDesc(e.target.value)}
                placeholder="E.g.: When making decisions, they always consider the worst case first; they believe 90% of effort comes from the right direction..."
                rows={3}
                className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] px-4 py-3 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light resize-none" />
            </Card>

            {/* 7 dimension questionnaire */}
            <Card>
              <h3 className="text-xs font-light text-[#86868B] mb-2 tracking-wide">Seven-Dimensional Personality Questionnaire</h3>
              <p className="text-xs text-[#86868B] font-light mb-4">Answer these questions to make the persona more dimensional</p>
              <div className="space-y-4">
                {[
                  {key:"bg", label:"Background & Experience", placeholder:"Origins, education, career, defining moments..."},
                  {key:"think", label:"Thinking Style", placeholder:"First principles, reverse thinking, data-driven... give specific examples"},
                  {key:"values", label:"Values & Principles", placeholder:"Relentless pursuit of excellence, efficiency first, long-termism..."},
                  {key:"comm", label:"Communication Style", placeholder:"Concise or detailed? Uses analogies? Signature phrases?"},
                  {key:"decide", label:"Decision Mode", placeholder:"Worst-case first, rapid iteration, gather diverse opinions..."},
                  {key:"know", label:"Areas of Expertise", placeholder:"Specific technical domains, industry experience, interdisciplinary knowledge..."},
                  {key:"limit", label:"Cognitive Boundaries", placeholder:"Not great at socializing, biased in some areas, limited public info..."},
                ].map(({key, label, placeholder}) => (
                  <div key={key}>
                    <label className="text-xs font-light text-[#6E6E73] block mb-1">{label}</label>
                    <textarea value={(answers as any)[key]} onChange={(e) => setAnswers((p) => ({...p, [key]: e.target.value}))}
                      rows={2} placeholder={placeholder}
                      className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-[8px] px-3 py-2 text-xs text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light resize-none" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </details>

        {/* File upload */}
        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-2 tracking-wide">Reference Materials (optional)</h3>
          <p className="text-xs text-[#86868B] font-light mb-3">Upload articles, resumes, interview transcripts, etc.</p>
          <FileUploader onFilesSelected={(fs) => setFiles((prev) => [...prev, ...fs])} />
          {files.length > 0 && (
            <div className="mt-3 space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-[#86868B] font-light">
                  <span>·</span>
                  <span className="flex-1 truncate">{f.name}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-400">✕</button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Button className="w-full" size="lg" onClick={handleCreate} loading={saving} disabled={!name.trim()}>
          Create & Distill
        </Button>
      </div>
    </div>
  );
}