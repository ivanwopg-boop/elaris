import { create } from "zustand";
import { api, PersonaOut } from "@/lib/api";

interface AppState {
  // Persona list
  personas: PersonaOut[];
  loading: boolean;
  error: string | null;

  // Actions
  loadPersonas: (lang?: string) => Promise<void>;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  personas: [],
  loading: false,
  error: null,

  loadPersonas: async (lang?: string) => {
    set({ loading: true, error: null });
    try {
      const personas = await api.listPersonas(lang);
      set({ personas, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
