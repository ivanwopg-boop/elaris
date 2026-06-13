/**
 * API client for Persona Distiller backend.
 */

// Use relative path so Next.js proxy handles it
const API_BASE = "/api/v1";

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('auth-storage');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.state?.token || null;
  } catch { return null; }
}

export const api = {
  baseUrl: API_BASE,

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${path}`;
    const token = getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(url, {
      ...options,
      headers,
    });
    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try { detail = JSON.parse(text).detail || text; } catch {}
      const err = new Error(`API error ${res.status}: ${detail}`) as any;
      err.status = res.status;
      err._detail = detail;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  },

  // Auth
  login: (email: string, password: string) =>
    api.request<{ access_token: string; token_type: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  loginWithInvite: (invite_code: string) =>
    api.request<{ access_token: string; token_type: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ invite_code }),
    }),

  register: (email: string, password: string, name?: string, invite_code?: string, birth_date?: string) =>
    api.request<{ access_token: string; token_type: string; user: any }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name, invite_code, birth_date }),
    }),

  logout: () =>
    api.request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  getMe: () =>
    api.request<any>("/auth/me"),
  updateProfile: (data: { name?: string; avatar_url?: string }) => api.request<any>("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (data: { old_password: string; new_password: string }) => api.request<any>("/auth/change-password", { method: "POST", body: JSON.stringify(data) }),


  // Personas
  listPersonas: (lang?: string) =>
    api.request<PersonaOut[]>("/personas" + (lang ? "?lang=" + encodeURIComponent(lang) : "")),

  listPresets: (lang?: string) =>
    api.request<PersonaOut[]>("/personas/presets" + (lang ? "?lang=" + encodeURIComponent(lang) : "")),

  getPersona: (id: string) =>
    api.request<PersonaDetail>(`/personas/${id}`),

  createPersona: (data: { name: string; source_name?: string; description?: string; category?: string }) =>
    api.request<PersonaOut>("/personas", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updatePersona: (id: string, data: { name?: string; description?: string }) =>
    api.request<PersonaOut>(`/personas/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  uploadAvatar: async (personaId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/personas/${personaId}/avatar`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${getToken()}` },
      body: formData,
    });
    if (!res.ok) throw new Error(`Avatar upload failed: ${res.status}`);
    return res.json() as Promise<{ avatar_url: string }>;
  },

  deletePersona: (id: string) =>
    api.request<void>(`/personas/${id}`, { method: "DELETE" }),

  deletePreset: (id: string) =>
    api.request<{ ok: boolean }>(`/personas/presets/${id}`, { method: "DELETE" }),

  // Files
  uploadFiles: async (personaId: string, files: File[], urls: string[] = []) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("urls", JSON.stringify(urls));

    const res = await fetch(`${API_BASE}/personas/${personaId}/files`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json() as Promise<UploadResponse>;
  },

  listFiles: (personaId: string) =>
    api.request<FileOut[]>(`/personas/${personaId}/files`),

  deleteFile: (personaId: string, fileId: string) =>
    api.request<void>(`/personas/${personaId}/files/${fileId}`, { method: "DELETE" }),

  // Manual Input
  addManualInput: (personaId: string, fields: Record<string, string>) =>
    api.request<ManualInputOut[]>(`/personas/${personaId}/manual-input`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    }),

  getManualInputs: (personaId: string) =>
    api.request<ManualInputOut[]>(`/personas/${personaId}/manual-input`),

  // Web Search
  triggerWebSearch: (personaId: string, queries: string[]) =>
    api.request<WebSearchResultOut[]>(`/personas/${personaId}/web-search`, {
      method: "POST",
      body: JSON.stringify({ queries }),
    }),

  // Distill
  distill: (personaId: string, lang?: string) =>
    api.request<DistillResponse>(`/personas/${personaId}/distill` + (lang ? "?lang=" + encodeURIComponent(lang) : ""), { method: "POST" }),

  getSoul: (personaId: string) =>
    api.request<any>(`/personas/${personaId}/soul`),

  // Chat
  chat: (personaId: string, message: string, context?: string) =>
    api.request<ChatResponse>('/chat', {
      method: "POST",
      body: JSON.stringify({ persona_id: personaId, message, context }),
    }),

  // Brainstorm
  createBrainstorm: (data: {
    title: string;
    topic: string;
    topic_detail?: string;
    persona_ids: string[];
    persona_roles: Record<string, string>;
  persona_names?: Record<string, string>;
    max_rounds?: number;
  }) =>
    api.request<BrainstormSessionOut>("/brainstorm", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listBrainstorms: () =>
    api.request<BrainstormSessionOut[]>("/brainstorm"),

  getBrainstorm: (id: string) =>
    api.request<BrainstormDetailOut>(`/brainstorm/${id}`),

  startBrainstorm: (id: string, topic?: string) =>
    api.request<{ status: string; topic?: string; new_rounds: number; total_messages: number; summary: string }>(
      `/brainstorm/${id}/start`,
      { method: "POST", body: JSON.stringify({ topic: topic || "" }) }
    ),

  uploadBrainstormFiles: async (sessionId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch(`${API_BASE}/brainstorm/${sessionId}/files`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  deleteBrainstorm: (id: string) =>
    api.request<void>(`/brainstorm/${id}`, { method: "DELETE" }),

  exportBrainstorm: async (id: string, format: string = "docx") => {
    // Use form data to trigger download
    const form = new FormData();
    form.append("format", format);
    const res = await fetch(`${API_BASE}/brainstorm/${id}/export`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  },

  // Export
  // Group Chat
  createGroupChat: (data: { title: string; persona_ids: string[]; persona_roles?: Record<string, string> }) =>
    api.request<GroupChatOut>("/group-chat", { method: "POST", body: JSON.stringify(data) }),

  listConversations: () => api.request<any[]>("/conversations"),
  getConversationMessages: (convId: string) => api.request<any[]>("/conversations/" + convId + "/messages"),
  listGroupChats: () => api.request<GroupChatOut[]>("/group-chat"),

  getGroupChat: (id: string) => api.request<GroupChatDetailOut>(`/group-chat/${id}`),

  deleteGroupChat: (id: string) => api.request<void>(`/group-chat/${id}`, { method: "DELETE" }),
  deleteConversation: (id: string) => api.request<void>("/conversations/" + id, { method: "DELETE" }),

  invitePersona: (chatId: string, personaId: string) =>
    api.request<{ ok: boolean; persona_name: string }>(`/group-chat/${chatId}/invite`, {
      method: "POST", body: JSON.stringify({ persona_id: personaId }),
    }),

  removePersona: (chatId: string, personaId: string) =>
    api.request<{ ok: boolean; persona_name: string }>(`/group-chat/${chatId}/personas/${personaId}`, {
      method: "DELETE",
    }),

  // Export
  exportPersona: async (personaId: string, format: string) => {
    const res = await fetch(`${API_BASE}/export/${personaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  },
};

// Type definitions (matching backend schemas)
export interface PersonaOut {
  id: string;
  name: string;
  category: string | null;
  source_name: string | null;
  description: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  has_soul: boolean;
  user_id: string | null;
}

export interface PersonaDetail extends PersonaOut {
  soul: any | null;
  file_count: number;
  soul_version: number | null;
  souls_by_lang?: Record<string, { version: number; has_soul: boolean;
  user_id: string | null; soul: any | null }>;
}

export interface FileOut {
  id: string;
  persona_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  parsed_content: string | null;
  upload_batch: string;
  created_at: string;
}

export interface UploadResponse {
  upload_id: string;
  files: FileOut[];
}

export interface ManualInputOut {
  id: string;
  persona_id: string;
  field_key: string;
  field_value: string;
  source_batch: string;
  created_at: string;
}

export interface WebSearchResultOut {
  id: string;
  persona_id: string;
  query: string;
  results_json: string;
  search_batch: string;
  created_at: string;
}

export interface DistillResponse {
  persona_id: string;
  version: number;
  display_name: string;
  name_options: string[];
  source_name: string;
  soul: any;
  sources_used: number;
}

export interface ChatResponse {
  message: string;
  sources: string[];
  style_match: number | null;
}

export interface BrainstormSessionOut {
  id: string;
  title: string;
  topics: { title: string; detail: string }[];
  persona_ids: string[];
  persona_roles: Record<string, string>;
  persona_names?: Record<string, string>;
  max_rounds: number;
  status: string;
  completed_rounds: number;
  summary: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface BrainstormMessageOut {
  id: string;
  session_id: string;
  round_number: number;
  persona_id: string;
  persona_name: string;
  content: string;
  created_at: string;
}

export interface BrainstormDetailOut {
  session: BrainstormSessionOut;
  messages: BrainstormMessageOut[];
}

// ── Group Chat ───────────────────────────────────────────
export interface GroupChatOut {
  id: string;
  title: string;
  persona_ids: string[];
  persona_roles: Record<string, string>;
  persona_names?: Record<string, string>;
  status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface GroupChatMessageOut {
  id: string;
  chat_id: string;
  sender_type: string;
  sender_id: string;
  sender_name: string;
  content: string;
  round_number: number;
  created_at: string;
}

export interface GroupChatDetailOut {
  chat: GroupChatOut;
  messages: GroupChatMessageOut[];
}

export type GroupChatSSEEvent =
  | { type: "thinking"; persona_name: string }
  | { type: "message"; persona_name: string; persona_id: string; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

// SSE event types for real-time brainstorm streaming
export type BrainstormSSEEvent =
  | { type: "topic_set"; title: string; detail: string }
  | { type: "turn_start"; turn: number; persona_name: string }
  | { type: "thinking"; persona_name: string; turn: number }
  | { type: "message"; persona_name: string; persona_id: string; content: string; turn: number }
  | { type: "summary"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };
