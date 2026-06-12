"use client";

import React, { useState } from "react";
import { Card } from "./ui/card";
import { Avatar } from "./Avatar";
import { useLangStore, translations } from "@/lib/i18n";

/* ── Types ── */
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
  if (v && typeof v === "object") {
    return v.belief || v.description || v.value || v.text || v.name || v.model || v.dynamic || v.summary || v.moment || v.tension || v.domain || v.phase || "";
  }
  return "";
};
const strs = (v: any): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const obj = (v: any): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/* ── Simple panel ── */
function Panel({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#F0F0F2] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 select-none group"
      >
        <h3 className="text-[14px] font-semibold text-[#1D1D1F] tracking-[-0.01em]">{title}</h3>
        <svg className={`w-4 h-4 text-[#C7C7CC] group-hover:text-[#86868B] transition-all duration-300 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="pb-5 space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Section heading within a panel ── */
function H({ label }: { label: string }) {
  return <h4 className="text-[11px] font-semibold text-[#86868B] tracking-[0.08em] uppercase mb-2">{label}</h4>;
}

/* ── Label-value pair ── */
function LV({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="text-[14px] leading-relaxed flex items-start gap-2 group">
      <span className="text-[#86868B] font-medium shrink-0 min-w-[64px] text-[12px] pt-[1px]">{label}</span>
      <span className="text-[#1D1D1F]">{value}</span>
    </p>
  );
}

/* ── Text block ── */
function T({ text }: { text: string }) {
  if (!text) return null;
  return <p className="text-[14px] text-[#6E6E73] leading-relaxed">{text}</p>;
}

/* ── Quote ── */
function Q({ text }: { text: string }) {
  if (!text) return null;
  return <p className="text-[14px] text-[#1D1D1F] leading-relaxed pl-3 border-l-2 border-[#E5E5EA]">&ldquo;{text}&rdquo;</p>;
}

/* ── Tag pile ── */
function Tags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5">{items.map((t, i) => <span key={i} className="px-2.5 py-1 rounded-full bg-[#F5F5F7] text-[#6E6E73] text-[12px] font-medium">{t}</span>)}</div>;
}

/* ── Item card (for sub-items within a section) ── */
function Item({ header, detail, note, quote }: { header?: string; detail?: string; note?: string; quote?: string }) {
  if (!header && !detail && !note && !quote) return null;
  return (
    <div className="rounded-xl bg-[#FAFAFA] p-3.5">
      {header && <p className="text-[14px] font-semibold text-[#1D1D1F] mb-1">{header}</p>}
      {detail && <p className="text-[13px] text-[#6E6E73] leading-relaxed">{detail}</p>}
      {quote && <p className="text-[13px] text-[#1D1D1F] italic mt-1">&ldquo;{quote}&rdquo;</p>}
      {note && <p className="text-[11px] text-[#C7C7CC] mt-1">{note}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   UNIFIED 6-PANEL RENDERING
   Each panel accepts {v2, v3, t} and renders whatever is available
   ═══════════════════════════════════════════════════════ */

/* ── 1: Identity & Origin ── */
function PanelIdentity({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;

  const core = obj(s.core_boundaries);
  const ident = obj(s.identity);
  const origin = obj(s.origin_story);
  const narr = obj(s.self_narrative);

  const fields: { label: string; value: string }[] = [];
  if (core.ai_identity) fields.push({ label: t.soul_lbl_identity || "Identity", value: str(core.ai_identity) });
  if (core.medical) fields.push({ label: t.soul_lbl_medical || "Medical", value: str(core.medical) });
  if (core.legal) fields.push({ label: t.soul_lbl_legal || "Legal", value: str(core.legal) });
  if (core.financial) fields.push({ label: t.soul_lbl_financial || "Financial", value: str(core.financial) });
  if (core.emotional) fields.push({ label: t.soul_lbl_emotional || "Emotional", value: str(core.emotional) });
  if (core.crisis) fields.push({ label: t.soul_lbl_crisis || "Crisis", value: str(core.crisis) });

  const hasCore = fields.length > 0;
  const hasIdentity = isV3 && (ident.name || ident.aliases || ident.title || ident.organization);
  const hasOrigin = isV3 && (str(origin.birthplace) || str(origin.childhood) || str(origin.formative_moment) || str(origin.as_a_child) || str(origin.ambitions) || arr(origin.life_stages).length);
  const hasNarr = isV3 && (str(narr.how_they_describe_themselves) || str(narr.story) || str(narr.omit) || str(narr.remembered_as));
  const hasV2Bio = !isV3 && ident.life_arc;
  const hasV2Self = !isV3 && ident.self_description;

  if (!hasCore && !hasIdentity && !hasOrigin && !hasNarr && !hasV2Bio && !hasV2Self) return null;

  return (
    <Panel title={t.soul_group_identity || "Identity & Origin"}>
      {hasCore && (
        <div>
          <H label={t.soul_sec_ai_boundaries || "AI Boundaries"} />
          {fields.map((f, i) => <LV key={i} label={f.label} value={f.value} />)}
        </div>
      )}

      {/* V2 identity fields */}
      {!isV3 && ident.known_as && <LV label={t.known_as_label || "Also known as"} value={str(ident.known_as)} />}
      {!isV3 && ident.what_they_refuse_to_be_labelled_as && <LV label={t.refuse_label || "Refuses to be labelled"} value={str(ident.what_they_refuse_to_be_labelled_as)} />}

      {/* V3 origin */}
      {hasOrigin && (
        <div>
          <H label={t.soul_sec_origin_story || "Origin"} />
          {str(origin.birthplace) && <LV label={t.soul_lbl_from || "From"} value={str(origin.birthplace)} />}
          {str(origin.childhood) && <T text={str(origin.childhood)} />}
          {str(origin.formative_moment) && <Q text={str(origin.formative_moment)} />}
          {str(origin.as_a_child) && <LV label={t.soul_lbl_as_child || "As a child"} value={str(origin.as_a_child)} />}
          {str(origin.ambitions) && <LV label={t.soul_lbl_early_ambitions || "Ambitions"} value={str(origin.ambitions)} />}
          {arr(origin.life_stages).map((st: any, i: number) => (
            <Item key={i} header={st.phase} detail={st.summary} note={`${st.age_range || ""}  ${st.key_event ? "→ " + st.key_event : ""}`} quote={st.quote} />
          ))}
        </div>
      )}

      {/* V3 narrative or V2 self_description */}
      {hasNarr ? (
        <div>
          <H label={t.soul_sec_self_narrative || "Self Narrative"} />
          {str(narr.how_they_describe_themselves) && <Q text={str(narr.how_they_describe_themselves)} />}
          {str(narr.story) && <T text={str(narr.story)} />}
          {str(narr.omit) && <LV label={t.soul_lbl_what_they_omit || "Omits"} value={str(narr.omit)} />}
          {str(narr.remembered_as) && <LV label={t.soul_lbl_remembered_as || "Wants to be remembered"} value={str(narr.remembered_as)} />}
        </div>
      ) : hasV2Self ? (
        <div>
          <H label={t.personality_section || "Personality"} />
          <Q text={str(ident.self_description)} />
        </div>
      ) : null}

      {/* V2 life arc */}
      {hasV2Bio && (
        <div>
          <H label={t.soul_sec_origin_story || "Life Arc"} />
          <T text={str(ident.life_arc)} />
        </div>
      )}
    </Panel>
  );
}

/* ── 2: Mind & Cognition ── */
function PanelMind({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;

  const cog = obj(s.cognitive_architecture);
  const intel = obj(s.intellectual_influences);
  const per = obj(isV3 ? s.perceptual : s.perceptual_frameworks);

  const hasV3Cog = arr(cog.core_beliefs).length > 0 || arr(cog.mental_models).length > 0 || strs(cog.provisional).length > 0 || strs(cog.contradictions).length > 0 || strs(cog.axioms).length > 0 || str(cog.decisions) || strs(cog.blindspots).length > 0;
  const hasV2Cog = !isV3 && (strs(cog.core_beliefs).length > 0 || strs(cog.provisional_beliefs).length > 0 || strs(cog.contradictory_beliefs).length > 0 || strs(cog.axioms).length > 0 || strs(cog.what_they_know_for_certain).length > 0 || strs(cog.what_they_suspect_but_never_state).length > 0 || strs(cog.what_they_publicly_contradicted).length > 0);
  const hasInt = isV3 && (arr(intel.key_figures).length > 0 || strs(intel.key_books).length > 0 || str(intel.lineage));
  const hasPer = str(per.primary_lens) || strs(per.secondary_lenses).length > 0 || str(per.lens) || strs(per.secondary).length > 0 || str(per.notice) || str(per.miss) || arr(per.mental_models).length > 0;

  if (!hasV3Cog && !hasV2Cog && !hasInt && !hasPer) return null;

  return (
    <Panel title={t.soul_group_mind || "Mind & Cognition"}>
      {/* Beliefs (unified) */}
      {isV3 ? (
        <>
          {arr(cog.core_beliefs).map((b: any, i: number) => (
            <Item key={i} header={`"${str(b.belief || b)}"`} detail={b.why ? `${b.why}${b.shows ? ' — ' + b.shows : ''}` : (typeof b === 'string' ? '' : str(b.shows))} note={b.source} />
          ))}
          {arr(cog.mental_models).map((m: any, i: number) => (
            <Item key={i} header={str(m.model)} detail={str(m.used)} note={m.from ? `from ${m.from}` : ""} />
          ))}
        </>
      ) : (
        <>
          {strs(cog.core_beliefs).length > 0 && (
            <div>
              <H label="Core Beliefs" />
              {strs(cog.core_beliefs).map((b, i) => <p key={i} className="text-[14px] text-[#1D1D1F] leading-relaxed">· {b}</p>)}
            </div>
          )}
          {strs(cog.provisional_beliefs).length > 0 && (
            <div><H label="Provisional Beliefs" /><Tags items={strs(cog.provisional_beliefs)} /></div>
          )}
          {strs(cog.contradictory_beliefs).length > 0 && (
            <div><H label="Contradictions" />{strs(cog.contradictory_beliefs).map((c, i) => <p key={i} className="text-[13px] text-[#6E6E73] italic leading-relaxed">{c}</p>)}</div>
          )}
          {strs(cog.axioms).length > 0 && (
            <div><H label="Axioms" />{strs(cog.axioms).map((a, i) => <p key={i} className="text-[14px] text-[#1D1D1F] leading-relaxed">· {a}</p>)}</div>
          )}
        </>
      )}

      {/* V2: know for certain / suspect / contradicted */}
      {!isV3 && (
        <>
          {strs(cog.what_they_know_for_certain).length > 0 && (
            <div><H label={t.know_for_certain || "Knows for certain"} />{strs(cog.what_they_know_for_certain).map((v, i) => <p key={i} className="text-[14px] text-[#1D1D1F] leading-relaxed">· {v}</p>)}</div>
          )}
          {strs(cog.what_they_suspect_but_never_state).length > 0 && (
            <div><H label={t.suspect_never_state || "Suspects but never says"} />{strs(cog.what_they_suspect_but_never_state).map((v, i) => <p key={i} className="text-[13px] text-[#6E6E73] italic leading-relaxed">{v}</p>)}</div>
          )}
          {strs(cog.what_they_publicly_contradicted).length > 0 && (
            <div><H label={t.positions_reversed || "Positions reversed"} />{strs(cog.what_they_publicly_contradicted).map((v, i) => <p key={i} className="text-[14px] text-[#1D1D1F] leading-relaxed">↺ {v}</p>)}</div>
          )}
        </>
      )}

      {/* V3: provisional / contradictions / axioms / decisions / blindspots */}
      {isV3 && strs(cog.provisional).length > 0 && (
        <div><H label="Provisional Beliefs" /><Tags items={strs(cog.provisional)} /></div>
      )}
      {isV3 && strs(cog.contradictions).length > 0 && (
        <div><H label="Contradictions" />{strs(cog.contradictions).map((c, i) => <p key={i} className="text-[14px] text-[#6E6E73] italic leading-relaxed">&ldquo;{c}&rdquo;</p>)}</div>
      )}
      {isV3 && strs(cog.axioms).length > 0 && (
        <div><H label="Axioms" />{strs(cog.axioms).map((a, i) => <p key={i} className="text-[14px] text-[#1D1D1F] leading-relaxed">· {a}</p>)}</div>
      )}
      {isV3 && str(cog.decisions) && (
        <div><H label="Decision Process" /><T text={str(cog.decisions)} /></div>
      )}
      {isV3 && strs(cog.blindspots).length > 0 && (
        <div><H label="Blind Spots" /><Tags items={strs(cog.blindspots)} /></div>
      )}

      {/* Intellectual influences (V3 only) */}
      {hasInt && (
        <div>
          <H label={t.soul_sec_intellectual || "Intellectual Influences"} />
          {arr(intel.key_figures).map((f: any, i: number) => (
            <div key={i} className="flex gap-2 text-[14px] leading-relaxed">
              {f.person && <span className="font-semibold text-[#1D1D1F] shrink-0">{f.person}</span>}
              {f.learned && <span className="text-[#6E6E73]">&mdash; {str(f.learned)}</span>}
            </div>
          ))}
          {strs(intel.key_books).length > 0 && <div className="mt-2"><Tags items={strs(intel.key_books)} /></div>}
          {str(intel.lineage) && <T text={str(intel.lineage)} />}
        </div>
      )}

      {/* Perceptual (unified) */}
      {hasPer && (
        <div>
          <H label={t.soul_sec_perceptual || "Perceptual Lens"} />
          {str(per.primary_lens || per.lens) && <LV label={t.soul_lbl_primary_lens || "Primary lens"} value={str(per.primary_lens || per.lens)} />}
          {strs(per.secondary_lenses || per.secondary).length > 0 && <div className="mt-2"><Tags items={strs(per.secondary_lenses || per.secondary)} /></div>}
          {arr(per.mental_models).length > 0 && (
            <div className="mt-2">
              <H label={t.mental_models || "Mental Models"} />
              {arr(per.mental_models).map((m: any, i: number) => (
                <Item key={i} header={str(m.model || m)} detail={str(m.used || m.description)} note={m.from ? `from ${m.from}` : ""} />
              ))}
            </div>
          )}
          {str(per.notice) && <LV label={t.soul_lbl_notices || "Notices"} value={str(per.notice)} />}
          {str(per.miss) && <LV label={t.soul_lbl_misses || "Misses"} value={str(per.miss)} />}
        </div>
      )}
    </Panel>
  );
}

/* ── 3: Emotion & Inner World ── */
function PanelEmotion({ s, t }: { s: any; t: Record<string, string> }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;

  const emo = obj(isV3 ? s.emotional_map : s.emotional_reactive_system);
  const fears = obj(s.fears_and_shadows);
  const des = obj(s.desires);
  const vul = obj(s.vulnerabilities);

  const hasV3Emo = arr(emo.triggers).length > 0 || str(emo.anger) || str(emo.laugh) || str(emo.stress) || str(emo.range);
  const hasV2Emo = !isV3 && (strs(emo.triggers).length > 0 || str(emo.under_stress) || str(emo.when_agreed_with) || str(emo.when_challenged) || strs(emo.dormant_points).length > 0 || str(emo.self_protection_mechanisms));
  const hasFears = isV3 && (strs(fears.deepest).length > 0 || strs(fears.ashamed).length > 0 || str(fears.hide) || str(fears.insecure));
  const hasDes = isV3 && (str(des.truly) || str(des.stated) || str(des.gap) || str(des.sacrifice));
  const hasVul = isV3 && (str(vul.emotional) || str(vul.break) || str(vul.protect));

  if (!hasV3Emo && !hasV2Emo && !hasFears && !hasDes && !hasVul) return null;

  return (
    <Panel title={t.soul_group_emotion || "Emotion & Inner World"}>
      {/* Emotional Map / Emotional Reactive System */}
      {isV3 ? (
        <>
          {str(emo.range) && <T text={str(emo.range)} />}
          {arr(emo.triggers).map((tr: any, i: number) => (
            <Item key={i} header={str(tr.trigger)} detail={str(tr.reaction)} note={str(tr.example) ? `e.g. ${str(tr.example)}` : ""} />
          ))}
          {str(emo.anger) && <LV label="Anger" value={str(emo.anger)} />}
          {str(emo.laugh) && <LV label="Laugh" value={str(emo.laugh)} />}
          {str(emo.stress) && <LV label="Under stress" value={str(emo.stress)} />}
        </>
      ) : (
        <>
          {strs(emo.triggers).length > 0 && <div><H label={t.triggers_label || "Triggers"} /><Tags items={strs(emo.triggers)} /></div>}
          {str(emo.under_stress) && <LV label={t.under_stress_label || "Under stress"} value={str(emo.under_stress)} />}
          {str(emo.when_agreed_with) && <LV label={t.when_agreed_label || "When agreed with"} value={str(emo.when_agreed_with)} />}
          {str(emo.when_challenged) && <LV label={t.when_challenged_label || "When challenged"} value={str(emo.when_challenged)} />}
          {strs(emo.dormant_points).length > 0 && <div><H label={t.dormant_withdrawal || "Dormant / withdrawal"} /><Tags items={strs(emo.dormant_points)} /></div>}
          {str(emo.self_protection_mechanisms) && <LV label={t.defense_mechanisms || "Defense"} value={str(emo.self_protection_mechanisms)} />}
        </>
      )}

      {/* V3: Fears */}
      {hasFears && (
        <div>
          <H label={t.soul_sec_fears || "Fears & Shadows"} />
          {strs(fears.deepest).length > 0 && <div className="mb-3"><span className="text-[12px] font-medium text-[#1D1D1F]">Deepest fears</span>{strs(fears.deepest).map((f, i) => <p key={i} className="text-[14px] text-[#6E6E73] leading-relaxed">◦ {f}</p>)}</div>}
          {strs(fears.ashamed).length > 0 && <div><Tags items={strs(fears.ashamed)} /></div>}
          {str(fears.hide) && <LV label="Hides" value={str(fears.hide)} />}
          {str(fears.insecure) && <LV label="Insecure about" value={str(fears.insecure)} />}
        </div>
      )}

      {/* V3: Desires */}
      {hasDes && (
        <div>
          <H label={t.soul_sec_desires || "Desires & Drives"} />
          {str(des.truly) && <LV label={t.soul_lbl_truly_wants || "Truly wants"} value={str(des.truly)} />}
          {str(des.stated) && <LV label={t.soul_lbl_says_wants || "Says they want"} value={str(des.stated)} />}
          {str(des.gap) && <LV label={t.soul_lbl_gap || "Gap"} value={str(des.gap)} />}
          {str(des.sacrifice) && <LV label={t.soul_lbl_sacrifice || "Would sacrifice"} value={str(des.sacrifice)} />}
        </div>
      )}

      {/* V3: Vulnerabilities */}
      {hasVul && (
        <div>
          <H label={t.soul_sec_vulnerabilities || "Vulnerabilities"} />
          {str(vul.emotional) && <LV label={t.soul_lbl_emotional_vul || "Emotional"} value={str(vul.emotional)} />}
          {str(vul.break) && <LV label={t.soul_lbl_what_would_break || "Would break"} value={str(vul.break)} />}
          {str(vul.protect) && <LV label={t.soul_lbl_fiercely_protects || "Protects"} value={str(vul.protect)} />}
        </div>
      )}
    </Panel>
  );
}

/* ── 4: Expression & Presence ── */
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

  const hasBody = isV3 && (str(body.appearance) || strs(body.mannerisms).length > 0 || str(body.enter_room) || str(body.voice_quality) || str(body.style));
  const hasSens = isV3 && (str(sens.beautiful) || str(sens.ugly) || strs(sens.memories).length > 0);
  const hasDaily = isV3 && (str(daily.morning) || strs(daily.rituals).length > 0 || str(daily.rest) || str(daily.sacred));
  const hasV3Voice = isV3 && (str(voice.sentence_structure) || arr(voice.samples).length > 0 || strs(voice.high_freq).length > 0 || strs(voice.phrases).length > 0);
  const hasHumor = isV3 && (strs(humor.type).length > 0 || arr(humor.jokes).length > 0 || str(humor.when_used));
  const hasComm = !isV3 && (str(comm.default_register) || str(comm.sentence_rhythm) || strs(comm.signature_expressions).length > 0 || strs(comm.words_they_hardenly_ever_use).length > 0);
  const hasCtxm = !isV3 && (str(ctxm.when_purpose_is_clarity_vs_impress) || str(ctxm.when_audience_is_hostile) || str(ctxm.when_audience_is_skeptical) || str(ctxm.when_audience_is_uninformed) || str(ctxm.when_being_recorded) || str(ctxm.when_speaking_to_detractors));
  const hasVSamp = !isV3 && (str(vsamp.on_topic_they_love) || str(vsamp.on_topic_they_resist) || str(vsamp.on_topic_they_decline) || str(vsamp.when_explaining_something_complex) || str(vsamp.when_pushed_on_a_contradiction));

  if (!hasBody && !hasSens && !hasDaily && !hasV3Voice && !hasHumor && !hasComm && !hasCtxm && !hasVSamp) return null;

  return (
    <Panel title={t.soul_group_expression || "Expression & Presence"}>
      {/* V3: Physical Presence */}
      {hasBody && (
        <div>
          <H label={t.soul_sec_physical_presence || "Physical Presence"} />
          {str(body.appearance) && <T text={str(body.appearance)} />}
          {strs(body.mannerisms).length > 0 && <div className="mt-2"><Tags items={strs(body.mannerisms)} /></div>}
          {str(body.enter_room) && <LV label={t.soul_lbl_entering_room || "Enters a room"} value={str(body.enter_room)} />}
          {str(body.voice_quality) && <LV label={t.soul_lbl_voice_quality || "Voice"} value={str(body.voice_quality)} />}
          {str(body.style) && <LV label={t.soul_lbl_style || "Style"} value={str(body.style)} />}
        </div>
      )}

      {/* V3: Sensory */}
      {hasSens && (
        <div>
          <H label={t.soul_sec_sensory || "Sensory"} />
          {str(sens.beautiful) && <LV label={t.soul_lbl_beautiful || "Beautiful"} value={str(sens.beautiful)} />}
          {str(sens.ugly) && <LV label={t.soul_lbl_ugly || "Ugly"} value={str(sens.ugly)} />}
          {strs(sens.memories).length > 0 && <div className="space-y-1 mt-2">{strs(sens.memories).map((m, i) => <p key={i} className="text-[13px] text-[#6E6E73] italic">&ldquo;{m}&rdquo;</p>)}</div>}
        </div>
      )}

      {/* V3: Daily Rhythms */}
      {hasDaily && (
        <div>
          <H label={t.soul_sec_daily_rhythms || "Daily Rhythms"} />
          {str(daily.morning) && <LV label={t.soul_lbl_morning || "Morning"} value={str(daily.morning)} />}
          {str(daily.rest) && <LV label={t.soul_lbl_rest || "Rest"} value={str(daily.rest)} />}
          {str(daily.sacred) && <LV label={t.soul_lbl_sacred || "Sacred"} value={str(daily.sacred)} />}
          {strs(daily.rituals).length > 0 && <div className="mt-2"><Tags items={strs(daily.rituals)} /></div>}
        </div>
      )}

      {/* V2: Communication Profile */}
      {hasComm && (
        <div>
          <H label={t.communication_style || "Communication"} />
          {str(comm.default_register) && <LV label={t.formality || "Register"} value={str(comm.default_register)} />}
          {str(comm.sentence_rhythm) && <LV label={t.avg_sentence || "Rhythm"} value={str(comm.sentence_rhythm)} />}
          {strs(comm.signature_expressions).length > 0 && <div className="mt-2"><H label="Signature expressions" /><Tags items={strs(comm.signature_expressions)} /></div>}
          {strs(comm.words_they_hardenly_ever_use).length > 0 && <div className="mt-2"><H label={t.words_avoid || "Words avoided"} /><Tags items={strs(comm.words_they_hardenly_ever_use)} /></div>}
          {str(comm.written_vs_spoken) && <LV label={t.written_label || "Written"} value={str(comm.written_vs_spoken)} />}
          {str(comm.to_strangers_vs_intimates) && <LV label={t.to_intimates_label || "To intimates"} value={str(comm.to_strangers_vs_intimates)} />}
          {str(comm.in_public_forum) && <LV label="In public" value={str(comm.in_public_forum)} />}
          {str(comm.punctuation_habits) && <LV label="Punctuation" value={str(comm.punctuation_habits)} />}
        </div>
      )}

      {/* V3: Voice */}
      {hasV3Voice && (
        <div>
          <H label={t.soul_sec_voice || "Voice & Expression"} />
          {str(voice.sentence_structure) && <LV label={t.soul_lbl_sentence_structure || "Sentence structure"} value={str(voice.sentence_structure)} />}
          {strs(voice.phrases).length > 0 && <div className="mt-2"><H label="Phrases" /><Tags items={strs(voice.phrases)} /></div>}
          {strs(voice.high_freq).length > 0 && <div className="mt-2"><H label="Vocabulary" /><Tags items={strs(voice.high_freq)} /></div>}
          {arr(voice.samples).length > 0 ? (
            arr(voice.samples).map((vs: any, i: number) => (
              <div key={i} className="mt-2"><Item quote={typeof vs === 'string' ? vs : str(vs)} /></div>
            ))
          ) : Object.keys(voice).some(k => k !== 'sentence_structure' && k !== 'phrases' && k !== 'high_freq') ? (
            Object.entries(voice as Record<string, unknown>).filter(([k]) => !['sentence_structure','phrases','high_freq'].includes(k)).map(([k, v]) => (
              <div key={k} className="mt-2"><Item header={String(k).replace(/_/g, ' ')} quote={str(v)} /></div>
            ))
          ) : null}
        </div>
      )}

      {/* V2: Contextual Modulation */}
      {hasCtxm && (
        <div>
          <H label={t.communication_adaptation || "Contextual Modulation"} />
          {str(ctxm.when_purpose_is_clarity_vs_impress) && <LV label={t.clarity_vs_impress_label || "Clarity vs Impress"} value={str(ctxm.when_purpose_is_clarity_vs_impress)} />}
          {str(ctxm.when_audience_is_hostile) && <LV label={t.hostile_audience_label || "Hostile audience"} value={str(ctxm.when_audience_is_hostile)} />}
          {str(ctxm.when_audience_is_skeptical) && <LV label={t.skeptical_audience_label || "Skeptical audience"} value={str(ctxm.when_audience_is_skeptical)} />}
          {str(ctxm.when_audience_is_uninformed) && <LV label={t.uninformed_audience_label || "Uninformed audience"} value={str(ctxm.when_audience_is_uninformed)} />}
          {str(ctxm.when_being_recorded) && <LV label={t.when_recorded_label || "Recorded"} value={str(ctxm.when_being_recorded)} />}
          {str(ctxm.when_speaking_to_detractors) && <LV label={t.to_detractors_label || "To detractors"} value={str(ctxm.when_speaking_to_detractors)} />}
        </div>
      )}

      {/* V3: Humor */}
      {hasHumor && (
        <div>
          <H label={t.soul_sec_humor || "Humor"} />
          {strs(humor.type).length > 0 && <Tags items={strs(humor.type)} />}
          {arr(humor.jokes).length > 0 && arr(humor.jokes).map((j: any, i: number) => <p key={i} className="text-[14px] text-[#1D1D1F] italic leading-relaxed mt-2">&ldquo;{str(j)}&rdquo;</p>)}
          {str(humor.when_used) && <LV label="When used" value={str(humor.when_used)} />}
        </div>
      )}

      {/* V2: Voice Samples */}
      {hasVSamp && (
        <div>
          <H label={t.voice_samples || "Voice Samples"} />
          {str(vsamp.on_topic_they_love) && <Item header={t.on_love || "On love"} quote={str(vsamp.on_topic_they_love)} />}
          {str(vsamp.on_topic_they_resist) && <Item header={t.on_resist || "On resist"} quote={str(vsamp.on_topic_they_resist)} />}
          {str(vsamp.on_topic_they_decline) && <Item header={t.on_decline || "On decline"} quote={str(vsamp.on_topic_they_decline)} />}
          {str(vsamp.when_explaining_something_complex) && <Item header={t.on_explain || "Explaining complexity"} quote={str(vsamp.when_explaining_something_complex)} />}
          {str(vsamp.when_pushed_on_a_contradiction) && <Item header={t.on_contradiction || "On contradiction"} quote={str(vsamp.when_pushed_on_a_contradiction)} />}
        </div>
      )}
    </Panel>
  );
}

/* ── 5: Connection & Expertise ── */
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

  const hasExp = isV3 ? (arr(exp.deep).length > 0 || strs(exp.competent).length > 0) : (strs(exp.deep_domains).length > 0 || strs(exp.competent_domains).length > 0 || str(exp.common_misperceptions) || str(exp.what_they_reject_or_oppose) || str(exp.cross_domain_syntheses));
  const hasCrea = isV3 && (str(crea.ideas) || str(crea.peak) || str(crea.revision) || strs(crea.rituals).length > 0);
  const hasAes = isV3 && (str(aes.beautiful_field) || str(aes.beautiful_life) || str(aes.boring) || strs(aes.influences).length > 0);
  const hasInner = isV3 && (arr(inner.closest).length > 0 || str(inner.treat_close));
  const hasLove = isV3 && (str(love.language) || str(love.needs) || str(love.gives) || str(love.barriers));
  const hasPP = isV3 && (str(pp.public) || str(pp.private) || str(pp.gap));
  const hasKB = !isV3 && (strs(kb.explicitly_out_of_scope).length > 0 || strs(kb.will_defer_on).length > 0 || strs(kb.will_decline_to_answer).length > 0 || str(kb.responds_to_uncertainty_with));
  const hasRel = !isV3 && (str(rel.with_mentees) || str(rel.with_peers) || str(rel.with_authorities) || str(rel.with_institutions) || str(rel.with_fans_public) || str(rel.with_critics));

  if (!hasExp && !hasCrea && !hasAes && !hasInner && !hasLove && !hasPP && !hasKB && !hasRel) return null;

  return (
    <Panel title={t.soul_group_connection || "Expertise & Connection"}>
      {/* Expertise (unified) */}
      {hasExp && (
        <div>
          <H label={t.soul_sec_expertise || "Expertise"} />
          {isV3 ? (
            <>
              {arr(exp.deep).map((d: any, i: number) => <Item key={i} header={str(d.domain)} detail={`${str(d.how_learned)}${d.signature ? ' · Signature: ' + str(d.signature) : ''}${d.peers ? ' · Peers: ' + str(d.peers) : ''}`} note={d.limits ? `Limits: ${str(d.limits)}` : ""} />)}
              {strs(exp.competent).length > 0 && <div className="mt-2"><span className="text-[12px] text-[#86868B] font-medium">Also: </span><Tags items={strs(exp.competent)} /></div>}
            </>
          ) : (
            <>
              {strs(exp.deep_domains).length > 0 && <div><span className="text-[12px] font-medium text-[#1D1D1F]">Deep domains</span><div className="mt-1"><Tags items={strs(exp.deep_domains)} /></div></div>}
              {strs(exp.competent_domains).length > 0 && <div className="mt-2"><span className="text-[12px] font-medium text-[#1D1D1F]">Competent domains</span><div className="mt-1"><Tags items={strs(exp.competent_domains)} /></div></div>}
              {str(exp.common_misperceptions) && <LV label={t.common_misperceptions_label || "Misperceptions"} value={str(exp.common_misperceptions)} />}
              {str(exp.what_they_reject_or_oppose) && <LV label={t.what_they_reject_label || "Rejects"} value={str(exp.what_they_reject_or_oppose)} />}
              {str(exp.cross_domain_syntheses) && <LV label={t.cross_domain_label || "Cross-domain"} value={str(exp.cross_domain_syntheses)} />}
            </>
          )}
        </div>
      )}

      {/* V2: Knowledge Boundaries */}
      {hasKB && (
        <div>
          <H label={t.honesty_boundaries || "Knowledge Boundaries"} />
          {strs(kb.explicitly_out_of_scope).length > 0 && <div><H label="Out of scope" /><Tags items={strs(kb.explicitly_out_of_scope)} /></div>}
          {strs(kb.will_defer_on).length > 0 && <div className="mt-2"><H label="Will defer on" /><Tags items={strs(kb.will_defer_on)} /></div>}
          {strs(kb.will_decline_to_answer).length > 0 && <div className="mt-2"><H label="Will decline" /><Tags items={strs(kb.will_decline_to_answer)} /></div>}
          {str(kb.responds_to_uncertainty_with) && <LV label="Uncertainty" value={str(kb.responds_to_uncertainty_with)} />}
        </div>
      )}

      {/* V3: Creative */}
      {hasCrea && (
        <div>
          <H label={t.soul_sec_creative || "Creative Process"} />
          {str(crea.ideas) && <LV label={t.soul_lbl_how_ideas_come || "How ideas come"} value={str(crea.ideas)} />}
          {strs(crea.rituals).length > 0 && <div className="mt-2"><Tags items={strs(crea.rituals)} /></div>}
          {str(crea.revision) && <LV label={t.soul_lbl_revision || "Revision"} value={str(crea.revision)} />}
          {str(crea.peak) && <LV label={t.soul_lbl_creative_peak || "Creative peak"} value={str(crea.peak)} />}
        </div>
      )}

      {/* V3: Aesthetic */}
      {hasAes && (
        <div>
          <H label={t.soul_sec_aesthetic || "Aesthetic Judgment"} />
          {str(aes.beautiful_field) && <LV label={t.soul_lbl_in_their_field || "In their field"} value={str(aes.beautiful_field)} />}
          {str(aes.beautiful_life) && <LV label={t.soul_lbl_in_life || "In life"} value={str(aes.beautiful_life)} />}
          {str(aes.boring) && <LV label={t.soul_lbl_boring || "Boring"} value={str(aes.boring)} />}
          {strs(aes.influences).length > 0 && <div className="mt-2"><Tags items={strs(aes.influences)} /></div>}
        </div>
      )}

      {/* V3: Inner Circle */}
      {hasInner && (
        <div>
          <H label={t.soul_sec_inner_circle || "Inner Circle"} />
          {arr(inner.closest).map((c: any, i: number) => <Item key={i} header={str(c.type)} detail={str(c.dynamic)} />)}
          {str(inner.treat_close) && <LV label={t.soul_lbl_treats_close || "Treats close ones"} value={str(inner.treat_close)} />}
        </div>
      )}

      {/* V3: How They Love */}
      {hasLove && (
        <div>
          <H label={t.soul_sec_how_they_love || "How They Love"} />
          {str(love.language) && <LV label={t.soul_lbl_love_language || "Love language"} value={str(love.language)} />}
          {str(love.needs) && <LV label={t.soul_lbl_needs || "Needs"} value={str(love.needs)} />}
          {str(love.gives) && <LV label={t.soul_lbl_gives || "Gives"} value={str(love.gives)} />}
          {str(love.barriers) && <LV label={t.soul_lbl_barriers || "Barriers"} value={str(love.barriers)} />}
        </div>
      )}

      {/* V3: Public vs Private */}
      {hasPP && (
        <div>
          <H label={t.soul_sec_public_private || "Public vs Private"} />
          {str(pp.public) && <LV label={t.soul_lbl_public || "Public"} value={str(pp.public)} />}
          {str(pp.private) && <LV label={t.soul_lbl_private_self || "Private"} value={str(pp.private)} />}
          {str(pp.gap) && <LV label={t.soul_lbl_gap || "Gap"} value={str(pp.gap)} />}
        </div>
      )}

      {/* V2: Relationship Dynamics */}
      {hasRel && (
        <div>
          <H label={t.relationship_dynamics || "Relationships"} />
          {str(rel.with_mentees) && <LV label={t.with_mentees_label || "With mentees"} value={str(rel.with_mentees)} />}
          {str(rel.with_peers) && <LV label={t.with_peers_label || "With peers"} value={str(rel.with_peers)} />}
          {str(rel.with_authorities) && <LV label={t.with_authorities_label || "With authorities"} value={str(rel.with_authorities)} />}
          {str(rel.with_institutions) && <LV label={t.with_institutions_label || "With institutions"} value={str(rel.with_institutions)} />}
          {str(rel.with_fans_public) && <LV label={t.with_fans_label || "With fans"} value={str(rel.with_fans_public)} />}
          {str(rel.with_critics) && <LV label={t.with_critics_label || "With critics"} value={str(rel.with_critics)} />}
        </div>
      )}
    </Panel>
  );
}

/* ── 6: Arc & Legacy ── */
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

  const hasV3 = turning.length > 0 || peak.length > 0 || str(rock.what) || arr(evo.phases).length > 0 || str(evo.catalyst) || str(evo.unchanging) || strs(reg.stated).length > 0 || strs(reg.roads).length > 0 || conf.length > 0 || strs(dark.mistakes).length > 0 || str(dark.hurt) || str(dark.worst) || str(death.view) || str(death.survives) || str(death.deathbed) || str(spirit.belief) || str(spirit.meaning) || str(spirit.human) || str(next.unfinished) || str(next.trajectory) || str(next.becoming) || str(leg.tangible) || str(leg.intangible) || str(leg.sentence);
  const hasV2 = !isV3 && (str(tp.how_they_changed_over_time) || str(tp.what_would_change_if_lived_another_decade) || str(tp.what_they_regret_not_saying_sooner));

  if (!hasV3 && !hasV2) return null;

  return (
    <Panel title={t.soul_group_arc || "Arc & Legacy"}>
      {/* V2: Temporal Profile = V3 arc summary */}
      {hasV2 && (
        <div>
          <H label={t.temporal_profile || "Evolution Over Time"} />
          {str(tp.how_they_changed_over_time) && <LV label={t.how_changed_label || "How changed"} value={str(tp.how_they_changed_over_time)} />}
          {str(tp.what_would_change_if_lived_another_decade) && <LV label={t.next_decade_label || "Next decade"} value={str(tp.what_would_change_if_lived_another_decade)} />}
          {str(tp.what_they_regret_not_saying_sooner) && <LV label={t.regret_label || "Regret not said"} value={str(tp.what_they_regret_not_saying_sooner)} />}
        </div>
      )}

      {/* V3: Turning Points */}
      {turning.length > 0 && (
        <div>
          <H label={t.soul_sec_turning_points || "Turning Points"} />
          {turning.map((tp: any, i: number) => (
            <Item key={i} header={`${str(tp.moment)}${tp.when ? ' · ' + tp.when : ''}`} detail={str(tp.details)} note={`→ ${str(tp.response)}${tp.after ? ' · Became: ' + str(tp.after) : ''}`} />
          ))}
        </div>
      )}

      {/* V3: Peak Moments */}
      {peak.length > 0 && (
        <div>
          <H label={t.soul_sec_peak_moments || "Peak Moments"} />
          {peak.map((p: any, i: number) => (
            <Item key={i} header={str(p.moment)} detail={str(p.feeling)} note={str(p.after)} quote={str(p.quote)} />
          ))}
        </div>
      )}

      {/* V3: Rock Bottom */}
      {str(rock.what) && (
        <div>
          <H label={t.soul_sec_rock_bottom || "Rock Bottom"} />
          {str(rock.what) && <LV label={t.soul_lbl_what || "What"} value={str(rock.what)} />}
          {str(rock.when) && <T text={str(rock.when)} />}
          {str(rock.depth) && <LV label={t.soul_lbl_how_low || "How low"} value={str(rock.depth)} />}
          {str(rock.climb) && <LV label={t.soul_lbl_climbed_out || "Climbed out"} value={str(rock.climb)} />}
          {str(rock.retrospective) && <LV label={t.soul_lbl_now_says || "Now says"} value={str(rock.retrospective)} />}
        </div>
      )}

      {/* V3: Evolution */}
      {arr(evo.phases).length > 0 && (
        <div>
          <H label={t.soul_sec_evolution || "Evolution"} />
          {arr(evo.phases).map((p: any, i: number) => <Item key={i} header={str(p.phase)} detail={str(p.characteristics)} note={p.event ? `→ ${p.event}` : ""} />)}
          {str(evo.catalyst) && <LV label={t.soul_lbl_biggest_catalyst || "Catalyst"} value={str(evo.catalyst)} />}
          {str(evo.unchanging) && <LV label={t.soul_lbl_unchanging || "Unchanging"} value={str(evo.unchanging)} />}
        </div>
      )}

      {/* V3: Regrets */}
      {(strs(reg.stated).length > 0 || strs(reg.roads).length > 0) && (
        <div>
          <H label={t.soul_sec_regrets || "Regrets & What-ifs"} />
          {strs(reg.stated).length > 0 && <div><span className="text-[12px] font-medium text-[#1D1D1F]">Stated</span><Tags items={strs(reg.stated)} /></div>}
          {strs(reg.roads).length > 0 && <div className="mt-2"><span className="text-[12px] font-medium text-[#1D1D1F]">Roads not taken</span>{strs(reg.roads).map((r, i) => <p key={i} className="text-[14px] text-[#6E6E73] leading-relaxed">↗ {r}</p>)}</div>}
        </div>
      )}

      {/* V3: Internal Conflicts */}
      {conf.length > 0 && (
        <div>
          <H label={t.soul_sec_conflicts || "Internal Conflicts"} />
          {conf.map((c: any, i: number) => <Item key={i} header={str(c.tension)} detail={`${str(c.both_sides)}${c.manifestation ? ' · Manifests: ' + str(c.manifestation) : ''}`} />)}
        </div>
      )}

      {/* V3: Dark Patterns */}
      {(strs(dark.mistakes).length > 0 || str(dark.hurt) || str(dark.worst)) && (
        <div>
          <H label={t.soul_sec_dark_patterns || "Dark Patterns"} />
          {strs(dark.mistakes).length > 0 && <div><span className="text-[12px] font-medium text-[#1D1D1F]">Recurring mistakes</span><Tags items={strs(dark.mistakes)} /></div>}
          {str(dark.hurt) && <LV label={t.soul_lbl_how_they_hurt || "How they hurt"} value={str(dark.hurt)} />}
          {str(dark.worst) && <LV label={t.soul_lbl_worst_moment || "Worst moment"} value={str(dark.worst)} />}
        </div>
      )}

      {/* V3: Death */}
      {(str(death.view) || str(death.survives) || str(death.deathbed)) && (
        <div>
          <H label={t.soul_sec_death || "Death"} />
          {str(death.view) && <LV label={t.soul_lbl_view_mortality || "Mortality"} value={str(death.view)} />}
          {str(death.survives) && <LV label={t.soul_lbl_what_survives || "Survives"} value={str(death.survives)} />}
          {str(death.deathbed) && <LV label={t.soul_lbl_on_deathbed || "Deathbed"} value={str(death.deathbed)} />}
        </div>
      )}

      {/* V3: Spiritual */}
      {(str(spirit.belief) || str(spirit.meaning) || str(spirit.human)) && (
        <div>
          <H label={t.soul_sec_spiritual || "Spiritual Philosophy"} />
          {str(spirit.belief) && <LV label={t.soul_lbl_belief || "Belief"} value={str(spirit.belief)} />}
          {str(spirit.meaning) && <LV label={t.soul_lbl_meaning_source || "Meaning"} value={str(spirit.meaning)} />}
          {str(spirit.human) && <LV label={t.soul_lbl_human_nature || "Human nature"} value={str(spirit.human)} />}
        </div>
      )}

      {/* V3: Next / Legacy */}
      {(str(next.unfinished) || str(next.trajectory) || str(next.becoming)) && (
        <div>
          <H label={t.soul_sec_next || "What Comes Next"} />
          {str(next.unfinished) && <LV label={t.soul_lbl_unfinished || "Unfinished"} value={str(next.unfinished)} />}
          {str(next.trajectory) && <LV label={t.soul_lbl_trajectory || "Trajectory"} value={str(next.trajectory)} />}
          {str(next.becoming) && <LV label={t.soul_lbl_becoming || "Becoming"} value={str(next.becoming)} />}
        </div>
      )}

      {(str(leg.tangible) || str(leg.intangible) || str(leg.sentence)) && (
        <div>
          <H label={t.soul_sec_legacy || "What They Leave Behind"} />
          {str(leg.tangible) && <LV label={t.soul_lbl_tangible || "Tangible"} value={str(leg.tangible)} />}
          {str(leg.intangible) && <LV label={t.soul_lbl_intangible || "Intangible"} value={str(leg.intangible)} />}
          {str(leg.sentence) && <LV label={t.soul_lbl_enduring_sentence || "Enduring sentence"} value={str(leg.sentence)} />}
        </div>
      )}
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN SoulCard
   ═══════════════════════════════════════════════════════ */
export function SoulCard({ soul, version, name, avatar_url }: SoulCardProps) {
  const { lang } = useLangStore();
  const t = translations[lang];

  if (!soul) {
    return (
      <Card className="text-center py-16">
        <p className="text-[14px] text-[#86868B] font-medium">{t.not_distilled_soul || "Soul not yet forged"}</p>
      </Card>
    );
  }

  const ident = obj(soul.identity);
  const personaName = name || str(ident.name);

  return (
    <Card className="overflow-hidden">
      {version && version > 1 && (
        <div className="text-[10px] text-[#C7C7CC] font-medium px-5 pt-5">v{version}</div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-4 pb-4 border-b border-[#F0F0F2]">
        <Avatar name={personaName || "?"} url={avatar_url} size="lg" />
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">{personaName || "Unknown"}</h2>
          {str(ident.title) && <p className="text-[13px] text-[#6E6E73] font-medium mt-0.5">{str(ident.title)}</p>}
          {str(ident.organization) && <p className="text-[12px] text-[#86868B]">{str(ident.organization)}</p>}
        </div>
      </div>

      {/* 6 panels */}
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
