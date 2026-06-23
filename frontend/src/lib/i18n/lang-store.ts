'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from './translations';

function getInitialLang(): Lang {
  if (typeof window !== 'undefined' && navigator.language.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en';
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: getInitialLang(),
      setLang: (lang) => set({ lang }),
    }),
    { name: 'elaris-lang' }
  )
);