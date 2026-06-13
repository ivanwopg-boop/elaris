"use client";

import React from "react";
import { Card } from "./ui/card";
import { useLangStore, translations } from "@/lib/i18n";

interface SoulCardProps { soul: any; version?: number; name?: string; }

const str = (v: any): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ");
  if (typeof v === "object") return v.belief || v.description || v.value || v.text || v.name || v.model || v.summary || v.moment || v.tension || v.domain || v.title || v.how || v.what || v.why || v.lesson || v.pattern || v.theme || v.taste || v.style || v.feeling || v.moment || v.what || Object.values(v).map(str).filter(Boolean).join(" ") || "";
  return "";
};
const strs = (v: any): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const obj = (v: any): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function Section({ icon, title }: { icon: string; title: string }) {
  return <div className="flex items-center gap-2 mb-3"><h3 className="text-[13px] font-medium text-[#1D1D1F] tracking-[-0.01em]">{title}</h3></div>;
}
function Tags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5 mb-2">{items.map((t, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] text-[12px] font-light text-[#6E6E73]">{t}</span>)}</div>;
}
function P({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return <p className={`text-[13px] font-light text-[#6E6E73] leading-relaxed ${className || ""}`}>{label && <span className="text-[#86868B]">{label}: </span>}{children}</p>;
}
function Block({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 mb-2">{children}</div>;
}

export function SoulCard({ soul, version, name }: SoulCardProps) {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isZh = lang === "zh-CN";
  if (!soul) return <Card className="text-center py-16"><p className="text-sm font-light text-[#86868B]">{t.not_distilled_soul || "Not yet ready"}</p></Card>;

  const ident = obj(soul.identity);
  const cog = obj(soul.cognitive_architecture);
  const per = obj(soul.perceptual);
  const voice = obj(soul.voice);
  const emo = obj(soul.emotional_map);
  const exp = obj(soul.expertise);
  const bound = obj(soul.core_boundaries);
  const humor = obj(soul.humor);
  const creative = obj(soul.creative);
  const aesthetic = obj(soul.aesthetic);
  const sensory = obj(soul.sensory);
  const daily = obj(soul.daily_rhythms);
  const physical = obj(soul.physical_presence);
  const fears = obj(soul.fears_and_shadows);
  const desires = obj(soul.desires);
  const vulns = obj(soul.vulnerabilities);
  const inner = obj(soul.inner_circle);
  const love = obj(soul.how_they_love);
  const pubPriv = obj(soul.public_vs_private);
  const evolution = obj(soul.evolution);
  const legacy = obj(soul.legacy);
  const death = obj(soul.death);
  const spiritual = obj(soul.spiritual);
  const originStory = obj(soul.origin_story);
  const selfNarr = obj(soul.self_narrative);
  const next = obj(soul.next);
  const intellectual = obj(soul.intellectual_influences);
  const dark = obj(soul.dark_patterns);
  const regrets = obj(soul.regrets);
  const turning = arr(soul.turning_points);
  const peaks = arr(soul.peak_moments);
  const rockBottom = obj(soul.rock_bottom);
  const conflicts = arr(soul.internal_conflicts);

  // Check if section has content
  const has = (...vals: any[]) => vals.some(v => v && (typeof v === "string" ? v.trim() : true));
  // Helper: array of objects → tags
  const arrTags = (a: any[], key: string) => a.map((x: any) => obj(x)[key] || x).map(str).filter(Boolean);
  // Helper: array of objects → joined blocks
  const arrBlocks = (a: any[], keys: string[]) => a.map((item: any) => { const o = obj(item); return keys.map(k => o[k]).filter(Boolean).map(str).join(" — "); }).filter(Boolean);

  return (
    <Card className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden">
      {version && version > 1 && <div className="text-[10px] font-light text-[#C7C7CC] px-5 pt-5">v{version}</div>}

      <div className="px-5 pt-5 pb-5 space-y-5">

        {/* IDENTITY */}
        <div>
          <Section icon="" title={isZh ? "身份" : "Identity"} />
          <Block>
            {str(ident.title) && <P><strong>{str(ident.title)}</strong>{str(ident.organization) ? ` · ${str(ident.organization)}` : ""}</P>}
            {str(ident.nationality) && <P>{str(ident.nationality)}{str(ident.era) ? ` · ${str(ident.era)}` : ""}</P>}
            {str(selfNarr.how_they_describe_themselves) && <P className="italic">"{str(selfNarr.how_they_describe_themselves).slice(0, 300)}"</P>}
          </Block>
          {strs(ident.known_as).length > 0 && <Tags items={strs(ident.known_as)} />}
        </div>

        {/* ORIGIN STORY */}
        {has(str(originStory.formative), str(originStory.childhood)) && (
          <div>
            <Section icon="" title={isZh ? "成长背景" : "Origins"} />
            <Block>
              {str(originStory.birthplace) && <P>{str(originStory.birthplace)}</P>}
              {str(originStory.childhood) && <P>{str(originStory.childhood).slice(0, 300)}</P>}
              {str(originStory.formative) && <P>{str(originStory.formative).slice(0, 300)}</P>}
              {str(originStory.as_child) && <P>{isZh ? "小时候：" : "As a child: "}{str(originStory.as_child).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* COGNITIVE — How They Think */}
        {has(cog.core_beliefs, cog.axioms, cog.contradictory_beliefs) && (
          <div>
            <Section icon="" title={isZh ? "思维方式" : "How They Think"} />
            <Block>
              {arr(cog.core_beliefs).map((b: any, i: number) => {
                const o = obj(b);
                return <P key={i}>"{str(o.belief || o)}"{str(o.why) ? ` — ${str(o.why).slice(0, 150)}` : ""}</P>;
              })}
              {strs(cog.axioms).length > 0 && <P label={isZh ? "公理" : "Axioms"}>{strs(cog.axioms).join(" · ")}</P>}
              {strs(cog.contradictory_beliefs).length > 0 && <P label={isZh ? "矛盾" : "Contradictions"}>{strs(cog.contradictory_beliefs).join(" · ")}</P>}
              {strs(cog.provisional_beliefs).length > 0 && <P label={isZh ? "暂定" : "Provisional"}>{strs(cog.provisional_beliefs).join(" · ")}</P>}
            </Block>
          </div>
        )}

        {/* PERCEPTUAL */}
        {has(str(per.primary_lens), arr(per.mental_models)) && (
          <div>
            <Section icon="" title={isZh ? "认知视角" : "Perception"} />
            <Block>
              {str(per.primary_lens) && <P label={isZh ? "主导视角" : "Primary lens"}>{str(per.primary_lens)}</P>}
              {arrTags(arr(per.mental_models), 'model').length > 0 && <Tags items={arrTags(arr(per.mental_models), 'model')} />}
            </Block>
          </div>
        )}

        {/* EXPERTISE */}
        {has(arr(exp.deep), arr(exp.competent), exp.cross_domain_syntheses) && (
          <div>
            <Section icon="" title={isZh ? "专业领域" : "Expertise"} />
            {arrTags(arr(exp.deep), 'domain').length > 0 && <Tags items={arrTags(arr(exp.deep), 'domain')} />}
            {arrTags(arr(exp.competent), 'domain').length > 0 && <Tags items={arrTags(arr(exp.competent), 'domain')} />}
            <Block>
              {arrBlocks(arr(exp.deep), ['domain', 'how', 'signature']).map((t, i) => <P key={i}>{t.slice(0, 250)}</P>)}
              {strs(exp.cross_domain_syntheses).length > 0 && <P label={isZh ? "跨界" : "Cross-domain"}>{strs(exp.cross_domain_syntheses).join(" · ")}</P>}
              {str(exp.common_misperceptions) && <P label={isZh ? "常见误解" : "Misperception"}>{str(exp.common_misperceptions)}</P>}
            </Block>
          </div>
        )}

        {/* VOICE — Expression Style */}
        {has(str(voice.phrases), str(voice.sentence), str(voice.metaphors), arr(voice.high_freq)) && (
          <div>
            <Section icon="" title={isZh ? "表达风格" : "Voice & Expression"} />
            <Block>
              {str(voice.sentence) && <P label={isZh ? "句式" : "Sentence"}>{str(voice.sentence).slice(0, 250)}</P>}
              {str(voice.phrases) && <P label={isZh ? "常用语" : "Phrases"}>{str(voice.phrases).slice(0, 250)}</P>}
              {str(voice.metaphors) && <P label={isZh ? "隐喻" : "Metaphors"}>{str(voice.metaphors).slice(0, 250)}</P>}
              {str(voice.argue) && <P label={isZh ? "争论时" : "When arguing"}>{str(voice.argue).slice(0, 200)}</P>}
              {str(voice.praise) && <P label={isZh ? "赞美时" : "When praising"}>{str(voice.praise).slice(0, 200)}</P>}
              {str(voice.criticize) && <P label={isZh ? "批评时" : "When criticizing"}>{str(voice.criticize).slice(0, 200)}</P>}
            </Block>
            {strs(voice.high_freq).length > 0 && <Tags items={strs(voice.high_freq)} />}
            {strs(voice.never).length > 0 && <Tags items={strs(voice.never).map((w: string) => isZh ? `不用"${w}"` : `avoids "${w}"`)} />}
          </div>
        )}

        {/* EMOTIONAL LANDSCAPE */}
        {has(str(emo.range), str(emo.stress), str(emo.triggers), str(emo.anger)) && (
          <div>
            <Section icon="" title={isZh ? "情感图谱" : "Emotional Landscape"} />
            <Block>
              {str(emo.range) && <P label={isZh ? "情绪范围" : "Range"}>{str(emo.range).slice(0, 250)}</P>}
              {str(emo.stress) && <P label={isZh ? "压力下" : "Under stress"}>{str(emo.stress).slice(0, 200)}</P>}
              {str(emo.anger) && <P label={isZh ? "愤怒时" : "When angry"}>{str(emo.anger).slice(0, 200)}</P>}
              {str(emo.regulation) && <P label={isZh ? "情绪调节" : "Regulation"}>{str(emo.regulation).slice(0, 200)}</P>}
            </Block>
            {strs(emo.triggers).length > 0 && <Tags items={strs(emo.triggers)} />}
          </div>
        )}

        {/* HUMOR */}
        {has(str(humor.type), str(humor.jokes), str(humor.when)) && (
          <div>
            <Section icon="" title={isZh ? "幽默感" : "Humor"} />
            <Block>
              {str(humor.type) && <P label={isZh ? "类型" : "Type"}>{str(humor.type)}</P>}
              {str(humor.when) && <P label={isZh ? "何时" : "When"}>{str(humor.when).slice(0, 200)}</P>}
              {str(humor.jokes) && <P className="italic">"{str(humor.jokes).slice(0, 200)}"</P>}
              {str(humor.never) && <P label={isZh ? "不碰" : "Never"}>{str(humor.never)}</P>}
            </Block>
          </div>
        )}

        {/* CREATIVITY */}
        {has(str(creative.ideas), str(creative.rituals), str(creative.blocks)) && (
          <div>
            <Section icon="" title={isZh ? "创造力" : "Creativity"} />
            <Block>
              {str(creative.ideas) && <P label={isZh ? "灵感来源" : "Ideas"}>{str(creative.ideas).slice(0, 250)}</P>}
              {str(creative.rituals) && <P label={isZh ? "创作仪式" : "Rituals"}>{str(creative.rituals).slice(0, 250)}</P>}
              {str(creative.blocks) && <P label={isZh ? "瓶颈" : "Blocks"}>{str(creative.blocks).slice(0, 200)}</P>}
              {str(creative.collaboration) && <P label={isZh ? "合作方式" : "Collaboration"}>{str(creative.collaboration).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* AESTHETIC */}
        {has(str(aesthetic.beautiful_field), str(aesthetic.beautiful_life), str(aesthetic.boring)) && (
          <div>
            <Section icon="" title={isZh ? "审美" : "Aesthetic"} />
            <Block>
              {str(aesthetic.beautiful_field) && <P label={isZh ? "领域之美" : "Beauty in field"}>{str(aesthetic.beautiful_field).slice(0, 250)}</P>}
              {str(aesthetic.beautiful_life) && <P label={isZh ? "生活之美" : "Beauty in life"}>{str(aesthetic.beautiful_life).slice(0, 250)}</P>}
              {str(aesthetic.boring) && <P label={isZh ? "无聊的" : "Boring"}>{str(aesthetic.boring).slice(0, 200)}</P>}
              {str(aesthetic.influences) && <P label={isZh ? "影响因素" : "Influences"}>{str(aesthetic.influences).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* DESIRES */}
        {has(str(desires.truly), str(desires.stated), str(desires.gap)) && (
          <div>
            <Section icon="" title={isZh ? "渴望" : "Desires"} />
            <Block>
              {str(desires.truly) && <P label={isZh ? "真正想要" : "Truly wants"}>{str(desires.truly).slice(0, 250)}</P>}
              {str(desires.stated) && <P label={isZh ? "表面目标" : "Stated goal"}>{str(desires.stated).slice(0, 200)}</P>}
              {str(desires.gap) && <P label={isZh ? "落差" : "The gap"}>{str(desires.gap).slice(0, 200)}</P>}
              {str(desires.sacrifice) && <P label={isZh ? "愿付出的代价" : "Would sacrifice"}>{str(desires.sacrifice).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* VULNERABILITIES */}
        {has(str(vulns.emotional), str(vulns.professional), str(vulns.relational)) && (
          <div>
            <Section icon="" title={isZh ? "脆弱面" : "Vulnerabilities"} />
            <Block>
              {str(vulns.emotional) && <P label={isZh ? "情感" : "Emotional"}>{str(vulns.emotional).slice(0, 250)}</P>}
              {str(vulns.professional) && <P label={isZh ? "专业" : "Professional"}>{str(vulns.professional).slice(0, 200)}</P>}
              {str(vulns.relational) && <P label={isZh ? "关系" : "Relational"}>{str(vulns.relational).slice(0, 200)}</P>}
              {str(vulns.protect) && <P label={isZh ? "保护方式" : "Protects by"}>{str(vulns.protect).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* FEARS & SHADOWS */}
        {has(str(fears.deepest), str(fears.ashamed), str(fears.hide)) && (
          <div>
            <Section icon="" title={isZh ? "恐惧与暗面" : "Fears & Shadows"} />
            <Block>
              {str(fears.deepest) && <P label={isZh ? "最深恐惧" : "Deepest fear"}>{str(fears.deepest).slice(0, 250)}</P>}
              {str(fears.ashamed) && <P label={isZh ? "羞耻感" : "Ashamed of"}>{str(fears.ashamed).slice(0, 200)}</P>}
              {str(fears.hide) && <P label={isZh ? "隐藏的" : "Hides"}>{str(fears.hide).slice(0, 200)}</P>}
              {str(fears.insecure) && <P label={isZh ? "不安全感" : "Insecure about"}>{str(fears.insecure).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* RELATIONSHIPS */}
        {has(str(inner.closest), str(inner.treat), str(love.language), str(love.patterns)) && (
          <div>
            <Section icon="" title={isZh ? "人际关系" : "Relationships"} />
            <Block>
              {str(inner.closest) && <P label={isZh ? "核心圈" : "Inner circle"}>{str(inner.closest).slice(0, 250)}</P>}
              {str(inner.treat) && <P label={isZh ? "相处方式" : "Treats them"}>{str(inner.treat).slice(0, 200)}</P>}
              {str(love.language) && <P label={isZh ? "爱的语言" : "Love language"}>{str(love.language).slice(0, 200)}</P>}
              {str(love.patterns) && <P label={isZh ? "关系模式" : "Patterns"}>{str(love.patterns).slice(0, 200)}</P>}
              {str(love.needs) && <P label={isZh ? "需要" : "Needs"}>{str(love.needs).slice(0, 200)}</P>}
              {str(love.gives) && <P label={isZh ? "给予" : "Gives"}>{str(love.gives).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* PUBLIC vs PRIVATE */}
        {has(str(pubPriv.public), str(pubPriv.private), str(pubPriv.gap)) && (
          <div>
            <Section icon="" title={isZh ? "公众与私下" : "Public vs Private"} />
            <Block>
              {str(pubPriv.public) && <P label={isZh ? "公众形象" : "Public"}>{str(pubPriv.public).slice(0, 250)}</P>}
              {str(pubPriv.private) && <P label={isZh ? "私下真实" : "Private"}>{str(pubPriv.private).slice(0, 250)}</P>}
              {str(pubPriv.gap) && <P label={isZh ? "落差" : "The gap"}>{str(pubPriv.gap).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* TURNING POINTS */}
        {turning.length > 0 && (
          <div>
            <Section icon="" title={isZh ? "人生转折" : "Turning Points"} />
            <Block>
              {turning.map((tp: any, i: number) => {
                const o = obj(tp);
                return <P key={i}>{str(o.when) ? `${str(o.when)} — ` : ""}{str(o.moment || o.what || o).slice(0, 250)}</P>;
              })}
            </Block>
          </div>
        )}

        {/* PEAK MOMENTS */}
        {peaks.length > 0 && (
          <div>
            <Section icon="" title={isZh ? "巅峰时刻" : "Peak Moments"} />
            <Block>
              {peaks.map((pk: any, i: number) => {
                const o = obj(pk);
                return <P key={i}>{str(o.moment || o).slice(0, 250)}{str(o.feeling) ? <span className="block text-[#AEAEB2] mt-0.5">{str(o.feeling).slice(0, 150)}</span> : null}</P>;
              })}
            </Block>
          </div>
        )}

        {/* ROCK BOTTOM */}
        {has(str(rockBottom.what), str(rockBottom.depth)) && (
          <div>
            <Section icon="" title={isZh ? "低谷" : "Rock Bottom"} />
            <Block>
              {str(rockBottom.what) && <P>{str(rockBottom.what).slice(0, 300)}</P>}
              {str(rockBottom.climb) && <P label={isZh ? "如何走出" : "The climb"}>{str(rockBottom.climb).slice(0, 200)}</P>}
              {str(rockBottom.retrospective) && <P label={isZh ? "回望" : "In hindsight"}>{str(rockBottom.retrospective).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* INTERNAL CONFLICTS */}
        {conflicts.length > 0 && (
          <div>
            <Section icon="" title={isZh ? "内心冲突" : "Internal Conflicts"} />
            <Block>
              {conflicts.map((c: any, i: number) => {
                const o = obj(c);
                return <P key={i}>{str(o.tension || o).slice(0, 300)}</P>;
              })}
            </Block>
          </div>
        )}

        {/* DARK PATTERNS */}
        {has(str(dark.mistakes), str(dark.hurt), str(dark.worst)) && (
          <div>
            <Section icon="" title={isZh ? "暗面模式" : "Dark Patterns"} />
            <Block>
              {str(dark.mistakes) && <P label={isZh ? "犯过的错" : "Mistakes"}>{str(dark.mistakes).slice(0, 250)}</P>}
              {str(dark.hurt) && <P label={isZh ? "伤害过的人" : "Hurt"}>{str(dark.hurt).slice(0, 200)}</P>}
              {str(dark.worst) && <P label={isZh ? "最糟的" : "Worst"}>{str(dark.worst).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* REGRETS */}
        {has(str(regrets.stated), str(regrets.unstated), str(regrets.roads)) && (
          <div>
            <Section icon="" title={isZh ? "遗憾" : "Regrets"} />
            <Block>
              {str(regrets.stated) && <P label={isZh ? "说出口的" : "Stated"}>{str(regrets.stated).slice(0, 250)}</P>}
              {str(regrets.unstated) && <P label={isZh ? "未说出口的" : "Unstated"}>{str(regrets.unstated).slice(0, 250)}</P>}
              {str(regrets.roads) && <P label={isZh ? "未走的路" : "Roads not taken"}>{str(regrets.roads).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* PHYSICAL PRESENCE */}
        {has(str(physical.mannerisms), str(physical.appearance), str(physical.energy)) && (
          <div>
            <Section icon="" title={isZh ? "身体语言" : "Physical Presence"} />
            <Block>
              {str(physical.appearance) && <P label={isZh ? "外貌" : "Appearance"}>{str(physical.appearance).slice(0, 200)}</P>}
              {str(physical.mannerisms) && <P label={isZh ? "习惯动作" : "Mannerisms"}>{str(physical.mannerisms).slice(0, 200)}</P>}
              {str(physical.enter) && <P label={isZh ? "出场" : "Enters a room"}>{str(physical.enter).slice(0, 200)}</P>}
              {str(physical.voice) && <P label={isZh ? "声音" : "Voice"}>{str(physical.voice).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* DAILY RHYTHMS */}
        {has(str(daily.morning), str(daily.rituals), str(daily.sacred)) && (
          <div>
            <Section icon="" title={isZh ? "日常节律" : "Daily Rhythms"} />
            <Block>
              {str(daily.morning) && <P label={isZh ? "早晨" : "Morning"}>{str(daily.morning).slice(0, 200)}</P>}
              {str(daily.rituals) && <P label={isZh ? "日常仪式" : "Rituals"}>{str(daily.rituals).slice(0, 200)}</P>}
              {str(daily.sacred) && <P label={isZh ? "神圣时刻" : "Sacred"}>{str(daily.sacred).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* SENSORY */}
        {has(str(sensory.preferences), str(sensory.beautiful), str(sensory.memories)) && (
          <div>
            <Section icon="" title={isZh ? "感官世界" : "Sensory"} />
            <Block>
              {str(sensory.preferences) && <P label={isZh ? "偏好" : "Preferences"}>{str(sensory.preferences).slice(0, 200)}</P>}
              {str(sensory.beautiful) && <P label={isZh ? "美的感受" : "Beauty"}>{str(sensory.beautiful).slice(0, 200)}</P>}
              {str(sensory.memories) && <P label={isZh ? "感官记忆" : "Memories"}>{str(sensory.memories).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* SPIRITUAL */}
        {has(str(spiritual.belief), str(spiritual.meaning), str(spiritual.suffering)) && (
          <div>
            <Section icon="" title={isZh ? "精神世界" : "Spiritual"} />
            <Block>
              {str(spiritual.belief) && <P label={isZh ? "信念" : "Belief"}>{str(spiritual.belief).slice(0, 250)}</P>}
              {str(spiritual.meaning) && <P label={isZh ? "生命意义" : "Meaning"}>{str(spiritual.meaning).slice(0, 200)}</P>}
              {str(spiritual.suffering) && <P label={isZh ? "苦难观" : "On suffering"}>{str(spiritual.suffering).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* EVOLUTION */}
        {has(str(evolution.phases), str(evolution.unchanging), str(evolution.catalyst)) && (
          <div>
            <Section icon="" title={isZh ? "演变" : "Evolution"} />
            <Block>
              {str(evolution.phases) && <P label={isZh ? "阶段" : "Phases"}>{str(evolution.phases).slice(0, 300)}</P>}
              {str(evolution.catalyst) && <P label={isZh ? "催化剂" : "Catalyst"}>{str(evolution.catalyst).slice(0, 200)}</P>}
              {str(evolution.unchanging) && <P label={isZh ? "不变的" : "Unchanging"}>{str(evolution.unchanging).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* LEGACY */}
        {has(str(legacy.tangible), str(legacy.intangible), str(legacy.forgotten)) && (
          <div>
            <Section icon="" title={isZh ? "遗产" : "Legacy"} />
            <Block>
              {str(legacy.tangible) && <P label={isZh ? "有形遗产" : "Tangible"}>{str(legacy.tangible).slice(0, 250)}</P>}
              {str(legacy.intangible) && <P label={isZh ? "无形遗产" : "Intangible"}>{str(legacy.intangible).slice(0, 250)}</P>}
              {str(legacy.missed) && <P label={isZh ? "被忽略的" : "Missed"}>{str(legacy.missed).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* ON MORTALITY */}
        {has(str(death.view), str(death.survives), str(death.deathbed)) && (
          <div>
            <Section icon="" title={isZh ? "生死观" : "On Mortality"} />
            <Block>
              {str(death.view) && <P>{str(death.view).slice(0, 300)}</P>}
              {str(death.survives) && <P label={isZh ? "什么会留下" : "What survives"}>{str(death.survives).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {/* WHAT'S NEXT */}
        {has(str(next.unfinished), str(next.trajectory), str(next.becoming)) && (
          <div>
            <Section icon="" title={isZh ? "下一步" : "What's Next"} />
            <Block>
              {str(next.unfinished) && <P label={isZh ? "未完成" : "Unfinished"}>{str(next.unfinished).slice(0, 250)}</P>}
              {str(next.trajectory) && <P label={isZh ? "轨迹" : "Trajectory"}>{str(next.trajectory).slice(0, 200)}</P>}
              {str(next.becoming) && <P label={isZh ? "正在成为" : "Becoming"}>{str(next.becoming).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

      </div>
    </Card>
  );
}

