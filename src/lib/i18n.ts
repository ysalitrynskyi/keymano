// App i18n (. i18next + react-i18next, source locale `en`. Generated
// locales are loaded from src/locales/<lang>/<ns>.json (translated via MCP).

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "../locales/en/common.json";
import enEditor from "../locales/en/editor.json";
import enErrors from "../locales/en/errors.json";

export const NAMESPACES = ["common", "editor", "errors"] as const;
export const SUPPORTED_LANGUAGES = [
  "en", "de", "fr", "es", "it", "pt", "nl", "pl", "uk", "ru", "ja",
  "zh-Hans", "zh-Hant", "ko",
  // top world languages added in v0.1
  "hi", "ar", "bn", "id", "ur", "tr", "vi", "fa", "ta", "mr",
] as const;

/** Right-to-left scripts — drive the document `dir` attribute. */
export const RTL_LANGUAGES = new Set(["ar", "ur", "fa", "he"]);

/** True if a (possibly region-tagged) language code is right-to-left. */
export function isRtl(lang: string): boolean {
  return RTL_LANGUAGES.has(lang.split("-")[0]);
}

const resources: Record<string, Record<string, object>> = {
  en: { common: enCommon, editor: enEditor, errors: enErrors },
};

// Eagerly load any generated non-en locales bundled at build time.
const generated = import.meta.glob("../locales/*/*.json", { eager: true }) as Record<
  string,
  { default: object }
>;
for (const [path, mod] of Object.entries(generated)) {
  const m = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!m) continue;
  const [, lang, ns] = m;
  if (lang === "en") continue;
  (resources[lang] ??= {})[ns] = mod.default;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    // Treat an empty string as "missing" so it falls back to en instead of
    // rendering a blank label — a locale key that somehow ships empty degrades
    // to English rather than to nothing.
    returnEmptyString: false,
    defaultNS: "common",
    ns: NAMESPACES as unknown as string[],
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
  });

export default i18n;
