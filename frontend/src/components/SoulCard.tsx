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
    tone: [
      v2comm.default_register ? 'Register: ' + v2comm.default_register : '',
      v2comm.humor_register ? 'Humor: ' + v2comm.humor_register : '',
      v2comm.punctuation_habits || '',
      v2comm.how_they_use_silence || '',
    ].filter(Boolean).join(' | ') || '',
    common_phrases: v2comm.signature_expressions || [],
    extra: {
      written: (v2comm.written_vs_spoken || {}).written || '',
      spoken: (v2comm.written_vs_spoken || {}).spoken || '',
      to_strangers: (v2comm.to_strangers_vs_intimates || {}).strangers || '',
      to_intimates: (v2comm.to_strangers_vs_intimates || {}).intimates || '',
    },
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
    voice_samples: t.voice_samples || "Voice Samples",
    deep_convictions: t.deep_convictions || "Deep Convictions",
    communication_adaptation: t.communication_adaptation || "Communication Adaptation",
    relationship_dynamics: t.relationship_dynamics || "Relationship Dynamics",
    expertise_nuance: t.expertise_nuance || "Expertise Nuance",
    identity_nuance: t.identity_nuance || "Identity Nuance",
    perceptual_lenses: t.perceptual_lenses || "Perceptual Lenses",
    temporal_profile: t.temporal_profile || "Evolution Over Time",
    triggers_label: t.triggers_label || "{i18n.triggers_label}",
    defense_mechanisms: t.defense_mechanisms || "{i18n.defense_mechanisms}",
    dormant_withdrawal: t.dormant_withdrawal || "{i18n.dormant_withdrawal}",
    know_for_certain: t.know_for_certain || "{i18n.know_for_certain}",
    suspect_never_state: t.suspect_never_state || "{i18n.suspect_never_state}",
    positions_reversed: t.positions_reversed || "{i18n.positions_reversed}",
    on_love: t.on_love || "{i18n.on_love}",
    on_resist: t.on_resist || "{i18n.on_resist}",
    on_decline: t.on_decline || "{i18n.on_decline}",
    on_explain: t.on_explain || "{i18n.on_explain}",
    on_contradiction: t.on_contradiction || "{i18n.on_contradiction}",
    under_stress_label: t.under_stress_label || "Under stress",
    when_agreed_label: t.when_agreed_label || "When agreed with",
    when_challenged_label: t.when_challenged_label || "When challenged",
    common_misperceptions_label: t.common_misperceptions_label || "{i18n.common_misperceptions_label}",
    what_they_reject_label: t.what_they_reject_label || "{i18n.what_they_reject_label}",
    cross_domain_label: t.cross_domain_label || "{i18n.cross_domain_label}",
    how_changed_label: t.how_changed_label || "How they changed",
    next_decade_label: t.next_decade_label || "Next decade outlook",
    regret_label: t.regret_label || "Regret not saying sooner",
    known_as_label: t.known_as_label || "{i18n.known_as_label}",
    refuse_label: t.refuse_label || "{i18n.refuse_label}",
    written_label: t.written_label || "Written",
    spoken_label: t.spoken_label || "Spoken",
    to_strangers_label: t.to_strangers_label || "To strangers",
    to_intimates_label: t.to_intimates_label || "To intimates",
    clarity_vs_impress_label: t.clarity_vs_impress_label || "Clarity vs. Impress",
    hostile_audience_label: t.hostile_audience_label || "Hostile audience",
    skeptical_audience_label: t.skeptical_audience_label || "Skeptical audience",
    uninformed_audience_label: t.uninformed_audience_label || "Uninformed audience",
    when_recorded_label: t.when_recorded_label || "When recorded",
    to_detractors_label: t.to_detractors_label || "To detractors",
    with_mentees_label: t.with_mentees_label || "With mentees",
    with_peers_label: t.with_peers_label || "With peers",
    with_authorities_label: t.with_authorities_label || "With authorities",
    with_institutions_label: t.with_institutions_label || "With institutions",
    with_fans_label: t.with_fans_label || "With fans/public",
    with_critics_label: t.with_critics_label || "With critics",
  };

  return (
    <Card>
      {version && <div className="text-[10px] text-[#C7C7CC] font-light mb-3 hidden sm:block">v{version}</div>}

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
      {/* v1: bars + description */}
      {!isV2 && p && (p.extrovert_level > 0 || p.rational_level > 0 || p.risk_tolerance > 0) && (
        <Section title={i18n.personality}>
          <div className="space-y-2">
            <Bar label={i18n.extroversion} value={p.extrovert_level || 0} />
            <Bar label={i18n.rationality} value={p.rational_level || 0} />
            <Bar label={i18n.risk_tolerance} value={p.risk_tolerance || 0} />
          </div>
          {p.description && <p className="text-xs text-[#86868B] font-light mt-2">{p.description}</p>}
        </Section>
      )}
      {/* v2: emotional system + self description */}
      {isV2 && v2ident && (
        <Section title={i18n.personality}>
          {v2ident.self_description && <p className="text-xs text-[#1D1D1F] font-light italic">“{v2ident.self_description}”</p>}
          {v2ident.how_the_world_sees_them && <p className="text-xs text-[#86868B] font-light mt-1">{v2ident.how_the_world_sees_them}</p>}
          {v2emo.triggers?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.05)]">
              <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.triggers_label}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2emo.triggers.map((t: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(255,149,0,0.06)] text-[#FF9500] border border-[rgba(255,149,0,0.15)] rounded-full text-xs font-light">{t}</span>
                ))}
              </div>
            </div>
          )}
          {v2emo.self_protection_mechanisms?.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.defense_mechanisms}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2emo.self_protection_mechanisms.map((m: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(175,82,222,0.06)] text-[#AF52DE] border border-[rgba(175,82,222,0.15)] rounded-full text-xs font-light">{m}</span>
                ))}
              </div>
            </div>
          )}
          {v2emo.dormant_points?.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.dormant_withdrawal}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2emo.dormant_points.map((d: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(0,0,0,0.03)] text-[#6E6E73] rounded-full text-xs font-light">{d}</span>
                ))}
              </div>
            </div>
          )}
          {v2emo.under_stress && <p className="text-xs text-[#86868B] font-light mt-2"><span className="text-[#1D1D1F]">{i18n.under_stress_label}:</span> {v2emo.under_stress}</p>}
          {v2emo.when_agreed_with && <p className="text-xs text-[#86868B] font-light mt-1"><span className="text-[#1D1D1F]">{i18n.when_agreed_label}:</span> {v2emo.when_agreed_with}</p>}
          {v2emo.when_challenged && <p className="text-xs text-[#86868B] font-light mt-1"><span className="text-[#1D1D1F]">{i18n.when_challenged_label}:</span> {v2emo.when_challenged}</p>}
        </Section>
      )}

      {/* Communication Style */}
      {/* v1: formality bar + tone + phrases */}
      {!isV2 && cs && (cs.formal_level > 0 || cs.tone || cs.common_phrases?.length > 0) && (
        <Section title={i18n.communication_style}>
          <Bar label={i18n.formality} value={cs.formal_level || 0} />
          {cs.tone && <p className="text-xs text-[#86868B] font-light mt-1">{i18n.tone}：{cs.tone}</p>}
          {cs.common_phrases?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cs.common_phrases.map((phrase: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-[rgba(0,0,0,0.03)] rounded-full text-xs text-[#86868B] font-light">“{phrase}”</span>
              ))}
            </div>
          )}
        </Section>
      )}
      {/* v2: tone + phrases + written/spoken/strangers/intimates */}
      {isV2 && cs && (cs.tone || cs.common_phrases?.length > 0) && (
        <Section title={i18n.communication_style}>
          {cs.tone && <p className="text-xs text-[#1D1D1F] font-light italic">{cs.tone}</p>}
          {cs.common_phrases?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cs.common_phrases.map((phrase: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-[rgba(0,113,227,0.06)] rounded-full text-xs text-[#0071E3] font-light">{phrase}</span>
              ))}
            </div>
          )}
          {cs.extra && (cs.extra.written || cs.extra.spoken || cs.extra.to_strangers || cs.extra.to_intimates) && (
            <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.05)]">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-[#86868B] font-light">
                {cs.extra.written && <div><span className="text-[#1D1D1F]">{i18n.written_label}:</span><br/>{cs.extra.written}</div>}
                {cs.extra.spoken && <div><span className="text-[#1D1D1F]">{i18n.spoken_label}:</span><br/>{cs.extra.spoken}</div>}
                {cs.extra.to_strangers && <div><span className="text-[#1D1D1F]">{i18n.to_strangers_label}:</span><br/>{cs.extra.to_strangers}</div>}
                {cs.extra.to_intimates && <div><span className="text-[#1D1D1F]">{i18n.to_intimates_label}:</span><br/>{cs.extra.to_intimates}</div>}
              </div>
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

      {/* ═══════════════════════════════════ */}
      {/* V2-ONLY SECTIONS                    */}
      {/* ═══════════════════════════════════ */}

      {/* Voice Samples */}
      {isV2 && (soul.voice_samples) && (soul.voice_samples.on_topic_they_love || soul.voice_samples.on_topic_they_resist) && (
        <Section title={i18n.voice_samples}>
          <div className="space-y-2">
            {soul.voice_samples.on_topic_they_love && (
              <div className="p-2.5 rounded-[6px] bg-[rgba(0,0,0,0.02)] border-l-2 border-l-[#0071E3]">
                <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.on_love}</span>
                <p className="text-xs text-[#1D1D1F] font-light mt-0.5 italic">&ldquo;{soul.voice_samples.on_topic_they_love}&rdquo;</p>
              </div>
            )}
            {soul.voice_samples.on_topic_they_resist && (
              <div className="p-2.5 rounded-[6px] bg-[rgba(0,0,0,0.02)] border-l-2 border-l-[#FF9500]">
                <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.on_resist}</span>
                <p className="text-xs text-[#1D1D1F] font-light mt-0.5 italic">&ldquo;{soul.voice_samples.on_topic_they_resist}&rdquo;</p>
              </div>
            )}
            {soul.voice_samples.on_topic_they_decline && (
              <div className="p-2.5 rounded-[6px] bg-[rgba(0,0,0,0.02)] border-l-2 border-l-[#86868B]">
                <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.on_decline}</span>
                <p className="text-xs text-[#1D1D1F] font-light mt-0.5 italic">&ldquo;{soul.voice_samples.on_topic_they_decline}&rdquo;</p>
              </div>
            )}
            {soul.voice_samples.when_explaining_something_complex && (
              <div className="p-2.5 rounded-[6px] bg-[rgba(0,0,0,0.02)] border-l-2 border-l-[#34C759]">
                <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.on_explain}</span>
                <p className="text-xs text-[#1D1D1F] font-light mt-0.5 italic">&ldquo;{soul.voice_samples.when_explaining_something_complex}&rdquo;</p>
              </div>
            )}
            {soul.voice_samples.when_pushed_on_a_contradiction && (
              <div className="p-2.5 rounded-[6px] bg-[rgba(0,0,0,0.02)] border-l-2 border-l-[#AF52DE]">
                <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.on_contradiction}</span>
                <p className="text-xs text-[#1D1D1F] font-light mt-0.5 italic">&ldquo;{soul.voice_samples.when_pushed_on_a_contradiction}&rdquo;</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {isV2 && v2emo && (v2emo.triggers?.length > 0 || v2emo.self_protection_mechanisms?.length > 0) && (
        <Section title={i18n.personality}>
          {v2emo.triggers?.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-[#86868B] font-light">{i18n.triggers_label}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2emo.triggers.map((t: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(255,149,0,0.06)] text-[#FF9500] border border-[rgba(255,149,0,0.15)] rounded-full text-xs font-light">{t}</span>
                ))}
              </div>
            </div>
          )}
          {v2emo.self_protection_mechanisms?.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-[#86868B] font-light">{i18n.defense_mechanisms}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2emo.self_protection_mechanisms.map((m: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(175,82,222,0.06)] text-[#AF52DE] border border-[rgba(175,82,222,0.15)] rounded-full text-xs font-light">{m}</span>
                ))}
              </div>
            </div>
          )}
          {v2emo.dormant_points?.length > 0 && (
            <div>
              <span className="text-[10px] text-[#86868B] font-light">{i18n.dormant_withdrawal}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2emo.dormant_points.map((d: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(0,0,0,0.03)] text-[#6E6E73] rounded-full text-xs font-light">{d}</span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Deep Convictions */}
      {isV2 && v2cog && (v2cog.what_they_know_for_certain?.length > 0 || v2cog.what_they_suspect_but_never_state?.length > 0) && (
        <Section title={i18n.deep_convictions}>
          {v2cog.what_they_know_for_certain?.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-[#86868B] font-light">{i18n.know_for_certain}</span>
              <ul className="space-y-1 mt-1">
                {v2cog.what_they_know_for_certain.map((k: string, i: number) => (
                  <li key={i} className="text-xs text-[#1D1D1F] font-light flex gap-2">
                    <span className="text-[#0071E3] font-light shrink-0">{i + 1}.</span>
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {v2cog.what_they_suspect_but_never_state?.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-[#86868B] font-light">{i18n.suspect_never_state}</span>
              <ul className="space-y-1 mt-1">
                {v2cog.what_they_suspect_but_never_state.map((k: string, i: number) => (
                  <li key={i} className="text-xs text-[#86868B] font-light flex gap-2">
                    <span className="text-[#86868B] font-light shrink-0">&bull;</span>
                    <span className="italic">&ldquo;{k}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {v2cog.what_they_publicly_contradicted?.length > 0 && (
            <div>
              <span className="text-[10px] text-[#86868B] font-light">{i18n.positions_reversed}</span>
              <div className="space-y-1.5 mt-1">
                {v2cog.what_they_publicly_contradicted.map((c: any, i: number) => (
                  <div key={i} className="p-2 rounded-[6px] bg-[rgba(0,0,0,0.02)]">
                    <p className="text-xs text-[#1D1D1F] font-light">{c.claim}</p>
                    {c.context && <p className="text-[10px] text-[#86868B] font-light mt-0.5">{c.context}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Communication Nuance */}
      {isV2 && cs.extra && Object.values(cs.extra).some(Boolean) && (
        <Section title="Communication Nuance">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-[#86868B] font-light">
            {cs.extra.written && <div><span className="text-[#1D1D1F]">{i18n.written_label}:</span><br/>{cs.extra.written}</div>}
            {cs.extra.spoken && <div><span className="text-[#1D1D1F]">{i18n.spoken_label}:</span><br/>{cs.extra.spoken}</div>}
            {cs.extra.to_strangers && <div><span className="text-[#1D1D1F]">{i18n.to_strangers_label}:</span><br/>{cs.extra.to_strangers}</div>}
            {cs.extra.to_intimates && <div><span className="text-[#1D1D1F]">{i18n.to_intimates_label}:</span><br/>{cs.extra.to_intimates}</div>}
          </div>
        </Section>
      )}

      {/* Temporal Profile */}
      {isV2 && (soul.temporal_profile) && (
        <Section title={i18n.temporal_profile}>
          <div className="space-y-2 text-xs text-[#86868B] font-light">
            {soul.temporal_profile.how_they_changed_over_time && (
              <div>
                <span className="text-[10px] text-[#1D1D1F]">{i18n.how_changed_label}:</span>
                <p className="mt-0.5">{soul.temporal_profile.how_they_changed_over_time}</p>
              </div>
            )}
            {soul.temporal_profile.what_would_change_if_lived_another_decade && (
              <div>
                <span className="text-[10px] text-[#1D1D1F]">{i18n.next_decade_label}:</span>
                <p className="mt-0.5">{soul.temporal_profile.what_would_change_if_lived_another_decade}</p>
              </div>
            )}
            {soul.temporal_profile.what_they_regret_not_saying_sooner && (
              <div>
                <span className="text-[10px] text-[#1D1D1F]">{i18n.regret_label}:</span>
                <p className="mt-0.5 italic">&ldquo;{soul.temporal_profile.what_they_regret_not_saying_sooner}&rdquo;</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Contextual Modulation — v2 only */}
      {isV2 && (soul.contextual_modulation) && (
        <Section title={i18n.communication_adaptation}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-light">
            {soul.contextual_modulation.when_purpose_is_clarity_vs_impress && (
              <div className="col-span-2"><span className="text-[#1D1D1F]">{i18n.clarity_vs_impress_label}:</span> <span className="text-[#86868B]">{soul.contextual_modulation.when_purpose_is_clarity_vs_impress}</span></div>
            )}
            {soul.contextual_modulation.when_audience_is_hostile && (
              <div><span className="text-[#1D1D1F]">{i18n.hostile_audience_label}:</span><br/><span className="text-[#86868B]">{soul.contextual_modulation.when_audience_is_hostile}</span></div>
            )}
            {soul.contextual_modulation.when_audience_is_skeptical && (
              <div><span className="text-[#1D1D1F]">{i18n.skeptical_audience_label}:</span><br/><span className="text-[#86868B]">{soul.contextual_modulation.when_audience_is_skeptical}</span></div>
            )}
            {soul.contextual_modulation.when_audience_is_uninformed && (
              <div><span className="text-[#1D1D1F]">{i18n.uninformed_audience_label}:</span><br/><span className="text-[#86868B]">{soul.contextual_modulation.when_audience_is_uninformed}</span></div>
            )}
            {soul.contextual_modulation.when_being_recorded && (
              <div><span className="text-[#1D1D1F]">{i18n.when_recorded_label}:</span><br/><span className="text-[#86868B]">{soul.contextual_modulation.when_being_recorded}</span></div>
            )}
            {soul.contextual_modulation.when_speaking_to_detractors && (
              <div><span className="text-[#1D1D1F]">{i18n.to_detractors_label}:</span><br/><span className="text-[#86868B]">{soul.contextual_modulation.when_speaking_to_detractors}</span></div>
            )}
          </div>
        </Section>
      )}

      {/* Relationship Dynamics — v2 only */}
      {isV2 && (soul.relationship_dynamics) && (
        <Section title={i18n.relationship_dynamics}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-light">
            {soul.relationship_dynamics.with_mentees && (
              <div><span className="text-[#1D1D1F]">{i18n.with_mentees_label}:</span><br/><span className="text-[#86868B]">{soul.relationship_dynamics.with_mentees}</span></div>
            )}
            {soul.relationship_dynamics.with_peers && (
              <div><span className="text-[#1D1D1F]">{i18n.with_peers_label}:</span><br/><span className="text-[#86868B]">{soul.relationship_dynamics.with_peers}</span></div>
            )}
            {soul.relationship_dynamics.with_authorities && (
              <div><span className="text-[#1D1D1F]">{i18n.with_authorities_label}:</span><br/><span className="text-[#86868B]">{soul.relationship_dynamics.with_authorities}</span></div>
            )}
            {soul.relationship_dynamics.with_institutions && (
              <div><span className="text-[#1D1D1F]">{i18n.with_institutions_label}:</span><br/><span className="text-[#86868B]">{soul.relationship_dynamics.with_institutions}</span></div>
            )}
            {soul.relationship_dynamics.with_fans_public && (
              <div><span className="text-[#1D1D1F]">{i18n.with_fans_label}:</span><br/><span className="text-[#86868B]">{soul.relationship_dynamics.with_fans_public}</span></div>
            )}
            {soul.relationship_dynamics.with_critics && (
              <div><span className="text-[#1D1D1F]">{i18n.with_critics_label}:</span><br/><span className="text-[#86868B]">{soul.relationship_dynamics.with_critics}</span></div>
            )}
          </div>
        </Section>
      )}

      {/* Expertise Details — v2 only */}
      {isV2 && v2exp && (v2exp.common_misperceptions?.length > 0 || v2exp.what_they_reject_or_oppose?.length > 0) && (
        <Section title={i18n.expertise_nuance}>
          {v2exp.common_misperceptions?.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.common_misperceptions_label}</span>
              <ul className="space-y-0.5 mt-1">
                {v2exp.common_misperceptions.map((m: string, i: number) => (
                  <li key={i} className="text-xs text-[#86868B] font-light flex gap-2">
                    <span className="text-[#86868B] shrink-0">&bull;</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {v2exp.what_they_reject_or_oppose?.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.what_they_reject_label}</span>
              <div className="space-y-1 mt-1">
                {v2exp.what_they_reject_or_oppose.map((r: any, i: number) => (
                  <div key={i} className="p-2 rounded-[6px] bg-[rgba(255,59,48,0.03)]">
                    <p className="text-xs text-[#1D1D1F] font-light">{r.position}</p>
                    {r.reason && <p className="text-[10px] text-[#86868B] font-light mt-0.5">{r.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {v2exp.cross_domain_syntheses?.length > 0 && (
            <div>
              <span className="text-[10px] text-[#86868B] font-light uppercase tracking-wide">{i18n.cross_domain_label}</span>
              <ul className="space-y-0.5 mt-1">
                {v2exp.cross_domain_syntheses.map((s: string, i: number) => (
                  <li key={i} className="text-xs text-[#1D1D1F] font-light flex gap-2">
                    <span className="text-[#0071E3] font-light shrink-0">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {/* Identity Extras — v2 only */}
      {isV2 && v2ident && (v2ident.known_as?.length > 1 || v2ident.what_they_refuse_to_be_labelled_as?.length > 0) && (
        <Section title={i18n.identity_nuance}>
          {v2ident.known_as?.length > 1 && (
            <div className="mb-2">
              <span className="text-[10px] text-[#86868B] font-light">{i18n.known_as_label}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2ident.known_as.slice(1).map((n: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(0,0,0,0.03)] rounded-full text-xs text-[#6E6E73] font-light">{n}</span>
                ))}
              </div>
            </div>
          )}
          {v2ident.what_they_refuse_to_be_labelled_as?.length > 0 && (
            <div>
              <span className="text-[10px] text-[#86868B] font-light">{i18n.refuse_label}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {v2ident.what_they_refuse_to_be_labelled_as.map((l: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-[rgba(255,59,48,0.06)] text-[#FF3B30] border border-[rgba(255,59,48,0.15)] rounded-full text-xs font-light">{l}</span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Secondary Lenses — v2 only */}
      {isV2 && v2pf && v2pf.secondary_lenses?.length > 0 && (
        <Section title={i18n.perceptual_lenses}>
          <div className="flex flex-wrap gap-1">
            {v2pf.secondary_lenses.map((l: string, i: number) => (
              <span key={i} className="px-2.5 py-1 bg-[rgba(0,113,227,0.06)] text-[#0071E3] rounded-full text-xs font-light">{l}</span>
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