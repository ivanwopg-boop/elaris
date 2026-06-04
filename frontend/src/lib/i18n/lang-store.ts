'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from './translations';

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'en',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'elaris-lang' }
  )
);
