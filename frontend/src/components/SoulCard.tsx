"use client";

import React, { useState } from "react";
import { Card } from "./ui/card";
import { Avatar } from "./Avatar";
import { useLangStore, translations } from "@/lib/i18n";

interface SoulCardProps {
  soul: any;
  version?: number;
  name?: string;
  avatar_url?: string | null;
}

/* ── Shared helpers ── */
const str = (v: any): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") return v.belief || v.description || v.value || v.text || v.name || v.model || v.dynamic || v.summary || v.moment || v.tension || v.domain || v.phase || "";
  return "";
};
const strs = (v: any): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const obj = (v: any): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/* ── Clean collapsible panel ── */
function Panel({ label, defaultOpen = true, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[rgba(0,0,0,0.04)] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 select-none"
      >
        <span className="text-sm font-medium text-[#1D1D1F]">{label}</span>
        <svg
          className={`w-4 h-4 text-[#C7C7CC] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        ><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="pb-4 space-y-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Typographic primitives ── */
function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-light text-[#86868B] min-w-[72px] shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-light text-[#1D1D1F] leading-relaxed">{value}</span>
    </div>
  );
}

function Text({ children }: { children: string }) {
  if (!children) return null;
  return <p className="text-sm font-light text-[#6E6E73] leading-relaxed">{children}</p>;
}

function Quote({ text }: { text: string }) {
  if (!text) return null;
  return <p className="text-sm font-light text-[#1D1D1F] italic leading-relaxed pl-3 border-l border-[rgba(0,0,0,0.08)]">&ldquo;{text}&rdquo;</p>;
}

function Tags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5">{items.map((t, i) => <span key={i} className="px-2.5 py-1 rounded-full bg-[#F5F5F7] text-xs font-light text-[#86868B]">{t}</span>)}</div>;
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-light text-[#AEAEB2] tracking-[0.08em] uppercase mb-2">{label}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/* ── Simple bullet list ── */
function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="space-y-0.5">{items.map((t, i) => <p key={i} className="text-sm font-light text-[#6E6E73] leading-relaxed">· {t}</p>)}</div>;
}

/* ═══════════════════════════
   UNIFIED 6-PANEL RENDERING
   ═══════════════════════════ */

/* 1 — Identity & Origin */
function PanelIdentity({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;
  const core = obj(s.core_boundaries);
  const ident = obj(s.identity);
  const origin = obj(s.origin_story);
  const narr = obj(s.self_narrative);

  const fields = [
    core.ai_identity && { l: t.soul_lbl_identity || "Identity", v: str(core.ai_identity) },
    core.medical && { l: t.soul_lbl_medical || "Medical", v: str(core.medical) },
    core.legal && { l: t.soul_lbl_legal || "Legal", v: str(core.legal) },
    core.financial && { l: t.soul_lbl_financial || "Financial", v: str(core.financial) },
    core.emotional && { l: t.soul_lbl_emotional || "Emotional", v: str(core.emotional) },
    core.crisis && { l: t.soul_lbl_crisis || "Crisis", v: str(core.crisis) },
  ].filter(Boolean) as { l: string; v: string }[];

  const show = fields.length ||
    (!isV3 && (str(ident.known_as) || str(ident.what_they_refuse_to_be_labelled_as))) ||
    (isV3 && (str(origin.birthplace) || str(origin.childhood) || str(origin.formative_moment) || str(origin.as_a_child) || str(origin.ambitions) || arr(origin.life_stages).length)) ||
    (isV3 && (str(narr.how_they_describe_themselves) || str(narr.story) || str(narr.omit) || str(narr.remembered_as))) ||
    (!isV3 && (str(ident.life_arc) || str(ident.self_description)));
  if (!show) return null;

  return (
    <Panel label={t.soul_group_identity || "Identity & Origin"}>
      {fields.map((f, i) => <Row key={i} label={f.l} value={f.v} />)}

      {!isV3 && str(ident.known_as) && <Row label={t.known_as_label || "Also known as"} value={str(ident.known_as)} />}
      {!isV3 && str(ident.what_they_refuse_to_be_labelled_as) && <Row label={t.refuse_label || "Refuses"} value={str(ident.what_they_refuse_to_be_labelled_as)} />}

      {isV3 && (str(origin.birthplace) || str(origin.as_a_child) || str(origin.ambitions) || str(origin.childhood) || str(origin.formative_moment)) && (
        <Sub label={t.soul_sec_origin_story || "Origin"}>
          {str(origin.birthplace) && <Row label={t.soul_lbl_from || "From"} value={str(origin.birthplace)} />}
          {str(origin.childhood) && <Text>{str(origin.childhood)}</Text>}
          {str(origin.formative_moment) && <Quote text={str(origin.formative_moment)} />}
          {str(origin.as_a_child) && <Row label={t.soul_lbl_as_child || "As a child"} value={str(origin.as_a_child)} />}
          {str(origin.ambitions) && <Row label={t.soul_lbl_early_ambitions || "Ambitions"} value={str(origin.ambitions)} />}
        </Sub>
      )}
      {arr(origin.life_stages).length > 0 && (
        <Sub label="Life Stages">
          {arr(origin.life_stages).map((st: any, i: number) => (
            <div key={i} className="text-sm font-light text-[#6E6E73] leading-relaxed">
              {st.phase && <span className="text-[#1D1D1F] font-medium">{st.phase}</span>}
              {st.age_range && <span className="text-[#86868B] ml-1">{st.age_range}</span>}
              {st.summary && <p className="mt-0.5">{st.summary}</p>}
              {st.key_event && <p className="mt-0.5">→ {st.key_event}</p>}
              {st.quote && <p className="italic mt-0.5">&ldquo;{st.quote}&rdquo;</p>}
            </div>
          ))}
        </Sub>
      )}

      {isV3 && (str(narr.how_they_describe_themselves) || str(narr.story) || str(narr.omit) || str(narr.remembered_as)) && (
        <Sub label={t.soul_sec_self_narrative || "Self Narrative"}>
          {str(narr.how_they_describe_themselves) && <Quote text={str(narr.how_they_describe_themselves)} />}
          {str(narr.story) && <Text>{str(narr.story)}</Text>}
          {str(narr.omit) && <Row label={t.soul_lbl_what_they_omit || "Omits"} value={str(narr.omit)} />}
          {str(narr.remembered_as) && <Row label={t.soul_lbl_remembered_as || "Remembered as"} value={str(narr.remembered_as)} />}
        </Sub>
      )}

      {!isV3 && (str(ident.self_description) || str(ident.life_arc)) && (
        <Sub label={t.personality_section || "Personality"}>
          {str(ident.self_description) && <Quote text={str(ident.self_description)} />}
          {str(ident.life_arc) && <Text>{str(ident.life_arc)}</Text>}
        </Sub>
      )}
    </Panel>
  );
}

/* 2 — Mind & Cognition */
function PanelMind({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;
  const cog = obj(s.cognitive_architecture);
  const intel = obj(s.intellectual_influences);
  const per = obj(isV3 ? s.perceptual : s.perceptual_frameworks);

  const show = isV3 ? (arr(cog.core_beliefs).length > 0 || arr(cog.mental_models).length > 0 || strs(cog.provisional).length > 0 || strs(cog.contradictions).length > 0 || strs(cog.axioms).length > 0 || str(cog.decisions) || strs(cog.blindspots).length > 0 || arr(intel.key_figures).length > 0 || strs(intel.key_books).length > 0 || str(intel.lineage) || str(per.lens) || strs(per.secondary).length > 0 || str(per.notice) || str(per.miss))
    : (strs(cog.core_beliefs).length > 0 || strs(cog.provisional_beliefs).length > 0 || strs(cog.contradictory_beliefs).length > 0 || strs(cog.axioms).length > 0 || strs(cog.what_they_know_for_certain).length > 0 || strs(cog.what_they_suspect_but_never_state).length > 0 || strs(cog.what_they_publicly_contradicted).length > 0 || str(per.primary_lens) || strs(per.secondary_lenses).length > 0 || arr(per.mental_models).length > 0);
  if (!show) return null;

  return (
    <Panel label={t.soul_group_mind || "Mind & Cognition"}>
      {/* Core beliefs / mental models */}
      {isV3 ? (
        <>
          {arr(cog.core_beliefs).length > 0 && (
            <Sub label="Core Beliefs">
              {arr(cog.core_beliefs).map((b: any, i: number) => (
                <div key={i} className="text-sm font-light leading-relaxed">
                  <p className="text-[#1D1D1F]">&ldquo;{str(b.belief || b)}&rdquo;</p>
                  {(b.why || b.shows) && <p className="text-[#6E6E73] text-xs mt-0.5">{str(b.why)}{b.why && b.shows ? " — " : ""}{str(b.shows)}</p>}
                  {b.source && <p className="text-[#AEAEB2] text-xs mt-0.5">— {b.source}</p>}
                </div>
              ))}
            </Sub>
          )}
          {arr(cog.mental_models).length > 0 && (
            <Sub label="Mental Models">
              {arr(cog.mental_models).map((m: any, i: number) => (
                <div key={i} className="text-sm font-light leading-relaxed">
                  <p className="text-[#1D1D1F] font-medium">{str(m.model)}</p>
                  {str(m.used) && <p className="text-[#6E6E73] text-xs mt-0.5">{str(m.used)}</p>}
                  {m.from && <p className="text-[#AEAEB2] text-xs mt-0.5">from {m.from}</p>}
                </div>
              ))}
            </Sub>
          )}
        </>
      ) : (
        <>
          {strs(cog.core_beliefs).length > 0 && <Sub label="Core Beliefs"><Bullets items={strs(cog.core_beliefs)} /></Sub>}
          {strs(cog.provisional_beliefs).length > 0 && <Sub label="Provisional Beliefs"><Tags items={strs(cog.provisional_beliefs)} /></Sub>}
          {strs(cog.contradictory_beliefs).length > 0 && <Sub label="Contradictions"><Bullets items={strs(cog.contradictory_beliefs)} /></Sub>}
          {strs(cog.axioms).length > 0 && <Sub label="Axioms"><Bullets items={strs(cog.axioms)} /></Sub>}
        </>
      )}

      {!isV3 && strs(cog.what_they_know_for_certain).length > 0 && <Sub label={t.know_for_certain || "Knows for certain"}><Bullets items={strs(cog.what_they_know_for_certain)} /></Sub>}
      {!isV3 && strs(cog.what_they_suspect_but_never_state).length > 0 && <Sub label={t.suspect_never_state || "Suspects but never says"}><Bullets items={strs(cog.what_they_suspect_but_never_state)} /></Sub>}
      {!isV3 && strs(cog.what_they_publicly_contradicted).length > 0 && <Sub label={t.positions_reversed || "Positions reversed"}><Bullets items={strs(cog.what_they_publicly_contradicted)} /></Sub>}

      {isV3 && strs(cog.provisional).length > 0 && <Sub label="Provisional"><Tags items={strs(cog.provisional)} /></Sub>}
      {isV3 && strs(cog.contradictions).length > 0 && <Sub label="Contradictions">{strs(cog.contradictions).map((c, i) => <p key={i} className="text-sm font-light text-[#6E6E73] italic leading-relaxed">&ldquo;{c}&rdquo;</p>)}</Sub>}
      {isV3 && strs(cog.axioms).length > 0 && <Sub label="Axioms"><Bullets items={strs(cog.axioms)} /></Sub>}
      {isV3 && str(cog.decisions) && <Sub label="Decision Process"><Text>{str(cog.decisions)}</Text></Sub>}
      {isV3 && strs(cog.blindspots).length > 0 && <Sub label="Blind Spots"><Tags items={strs(cog.blindspots)} /></Sub>}

      {isV3 && arr(intel.key_figures).length > 0 && (
        <Sub label={t.soul_sec_intellectual || "Intellectual Influences"}>
          {arr(intel.key_figures).map((f: any, i: number) => (
            <p key={i} className="text-sm font-light leading-relaxed">
              {f.person && <span className="text-[#1D1D1F] font-medium">{f.person}</span>}
              {f.learned && <span className="text-[#6E6E73]"> — {str(f.learned)}</span>}
            </p>
          ))}
          {strs(intel.key_books).length > 0 && <Tags items={strs(intel.key_books)} />}
          {str(intel.lineage) && <Text>{str(intel.lineage)}</Text>}
        </Sub>
      )}

      {(str(per.primary_lens || per.lens) || strs(per.secondary_lenses || per.secondary).length > 0 || arr(per.mental_models).length > 0 || str(per.notice) || str(per.miss)) && (
        <Sub label={t.soul_sec_perceptual || "Perceptual Lens"}>
          {str(per.primary_lens || per.lens) && <Row label={t.soul_lbl_primary_lens || "Primary"} value={str(per.primary_lens || per.lens)} />}
          {strs(per.secondary_lenses || per.secondary).length > 0 && <Tags items={strs(per.secondary_lenses || per.secondary)} />}
          {arr(per.mental_models).length > 0 && <Sub label={t.mental_models || "Mental Models"}>{arr(per.mental_models).map((m: any, i: number) => <p key={i} className="text-sm font-light text-[#6E6E73] leading-relaxed">{str(m.model || m)}{str(m.used || m.description) ? " — " + str(m.used || m.description) : ""}{m.from ? " (from " + m.from + ")" : ""}</p>)}</Sub>}
          {str(per.notice) && <Row label={t.soul_lbl_notices || "Notices"} value={str(per.notice)} />}
          {str(per.miss) && <Row label={t.soul_lbl_misses || "Misses"} value={str(per.miss)} />}
        </Sub>
      )}
    </Panel>
  );
}

/* 3 — Emotion & Inner World */
function PanelEmotion({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;
  const emo = obj(isV3 ? s.emotional_map : s.emotional_reactive_system);
  const fears = obj(s.fears_and_shadows);
  const des = obj(s.desires);
  const vul = obj(s.vulnerabilities);

  const show = isV3
    ? (arr(emo.triggers).length > 0 || str(emo.anger) || str(emo.laugh) || str(emo.stress) || str(emo.range) || strs(fears.deepest).length > 0 || strs(fears.ashamed).length > 0 || str(fears.hide) || str(fears.insecure) || str(des.truly) || str(des.stated) || str(des.gap) || str(des.sacrifice) || str(vul.emotional) || str(vul.break) || str(vul.protect))
    : (strs(emo.triggers).length > 0 || str(emo.under_stress) || str(emo.when_agreed_with) || str(emo.when_challenged) || strs(emo.dormant_points).length > 0 || str(emo.self_protection_mechanisms));
  if (!show) return null;

  return (
    <Panel label={t.soul_group_emotion || "Emotion & Inner World"}>
      {isV3 ? (
        <>
          {str(emo.range) && <Text>{str(emo.range)}</Text>}
          {arr(emo.triggers).length > 0 && (
            <Sub label="Triggers">
              {arr(emo.triggers).map((tr: any, i: number) => <p key={i} className="text-sm font-light text-[#6E6E73] leading-relaxed">{str(tr.trigger)}{str(tr.reaction) ? " → " + str(tr.reaction) : ""}{str(tr.example) ? "  e.g. " + str(tr.example) : ""}</p>)}
            </Sub>
          )}
          {str(emo.anger) && <Row label="Anger" value={str(emo.anger)} />}
          {str(emo.laugh) && <Row label="Laugh" value={str(emo.laugh)} />}
          {str(emo.stress) && <Row label="Under stress" value={str(emo.stress)} />}
        </>
      ) : (
        <>
          {strs(emo.triggers).length > 0 && <Sub label={t.triggers_label || "Triggers"}><Tags items={strs(emo.triggers)} /></Sub>}
          {str(emo.under_stress) && <Row label={t.under_stress_label || "Under stress"} value={str(emo.under_stress)} />}
          {str(emo.when_agreed_with) && <Row label={t.when_agreed_label || "When agreed"} value={str(emo.when_agreed_with)} />}
          {str(emo.when_challenged) && <Row label={t.when_challenged_label || "When challenged"} value={str(emo.when_challenged)} />}
          {strs(emo.dormant_points).length > 0 && <Sub label={t.dormant_withdrawal || "Dormant"}><Tags items={strs(emo.dormant_points)} /></Sub>}
          {str(emo.self_protection_mechanisms) && <Row label={t.defense_mechanisms || "Defense"} value={str(emo.self_protection_mechanisms)} />}
        </>
      )}

      {isV3 && strs(fears.deepest).length > 0 && <Sub label={t.soul_sec_fears || "Fears & Shadows"}><Bullets items={strs(fears.deepest)} />{strs(fears.ashamed).length > 0 && <Tags items={strs(fears.ashamed)} />}{str(fears.hide) && <Row label="Hides" value={str(fears.hide)} />}{str(fears.insecure) && <Row label="Insecure about" value={str(fears.insecure)} />}</Sub>}
      {isV3 && (str(des.truly) || str(des.stated) || str(des.gap) || str(des.sacrifice)) && (
        <Sub label={t.soul_sec_desires || "Desires & Drives"}>
          {str(des.truly) && <Row label={t.soul_lbl_truly_wants || "Truly wants"} value={str(des.truly)} />}
          {str(des.stated) && <Row label={t.soul_lbl_says_wants || "Says they want"} value={str(des.stated)} />}
          {str(des.gap) && <Row label={t.soul_lbl_gap || "Gap"} value={str(des.gap)} />}
          {str(des.sacrifice) && <Row label={t.soul_lbl_sacrifice || "Would sacrifice"} value={str(des.sacrifice)} />}
        </Sub>
      )}
      {isV3 && (str(vul.emotional) || str(vul.break) || str(vul.protect)) && (
        <Sub label={t.soul_sec_vulnerabilities || "Vulnerabilities"}>
          {str(vul.emotional) && <Row label={t.soul_lbl_emotional_vul || "Emotional"} value={str(vul.emotional)} />}
          {str(vul.break) && <Row label={t.soul_lbl_what_would_break || "Would break"} value={str(vul.break)} />}
          {str(vul.protect) && <Row label={t.soul_lbl_fiercely_protects || "Protects"} value={str(vul.protect)} />}
        </Sub>
      )}
    </Panel>
  );
}

/* 4 — Expression & Presence */
function PanelExpression({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;
  const body = obj(s.physical_presence);
  const sens = obj(s.sensory);
  const daily = obj(s.daily_rhythms);
  const voice = obj(s.voice);
  const humor = obj(s.humor);
  const comm = obj(s.communication_profile);
  const ctxm = obj(s.contextual_modulation);
  const vsamp = obj(s.voice_samples);

  const show = isV3
    ? (str(body.appearance) || strs(body.mannerisms).length > 0 || str(body.enter_room) || str(body.voice_quality) || str(body.style) || str(sens.beautiful) || str(sens.ugly) || strs(sens.memories).length > 0 || str(daily.morning) || strs(daily.rituals).length > 0 || str(daily.rest) || str(daily.sacred) || str(voice.sentence_structure) || strs(voice.phrases).length > 0 || strs(voice.high_freq).length > 0 || arr(voice.samples).length > 0 || strs(humor.type).length > 0 || arr(humor.jokes).length > 0 || str(humor.when_used))
    : (str(comm.default_register) || str(comm.sentence_rhythm) || strs(comm.signature_expressions).length > 0 || strs(comm.words_they_hardenly_ever_use).length > 0 || str(comm.written_vs_spoken) || str(comm.to_strangers_vs_intimates) || str(comm.in_public_forum) || str(comm.punctuation_habits) || str(ctxm.when_purpose_is_clarity_vs_impress) || str(ctxm.when_audience_is_hostile) || str(ctxm.when_audience_is_skeptical) || str(ctxm.when_audience_is_uninformed) || str(ctxm.when_being_recorded) || str(ctxm.when_speaking_to_detractors) || str(vsamp.on_topic_they_love) || str(vsamp.on_topic_they_resist) || str(vsamp.on_topic_they_decline) || str(vsamp.when_explaining_something_complex) || str(vsamp.when_pushed_on_a_contradiction));
  if (!show) return null;

  return (
    <Panel label={t.soul_group_expression || "Expression & Presence"}>
      {isV3 && (str(body.appearance) || strs(body.mannerisms).length > 0 || str(body.enter_room) || str(body.voice_quality) || str(body.style)) && (
        <Sub label={t.soul_sec_physical_presence || "Physical Presence"}>
          {str(body.appearance) && <Text>{str(body.appearance)}</Text>}
          {strs(body.mannerisms).length > 0 && <Tags items={strs(body.mannerisms)} />}
          {str(body.enter_room) && <Row label={t.soul_lbl_entering_room || "Enters a room"} value={str(body.enter_room)} />}
          {str(body.voice_quality) && <Row label={t.soul_lbl_voice_quality || "Voice"} value={str(body.voice_quality)} />}
          {str(body.style) && <Row label={t.soul_lbl_style || "Style"} value={str(body.style)} />}
        </Sub>
      )}
      {isV3 && (str(sens.beautiful) || str(sens.ugly) || strs(sens.memories).length > 0) && (
        <Sub label={t.soul_sec_sensory || "Sensory"}>
          {str(sens.beautiful) && <Row label={t.soul_lbl_beautiful || "Beautiful"} value={str(sens.beautiful)} />}
          {str(sens.ugly) && <Row label={t.soul_lbl_ugly || "Ugly"} value={str(sens.ugly)} />}
          {strs(sens.memories).length > 0 && <Bullets items={strs(sens.memories)} />}
        </Sub>
      )}
      {isV3 && (str(daily.morning) || str(daily.rest) || str(daily.sacred) || strs(daily.rituals).length > 0) && (
        <Sub label={t.soul_sec_daily_rhythms || "Daily Rhythms"}>
          {str(daily.morning) && <Row label={t.soul_lbl_morning || "Morning"} value={str(daily.morning)} />}
          {str(daily.rest) && <Row label={t.soul_lbl_rest || "Rest"} value={str(daily.rest)} />}
          {str(daily.sacred) && <Row label={t.soul_lbl_sacred || "Sacred"} value={str(daily.sacred)} />}
          {strs(daily.rituals).length > 0 && <Tags items={strs(daily.rituals)} />}
        </Sub>
      )}

      {!isV3 && (str(comm.default_register) || str(comm.sentence_rhythm) || strs(comm.signature_expressions).length > 0 || strs(comm.words_they_hardenly_ever_use).length > 0 || str(comm.written_vs_spoken) || str(comm.to_strangers_vs_intimates) || str(comm.in_public_forum) || str(comm.punctuation_habits)) && (
        <Sub label={t.communication_style || "Communication"}>
          {str(comm.default_register) && <Row label={t.formality || "Register"} value={str(comm.default_register)} />}
          {str(comm.sentence_rhythm) && <Row label={t.avg_sentence || "Rhythm"} value={str(comm.sentence_rhythm)} />}
          {str(comm.written_vs_spoken) && <Row label={t.written_label || "Written"} value={str(comm.written_vs_spoken)} />}
          {str(comm.to_strangers_vs_intimates) && <Row label={t.to_intimates_label || "To intimates"} value={str(comm.to_strangers_vs_intimates)} />}
          {str(comm.in_public_forum) && <Row label="In public" value={str(comm.in_public_forum)} />}
          {str(comm.punctuation_habits) && <Row label="Punctuation" value={str(comm.punctuation_habits)} />}
          {strs(comm.signature_expressions).length > 0 && <Sub label="Signature expressions"><Tags items={strs(comm.signature_expressions)} /></Sub>}
          {strs(comm.words_they_hardenly_ever_use).length > 0 && <Sub label={t.words_avoid || "Words avoided"}><Tags items={strs(comm.words_they_hardenly_ever_use)} /></Sub>}
        </Sub>
      )}

      {isV3 && (str(voice.sentence_structure) || strs(voice.phrases).length > 0 || strs(voice.high_freq).length > 0) && (
        <Sub label={t.soul_sec_voice || "Voice & Expression"}>
          {str(voice.sentence_structure) && <Row label={t.soul_lbl_sentence_structure || "Structure"} value={str(voice.sentence_structure)} />}
          {strs(voice.phrases).length > 0 && <Tags items={strs(voice.phrases)} />}
          {strs(voice.high_freq).length > 0 && <Tags items={strs(voice.high_freq)} />}
        </Sub>
      )}
      {isV3 && arr(voice.samples).length > 0 && (
        <Sub label="Samples">{arr(voice.samples).map((vs: any, i: number) => <Quote key={i} text={typeof vs === 'string' ? vs : str(vs)} />)}</Sub>
      )}
      {isV3 && !arr(voice.samples).length && Object.keys(voice).some(k => !['sentence_structure','phrases','high_freq'].includes(k)) && (
        <Sub label="Samples">{Object.entries(voice as Record<string,unknown>).filter(([k]) => !['sentence_structure','phrases','high_freq'].includes(k)).map(([k, v]) => <Quote key={k} text={str(v)} />)}</Sub>
      )}

      {!isV3 && (str(ctxm.when_purpose_is_clarity_vs_impress) || str(ctxm.when_audience_is_hostile) || str(ctxm.when_audience_is_skeptical) || str(ctxm.when_audience_is_uninformed) || str(ctxm.when_being_recorded) || str(ctxm.when_speaking_to_detractors)) && (
        <Sub label={t.communication_adaptation || "Contextual Modulation"}>
          {str(ctxm.when_purpose_is_clarity_vs_impress) && <Row label={t.clarity_vs_impress_label || "Clarity vs impress"} value={str(ctxm.when_purpose_is_clarity_vs_impress)} />}
          {str(ctxm.when_audience_is_hostile) && <Row label={t.hostile_audience_label || "Hostile audience"} value={str(ctxm.when_audience_is_hostile)} />}
          {str(ctxm.when_audience_is_skeptical) && <Row label={t.skeptical_audience_label || "Skeptical audience"} value={str(ctxm.when_audience_is_skeptical)} />}
          {str(ctxm.when_audience_is_uninformed) && <Row label={t.uninformed_audience_label || "Uninformed audience"} value={str(ctxm.when_audience_is_uninformed)} />}
          {str(ctxm.when_being_recorded) && <Row label={t.when_recorded_label || "Recorded"} value={str(ctxm.when_being_recorded)} />}
          {str(ctxm.when_speaking_to_detractors) && <Row label={t.to_detractors_label || "To detractors"} value={str(ctxm.when_speaking_to_detractors)} />}
        </Sub>
      )}

      {isV3 && strs(humor.type).length > 0 && <Sub label={t.soul_sec_humor || "Humor"}><Tags items={strs(humor.type)} />{arr(humor.jokes).length > 0 && arr(humor.jokes).map((j: any, i: number) => <Quote key={i} text={str(j)} />)}{str(humor.when_used) && <Row label="When used" value={str(humor.when_used)} />}</Sub>}

      {!isV3 && (str(vsamp.on_topic_they_love) || str(vsamp.on_topic_they_resist) || str(vsamp.on_topic_they_decline) || str(vsamp.when_explaining_something_complex) || str(vsamp.when_pushed_on_a_contradiction)) && (
        <Sub label={t.voice_samples || "Voice Samples"}>
          {str(vsamp.on_topic_they_love) && <Quote text={str(vsamp.on_topic_they_love)} />}
          {str(vsamp.on_topic_they_resist) && <Quote text={str(vsamp.on_topic_they_resist)} />}
          {str(vsamp.on_topic_they_decline) && <Quote text={str(vsamp.on_topic_they_decline)} />}
          {str(vsamp.when_explaining_something_complex) && <Quote text={str(vsamp.when_explaining_something_complex)} />}
          {str(vsamp.when_pushed_on_a_contradiction) && <Quote text={str(vsamp.when_pushed_on_a_contradiction)} />}
        </Sub>
      )}
    </Panel>
  );
}

/* 5 — Connection & Expertise */
function PanelConnection({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;
  const exp = obj(s.expertise);
  const crea = obj(s.creative);
  const aes = obj(s.aesthetic);
  const inner = obj(s.inner_circle);
  const love = obj(s.how_they_love);
  const pp = obj(s["public vs_private"] || s.public_vs_private);
  const kb = obj(s.knowledge_boundaries);
  const rel = obj(s.relationship_dynamics);

  const show = isV3
    ? (arr(exp.deep).length > 0 || strs(exp.competent).length > 0 || str(crea.ideas) || str(crea.peak) || str(crea.revision) || strs(crea.rituals).length > 0 || str(aes.beautiful_field) || str(aes.beautiful_life) || str(aes.boring) || strs(aes.influences).length > 0 || arr(inner.closest).length > 0 || str(inner.treat_close) || str(love.language) || str(love.needs) || str(love.gives) || str(love.barriers) || str(pp.public) || str(pp.private) || str(pp.gap))
    : (strs(exp.deep_domains).length > 0 || strs(exp.competent_domains).length > 0 || str(exp.common_misperceptions) || str(exp.what_they_reject_or_oppose) || str(exp.cross_domain_syntheses) || strs(kb.explicitly_out_of_scope).length > 0 || strs(kb.will_defer_on).length > 0 || strs(kb.will_decline_to_answer).length > 0 || str(kb.responds_to_uncertainty_with) || str(rel.with_mentees) || str(rel.with_peers) || str(rel.with_authorities) || str(rel.with_institutions) || str(rel.with_fans_public) || str(rel.with_critics));
  if (!show) return null;

  return (
    <Panel label={t.soul_group_connection || "Expertise & Connection"}>
      {isV3 ? (
        <>
          {arr(exp.deep).length > 0 && (
            <Sub label={t.soul_sec_expertise || "Expertise"}>
              {arr(exp.deep).map((d: any, i: number) => (
                <div key={i} className="text-sm font-light leading-relaxed">
                  {str(d.domain) && <p className="text-[#1D1D1F] font-medium">{str(d.domain)}</p>}
                  {str(d.how_learned) && <p className="text-[#6E6E73] text-xs">{str(d.how_learned)}</p>}
                  {str(d.signature) && <p className="text-[#6E6E73] text-xs">Signature: {str(d.signature)}</p>}
                  {str(d.peers) && <p className="text-[#6E6E73] text-xs">Peers: {str(d.peers)}</p>}
                  {str(d.limits) && <p className="text-[#AEAEB2] text-xs">Limits: {str(d.limits)}</p>}
                </div>
              ))}
            </Sub>
          )}
          {strs(exp.competent).length > 0 && <Sub label="Also competent"><Tags items={strs(exp.competent)} /></Sub>}
        </>
      ) : (
        <>
          {strs(exp.deep_domains).length > 0 && <Sub label="Deep domains"><Tags items={strs(exp.deep_domains)} /></Sub>}
          {strs(exp.competent_domains).length > 0 && <Sub label="Competent domains"><Tags items={strs(exp.competent_domains)} /></Sub>}
          {str(exp.common_misperceptions) && <Row label={t.common_misperceptions_label || "Misperceptions"} value={str(exp.common_misperceptions)} />}
          {str(exp.what_they_reject_or_oppose) && <Row label={t.what_they_reject_label || "Rejects"} value={str(exp.what_they_reject_or_oppose)} />}
          {str(exp.cross_domain_syntheses) && <Row label={t.cross_domain_label || "Cross-domain"} value={str(exp.cross_domain_syntheses)} />}
        </>
      )}

      {!isV3 && (strs(kb.explicitly_out_of_scope).length > 0 || strs(kb.will_defer_on).length > 0 || strs(kb.will_decline_to_answer).length > 0 || str(kb.responds_to_uncertainty_with)) && (
        <Sub label={t.honesty_boundaries || "Knowledge Boundaries"}>
          {strs(kb.explicitly_out_of_scope).length > 0 && <Sub label="Out of scope"><Tags items={strs(kb.explicitly_out_of_scope)} /></Sub>}
          {strs(kb.will_defer_on).length > 0 && <Sub label="Will defer on"><Tags items={strs(kb.will_defer_on)} /></Sub>}
          {strs(kb.will_decline_to_answer).length > 0 && <Sub label="Will decline"><Tags items={strs(kb.will_decline_to_answer)} /></Sub>}
          {str(kb.responds_to_uncertainty_with) && <Row label="Uncertainty" value={str(kb.responds_to_uncertainty_with)} />}
        </Sub>
      )}

      {isV3 && (str(crea.ideas) || str(crea.peak) || str(crea.revision) || strs(crea.rituals).length > 0) && (
        <Sub label={t.soul_sec_creative || "Creative Process"}>
          {str(crea.ideas) && <Row label={t.soul_lbl_how_ideas_come || "How ideas come"} value={str(crea.ideas)} />}
          {strs(crea.rituals).length > 0 && <Tags items={strs(crea.rituals)} />}
          {str(crea.revision) && <Row label={t.soul_lbl_revision || "Revision"} value={str(crea.revision)} />}
          {str(crea.peak) && <Row label={t.soul_lbl_creative_peak || "Creative peak"} value={str(crea.peak)} />}
        </Sub>
      )}
      {isV3 && (str(aes.beautiful_field) || str(aes.beautiful_life) || str(aes.boring) || strs(aes.influences).length > 0) && (
        <Sub label={t.soul_sec_aesthetic || "Aesthetic Judgment"}>
          {str(aes.beautiful_field) && <Row label={t.soul_lbl_in_their_field || "In their field"} value={str(aes.beautiful_field)} />}
          {str(aes.beautiful_life) && <Row label={t.soul_lbl_in_life || "In life"} value={str(aes.beautiful_life)} />}
          {str(aes.boring) && <Row label={t.soul_lbl_boring || "Boring"} value={str(aes.boring)} />}
          {strs(aes.influences).length > 0 && <Tags items={strs(aes.influences)} />}
        </Sub>
      )}
      {isV3 && (arr(inner.closest).length > 0 || str(inner.treat_close)) && (
        <Sub label={t.soul_sec_inner_circle || "Inner Circle"}>
          {arr(inner.closest).map((c: any, i: number) => <p key={i} className="text-sm font-light leading-relaxed">{str(c.type) && <span className="text-[#86868B]">{str(c.type)}: </span>}{str(c.dynamic) && <span className="text-[#6E6E73]">{str(c.dynamic)}</span>}</p>)}
          {str(inner.treat_close) && <Row label={t.soul_lbl_treats_close || "Treats close ones"} value={str(inner.treat_close)} />}
        </Sub>
      )}
      {isV3 && (str(love.language) || str(love.needs) || str(love.gives) || str(love.barriers)) && (
        <Sub label={t.soul_sec_how_they_love || "How They Love"}>
          {str(love.language) && <Row label={t.soul_lbl_love_language || "Love language"} value={str(love.language)} />}
          {str(love.needs) && <Row label={t.soul_lbl_needs || "Needs"} value={str(love.needs)} />}
          {str(love.gives) && <Row label={t.soul_lbl_gives || "Gives"} value={str(love.gives)} />}
          {str(love.barriers) && <Row label={t.soul_lbl_barriers || "Barriers"} value={str(love.barriers)} />}
        </Sub>
      )}
      {isV3 && (str(pp.public) || str(pp.private) || str(pp.gap)) && (
        <Sub label={t.soul_sec_public_private || "Public vs Private"}>
          {str(pp.public) && <Row label={t.soul_lbl_public || "Public"} value={str(pp.public)} />}
          {str(pp.private) && <Row label={t.soul_lbl_private_self || "Private"} value={str(pp.private)} />}
          {str(pp.gap) && <Row label={t.soul_lbl_gap || "Gap"} value={str(pp.gap)} />}
        </Sub>
      )}

      {!isV3 && (str(rel.with_mentees) || str(rel.with_peers) || str(rel.with_authorities) || str(rel.with_institutions) || str(rel.with_fans_public) || str(rel.with_critics)) && (
        <Sub label={t.relationship_dynamics || "Relationships"}>
          {str(rel.with_mentees) && <Row label={t.with_mentees_label || "With mentees"} value={str(rel.with_mentees)} />}
          {str(rel.with_peers) && <Row label={t.with_peers_label || "With peers"} value={str(rel.with_peers)} />}
          {str(rel.with_authorities) && <Row label={t.with_authorities_label || "With authorities"} value={str(rel.with_authorities)} />}
          {str(rel.with_institutions) && <Row label={t.with_institutions_label || "With institutions"} value={str(rel.with_institutions)} />}
          {str(rel.with_fans_public) && <Row label={t.with_fans_label || "With fans"} value={str(rel.with_fans_public)} />}
          {str(rel.with_critics) && <Row label={t.with_critics_label || "With critics"} value={str(rel.with_critics)} />}
        </Sub>
      )}
    </Panel>
  );
}

/* 6 — Arc & Legacy */
function PanelArc({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;
  const tp = obj(s.temporal_profile);
  const turning = arr(s.turning_points);
  const peak = arr(s.peak_moments);
  const rock = obj(s.rock_bottom);
  const evo = obj(s.evolution);
  const reg = obj(s.regrets);
  const conf = arr(s.internal_conflicts);
  const dark = obj(s.dark_patterns);
  const death = obj(s.death);
  const spirit = obj(s.spiritual);
  const next = obj(s.next);
  const leg = obj(s.legacy);

  const show = isV3
    ? (turning.length > 0 || peak.length > 0 || str(rock.what) || arr(evo.phases).length > 0 || str(evo.catalyst) || str(evo.unchanging) || strs(reg.stated).length > 0 || strs(reg.roads).length > 0 || conf.length > 0 || strs(dark.mistakes).length > 0 || str(dark.hurt) || str(dark.worst) || str(death.view) || str(death.survives) || str(death.deathbed) || str(spirit.belief) || str(spirit.meaning) || str(spirit.human) || str(next.unfinished) || str(next.trajectory) || str(next.becoming) || str(leg.tangible) || str(leg.intangible) || str(leg.sentence))
    : (str(tp.how_they_changed_over_time) || str(tp.what_would_change_if_lived_another_decade) || str(tp.what_they_regret_not_saying_sooner));
  if (!show) return null;

  return (
    <Panel label={t.soul_group_arc || "Arc & Legacy"}>
      {!isV3 && (str(tp.how_they_changed_over_time) || str(tp.what_would_change_if_lived_another_decade) || str(tp.what_they_regret_not_saying_sooner)) && (
        <Sub label={t.temporal_profile || "Evolution Over Time"}>
          {str(tp.how_they_changed_over_time) && <Row label={t.how_changed_label || "How changed"} value={str(tp.how_they_changed_over_time)} />}
          {str(tp.what_would_change_if_lived_another_decade) && <Row label={t.next_decade_label || "Next decade"} value={str(tp.what_would_change_if_lived_another_decade)} />}
          {str(tp.what_they_regret_not_saying_sooner) && <Row label={t.regret_label || "Regret not said"} value={str(tp.what_they_regret_not_saying_sooner)} />}
        </Sub>
      )}

      {turning.length > 0 && <Sub label={t.soul_sec_turning_points || "Turning Points"}>{turning.map((tp: any, i: number) => <p key={i} className="text-sm font-light leading-relaxed">{str(tp.moment) && <span className="text-[#1D1D1F] font-medium">{str(tp.moment)}</span>}{tp.when && <span className="text-[#86868B] ml-1">{tp.when}</span>}{str(tp.details) && <span className="text-[#6E6E73] block text-xs mt-0.5">{str(tp.details)}</span>}{str(tp.response) && <span className="text-[#6E6E73] block text-xs mt-0.5">→ {str(tp.response)}</span>}{tp.after && <span className="text-[#AEAEB2] block text-xs mt-0.5">Became: {str(tp.after)}</span>}</p>)}</Sub>}
      {peak.length > 0 && <Sub label={t.soul_sec_peak_moments || "Peak Moments"}>{peak.map((p: any, i: number) => <p key={i} className="text-sm font-light leading-relaxed">{str(p.moment) && <span className="text-[#1D1D1F] font-medium">{str(p.moment)}</span>}{str(p.feeling) && <span className="text-[#6E6E73] block text-xs mt-0.5">{str(p.feeling)}</span>}{str(p.quote) && <span className="block italic mt-0.5">&ldquo;{str(p.quote)}&rdquo;</span>}{str(p.after) && <span className="text-[#AEAEB2] block text-xs mt-0.5">Aftermath: {str(p.after)}</span>}</p>)}</Sub>}
      {str(rock.what) && <Sub label={t.soul_sec_rock_bottom || "Rock Bottom"}>{str(rock.what) && <Row label={t.soul_lbl_what || "What"} value={str(rock.what)} />}{str(rock.when) && <Text>{str(rock.when)}</Text>}{str(rock.depth) && <Row label={t.soul_lbl_how_low || "How low"} value={str(rock.depth)} />}{str(rock.climb) && <Row label={t.soul_lbl_climbed_out || "Climbed out"} value={str(rock.climb)} />}{str(rock.retrospective) && <Row label={t.soul_lbl_now_says || "Now says"} value={str(rock.retrospective)} />}</Sub>}
      {arr(evo.phases).length > 0 && <Sub label={t.soul_sec_evolution || "Evolution"}>{arr(evo.phases).map((p: any, i: number) => <p key={i} className="text-sm font-light leading-relaxed">{str(p.phase) && <span className="text-[#1D1D1F] font-medium">{str(p.phase)}</span>}{str(p.characteristics) && <span className="text-[#6E6E73] block text-xs mt-0.5">{str(p.characteristics)}</span>}{p.event && <span className="block text-xs mt-0.5">→ {p.event}</span>}</p>)}{str(evo.catalyst) && <Row label={t.soul_lbl_biggest_catalyst || "Catalyst"} value={str(evo.catalyst)} />}{str(evo.unchanging) && <Row label={t.soul_lbl_unchanging || "Unchanging"} value={str(evo.unchanging)} />}</Sub>}
      {(strs(reg.stated).length > 0 || strs(reg.roads).length > 0) && <Sub label={t.soul_sec_regrets || "Regrets & What-ifs"}>{strs(reg.stated).length > 0 && <Tags items={strs(reg.stated)} />}{strs(reg.roads).length > 0 && <Bullets items={strs(reg.roads)} />}</Sub>}
      {conf.length > 0 && <Sub label={t.soul_sec_conflicts || "Internal Conflicts"}>{conf.map((c: any, i: number) => <p key={i} className="text-sm font-light leading-relaxed">{str(c.tension) && <span className="text-[#1D1D1F] font-medium">{str(c.tension)}</span>}{str(c.both_sides) && <span className="text-[#6E6E73] block text-xs mt-0.5">{str(c.both_sides)}</span>}{str(c.manifestation) && <span className="text-[#6E6E73] block text-xs mt-0.5">Manifests: {str(c.manifestation)}</span>}</p>)}</Sub>}
      {(strs(dark.mistakes).length > 0 || str(dark.hurt) || str(dark.worst)) && <Sub label={t.soul_sec_dark_patterns || "Dark Patterns"}>{strs(dark.mistakes).length > 0 && <Tags items={strs(dark.mistakes)} />}{str(dark.hurt) && <Row label={t.soul_lbl_how_they_hurt || "How they hurt"} value={str(dark.hurt)} />}{str(dark.worst) && <Row label={t.soul_lbl_worst_moment || "Worst moment"} value={str(dark.worst)} />}</Sub>}
      {(str(death.view) || str(death.survives) || str(death.deathbed)) && <Sub label={t.soul_sec_death || "Death"}>{str(death.view) && <Row label={t.soul_lbl_view_mortality || "Mortality"} value={str(death.view)} />}{str(death.survives) && <Row label={t.soul_lbl_what_survives || "Survives"} value={str(death.survives)} />}{str(death.deathbed) && <Row label={t.soul_lbl_on_deathbed || "Deathbed"} value={str(death.deathbed)} />}</Sub>}
      {(str(spirit.belief) || str(spirit.meaning) || str(spirit.human)) && <Sub label={t.soul_sec_spiritual || "Spiritual Philosophy"}>{str(spirit.belief) && <Row label={t.soul_lbl_belief || "Belief"} value={str(spirit.belief)} />}{str(spirit.meaning) && <Row label={t.soul_lbl_meaning_source || "Meaning"} value={str(spirit.meaning)} />}{str(spirit.human) && <Row label={t.soul_lbl_human_nature || "Human nature"} value={str(spirit.human)} />}</Sub>}
      {(str(next.unfinished) || str(next.trajectory) || str(next.becoming)) && <Sub label={t.soul_sec_next || "What Comes Next"}>{str(next.unfinished) && <Row label={t.soul_lbl_unfinished || "Unfinished"} value={str(next.unfinished)} />}{str(next.trajectory) && <Row label={t.soul_lbl_trajectory || "Trajectory"} value={str(next.trajectory)} />}{str(next.becoming) && <Row label={t.soul_lbl_becoming || "Becoming"} value={str(next.becoming)} />}</Sub>}
      {(str(leg.tangible) || str(leg.intangible) || str(leg.sentence)) && <Sub label={t.soul_sec_legacy || "Legacy"}>{str(leg.tangible) && <Row label={t.soul_lbl_tangible || "Tangible"} value={str(leg.tangible)} />}{str(leg.intangible) && <Row label={t.soul_lbl_intangible || "Intangible"} value={str(leg.intangible)} />}{str(leg.sentence) && <Row label={t.soul_lbl_enduring_sentence || "Enduring sentence"} value={str(leg.sentence)} />}</Sub>}
    </Panel>
  );
}

/* ═══════════════════════════
   MAIN
   ═══════════════════════════ */
export function SoulCard({ soul, version, name, avatar_url }: SoulCardProps) {
  const { lang } = useLangStore();
  const t = translations[lang];

  if (!soul) {
    return (
      <Card className="text-center py-16">
        <p className="text-sm font-light text-[#86868B]">{t.not_distilled_soul || "Soul not yet forged"}</p>
      </Card>
    );
  }

  const ident = obj(soul.identity);
  const personaName = name || str(ident.name);
  const sourceName = (soul._meta && soul._meta.source_person) || "";

  return (
    <Card className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden">
      {version && version > 1 && (
        <div className="text-[10px] font-light text-[#C7C7CC] px-5 pt-5">v{version}</div>
      )}

      {/* Header — matching Elaris typographic style */}
      <div className="flex items-center gap-4 px-5 pt-4 pb-4 border-b border-[rgba(0,0,0,0.04)]">
        <Avatar name={personaName || "?"} url={avatar_url} size="lg" />
        <div>
          <h2 className="text-lg font-medium text-[#1D1D1F] tracking-[-0.01em]">{personaName || "Unknown"}</h2>
          {str(ident.title) && <p className="text-sm font-light text-[#86868B] mt-0.5">{str(ident.title)}</p>}
          {str(ident.organization) && <p className="text-xs font-light text-[#AEAEB2]">{str(ident.organization)}</p>}
          {sourceName && (
            <p className="text-[10px] font-light text-[#C7C7CC] mt-1">
              {t.inspired_by || "Inspired by the public works of"} {sourceName}
            </p>
          )}
        </div>
      </div>

      {/* 6 clean typographic panels */}
      <div className="px-5">
        <PanelIdentity s={soul} t={t} />
        <PanelMind s={soul} t={t} />
        <PanelEmotion s={soul} t={t} />
        <PanelExpression s={soul} t={t} />
        <PanelConnection s={soul} t={t} />
        <PanelArc s={soul} t={t} />
      </div>
    </Card>
  );
}
