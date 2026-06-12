"use client";

import React, { useState } from "react";
import { Card } from "./ui/card";
import { useLangStore, translations } from "@/lib/i18n";

/* ── Types ── */
interface SoulCardProps {
  soul: any;
  version?: number;
  name?: string;
}

/* ── Helpers ── */
const str = (v: any): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") return v.belief || v.description || v.value || v.text || v.name || v.model || v.dynamic || v.summary || v.moment || v.tension || v.domain || v.phase || "";
  return "";
};
const strs = (v: any): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const obj = (v: any): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const pick = (s: any, ...keys: string[]): any => {
  const o = obj(s);
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/* ── Insight Card ── */
function InsightCard({
  icon, title, children,
}: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.04)] last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="text-[18px] leading-none mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-[#1D1D1F] tracking-[-0.01em] mb-2">{title}</h3>
          <div className="text-[14px] font-light text-[#6E6E73] leading-relaxed space-y-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── A single insight paragraph ── */
function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

/* ── Inline quote ── */
function Q({ text }: { text: string }) {
  if (!text) return null;
  return <span className="text-[#1D1D1F] italic">&ldquo;{text}&rdquo;</span>;
}

/* ── Generate insights from Soul data ── */
function buildInsights(s: any, t: Record<string, string>, sourceName: string, lang: string) {
  const isZh = lang === "zh-CN";
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;

  const cog = obj(s.cognitive_architecture);
  const per = obj(isV3 ? s.perceptual : s.perceptual_frameworks);
  const emo = obj(isV3 ? s.emotional_map : s.emotional_reactive_system);
  const des = obj(s.desires);
  const fears = obj(s.fears_and_shadows);
  const vul = obj(s.vulnerabilities);
  const dark = obj(s.dark_patterns);
  const voice = obj(s.voice);
  const comm = obj(s.communication_profile);
  const vs = obj(s.voice_samples);
  const tp = obj(s.temporal_profile);
  const turning = arr(s.turning_points);
  const peak = arr(s.peak_moments);
  const rock = obj(s.rock_bottom);
  const evo = obj(s.evolution);
  const exp = obj(s.expertise);
  const love = obj(s.how_they_love);
  const rel = obj(s.relationship_dynamics);
  const next = obj(s.next);
  const reg = obj(s.regrets);
  const conf = arr(s.internal_conflicts);

  const insights: { icon: string; title: string; paras: string[] }[] = [];

  // 1. Perception
  {
    const lens = str(pick(per, "lens", "primary_lens"));
    const notice = str(pick(per, "notice"));
    const miss = str(pick(per, "miss"));
    const beliefs = isV3 ? arr(cog.core_beliefs).map((b: any) => str(b.belief || b)).filter(Boolean).slice(0, 2) : strs(cog.core_beliefs).slice(0, 2);
    const paras: string[] = [];
    if (lens) paras.push(isZh ? `这个角色透过「${lens}」的滤镜感知世界。` : `This persona perceives the world through a lens of ${lens}.`);
    if (notice) paras.push(isZh ? `它天然会注意到${notice}。` : `It naturally notices ${notice}.`);
    if (miss) paras.push(isZh ? `它常常忽略${miss}。` : `It consistently overlooks ${miss}.`);
    if (beliefs.length) paras.push(isZh ? `底层信念：${beliefs.map(b => `「${b}」`).join("；")}。` : `Core beliefs: ${beliefs.map(b => `"${b}"`).join("; ")}.`);
    if (paras.length) insights.push({ icon: "🌊", title: t.insight_perception || (isZh ? "它如何感知世界" : "How this persona perceives"), paras });
  }

  // 2. Anchors
  {
    const axioms = strs(isV3 ? cog.axioms : cog.axioms).slice(0, 3);
    const title = str(s.identity?.title);
    const knownFor = str(s.identity?.what_they_are_known_for);
    const actual = str(s.identity?.what_they_actually_are);
    const paras: string[] = [];
    if (title || knownFor) paras.push(isZh ? `这个角色的核心是「${title || knownFor}」${actual ? "——" + actual : ""}。` : `At its core, this persona embodies ${title || knownFor}${actual ? " — " + actual : ""}.`);
    if (axioms.length) paras.push(isZh ? `定义它的公理：${axioms.map(a => `「${a}」`).join("；")}。` : `Axioms that define it: ${axioms.map(a => `"${a}"`).join("; ")}.`);
    if (!paras.length && sourceName) paras.push(isZh ? `这个角色的内核是由${sourceName}的思维模式塑造的。` : `Shaped by the thinking patterns of ${sourceName}.`);
    if (paras.length) insights.push({ icon: "⚓", title: t.insight_anchor || (isZh ? "什么锚定它" : "What anchors this persona"), paras });
  }

  // 3. Drive
  {
    const truly = str(pick(des, "truly"));
    const stated = str(pick(des, "stated"));
    const gap = str(pick(des, "gap"));
    const sacrifice = str(pick(des, "sacrifice"));
    const triggers = isV3 ? arr(emo.triggers).map((tr: any) => str(tr.trigger || tr)).filter(Boolean).slice(0, 3) : strs(emo.triggers).slice(0, 3);
    const paras: string[] = [];
    if (truly) paras.push(isZh ? `它真正渴望的是：${truly}。` : `What it truly wants: ${truly}.`);
    if (stated && stated !== truly) paras.push(isZh ? `它嘴上说的是：${stated}。` : `What it says it wants: ${stated}.`);
    if (gap) paras.push(isZh ? `两者之间的落差：${gap}。` : `The gap: ${gap}.`);
    if (sacrifice) paras.push(isZh ? `它愿意为${sacrifice}付出一切。` : `It would sacrifice everything for: ${sacrifice}.`);
    if (triggers.length && !truly) paras.push(isZh ? `被以下事物驱动：${triggers.join("、")}。` : `Driven by: ${triggers.join(", ")}.`);
    if (paras.length) insights.push({ icon: "🔥", title: t.insight_drive || (isZh ? "什么驱动它" : "What drives this persona"), paras });
  }

  // 4. Voice
  {
    const sentence = str(pick(voice, "sentence_structure"));
    const phrases = (isV3 ? strs(voice.phrases) : strs(comm.signature_expressions)).slice(0, 4);
    const freq = strs(voice.high_freq).slice(0, 4);
    const neverWords = strs(comm.words_they_hardenly_ever_use).slice(0, 4);
    const samples = isV3 ? (arr(voice.samples).length ? arr(voice.samples).map((x: any) => str(x)).slice(0, 2) : []) : [str(vs.on_topic_they_love), str(vs.on_topic_they_resist)].filter(Boolean).slice(0, 2);
    const paras: string[] = [];
    if (sentence) paras.push(sentence);
    if (phrases.length) paras.push(isZh ? `标志性表达：${phrases.map(p => `「${p}」`).join("、")}。` : `Signature phrases: ${phrases.map(p => `"${p}"`).join(", ")}.`);
    if (freq.length) paras.push(isZh ? `高频词汇：${freq.join("、")}。` : `Vocabulary markers: ${freq.join(", ")}.`);
    if (neverWords.length) paras.push(isZh ? `几乎不用的词：${neverWords.join("、")}。` : `Words it rarely uses: ${neverWords.join(", ")}.`);
    if (samples.length) paras.push(samples.map(q => <P key=""><Q text={q} /></P>) as any);
    if (paras.length) insights.push({ icon: "💬", title: t.insight_voice || (isZh ? "它如何表达" : "How this persona speaks"), paras });
  }

  // 5. Shadows
  {
    const deepest = strs(fears.deepest).slice(0, 3);
    const ashamed = strs(fears.ashamed).slice(0, 3);
    const hide = str(pick(fears, "hide"));
    const insecure = str(pick(fears, "insecure"));
    const vulEmo = str(pick(vul, "emotional"));
    const vulBreak = str(pick(vul, "break"));
    const darkHurt = str(pick(dark, "hurt"));
    const mistakes = strs(dark.mistakes).slice(0, 3);
    const conflicts = conf.map((c: any) => str(c.tension)).filter(Boolean).slice(0, 2);
    const paras: string[] = [];
    if (deepest.length) paras.push(isZh ? `最深的恐惧：${deepest.join("、")}。` : `Deepest fears: ${deepest.join(", ")}.`);
    if (hide) paras.push(isZh ? `它隐藏的是：${hide}。` : `It hides: ${hide}.`);
    if (insecure) paras.push(isZh ? `不安全感来源：${insecure}。` : `Insecure about: ${insecure}.`);
    if (vulEmo) paras.push(isZh ? `情感上的脆弱点：${vulEmo}。` : `Emotional vulnerability: ${vulEmo}.`);
    if (vulBreak) paras.push(isZh ? `可能击垮它的是：${vulBreak}。` : `What could break it: ${vulBreak}.`);
    if (darkHurt) paras.push(isZh ? `它伤害别人的方式：${darkHurt}。` : `How it hurts others: ${darkHurt}.`);
    if (mistakes.length) paras.push(isZh ? `反复犯的错：${mistakes.join("、")}。` : `Recurring mistakes: ${mistakes.join(", ")}.`);
    if (conflicts.length) paras.push(isZh ? `内心冲突：${conflicts.map(c => `「${c}」`).join("；")}。` : `Inner conflicts: ${conflicts.map(c => `"${c}"`).join("; ")}.`);
    if (paras.length) insights.push({ icon: "🌑", title: t.insight_shadow || (isZh ? "什么困扰它" : "What haunts this persona"), paras });
  }

  // 6. Arc
  {
    const turningTexts = turning.map((tp: any) => str(tp.moment)).filter(Boolean).slice(0, 2);
    const peakTexts = peak.map((p: any) => str(p.moment)).filter(Boolean).slice(0, 1);
    const rockWhat = str(pick(rock, "what"));
    const rockClimb = str(pick(rock, "climb"));
    const evoPhases = arr(evo.phases).map((p: any) => str(p.phase)).filter(Boolean).slice(0, 2);
    const catalyst = str(pick(evo, "catalyst"));
    const unchanging = str(pick(evo, "unchanging"));
    const nextUnfinished = str(pick(next, "unfinished"));
    const nextTrajectory = str(pick(next, "trajectory"));
    const howChanged = str(pick(tp, "how_they_changed_over_time"));
    const paras: string[] = [];
    if (howChanged) paras.push(howChanged);
    if (turningTexts.length) paras.push(isZh ? `关键转折：${turningTexts.join("；")}。` : `Pivotal moments: ${turningTexts.join("; ")}.`);
    if (peakTexts.length) paras.push(isZh ? `巅峰时刻：${peakTexts[0]}。` : `Peak: ${peakTexts[0]}.`);
    if (rockWhat) paras.push(isZh ? `最低谷：${rockWhat}。` : `At its lowest: ${rockWhat}.`);
    if (rockClimb) paras.push(isZh ? `如何爬出来：${rockClimb}。` : `How it climbed out: ${rockClimb}.`);
    if (evoPhases.length) paras.push(isZh ? `演化阶段：${evoPhases.join(" → ")}。` : `Evolution: ${evoPhases.join(" → ")}.`);
    if (catalyst) paras.push(isZh ? `最大的改变催化剂：${catalyst}。` : `Biggest catalyst: ${catalyst}.`);
    if (unchanging) paras.push(isZh ? `从未改变的内核：${unchanging}。` : `Unchanging core: ${unchanging}.`);
    if (nextUnfinished || nextTrajectory) paras.push(isZh ? `前方还有：${[nextUnfinished, nextTrajectory].filter(Boolean).join(" ")}` : `Ahead: ${[nextUnfinished, nextTrajectory].filter(Boolean).join(" ")}`);
    if (paras.length) insights.push({ icon: "🌀", title: t.insight_arc || (isZh ? "它如何演变" : "How this persona evolves"), paras });
  }

  return insights;
}

