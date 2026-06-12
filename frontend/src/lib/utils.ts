import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(str: string, maxLen: number = 100): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

export function fileIcon(fileType: string): string {
  switch (fileType) {
    case ".pdf": return "📄";
    case ".docx":
    case ".doc": return "📝";
    case ".txt":
    case ".md": return "📃";
    case ".csv": return "📊";
    case ".png":
    case ".jpg":
    case ".jpeg": return "🖼️";
    case "url": return "🔗";
    default: return "📁";
  }
}

export function soulVersion(persona: { soul_version: number | null }): string {
  if (!persona.soul_version) return "Soul not forged";
  return `v${persona.soul_version}`;
}

export const DEFAULT_SOUL = {
  basic_info: { name: "", title: "", company: "", background: "" },
  personality: { extrovert_level: 0, rational_level: 0, risk_tolerance: 0, description: "" },
  communication_style: { formal_level: 0, tone: "", common_phrases: [], preferred_channels: [] },
  knowledge_areas: [],
  decision_patterns: { priority_framework: "", risk_approach: "", decision_speed: "" },
  values: [],
  mental_models: [],
  expression_dna: { avg_sentence_length: 0, question_ratio: 0, analogy_density: 0, first_person_ratio: 0, certainty_ratio: 0, transition_frequency: 0, style_tags: [], common_phrases: [], taboo_words: [] },
  decision_heuristics: [],
  core_tensions: [],
  honest_limitations: [],
};
