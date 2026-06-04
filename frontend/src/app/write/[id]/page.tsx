"use client";

import { useParams } from "next/navigation";
import { useLangStore, translations } from '@/lib/i18n';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, PersonaDetail } from "@/lib/api";

export default function WritePage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.getPersona(id).then(setPersona).catch(() => router.push("/"));
  }, [id]);

  const handleGenerate = async () => {
    if (!context.trim()) return;
    setGenerating(true);
    setResult("");
    try {
      const res = await api.chat(id, context, "write", context);
      setResult(res.message);
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <button
        onClick={() => router.push(`/persona/${id}`)}
        className="text-xs text-[#86868B] font-light hover:text-[#6E6E73] mb-5"
      >
        {t.back} {persona?.name || "..."}
      </button>

      <h1 className="text-2xl font-extralight tracking-tight mb-1">Writing Assistant</h1>
      <p className="text-sm text-[#86868B] font-light mb-10">
        Enter a scenario to generate text in {persona?.name || "this person"}'s style
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input */}
        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">Scenario</h3>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="E.g.: Write a follow-up email to a client introducing our new product solution..."
            className="w-full h-48 bg-white border border-[rgba(0,0,0,0.08)] rounded-[10px] p-4 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] font-light resize-none"
          />
          <Button className="mt-3" onClick={handleGenerate} loading={generating}>
            Generate
          </Button>
        </Card>

        {/* Result */}
        <Card>
          <h3 className="text-xs font-light text-[#86868B] mb-3 tracking-wide">Generated Result</h3>
          <div className="min-h-48 whitespace-pre-wrap text-sm text-[#1D1D1F] font-light leading-relaxed">
            {result || (generating ? "Generating..." : "Waiting for input...")}
          </div>
          {result && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-[#86868B]"
              onClick={() => navigator.clipboard.writeText(result)}
            >
              Copy
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}