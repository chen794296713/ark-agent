"use client";

/**
 * App-wide client state that must survive route changes:
 *  - auth (current user + workspace), with login/register/logout
 *  - language (persisted to the user profile when signed in) + theme
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
  useSyncExternalStore,
} from "react";
import { detectLang, isLang, LANG_STORAGE_KEY } from "@/lib/i18n";
import {
  CURRENCY_STORAGE_KEY,
  currencyForLang,
  isCurrency,
  type Currency,
} from "@/lib/pricing";
import { api, type SessionUser, type WorkspaceDTO } from "@/lib/client-api";
import type { Lang } from "@/lib/types";

import {
  DEFAULT_DIRECTION,
  DEFAULT_THEME,
  DIRECTION_STORAGE_KEY,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  isDirection,
  isTheme,
  type Direction,
  type Theme,
} from "@/lib/theme-init";

// Re-exported so existing `from "@/lib/store"` imports keep working, while the
// values themselves live in a non-client module the root layout can also read.
export {
  THEMES,
  DIRECTIONS,
  DEFAULT_THEME,
  DEFAULT_DIRECTION,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  DIRECTION_STORAGE_KEY,
  isTheme,
  isDirection,
  type Theme,
  type Direction,
} from "@/lib/theme-init";

/**
 * The visitor's pinned currency, held in localStorage rather than React state.
 *
 * `useSyncExternalStore` is the right primitive for a value that only exists on
 * the client: it returns the server snapshot (`null` — follow the language)
 * during SSR and the first hydration render, so markup matches, then re-reads
 * on the client without a setState-in-effect. Subscribing to `storage` also
 * makes the choice track across tabs, which an effect-and-state version would
 * not have done.
 */
const currencyStore = {
  listeners: new Set<() => void>(),

  subscribe(onChange: () => void): () => void {
    currencyStore.listeners.add(onChange);
    // `storage` fires in OTHER tabs; the local Set covers this one.
    window.addEventListener("storage", onChange);
    return () => {
      currencyStore.listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  },

  /** Client snapshot. Returns a primitive, so React can compare it by value. */
  read(): Currency | null {
    try {
      const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
      return stored && isCurrency(stored) ? stored : null;
    } catch {
      return null; // private mode / storage disabled
    }
  },

  /** Server snapshot: nothing is pinned, so the language decides. */
  readServer(): Currency | null {
    return null;
  },

  write(next: Currency): void {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      /* private mode / storage disabled — the choice just will not persist */
    }
    for (const fn of currencyStore.listeners) fn();
  },
};

/**
 * Values that exist only in the browser — a persisted choice, a browser locale,
 * an attribute the pre-paint script already wrote. Each was previously adopted
 * by an effect that called setState synchronously on mount: a cascading render,
 * and one that painted a frame of the wrong language or theme first.
 *
 * `useSyncExternalStore` is the primitive for exactly this. It returns the
 * SERVER snapshot during SSR and the first hydration render — so the markup
 * matches — then re-reads on the client. There is nothing to subscribe to
 * (none of these change underneath us after boot), so the subscribe function is
 * a no-op, and every reader is memoised: React calls getSnapshot on every
 * render and warns if the value is not stable.
 */
const noopSubscribe = () => () => {};

/** Read once, then hand back the same value forever. */
function once<T>(read: () => T): () => T {
  let cached: { value: T } | null = null;
  return () => {
    if (!cached) cached = { value: read() };
    return cached.value;
  };
}

/**
 * The language to start in: a previously persisted choice wins, otherwise the
 * browser's own locale.
 */
const readBootLang = once<Lang>(() => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    /* private mode / storage disabled */
  }
  if (stored && isLang(stored)) return stored;
  return detectLang(typeof navigator !== "undefined" ? navigator.language : "en");
});

/**
 * Whatever the pre-paint boot script already applied to <html>. Reading the
 * attribute rather than localStorage keeps this in step with the script that
 * actually decided — including its own fallbacks.
 */
const readBootTheme = once<Theme>(() => {
  const applied = document.documentElement.getAttribute("data-theme");
  return applied && isTheme(applied) ? applied : DEFAULT_THEME;
});

