"use client";

import React from "react";
import { Card } from "./ui/card";
import { Avatar } from "./Avatar";
import { useLangStore, translations } from "@/lib/i18n";

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
  const { lang } = useLangStore();
  const t = translations[lang];

  if (!soul) {
    return (
      <Card className="text-center py-12">
        <p className="text-sm text-[#86868B] font-light">{t.not_distilled_soul}</p>
      </Card>
    );
  }

  // Normalize v2 soul to v1-compatible structure
  const isV2 = soul.schema_version === '2.0';

  // basic_info
  const bi = isV2 && soul.identity
    ? { name: soul.identity.name, title: soul.identity.title, company: soul.identity.organization, background: soul.identity.life_arc }
    : (soul.basic_info || {});

  // personality — v2: emotional_reactive_system + identity cues
  const v2emo = (isV2 && soul.emotional_reactive_system) ? soul.emotional_reactive_system : {};
  const v2ident = (isV2 && soul.identity) ? soul.identity : {};
  const v2cog = (isV2 && soul.cognitive_architecture) ? soul.cognitive_architecture : {};
  const p = isV2 ? {
    description: [v2ident.self_description, v2ident.how_the_world_sees_them].filter(Boolean).join(" | "),
  } : (soul.personality || {});

  // communication_style — v2: communication_profile
  const v2comm = (isV2 && soul.communication_profile) ? soul.communication_profile : {};
  const cs = isV2 ? {
    tone: v2comm.in_public_forum || v2comm.punctuation_habits || '',
    common_phrases: v2comm.signature_expressions || [],
  } : (soul.communication_style || {});

  // expression_dna — v2: communication_profile details
  const v2rhythm = (v2comm.sentence_rhythm) || {};
  const dna = isV2 ? {
    avg_sentence_length: v2rhythm.avg_length || 0,
    style_tags: (v2comm.words_they_hardenly_ever_use || []).map((w: string) => 'avoids "' + w + '"'),
    taboo_words: v2comm.words_they_hardenly_ever_use || [],
  } : (soul.expression_dna || {});

  // knowledge_areas — v2: expertise deep+competent domains
  const v2exp = (isV2 && soul.expertise) ? soul.expertise : {};
  const knowledge_areas = isV2
    ? [...(v2exp.deep_domains || []), ...(v2exp.competent_domains || [])].slice(0, 12)
    : (soul.knowledge_areas || []);

  // mental_models — v2: perceptual_frameworks.mental_models
  const v2pf = (isV2 && soul.perceptual_frameworks) ? soul.perceptual_frameworks : {};
  const mm_v2 = v2pf.mental_models || [];
  const mm = isV2
    ? mm_v2.map((m: any) => ({
        name: m.name,
        description: m.description,
        evidence: m.concrete_applications || [],
        application: m.when_deployed,
        limitation: m.when_it_fails,
      }))
    : (soul.mental_models || []);

  // decision_patterns — v2: cognitive_architecture.core_beliefs summary
  const dp = isV2 ? {
    priority_framework: v2pf.primary_lens || '',
    risk_approach: v2emo.under_stress || '',
    decision_speed: v2emo.when_challenged || '',
  } : (soul.decision_patterns || {});

  // decision_heuristics — v2: cognitive_architecture.axioms
  const heuristics = isV2
    ? (v2cog.axioms || [])
    : (soul.decision_heuristics || []);

  // values — v2: core_beliefs + provisional_beliefs
  const values = isV2
    ? [...(v2cog.core_beliefs || []), ...(v2cog.provisional_beliefs || [])].slice(0, 8)
    : (soul.values || []);

  // core_tensions — v2: contradictory_beliefs
  const v2contra = v2cog.contradictory_beliefs || [];
  const tensions = isV2
    ? v2contra.map((c: any) => ({
        description: 'Thesis: ' + (c.thesis || '') + ' | Antithesis: ' + (c.antithesis || ''),
        evidence: [c.synthesis || ''].filter(Boolean),
      }))
    : (soul.core_tensions || []);

  // honest_limitations — v2: knowledge_boundaries
  const v2kb = (isV2 && soul.knowledge_boundaries) ? soul.knowledge_boundaries : {};
  const limits = isV2
    ? [...(v2kb.explicitly_out_of_scope || []), ...(v2kb.will_decline_to_answer || [])].slice(0, 10)
    : (soul.honest_limitations || []);

  // Translate section titles
  const i18n = {
    personality: t.personality_section,
    communication_style: t.communication_style,
    expression_dna: t.expression_dna,
    expertise: t.expertise,
    mental_models: t.mental_models,
    decision_mode: t.decision_mode,
    decision_heuristics: t.decision_heuristics,
    values: t.values,
    core_tensions: t.core_tensions,
    honesty_boundaries: t.honesty_boundaries,
    extroversion: t.extroversion,
    rationality: t.rationality,
    risk_tolerance: t.risk_tolerance,
    formality: t.formality,
    tone: t.tone_label,
    avg_sentence: t.avg_sentence,
    questions: t.questions,
    analogy_density: t.analogy_density,
    certainty_tone: t.certainty_tone,
    transition_freq: t.transition_freq,
    words_avoid: t.words_avoid,
    priority_framework: t.priority_framework,
    risk_attitude: t.risk_attitude,
    decision_speed: t.decision_speed,
    application: t.application,
    limitation: t.limitation,
    description_label: t.description_label || "Description",
    evidence_label: t.evidence_label || "Evidence",
  };

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
        <Section title={i18n.personality}>
          <div className="space-y-2">
            <Bar label={i18n.extroversion} value={p.extrovert_level || 0} />
            <Bar label={i18n.rationality} value={p.rational_level || 0} />
            <Bar label={i18n.risk_tolerance} value={p.risk_tolerance || 0} />
          </div>
          {p.description && <p className="text-xs text-[#86868B] font-light mt-2">{p.description}</p>}
        </Section>
      )}

      {/* Communication Style */}
      {cs && (cs.formal_level > 0 || cs.tone || cs.common_phrases?.length > 0) && (
        <Section title={i18n.communication_style}>
          <Bar label={i18n.formality} value={cs.formal_level || 0} />
          {cs.tone && <p className="text-xs text-[#86868B] font-light mt-1">{i18n.tone}：{cs.tone}</p>}
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
        <Section title={i18n.expression_dna}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#86868B] font-light">
            {dna.avg_sentence_length > 0 && <span>{i18n.avg_sentence}：{dna.avg_sentence_length}{t.chars}</span>}
            {dna.question_ratio > 0 && <span>{i18n.questions}：{(dna.question_ratio * 100).toFixed(0)}%</span>}
            {dna.analogy_density > 0 && <span>{i18n.analogy_density}：{dna.analogy_density.toFixed(1)}{t.per_1k_chars}</span>}
            {dna.certainty_ratio > 0 && <span>{i18n.certainty_tone}：{(dna.certainty_ratio * 100).toFixed(0)}%</span>}
            {dna.transition_frequency > 0 && <span>{i18n.transition_freq}：{dna.transition_frequency.toFixed(1)}{t.per_1k_chars}</span>}
          </div>
          {dna.style_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {dna.style_tags.map((tag: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-[rgba(0,0,0,0.03)] rounded-full text-xs text-[#86868B] font-light">{tag}</span>
              ))}
            </div>
          )}
          {dna.taboo_words?.length > 0 && (
            <p className="text-xs text-red-400/50 mt-2 font-light">{i18n.words_avoid}：{dna.taboo_words.join("、")}</p>
          )}
        </Section>
      )}

      {/* Knowledge Areas */}
      {knowledge_areas.length > 0 && (
        <Section title={i18n.expertise}>
          <div className="flex flex-wrap gap-1">
            {knowledge_areas.map((area: string, i: number) => (
              <span key={i} className="px-2.5 py-1 bg-[rgba(0,113,227,0.06)] text-[#0071E3] rounded-full text-xs font-light">{area}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Mental Models */}
      {mm.length > 0 && (
        <Section title={i18n.mental_models}>
          <div className="space-y-3">
            {mm.map((m: any, i: number) => (
              <div key={i} className="p-3 rounded-[8px] bg-[rgba(0,0,0,0.02)] border border-[rgba(0,0,0,0.04)]">
                <h4 className="text-sm font-light text-[#1D1D1F] mb-1">{m.name}</h4>
                <p className="text-xs text-[#86868B] font-light mb-2">{m.description}</p>
                {m.evidence?.length > 0 && (
                  <div className="text-xs text-[#86868B] font-light">
                    <ul className="list-disc pl-4 space-y-0.5 mt-1">
                      {m.evidence.map((e: string, j: number) => <li key={j}><span className="text-[#86868B]">{i18n.evidence_label}: </span>{e}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mt-2 flex gap-2 text-xs">
                  {m.application && <span className="text-[#0071E3] font-light">{i18n.application} {m.application}</span>}
                  {m.limitation && <span className="text-[#86868B] font-light"> · {i18n.limitation} {m.limitation}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Decision Patterns */}
      {(dp.priority_framework || dp.risk_approach || dp.decision_speed) && (
        <Section title={i18n.decision_mode}>
          {dp.priority_framework && <p className="text-xs text-[#86868B] font-light">{i18n.priority_framework}：{dp.priority_framework}</p>}
          {dp.risk_approach && <p className="text-xs text-[#86868B] font-light">{i18n.risk_attitude}：{dp.risk_approach}</p>}
          {dp.decision_speed && <p className="text-xs text-[#86868B] font-light">{i18n.decision_speed}：{dp.decision_speed}</p>}
        </Section>
      )}

      {/* Decision Heuristics */}
      {heuristics.length > 0 && (
        <Section title={i18n.decision_heuristics}>
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
      {values.length > 0 && (
        <Section title={i18n.values}>
          <div className="flex flex-wrap gap-1">
            {values.map((v: string, i: number) => (
              <span key={i} className="px-2.5 py-1 bg-[rgba(0,0,0,0.03)] text-[#6E6E73] rounded-full text-xs font-light">{v}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Core Tensions */}
      {tensions.length > 0 && (
        <Section title={i18n.core_tensions}>
          <div className="space-y-2">
            {tensions.map((t: any, i: number) => (
              <div key={i} className="p-3 rounded-[8px] border border-[rgba(0,0,0,0.05)]">
                <p className="text-xs text-[#1D1D1F] font-light mb-1">{i18n.description_label}</p>
                {t.evidence?.length > 0 && (
                  <ul className="text-xs text-[#86868B] font-light space-y-0.5 pl-3 list-disc">
                    {t.evidence.map((e: string, j: number) => <li key={j}><span className="text-[#86868B]">{i18n.evidence_label}: </span>{e}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Honest Limitations */}
      {limits.length > 0 && (
        <Section title={i18n.honesty_boundaries}>
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