/* ── Simple collapsible for DNA archive ── */
function ArchivePanel({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[rgba(0,0,0,0.04)] last:border-b-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-3 select-none">
        <span className="text-[13px] font-medium text-[#86868B]">{label}</span>
        <svg className={`w-4 h-4 text-[#C7C7CC] transition-transform duration-300 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden"><div className="pb-4 space-y-4">{children}</div></div>
      </div>
    </div>
  );
}

/* ── Raw DNA fields (simplified from old panels) ── */
function RawDNA({ s }: { s: any }) {
  const v = s.schema_version;
  const isV3 = v === "3.0" || v === 3;
  const identity = obj(s.identity);
  const cog = obj(s.cognitive_architecture);
  const emo = obj(isV3 ? s.emotional_map : s.emotional_reactive_system);
  const per = obj(isV3 ? s.perceptual : s.perceptual_frameworks);
  const exp = obj(s.expertise);
  const des = obj(s.desires);
  const fears = obj(s.fears_and_shadows);
  const vul = obj(s.vulnerabilities);
  const voice = obj(s.voice);
  const vs = obj(s.voice_samples);
  const tp = obj(s.temporal_profile);
  const dark = obj(s.dark_patterns);
  const reg = obj(s.regrets);
  const conf = arr(s.internal_conflicts);
  const death = obj(s.death);
  const spirit = obj(s.spiritual);

  const allBeliefs = isV3
    ? arr(cog.core_beliefs).map((b: any) => str(b.belief || b)).filter(Boolean)
    : strs(cog.core_beliefs);
  const allAxioms = strs(cog.axioms);
  const allModels = isV3
    ? arr(cog.mental_models).map((m: any) => str(m.model)).filter(Boolean)
    : arr(per.mental_models).map((m: any) => str(m.model || m)).filter(Boolean);
  const allProvisional = strs(cog.provisional_beliefs || cog.provisional);
  const allContradictions = strs(cog.contradictory_beliefs || cog.contradictions);
  
  return (
    <>
      <ArchivePanel label="Core Beliefs & Models">
        {allBeliefs.map((b: string, i: number) => <p key={i} className="text-[13px] font-light text-[#6E6E73] leading-relaxed">&ldquo;{b}&rdquo;</p>)}
        {allAxioms.map((a: string, i: number) => <p key={i} className="text-[13px] font-light text-[#6E6E73] leading-relaxed">· {a}</p>)}
        {allModels.map((m: string, i: number) => <p key={i} className="text-[13px] font-light text-[#6E6E73] leading-relaxed">{m}</p>)}
        {allProvisional.length > 0 && <div className="flex flex-wrap gap-1.5">{allProvisional.map((p: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[12px] font-light text-[#86868B]">{p}</span>)}</div>}
        {allContradictions.length > 0 && allContradictions.map((c: string, i: number) => <p key={i} className="text-[13px] font-light text-[#6E6E73] italic leading-relaxed">&ldquo;{c}&rdquo;</p>)}
      </ArchivePanel>

      {(strs(emo.triggers).length > 0 || str(emo.under_stress) || str(emo.stress)) && (
        <ArchivePanel label="Emotional Patterns">
          {strs(emo.triggers).length > 0 && <div className="flex flex-wrap gap-1.5">{strs(emo.triggers).map((t: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[12px] font-light text-[#86868B]">{str(typeof t === 'object' ? (t as any).trigger : t)}</span>)}</div>}
          {str(emo.under_stress || emo.stress) && <p className="text-[13px] font-light text-[#6E6E73] leading-relaxed">Under stress: {str(emo.under_stress || emo.stress)}</p>}
        </ArchivePanel>
      )}

      {(strs(fears.deepest).length > 0 || strs(dark.mistakes).length > 0 || str(dark.hurt) || conf.length > 0) && (
        <ArchivePanel label="Shadows">
          {strs(fears.deepest).map((f: string, i: number) => <p key={i} className="text-[13px] font-light text-[#6E6E73] leading-relaxed">◦ {f}</p>)}
          {strs(dark.mistakes).length > 0 && <div className="flex flex-wrap gap-1.5">{strs(dark.mistakes).map((m: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[12px] font-light text-[#86868B]">{m}</span>)}</div>}
          {str(dark.hurt) && <p className="text-[13px] font-light text-[#6E6E73] leading-relaxed">How they hurt: {str(dark.hurt)}</p>}
          {conf.map((c: any, i: number) => <p key={i} className="text-[13px] font-light text-[#6E6E73] leading-relaxed">{str(c.tension)}: {str(c.both_sides)}</p>)}
        </ArchivePanel>
      )}

      {strs(voice.phrases).length > 0 && (
        <ArchivePanel label="Signature Phrases">
          {strs(voice.phrases).map((p: string, i: number) => <p key={i} className="text-[13px] font-light text-[#1D1D1F] italic leading-relaxed">&ldquo;{p}&rdquo;</p>)}
        </ArchivePanel>
      )}

      {(str(exp.common_misperceptions) || strs(exp.competent_domains).length > 0) && (
        <ArchivePanel label="Expertise">
          {strs(exp.competent_domains || exp.competent).map((d: string, i: number) => <span key={i} className="inline-block px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[12px] font-light text-[#86868B] mr-1.5 mb-1">{d}</span>)}
          {str(exp.common_misperceptions) && <p className="text-[13px] font-light text-[#6E6E73] leading-relaxed mt-2">{str(exp.common_misperceptions)}</p>}
        </ArchivePanel>
      )}

      {(str(vs.on_topic_they_love) || str(vs.on_topic_they_resist) || arr(voice.samples).length > 0) && (
        <ArchivePanel label="Voice Samples">
          {(isV3 ? arr(voice.samples) : []).map((vs: any, i: number) => <p key={i} className="text-[13px] font-light text-[#1D1D1F] italic leading-relaxed">&ldquo;{str(vs)}&rdquo;</p>)}
          {str(vs.on_topic_they_love) && <p className="text-[13px] font-light text-[#1D1D1F] italic leading-relaxed mt-1">&ldquo;{str(vs.on_topic_they_love)}&rdquo;</p>}
        </ArchivePanel>
      )}

      {(str(tp.how_they_changed_over_time) || strs(reg.stated).length > 0 || str(death.view) || str(spirit.belief)) && (
        <ArchivePanel label="Arc & Philosophy">
          {str(tp.how_they_changed_over_time) && <p className="text-[13px] font-light text-[#6E6E73] leading-relaxed">{str(tp.how_they_changed_over_time)}</p>}
          {strs(reg.stated).length > 0 && <div className="flex flex-wrap gap-1.5">{strs(reg.stated).map((r: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[12px] font-light text-[#86868B]">{r}</span>)}</div>}
          {str(death.view) && <p className="text-[13px] font-light text-[#6E6E73] leading-relaxed mt-1">On mortality: {str(death.view)}</p>}
          {str(spirit.belief) && <p className="text-[13px] font-light text-[#6E6E73] leading-relaxed">Belief: {str(spirit.belief)}</p>}
        </ArchivePanel>
      )}
    </>
  );
}

/* ═══════════════════════════
   MAIN
   ═══════════════════════════ */
export function SoulCard({ soul, version, name }: SoulCardProps) {
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
  const sourceBio = (soul._meta && soul._meta.source_bio) || "";

  // Build insights from soul data
  const insights = buildInsights(soul, t, sourceName, lang);

  return (
    <Card className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden">
      {version && version > 1 && (
        <div className="text-[10px] font-light text-[#C7C7CC] px-5 pt-5">v{version}</div>
      )}

      {/* ── HEADER: AI Identity ── */}
      <div className="px-5 pt-4 pb-3">
        <h2 className="text-[20px] font-semibold text-[#1D1D1F] tracking-[-0.02em]">{personaName || "Unknown"}</h2>
        {(str(ident.title) || str(ident.what_they_are_known_for)) && (
          <p className="text-[14px] font-light text-[#6E6E73] mt-0.5 leading-relaxed">
            {str(ident.what_they_are_known_for || ident.title)}
          </p>
        )}
      </div>

      {/* ── SOURCE: Where this soul comes from ── */}
      {sourceName && (
        <div className="mx-5 mb-1 px-4 py-3 rounded-2xl bg-[#F8F9FA] border border-[rgba(0,0,0,0.04)]">
          <p className="text-[10px] font-medium text-[#AEAEB2] tracking-[0.08em] uppercase mb-1.5">
            {t.insight_source || "Where this soul comes from"}
          </p>
          <p className="text-[13px] font-light text-[#6E6E73] leading-relaxed">
            {sourceBio
              ? sourceBio
              : (lang === "zh-CN"
                ? `这个角色的认知DNA提炼自${sourceName}${str(ident.life_arc) ? "——" + str(ident.life_arc).slice(0, 200) : "。"}`
                : `This persona's cognitive DNA was distilled from ${sourceName}${str(ident.life_arc) ? " — " + str(ident.life_arc).slice(0, 200) : '.'}`)
            }
          </p>
        </div>
      )}

      {/* ── INSIGHT CARDS: 6 Narrative Insights ── */}
      {insights.map((ins, i) => (
        <InsightCard key={i} icon={ins.icon} title={ins.title}>
          {ins.paras.map((p, j) => (
            <P key={j}>{p}</P>
          ))}
        </InsightCard>
      ))}

      {/* ── FULL DNA ARCHIVE (Collapsible) ── */}
      <div className="px-5 pt-2 pb-4">
        <div className="border-t border-[rgba(0,0,0,0.06)] pt-3">
          <ArchivePanel label={t.insight_archive || "Full DNA Archive"}>
            <RawDNA s={soul} />
          </ArchivePanel>
        </div>
      </div>
    </Card>
  );
}
