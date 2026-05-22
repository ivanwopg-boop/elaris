"use client";

import React from "react";
import { Card } from "./ui/card";
import { Avatar } from "./Avatar";

interface SoulCardProps {
  soul: any;
  version?: number;
  name?: string;
  avatar_url?: string | null;
}

function Bar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-[#86868B] font-light w-20 shrink-0">{label}</span>
      <div className="flex-1 h-px bg-[rgba(0,0,0,0.06)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: "#0071E3", opacity: 0.5 }} />
      </div>
      <span className="text-[11px] text-[#86868B] font-light w-5 text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <h3 className="text-[11px] font-light text-[#86868B] mb-3 tracking-wide uppercase">{title}</h3>
      {children}
    </div>
  );
}

export function SoulCard({ soul, version, name, avatar_url }: SoulCardProps) {
  if (!soul) {
    return (
      <Card className="text-center py-12">
        <p className="text-sm text-[#86868B] font-light">Not yet distilled. Upload files and click "Start Distillation"</p>
      </Card>
    );
  }

  const bi = soul.basic_info || {};
  const p = soul.personality || {};
  const cs = soul.communication_style || {};
  const dp = soul.decision_patterns || {};
  const dna = soul.expression_dna || {};
  const mm = soul.mental_models || [];
  const heuristics = soul.decision_heuristics || [];
  const tensions = soul.core_tensions || [];
  const limits = soul.honest_limitations || [];

  return (
    <Card>
      {version && <div className="text-[11px] text-[#86868B] font-light mb-4">v{version}</div>}

      {/* Basic Info */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={name || bi.name || "?"} url={avatar_url} size="lg" />
        <div>
          <h2 className="text-2xl font-extralight tracking-tight">{bi.name || "Unknown"}</h2>
          {bi.title && <p className="text-sm text-[#86868B] font-light">{bi.title}</p>}
          {bi.company && <p className="text-xs text-[#86868B] font-light">{bi.company}</p>}
          {bi.background && <p className="text-sm text-[#86868B] font-light mt-1">{bi.background}</p>}
        </div>
      </div>

      {/* Personality */}
      {p && (p.extrovert_level > 0 || p.rational_level > 0 || p.risk_tolerance > 0) && (
        <Section title="Personality">
          <div className="space-y-2">
            <Bar label="Extroversion" value={p.extrovert_level || 0} />
            <Bar label="Rationality" value={p.rational_level || 0} />
            <Bar label="Risk tolerance" value={p.risk_tolerance || 0} />
          </div>
          {p.description && <p className="text-xs text-[#86868B] font-light mt-2">{p.description}</p>}
        </Section>
      )}

      {/* Communication Style */}
      {cs && (cs.formal_level > 0 || cs.tone || cs.common_phrases?.length > 0) && (
        <Section title="Communication Style">
          <Bar label="Formality" value={cs.formal_level || 0} />
          {cs.tone && <p className="text-xs text-[#86868B] font-light mt-1">Tone：{cs.tone}</p>}
          {cs.common_phrases?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cs.common_phrases.map((phrase: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-[rgba(0,0,0,0.03)] rounded-full text-xs text-[#86868B] font-light">"{phrase}"</span>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Expression DNA */}
      {(dna.avg_sentence_length > 0 || dna.style_tags?.length > 0) && (
        <Section title="Expression DNA">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#86868B] font-light">
            {dna.avg_sentence_length > 0 && <span>Avg sentence length：{dna.avg_sentence_length}chars</span>}
            {dna.question_ratio > 0 && <span>Questions：{(dna.question_ratio * 100).toFixed(0)}%</span>}
            {dna.analogy_density > 0 && <span>Analogy density：{dna.analogy_density.toFixed(1)}/per 1k chars</span>}
            {dna.certainty_ratio > 0 && <span>Certainty Tone：{(dna.certainty_ratio * 100).toFixed(0)}%</span>}
            {dna.transition_frequency > 0 && <span>Transition freq：{dna.transition_frequency.toFixed(1)}/per 1k chars</span>}
          </div>
          {dna.style_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {dna.style_tags.map((tag: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-[rgba(0,0,0,0.03)] rounded-full text-xs text-[#86868B] font-light">{tag}</span>
              ))}
            </div>
          )}
          {dna.taboo_words?.length > 0 && (
            <p className="text-xs text-red-400/50 mt-2 font-light">Words they avoid：{dna.taboo_words.join("、")}</p>
          )}
        </Section>
      )}

      {/* Knowledge Areas */}
      {soul.knowledge_areas?.length > 0 && (
        <Section title="Expertise">
          <div className="flex flex-wrap gap-1">
            {soul.knowledge_areas.map((area: string, i: number) => (
              <span key={i} className="px-2.5 py-1 bg-[rgba(0,113,227,0.06)] text-[#0071E3] rounded-full text-xs font-light">{area}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Mental Models */}
      {mm.length > 0 && (
        <Section title="Core Mental Models">
          <div className="space-y-3">
            {mm.map((m: any, i: number) => (
              <div key={i} className="p-3 rounded-[8px] bg-[rgba(0,0,0,0.02)] border border-[rgba(0,0,0,0.04)]">
                <h4 className="text-sm font-light text-[#1D1D1F] mb-1">{m.name}</h4>
                <p className="text-xs text-[#86868B] font-light mb-2">{m.description}</p>
                {m.evidence?.length > 0 && (
                  <div className="text-xs text-[#86868B] font-light">
                    <ul className="list-disc pl-4 space-y-0.5 mt-1">
                      {m.evidence.map((e: string, j: number) => <li key={j}>{e}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mt-2 flex gap-2 text-xs">
                  {m.application && <span className="text-[#0071E3] font-light">✓ {m.application}</span>}
                  {m.limitation && <span className="text-[#86868B] font-light">· {m.limitation}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Decision Patterns */}
      {(dp.priority_framework || dp.risk_approach || dp.decision_speed) && (
        <Section title="Decision Mode">
          {dp.priority_framework && <p className="text-xs text-[#86868B] font-light">Priority framework：{dp.priority_framework}</p>}
          {dp.risk_approach && <p className="text-xs text-[#86868B] font-light">Risk attitude：{dp.risk_approach}</p>}
          {dp.decision_speed && <p className="text-xs text-[#86868B] font-light">Decision speed：{dp.decision_speed}</p>}
        </Section>
      )}

      {/* Decision Heuristics */}
      {heuristics.length > 0 && (
        <Section title="Decision Heuristics">
          <ul className="space-y-1">
            {heuristics.map((h: string, i: number) => (
              <li key={i} className="text-xs text-[#86868B] font-light flex gap-2">
                <span className="text-[#0071E3] font-light shrink-0">{i + 1}.</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Values */}
      {soul.values?.length > 0 && (
        <Section title="Values">
          <div className="flex flex-wrap gap-1">
            {soul.values.map((v: string, i: number) => (
              <span key={i} className="px-2.5 py-1 bg-[rgba(0,0,0,0.03)] text-[#6E6E73] rounded-full text-xs font-light">{v}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Core Tensions */}
      {tensions.length > 0 && (
        <Section title="Core Tensions">
          <div className="space-y-2">
            {tensions.map((t: any, i: number) => (
              <div key={i} className="p-3 rounded-[8px] border border-[rgba(0,0,0,0.05)]">
                <p className="text-xs text-[#1D1D1F] font-light mb-1">{t.description}</p>
                {t.evidence?.length > 0 && (
                  <ul className="text-xs text-[#86868B] font-light space-y-0.5 pl-3 list-disc">
                    {t.evidence.map((e: string, j: number) => <li key={j}>{e}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Honest Limitations */}
      {limits.length > 0 && (
        <Section title="Honesty Boundaries">
          <div className="space-y-1">
            {limits.map((l: string, i: number) => (
              <p key={i} className="text-xs text-[#86868B] font-light">· {l}</p>
            ))}
          </div>
        </Section>
      )}
    </Card>
  );
}