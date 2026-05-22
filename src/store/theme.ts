// Theme + keycap-font state, persisted to localStorage, applied to <html>.

import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

// Legend font for the keyboard view (Ukelele parity: choose the keycap font).
export type KeycapFont = "system" | "serif" | "mono" | "rounded";

const FONT_STACK: Record<KeycapFont, string> = {
  system: 'ui-sans-serif, system-ui, "Avenir Next", "Segoe UI", sans-serif',
  serif: '"Iowan Old Style", Palatino, "Book Antiqua", Georgia, ui-serif, serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
  rounded: '"SF Pro Rounded", "Varela Round", ui-rounded, "Avenir Next", sans-serif',
};

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function applyFont(font: KeycapFont) {
  document.documentElement.style.setProperty("--key-font", FONT_STACK[font]);
}

interface ThemeState {
  theme: Theme;
  font: KeycapFont;
  setTheme: (t: Theme) => void;
  setFont: (f: KeycapFont) => void;
  toggle: () => void;
}

// First launch (no stored config): follow the OS appearance. The system
// resolver falls back to light ("bright") when prefers-color-scheme is absent.
const stored: Theme =
  (typeof localStorage !== "undefined" &&
    (localStorage.getItem("keymano-theme") as Theme)) ||
  "system";

const storedFont: KeycapFont =
  (typeof localStorage !== "undefined" &&
    (localStorage.getItem("keymano-font") as KeycapFont)) ||
  "system";

export const useTheme = create<ThemeState>((set, get) => ({
  theme: stored,
  font: storedFont,
  setTheme: (t) => {
    localStorage.setItem("keymano-theme", t);
    apply(t);
    set({ theme: t });
  },
  setFont: (f) => {
    localStorage.setItem("keymano-font", f);
    applyFont(f);
    set({ font: f });
  },
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
}));

if (typeof document !== "undefined") {
  apply(stored);
  applyFont(storedFont);
  // React to live OS appearance changes while on "system" (P2-06).
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (useTheme.getState().theme === "system") apply("system");
  });
}
