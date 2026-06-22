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
  if (typeof v === "object") return v.belief || v.text || v.description || v.name || v.model || v.domain || v.title || v.moment || v.trigger || v.phase || Object.values(v).filter(Boolean).map(str).join(" ") || "";
  return "";
};
const strs = (v: any): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const obj = (v: any): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function Section({ title }: { title: string }) {
  return <h3 className="text-[13px] font-medium text-[#1D1D1F] tracking-[-0.01em] mb-3">{title}</h3>;
}
function Tags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5 mb-2">{items.map((t, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] text-[12px] font-light text-[#6E6E73]">{t}</span>)}</div>;
}
function P({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return <p className={`text-[13px] font-light text-[#6E6E73] leading-relaxed${className ? ' ' + className : ''}`}>{label && <span className="text-[#86868B]">{label}: </span>}{children}</p>;
}
function Block({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 mb-2">{children}</div>;
}

export function SoulCard({ soul, version, name }: SoulCardProps) {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isZh = lang === "zh-CN";
  if (!soul) return <Card className="text-center py-16"><p className="text-sm font-light text-[#86868B]">{t.not_distilled_soul || "Not yet ready"}</p></Card>;

  // 2026-06-22: detect empty-shell soul (schema frame but all content fields empty).
  // The backend now rejects these at write time, but legacy rows from before the
  // fix may still exist. Surface them clearly so the user knows to re-distill.
  const _ident = obj(soul.identity);
  const _hasContent =
    str(_ident.name).trim() ||
    str(_ident.life_arc).trim() ||
    str(_ident.title).trim() ||
    arr(soul.cognitive_architecture?.core_beliefs).length > 0 ||
    arr(soul.expertise?.deep_domains).length > 0 ||
    str(soul.communication_profile?.default_register).trim() ||
    str(soul.voice?.natural_register).trim();
  if (!_hasContent) {
    return (
      <Card className="text-center py-12 px-6 border-amber-200 bg-amber-50/30">
        <p className="text-sm font-medium text-[#1D1D1F] mb-1">Soul is incomplete</p>
        <p className="text-xs font-light text-[#86868B] leading-relaxed">
          {isZh
            ? "这个分身的灵魂资料不完整（蒸馏时信息源不足）。请在补充资料中加入职业、时代、代表作、名言等关键信息后重新蒸馏。"
            : "This persona's soul is incomplete (insufficient distillation sources). Add manual-input about occupation, era, key works, or famous quotes, then re-distill."}
        </p>
      </Card>
    );
  }

  const ident = obj(soul.identity);
  const cog = obj(soul.cognitive_architecture);
  const voice = obj(soul.voice);
  const emo = obj(soul.emotional_map);
  const exp = obj(soul.expertise);
  const desires = obj(soul.desires);
  const fears = obj(soul.fears || soul.fears_and_shadows);
  const rel = obj(soul.relationships);
  const turning = arr(soul.turning_points);
  const peak = obj(soul.peak_moment || soul.peak_moments);
  const rock = obj(soul.rock_bottom);
  const evolution = obj(soul.evolution);
  const legacy = obj(soul.legacy);

  const has = (...vals: any[]) => vals.some(v => v && (typeof v === "string" ? v.trim() : (Array.isArray(v) ? v.length > 0 : Object.keys(obj(v)).length > 0)));

  return (
    <Card className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden">
      {version && version > 1 && <div className="text-[10px] font-light text-[#C7C7CC] px-5 pt-5">v{version}</div>}
      <div className="px-5 pt-5 pb-5 space-y-5">

        {has(ident.name, ident.title, ident.life_arc) && (
          <div>
            <Section title={isZh ? "身份" : "Identity"} />
            <Block>
              {str(ident.title) && <P><strong>{str(ident.title)}</strong>{str(ident.organization) ? ` · ${str(ident.organization)}` : ""}</P>}
              {str(ident.nationality) && <P>{str(ident.nationality)}{str(ident.era) ? ` · ${str(ident.era)}` : ""}</P>}
              {str(ident.life_arc) && <P>{str(ident.life_arc).slice(0, 400)}</P>}
              {str(ident.self_view) && <P className="italic">"{str(ident.self_view).slice(0, 300)}"</P>}
            </Block>
            {strs(ident.known_as).length > 0 && <Tags items={strs(ident.known_as)} />}
          </div>
        )}

        {has(cog.core_beliefs, cog.axioms, cog.contradictions) && (
          <div>
            <Section title={isZh ? "思维方式" : "How They Think"} />
            <Block>
              {arr(cog.core_beliefs).map((b: any, i: number) => {
                const o = obj(b);
                return <P key={i}>"{str(o.belief || o)}"{str(o.why) ? ` — ${str(o.why).slice(0, 150)}` : ""}</P>;
              })}
              {strs(cog.axioms).length > 0 && <P label={isZh ? "公理" : "Axioms"}>{strs(cog.axioms).join(" · ")}</P>}
              {strs(cog.contradictions).length > 0 && <P label={isZh ? "矛盾" : "Contradictions"}>{strs(cog.contradictions).join(" · ")}</P>}
            </Block>
            {arr(cog.influences).length > 0 && (
              <Block>
                {arr(cog.influences).map((inf: any, i: number) => {
                  const o = obj(inf);
                  return <P key={i}>{str(o.figure)}{str(o.learned) ? ` — ${str(o.learned).slice(0, 150)}` : ""}</P>;
                })}
              </Block>
            )}
            {arr(cog.mental_models).length > 0 && <Tags items={arr(cog.mental_models).map((m: any) => str(obj(m).model || m)).filter(Boolean)} />}
          </div>
        )}

        {has(exp.deep, exp.cross_domain) && (
          <div>
            <Section title={isZh ? "专业领域" : "Expertise"} />
            {arr(exp.deep).map((d: any) => str(obj(d).domain)).filter(Boolean).length > 0 && <Tags items={arr(exp.deep).map((d: any) => str(obj(d).domain)).filter(Boolean)} />}
            <Block>
              {arr(exp.deep).map((d: any, i: number) => {
                const o = obj(d);
                return <P key={i}>{str(o.domain)}{str(o.how) ? `: ${str(o.how).slice(0, 200)}` : ""}{str(o.signature) ? ` · ${str(o.signature).slice(0, 150)}` : ""}</P>;
              })}
              {strs(exp.cross_domain).length > 0 && <P label={isZh ? "跨界" : "Cross-domain"}>{strs(exp.cross_domain).join(" · ")}</P>}
              {str(exp.misperceptions) && <P label={isZh ? "常见误解" : "Misperception"}>{str(exp.misperceptions).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {has(voice.phrases, voice.sentence, voice.metaphors) && (
          <div>
            <Section title={isZh ? "表达风格" : "Voice & Expression"} />
            <Block>
              {str(voice.sentence) && <P label={isZh ? "句式" : "Sentence"}>{str(voice.sentence).slice(0, 250)}</P>}
              {str(voice.metaphors) && <P label={isZh ? "隐喻" : "Metaphors"}>{str(voice.metaphors).slice(0, 250)}</P>}
              {str(voice.argue) && <P label={isZh ? "争论时" : "When arguing"}>{str(voice.argue).slice(0, 200)}</P>}
              {str(voice.praise) && <P label={isZh ? "赞美时" : "When praising"}>{str(voice.praise).slice(0, 200)}</P>}
              {str(voice.criticize) && <P label={isZh ? "批评时" : "When criticizing"}>{str(voice.criticize).slice(0, 200)}</P>}
            </Block>
            {strs(voice.high_freq).length > 0 && <Tags items={strs(voice.high_freq)} />}
            {strs(voice.phrases).length > 0 && <Block>{strs(voice.phrases).slice(0, 3).map((q: string, i: number) => <P key={i} className="italic">"{q.slice(0, 200)}"</P>)}</Block>}
          </div>
        )}

        {has(emo.range, emo.triggers, emo.stress) && (
          <div>
            <Section title={isZh ? "情感图谱" : "Emotional Landscape"} />
            <Block>
              {str(emo.range) && <P label={isZh ? "情绪范围" : "Range"}>{str(emo.range).slice(0, 250)}</P>}
              {str(emo.stress) && <P label={isZh ? "压力下" : "Under stress"}>{str(emo.stress).slice(0, 200)}</P>}
              {str(emo.regulation) && <P label={isZh ? "情绪调节" : "Regulation"}>{str(emo.regulation).slice(0, 200)}</P>}
            </Block>
            {arr(emo.triggers).length > 0 && (
              <Block>
                {arr(emo.triggers).map((tr: any, i: number) => {
                  const o = obj(tr);
                  return <P key={i}>{str(o.trigger)}{str(o.reaction) ? ` → ${str(o.reaction).slice(0, 150)}` : ""}</P>;
                })}
              </Block>
            )}
          </div>
        )}

        {has(desires.truly, desires.stated, desires.gap) && (
          <div>
            <Section title={isZh ? "渴望" : "Desires"} />
            <Block>
              {str(desires.truly) && <P label={isZh ? "真正想要" : "Truly wants"}>{str(desires.truly).slice(0, 250)}</P>}
              {str(desires.stated) && <P label={isZh ? "表面目标" : "Stated goal"}>{str(desires.stated).slice(0, 200)}</P>}
              {str(desires.gap) && <P label={isZh ? "落差" : "The gap"}>{str(desires.gap).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {has(fears.deepest, fears.ashamed, fears.hide) && (
          <div>
            <Section title={isZh ? "恐惧与暗面" : "Fears & Shadows"} />
            <Block>
              {strs(fears.deepest).length > 0 && <P label={isZh ? "最深恐惧" : "Deepest"}>{strs(fears.deepest).join(" · ").slice(0, 250)}</P>}
              {strs(fears.ashamed).length > 0 && <P label={isZh ? "羞耻感" : "Ashamed of"}>{strs(fears.ashamed).join(" · ").slice(0, 200)}</P>}
              {str(fears.hide) && <P label={isZh ? "隐藏的" : "Hides"}>{str(fears.hide).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {has(rel.inner_circle, rel.love_language, rel.love_patterns) && (
          <div>
            <Section title={isZh ? "人际关系" : "Relationships"} />
            <Block>
              {arr(rel.inner_circle).length > 0 && <P label={isZh ? "核心圈" : "Inner circle"}>{arr(rel.inner_circle).map((x: any) => str(obj(x).type || x)).join(" · ").slice(0, 250)}</P>}
              {str(rel.how_they_treat_close) && <P label={isZh ? "相处方式" : "How they treat"}>{str(rel.how_they_treat_close).slice(0, 200)}</P>}
              {str(rel.love_language) && <P label={isZh ? "爱的语言" : "Love language"}>{str(rel.love_language).slice(0, 200)}</P>}
              {str(rel.love_patterns) && <P label={isZh ? "关系模式" : "Patterns"}>{str(rel.love_patterns).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {turning.length > 0 && (
          <div>
            <Section title={isZh ? "人生转折" : "Turning Points"} />
            <Block>
              {turning.map((tp: any, i: number) => {
                const o = obj(tp);
                return <P key={i}>{str(o.moment || o).slice(0, 250)}{str(o.impact) ? <span className="block text-[#AEAEB2] mt-0.5">{str(o.impact).slice(0, 150)}</span> : null}</P>;
              })}
            </Block>
          </div>
        )}

        {has(peak.moment, peak.feeling) && (
          <div>
            <Section title={isZh ? "巅峰时刻" : "Peak Moment"} />
            <Block>
              {str(peak.moment) && <P>{str(peak.moment).slice(0, 250)}</P>}
              {str(peak.feeling) && <P className="text-[#AEAEB2]">{str(peak.feeling).slice(0, 150)}</P>}
            </Block>
          </div>
        )}

        {has(rock.event, rock.climb, rock.lesson) && (
          <div>
            <Section title={isZh ? "低谷" : "Rock Bottom"} />
            <Block>
              {str(rock.event) && <P>{str(rock.event).slice(0, 300)}</P>}
              {str(rock.climb) && <P label={isZh ? "如何走出" : "The climb"}>{str(rock.climb).slice(0, 200)}</P>}
              {str(rock.lesson) && <P label={isZh ? "学到" : "Lesson"}>{str(rock.lesson).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

        {has(legacy.tangible, legacy.intangible) && (
          <div>
            <Section title={isZh ? "影响" : "Impact"} />
            <Block>
              {str(legacy.tangible) && <P label={isZh ? "有形" : "Tangible"}>{str(legacy.tangible).slice(0, 250)}</P>}
              {str(legacy.intangible) && <P label={isZh ? "无形" : "Intangible"}>{str(legacy.intangible).slice(0, 250)}</P>}
            </Block>
          </div>
        )}

        {has(evolution.phases, evolution.catalyst, evolution.unchanging) && (
          <div>
            <Section title={isZh ? "演变" : "Evolution"} />
            <Block>
              {arr(evolution.phases).map((ph: any, i: number) => {
                const o = obj(ph);
                return <P key={i}>{str(o.phase)}{str(o.characteristics) ? `: ${str(o.characteristics).slice(0, 200)}` : ""}</P>;
              })}
              {str(evolution.catalyst) && <P label={isZh ? "催化剂" : "Catalyst"}>{str(evolution.catalyst).slice(0, 200)}</P>}
              {str(evolution.unchanging) && <P label={isZh ? "不变的" : "Unchanging"}>{str(evolution.unchanging).slice(0, 200)}</P>}
            </Block>
          </div>
        )}

      </div>
    </Card>
  );
}
