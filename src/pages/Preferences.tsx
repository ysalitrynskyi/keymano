// P8 Preferences — app-level settings (not per-layout), shown as a modal.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button, Card, Segmented } from "@/components/ui";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { ipc } from "@/lib/ipc";
import { APP_NAME, APP_VERSION, AUTHOR, AUTHOR_MAILTO, CONTACT_EMAIL, GITHUB_URL } from "@/lib/meta";
import { useTheme } from "@/store/theme";

export function PreferencesModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, font, setFont } = useTheme();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("nav.prefs")}
    >
      <Card className="w-[440px] max-w-[calc(100vw-2rem)] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display mb-4 text-xl font-semibold">{t("nav.prefs")}</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("prefs.appearance")}</span>
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: t("prefs.theme.light") },
                { value: "dark", label: t("prefs.theme.dark") },
                { value: "system", label: t("prefs.theme.system") },
              ]}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("prefs.font")}</span>
            <Segmented
              value={font}
              onChange={setFont}
              options={[
                { value: "system", label: t("prefs.font.sans") },
                { value: "serif", label: t("prefs.font.serif") },
                { value: "mono", label: t("prefs.font.mono") },
                { value: "rounded", label: t("prefs.font.rounded") },
              ]}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("prefs.language")}</span>
            <select
              value={i18n.language.split("-")[0] === "zh" ? i18n.language : i18n.language.split("-")[0]}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              aria-label={t("a11y.language")}
              className="km-select h-9 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>
              {APP_NAME} v{APP_VERSION}
            </span>
            <span className="opacity-40">·</span>
            <button
              onClick={() => void ipc.openExternal(AUTHOR_MAILTO)}
              title={CONTACT_EMAIL}
              className="hidden underline-offset-2 hover:text-[var(--accent)] hover:underline sm:inline"
            >
              {AUTHOR}
            </button>
            <span className="hidden opacity-40 sm:inline">·</span>
            <button
              onClick={() => void ipc.openExternal(GITHUB_URL)}
              className="underline-offset-2 hover:text-[var(--accent)] hover:underline"
            >
              {t("about.github")}
            </button>
          </div>
          <Button variant="accent" size="sm" onClick={onClose}>
            {t("action.close")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
