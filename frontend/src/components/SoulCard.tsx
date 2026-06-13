"use client";

import React, { useState } from "react";
import { Card } from "./ui/card";
import { useLangStore, translations } from "@/lib/i18n";

interface SoulCardProps { soul: any; version?: number; name?: string; }

const str = (v: any): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") return v.belief || v.description || v.value || v.text || v.name || v.model || v.dynamic || v.summary || v.moment || v.tension || v.domain || v.phase || v.register || v.trigger || v.title || "";
  return "";
};
const strs = (v: any): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const obj = (v: any): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function Section({ icon, title }: { icon: string; title: string }) {
  return <div className="flex items-center gap-2 mb-3"><span className="text-base">{icon}</span><h3 className="text-[13px] font-medium text-[#1D1D1F] tracking-[-0.01em]">{title}</h3></div>;
}
function Tags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5 mb-2">{items.map((t, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] text-[12px] font-light text-[#6E6E73]">{t}</span>)}</div>;
}
function Block({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-light text-[#6E6E73] leading-relaxed space-y-1.5 mb-2">{children}</div>;
}
function ArchivePanel({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[rgba(0,0,0,0.04)] last:border-b-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-3 select-none">
        <span className="text-[13px] font-medium text-[#86868B]">{label}</span>
        <svg className={`w-4 h-4 text-[#C7C7CC] transition-transform duration-300 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden"><div className="pb-4 space-y-3">{children}</div></div>
      </div>
    </div>
  );
}

export function SoulCard({ soul, version, name }: SoulCardProps) {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isZh = lang === "zh-CN";
  if (!soul) return <Card className="text-center py-16"><p className="text-sm font-light text-[#86868B]">{t.not_distilled_soul || "Soul not yet forged"}</p></Card>;

  const ident = obj(soul.identity);
  const sourceName = (soul._meta && soul._meta.source_person) || "";
  const sourceBio = (soul._meta && soul._meta.source_bio) || "";
  const cog = obj(soul.cognitive_architecture);
  const per = obj(soul.perceptual_frameworks);
  const emo = obj(soul.emotional_reactive_system);
  const exp = obj(soul.expertise);
  const kb = obj(soul.knowledge_boundaries);
  const comm = obj(soul.communication_profile);
  const ctx = obj(soul.contextual_modulation);
  const rel = obj(soul.relationship_dynamics);
  const vs = obj(soul.voice_samples);
  const tp = obj(soul.temporal_profile);

  const beliefs = arr(cog.core_beliefs).map((b: any) => str(b.belief || b)).filter(Boolean);
  const axioms = strs(cog.axioms);
  const models = arr(per.mental_models).map((m: any) => str(m.model || m)).filter(Boolean);
  const deepDomains = strs(exp.deep_domains);
  const competentDomains = strs(exp.competent_domains);
  const signatureExpressions = strs(comm.signature_expressions);
  const wordsAvoid = strs(comm.words_they_hardenly_ever_use);
  const triggers = strs(emo.triggers);
  const dominance = str(rel.with_dominance);

  return (
    <Card className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden">
      {version && version > 1 && <div className="text-[10px] font-light text-[#C7C7CC] px-5 pt-5">v{version}</div>}

      {/* ── SOURCE ── */}
      {sourceName && (
        <div className="px-5 pt-5 pb-1">
          <p className="text-[11px] font-medium text-[#AEAEB2] tracking-[0.06em] mb-1">{t.insight_source || "Soul Origins"}</p>
          <p className="text-[15px] font-light text-[#6E6E73] leading-relaxed">{sourceBio || (isZh ? `认知DNA提炼自${sourceName}。` : `Cognitive DNA distilled from ${sourceName}.`)}</p>
        </div>
      )}

      <div className="px-5 pt-4 pb-5 space-y-5">

        {/* IDENTITY */}
        {(str(ident.name) || str(ident.title) || str(ident.life_arc)) && (
          <div>
            <Section icon="🧬" title={isZh ? "身份" : "Identity"} />
            <Block>
              {str(ident.title) && <p><strong>{str(ident.title)}</strong>{str(ident.organization) ? ` · ${str(ident.organization)}` : ""}</p>}
              {str(ident.life_arc) && <p>{str(ident.life_arc).slice(0, 500)}</p>}
              {str(ident.self_description) && <p className="italic">"{str(ident.self_description).slice(0, 300)}"</p>}
              {str(ident.how_the_world_sees_them) && <p>{isZh ? "外界看待：" : "World sees: "}{str(ident.how_the_world_sees_them)}</p>}
            </Block>
            {strs(ident.known_as).length > 0 && <Tags items={strs(ident.known_as)} />}
          </div>
        )}

        {/* HOW THEY THINK */}
        {(beliefs.length > 0 || axioms.length > 0 || models.length > 0 || str(per.primary_lens)) && (
          <div>
            <Section icon="🧠" title={isZh ? "思考方式" : "How They Think"} />
            <Block>
              {str(per.primary_lens) && <p>{isZh ? `主导视角：${str(per.primary_lens)}` : `Primary lens: ${str(per.primary_lens)}`}</p>}
              {beliefs.length > 0 && <p>{isZh ? "核心信念：" : "Core beliefs: "}{beliefs.map((b: string) => `"${b}"`).join(" · ")}</p>}
              {axioms.length > 0 && <p>{isZh ? "公理：" : "Axioms: "}{axioms.join(" · ")}</p>}
              {models.length > 0 && <p>{isZh ? "思维模型：" : "Mental models: "}{models.join(" · ")}</p>}
              {strs(cog.contradictory_beliefs).length > 0 && <p>{isZh ? "矛盾信念：" : "Contradictions: "}{strs(cog.contradictory_beliefs).join(" · ")}</p>}
            </Block>
            {strs(cog.provisional_beliefs).length > 0 && <Tags items={strs(cog.provisional_beliefs)} />}
          </div>
        )}

        {/* EXPERTISE */}
        {(deepDomains.length > 0 || competentDomains.length > 0 || str(exp.common_misperceptions)) && (
          <div>
            <Section icon="🎯" title={isZh ? "专业领域" : "Expertise"} />
            {deepDomains.length > 0 && <Tags items={deepDomains} />}
            {competentDomains.length > 0 && <Tags items={competentDomains} />}
            <Block>
              {strs(exp.cross_domain_syntheses).length > 0 && <p>{isZh ? "跨界融合：" : "Cross-domain: "}{strs(exp.cross_domain_syntheses).join(" · ")}</p>}
              {str(exp.common_misperceptions) && <p>{isZh ? "常见误解：" : "Misperception: "}{str(exp.common_misperceptions)}</p>}
              {strs(exp.what_they_reject_or_oppose).length > 0 && <p>{isZh ? "反对：" : "Rejects: "}{strs(exp.what_they_reject_or_oppose).join(" · ")}</p>}
            </Block>
          </div>
        )}

        {/* COMMUNICATION STYLE */}
        {(str(comm.default_register) || signatureExpressions.length > 0 || str(comm.sentence_rhythm)) && (
          <div>
            <Section icon="💬" title={isZh ? "表达风格" : "Communication Style"} />
            <Block>
              {str(comm.default_register) && <p>{isZh ? `语域：${str(comm.default_register)}` : `Register: ${str(comm.default_register)}`}</p>}
              {str(comm.sentence_rhythm) && <p>{isZh ? `句式：${str(comm.sentence_rhythm)}` : `Sentence rhythm: ${str(comm.sentence_rhythm)}`}</p>}
              {str(comm.written_vs_spoken) && <p>{isZh ? `书面vs口语：${str(comm.written_vs_spoken)}` : `Written vs spoken: ${str(comm.written_vs_spoken)}`}</p>}
              {str(comm.to_strangers_vs_intimates) && <p>{isZh ? `对陌生人vs亲密者：${str(comm.to_strangers_vs_intimates)}` : `To strangers vs intimates: ${str(comm.to_strangers_vs_intimates)}`}</p>}
            </Block>
            {signatureExpressions.length > 0 && <Tags items={signatureExpressions} />}
            {wordsAvoid.length > 0 && <Tags items={wordsAvoid.map((w: string) => isZh ? `避用"${w}"` : `avoids "${w}"`)} />}
          </div>
        )}

        {/* EMOTIONAL PATTERNS */}
        {(str(emo.under_stress) || triggers.length > 0 || str(emo.when_challenged)) && (
          <div>
            <Section icon="🎭" title={isZh ? "情绪模式" : "Emotional Patterns"} />
            <Block>
              {str(emo.under_stress) && <p>{isZh ? `压力下：${str(emo.under_stress)}` : `Under stress: ${str(emo.under_stress)}`}</p>}
              {str(emo.when_agreed_with) && <p>{isZh ? `被认同时：${str(emo.when_agreed_with)}` : `When agreed with: ${str(emo.when_agreed_with)}`}</p>}
              {str(emo.when_challenged) && <p>{isZh ? `被挑战时：${str(emo.when_challenged)}` : `When challenged: ${str(emo.when_challenged)}`}</p>}
            </Block>
            {triggers.length > 0 && <Tags items={triggers} />}
            {strs(emo.self_protection_mechanisms).length > 0 && <Tags items={strs(emo.self_protection_mechanisms)} />}
          </div>
        )}

        {/* VOICE SAMPLES */}
        {(str(vs.on_topic_they_love) || str(vs.on_topic_they_resist) || str(vs.when_explaining_something_complex)) && (
          <div>
            <Section icon="🎙️" title={isZh ? "语言样本" : "Voice Samples"} />
            <Block>
              {str(vs.on_topic_they_love) && <p className="italic">"{str(vs.on_topic_they_love)}"</p>}
              {str(vs.on_topic_they_resist) && <p className="italic">"{str(vs.on_topic_they_resist)}"</p>}
              {str(vs.when_explaining_something_complex) && <p className="italic">"{str(vs.when_explaining_something_complex)}"</p>}
              {str(vs.when_pushed_on_a_contradiction) && <p className="italic">"{str(vs.when_pushed_on_a_contradiction)}"</p>}
            </Block>
          </div>
        )}

        {/* RELATIONSHIPS */}
        {(str(rel.with_peers) || str(rel.with_authorities) || str(rel.with_fans_public) || str(rel.with_critics)) && (
          <div>
            <Section icon="🤝" title={isZh ? "人际关系" : "Relationships"} />
            <Block>
              {str(rel.with_mentees) && <p>{isZh ? `对待后辈：${str(rel.with_mentees)}` : `With mentees: ${str(rel.with_mentees)}`}</p>}
              {str(rel.with_peers) && <p>{isZh ? `对待同辈：${str(rel.with_peers)}` : `With peers: ${str(rel.with_peers)}`}</p>}
              {str(rel.with_authorities) && <p>{isZh ? `对待权威：${str(rel.with_authorities)}` : `With authorities: ${str(rel.with_authorities)}`}</p>}
              {str(rel.with_institutions) && <p>{isZh ? `对待机构：${str(rel.with_institutions)}` : `With institutions: ${str(rel.with_institutions)}`}</p>}
              {str(rel.with_fans_public) && <p>{isZh ? `对待粉丝：${str(rel.with_fans_public)}` : `With fans: ${str(rel.with_fans_public)}`}</p>}
              {str(rel.with_critics) && <p>{isZh ? `对待批评者：${str(rel.with_critics)}` : `With critics: ${str(rel.with_critics)}`}</p>}
            </Block>
          </div>
        )}

        {/* CONTEXTUAL */}
        {(str(ctx.when_purpose_is_clarity_vs_impress) || str(ctx.when_audience_is_hostile) || str(ctx.when_being_recorded)) && (
          <div>
            <Section icon="🎯" title={isZh ? "语境调节" : "Contextual Modulation"} />
            <Block>
              {str(ctx.when_purpose_is_clarity_vs_impress) && <p>{isZh ? `清晰vs炫技：${str(ctx.when_purpose_is_clarity_vs_impress)}` : `Clarity vs impress: ${str(ctx.when_purpose_is_clarity_vs_impress)}`}</p>}
              {str(ctx.when_audience_is_hostile) && <p>{isZh ? `面对敌意：${str(ctx.when_audience_is_hostile)}` : `Hostile audience: ${str(ctx.when_audience_is_hostile)}`}</p>}
              {str(ctx.when_being_recorded) && <p>{isZh ? `被记录时：${str(ctx.when_being_recorded)}` : `Being recorded: ${str(ctx.when_being_recorded)}`}</p>}
            </Block>
          </div>
        )}

        {/* EVOLUTION */}
        {(str(tp.how_they_changed_over_time) || str(tp.what_would_change_if_lived_another_decade)) && (
          <div>
            <Section icon="🌀" title={isZh ? "演变" : "Evolution"} />
            <Block>
              {str(tp.how_they_changed_over_time) && <p>{str(tp.how_they_changed_over_time)}</p>}
              {str(tp.what_would_change_if_lived_another_decade) && <p>{isZh ? `十年后：${str(tp.what_would_change_if_lived_another_decade)}` : `In a decade: ${str(tp.what_would_change_if_lived_another_decade)}`}</p>}
              {str(tp.what_they_regret_not_saying_sooner) && <p>{isZh ? `早该说的话：${str(tp.what_they_regret_not_saying_sooner)}` : `Regret: ${str(tp.what_they_regret_not_saying_sooner)}`}</p>}
            </Block>
          </div>
        )}

        {/* BOUNDARIES */}
        {(strs(kb.explicitly_out_of_scope).length > 0 || strs(kb.will_defer_on).length > 0) && (
          <div>
            <Section icon="🚧" title={isZh ? "边界" : "Boundaries"} />
            <Block>
              {strs(kb.explicitly_out_of_scope).length > 0 && <p>{isZh ? `超出范围：${strs(kb.explicitly_out_of_scope).join(" · ")}` : `Out of scope: ${strs(kb.explicitly_out_of_scope).join(" · ")}`}</p>}
              {strs(kb.will_defer_on).length > 0 && <p>{isZh ? `会回避：${strs(kb.will_defer_on).join(" · ")}` : `Will defer: ${strs(kb.will_defer_on).join(" · ")}`}</p>}
            </Block>
          </div>
        )}

      </div>

      {/* ── FULL DNA ARCHIVE ── */}
      <div className="px-5 pt-1 pb-4">
        <div className="border-t border-[rgba(0,0,0,0.06)] pt-3">
          <ArchivePanel label={t.insight_archive || "Full DNA Archive"}>
            <div className="text-[12px] font-light text-[#6E6E73] leading-relaxed space-y-4">
              {[
                ["identity", ident], ["cognitive_architecture", cog], ["perceptual_frameworks", per],
                ["emotional_reactive_system", emo], ["expertise", exp],
                ["communication_profile", comm], ["contextual_modulation", ctx],
                ["relationship_dynamics", rel], ["voice_samples", vs], ["temporal_profile", tp],
                ["knowledge_boundaries", kb]
              ].map(([key, val]) => {
                const entries = Object.entries(obj(val as any));
                if (!entries.length) return null;
                return <div key={key as string}><p className="text-[11px] font-medium text-[#AEAEB2] mb-1">{(key as string).replace(/_/g, " ")}</p>
                  {entries.map(([k, v]) => {
                    const display = typeof v === "string" ? v : JSON.stringify(v);
                    if (!display || display === "[]" || display === "{}" || display === "null") return null;
                    return <p key={k} className="mb-1"><span className="text-[#1D1D1F]">{k}:</span> {display.length > 300 ? display.slice(0, 300) + "\u2026" : display}</p>;
                  })}</div>;
              })}
            </div>
          </ArchivePanel>
        </div>
      </div>
    </Card>
  );
}
