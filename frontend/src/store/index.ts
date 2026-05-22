import { create } from "zustand";
import { api, PersonaOut } from "@/lib/api";

interface AppState {
  // Persona list
  personas: PersonaOut[];
  loading: boolean;
  error: string | null;

  // Actions
  loadPersonas: () => Promise<void>;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  personas: [],
  loading: false,
  error: null,

  loadPersonas: async () => {
    set({ loading: true, error: null });
    try {
      const personas = await api.listPersonas();
      set({ personas, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
