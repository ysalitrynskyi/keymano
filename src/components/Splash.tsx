// Launch splash: vintage emblem, name, author, version, GitHub link, a 5s
// loading bar that PAUSES while the pointer hovers the link/controls so the
// user can read or click. Tiny theme + language pickers live here too. Click
// anywhere else / any key skips immediately. Respects reduced motion.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Logo } from "./Logo";
import { Wordmark } from "./Wordmark";
import { Segmented } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import { APP_VERSION, AUTHOR, AUTHOR_MAILTO, GITHUB_URL } from "@/lib/meta";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { useTheme } from "@/store/theme";

const DURATION = 5000;

export function Splash({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const done = React.useRef(false);
  const paused = React.useRef(false);
  const [progress, setProgress] = React.useState(0);

  const finish = React.useCallback(() => {
    if (done.current) return;
    done.current = true;
    onDone();
  }, [onDone]);

  // rAF countdown — only advances while not paused (hover holds it).
  React.useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const t = setTimeout(finish, 1200);
      return () => clearTimeout(t);
    }
    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused.current) elapsed += dt;
      const p = Math.min(elapsed / DURATION, 1);
      setProgress(p);
      if (p >= 1) finish();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

  React.useEffect(() => {
    const onKey = () => finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const openGithub = (e: React.MouseEvent) => {
    e.stopPropagation();
    void ipc.openExternal(GITHUB_URL);
  };

  // Hovering OR focusing any interactive control holds the countdown, so the
  // user can read, open the language dropdown, pick a theme, etc. without the
  // splash dismissing mid-action.
  const hold = {
    onMouseEnter: () => (paused.current = true),
    onMouseLeave: () => (paused.current = false),
    onFocusCapture: () => (paused.current = true),
    onBlurCapture: () => (paused.current = false),
    onPointerDown: () => (paused.current = true),
  };
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const lang = i18n.language.split("-")[0] === "zh" ? i18n.language : i18n.language.split("-")[0];

  return (
    <div
      onClick={finish}
      role="button"
      aria-label={t("splash.skipIntro")}
      tabIndex={0}
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-[var(--bg)] select-none"
    >
      {/* same faint vector hairlines as the app background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--hairline-fine) 0 1px, transparent 1px 13px), repeating-linear-gradient(-45deg, var(--hairline-wide) 0 1px, transparent 1px 52px)",
        }}
      />
      {/* tiny theme + language pickers, top-right; interacting holds the timer */}
      <div
        {...hold}
        onClick={stop}
        className="absolute right-4 top-4 z-10 flex cursor-default items-center gap-2"
      >
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: t("prefs.theme.light") },
            { value: "dark", label: t("prefs.theme.dark") },
            { value: "system", label: t("prefs.theme.system") },
          ]}
        />
        <select
          value={lang}
          onChange={(e) => void i18n.changeLanguage(e.target.value)}
          aria-label={t("a11y.language")}
          className="km-select h-8 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* emblem — single mark, gentle float only */}
      <div className="km-float" style={{ color: "var(--text)" }}>
        <Logo size={132} />
      </div>

      <h1 className="km-fade-in mt-7">
        <Wordmark className="text-5xl" />
      </h1>
      <div className="km-fade-in mx-auto mt-3 h-px w-28 hairline-accent" />
      <p
        className="km-fade-in mt-3 text-sm italic"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-display, ui-serif)" }}
      >
        {t("splash.tagline")}
      </p>

      {/* loading bar — width driven by the pausable countdown */}
      <div className="mt-10 h-1 w-64 overflow-hidden rounded-full bg-[var(--panel-2)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, var(--accent), var(--gold))",
          }}
        />
      </div>

      <div
        {...hold}
        className="mt-8 flex cursor-default items-center gap-3 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <span>
          {t("splash.by")}{" "}
          <button
            onClick={(e) => { e.stopPropagation(); void ipc.openExternal(AUTHOR_MAILTO); }}
            className="cursor-pointer underline-offset-2 hover:text-[var(--accent)] hover:underline"
          >
            {AUTHOR}
          </button>
        </span>
        <span className="opacity-50">·</span>
        <button onClick={openGithub} className="cursor-pointer underline-offset-2 hover:text-[var(--accent)] hover:underline">
          GitHub
        </button>
        <span className="opacity-50">·</span>
        <span>v{APP_VERSION}</span>
      </div>

      <p className="mt-6 text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
        {t("splash.clickToEnter")}
      </p>
    </div>
  );
}