const readBootDirection = once<Direction>(() => {
  const applied = document.documentElement.getAttribute("data-direction");
  return applied && isDirection(applied) ? applied : DEFAULT_DIRECTION;
});

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
  direction: Direction;
  setDirection: (d: Direction) => void;
  /**
   * Display currency. Follows the UI language (简体中文 → CNY, otherwise USD)
   * until the visitor picks one explicitly, after which the choice sticks.
   */
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** True once the visitor has overridden the language-derived default. */
  currencyPinned: boolean;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDTO | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Each preference is "what boot decided" unless something has since chosen
  // otherwise — a picker, or the signed-in user's profile. Deriving instead of
  // copying is what removes the mount effects.
  const bootLang = useSyncExternalStore(noopSubscribe, readBootLang, () => "en" as Lang);
  const bootTheme = useSyncExternalStore(noopSubscribe, readBootTheme, () => DEFAULT_THEME);
  const bootDirection = useSyncExternalStore(noopSubscribe, readBootDirection, () => DEFAULT_DIRECTION);

  const [langChoice, setLangState] = useState<Lang | null>(null);
  const [themeChoice, setThemeState] = useState<Theme | null>(null);
  const [directionChoice, setDirectionState] = useState<Direction | null>(null);

  const lang = langChoice ?? bootLang;
  const theme = themeChoice ?? bootTheme;
  const direction = directionChoice ?? bootDirection;
  // `null` = "follow the language"; a value = the visitor pinned it themselves.
  const currencyChoice = useSyncExternalStore(
    currencyStore.subscribe,
    currencyStore.read,
    currencyStore.readServer,
  );

  // Keep the document language in sync for accessibility & the :lang() CSS hook.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  /**
   * Adopt (or clear) a session. Signing in adopts the profile's language, which
   * is why this is the one place `setLangState` is called outside `setLang`.
   */
  const applySession = useCallback(
    (session: { user: SessionUser; workspace: WorkspaceDTO } | null) => {
      setUser(session?.user ?? null);
      setWorkspace(session?.workspace ?? null);
      if (session) setLangState(session.user.locale);
      setAuthReady(true);
    },
    [],
  );

  const refreshAuth = useCallback(async () => {
    try {
      applySession(await api.me());
    } catch {
      applySession(null);
    }
  }, [applySession]);

  // Written out rather than calling refreshAuth() so the state updates sit in
  // promise callbacks — an effect body that mutates state synchronously
  // cascades — and so the response can be discarded if the provider unmounts
  // while it is in flight.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((session) => !cancelled && applySession(session))
      .catch(() => !cancelled && applySession(null));
    return () => {
      cancelled = true;
    };
  }, [applySession]);

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

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      // Persist the choice locally so it survives reloads even when signed out…
      try {
        localStorage.setItem(LANG_STORAGE_KEY, l);
      } catch {
        /* private mode / storage disabled */
      }
      // …and to the profile when signed in (best-effort).
      void api.setPrefs({ locale: l }).catch(() => {});
    },
    [],
  );

  /**
   * The browser-chrome colour depends on BOTH axes, so each setter reads the
   * other's current value. They are kept as separate refs-free closures with
   * explicit deps rather than one combined setter, because the mode toggle and
   * the direction picker are independent controls on screen.
   */
  const applyChrome = useCallback((d: Direction, t: Theme) => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR[d][t]);
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      document.documentElement.setAttribute("data-theme", t);
      // Keep the browser chrome (iOS status bar, Android address bar) in step —
      // the static `viewport.themeColor` only describes the SSR default.
      applyChrome(direction, t);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, t);
      } catch {
        /* private mode / storage disabled */
      }
    },
    [applyChrome, direction],
  );

  const setDirection = useCallback(
    (d: Direction) => {
      setDirectionState(d);
      document.documentElement.setAttribute("data-direction", d);
      applyChrome(d, theme);
      try {
        localStorage.setItem(DIRECTION_STORAGE_KEY, d);
      } catch {
        /* private mode / storage disabled */
      }
    },
    [applyChrome, theme],
  );

  const setCurrency = useCallback((next: Currency) => currencyStore.write(next), []);

  const currency = currencyChoice ?? currencyForLang(lang);

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
      direction,
      setDirection,
      currency,
      setCurrency,
      currencyPinned: currencyChoice !== null,
    }),
    [
      user, workspace, authReady, refreshAuth, login, register, logout,
      lang, setLang, theme, setTheme, direction, setDirection, currency, setCurrency, currencyChoice,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
