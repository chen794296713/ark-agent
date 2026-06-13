"use client";

/**
 * App-wide client state that must survive route changes:
 *  - auth (current user + workspace), with login/register/logout
 *  - language (persisted to the user profile when signed in) + theme
 *  - legacy prototype agent state (kept for screens not yet wired to the API)
 *
 * Screen-local state (form fields, chat drafts, billing range, payment step…)
 * lives in the route components themselves.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { agentsData } from "@/lib/data";
import { detectLang } from "@/lib/i18n";
import { api, type SessionUser, type WorkspaceDTO } from "@/lib/client-api";
import type { Agent, Lang } from "@/lib/types";

export type Theme = "dark" | "light";

interface AppState {
  // ---- auth ----
  user: SessionUser | null;
  workspace: WorkspaceDTO | null;
  authReady: boolean;
  refreshAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (name: string, email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;

  // ---- preferences ----
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;

  // ---- legacy prototype state (un-wired screens) ----
  createdAgent: Agent | null;
  setCreatedAgent: (a: Agent | null) => void;
  agents: Agent[];
  getAgent: (id: string) => Agent | undefined;
  paused: Record<string, boolean>;
  togglePause: (id: string) => void;
  isPaused: (id: string) => boolean;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDTO | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<Theme>("dark");
  const [createdAgent, setCreatedAgent] = useState<Agent | null>(null);
  const [paused, setPaused] = useState<Record<string, boolean>>({});

  // Default language from the browser locale (overridden by the user profile
  // once auth loads).
  useEffect(() => {
    setLangState(detectLang(typeof navigator !== "undefined" ? navigator.language : "en"));
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const { user: u, workspace: w } = await api.me();
      setUser(u);
      setWorkspace(w);
      setLangState(u.locale);
    } catch {
      setUser(null);
      setWorkspace(null);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u, workspace: w } = await api.login({ email, password });
    setUser(u);
    setWorkspace(w);
    setLangState(u.locale);
    return u;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { user: u, workspace: w } = await api.register({ name, email, password });
    setUser(u);
    setWorkspace(w);
    setLangState(u.locale);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setWorkspace(null);
  }, []);

  // Adopt whatever the pre-paint script already applied (localStorage value).
  useEffect(() => {
    const applied = document.documentElement.getAttribute("data-theme");
    if (applied === "light" || applied === "dark") setThemeState(applied);
  }, []);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      // Persist to the profile when signed in (best-effort).
      void api.setPrefs({ locale: l }).catch(() => {});
    },
    [],
  );

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("ark-theme", t);
    } catch {
      /* private mode / storage disabled */
    }
  }, []);

  const toggleTheme = useCallback(
    () =>
      setThemeState((prev) => {
        const next = prev === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem("ark-theme", next);
        } catch {
          /* ignore */
        }
        return next;
      }),
    [],
  );

  const agents = useMemo(
    () => (createdAgent ? [...agentsData, createdAgent] : agentsData),
    [createdAgent],
  );
  const getAgent = useCallback((id: string) => agents.find((a) => a.id === id), [agents]);
  const togglePause = useCallback(
    (id: string) => setPaused((p) => ({ ...p, [id]: !p[id] })),
    [],
  );
  const isPaused = useCallback((id: string) => !!paused[id], [paused]);

  const value = useMemo<AppState>(
    () => ({
      user,
      workspace,
      authReady,
      refreshAuth,
      login,
      register,
      logout,
      lang,
      setLang,
      theme,
      setTheme,
      toggleTheme,
      createdAgent,
      setCreatedAgent,
      agents,
      getAgent,
      paused,
      togglePause,
      isPaused,
    }),
    [
      user, workspace, authReady, refreshAuth, login, register, logout,
      lang, setLang, theme, setTheme, toggleTheme,
      createdAgent, agents, getAgent, paused, togglePause, isPaused,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
