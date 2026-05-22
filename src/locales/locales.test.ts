// Locale key-parity + placeholder-integrity + used-key coverage (.
// Every non-en locale must expose exactly the en key set with matching
// interpolation placeholders, and every `t("...")` reference in app source
// must resolve against the en JSON (or have an explicit `defaultValue`).
// Source `en` is authored by hand; other locales are MCP-generated.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const enModules = import.meta.glob("./en/*.json", { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>;
const allModules = import.meta.glob("./*/*.json", { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>;

function nsOf(path: string): string {
  return /\/([^/]+)\.json$/.exec(path)![1];
}
function langOf(path: string): string {
  return /\.\/([^/]+)\//.exec(path)![1];
}
function placeholders(s: string): string[] {
  return (s.match(/\{\{[^}]+\}\}/g) ?? []).sort();
}

const enByNs: Record<string, Record<string, string>> = {};
for (const [p, m] of Object.entries(enModules)) enByNs[nsOf(p)] = m.default;

describe("locale parity", () => {
  it("en has at least the common + editor + errors namespaces", () => {
    expect(Object.keys(enByNs).sort()).toEqual(["common", "editor", "errors"]);
  });

  const langs = new Set(Object.keys(allModules).map(langOf));
  langs.delete("en");

  // Literal tokens that must never be translated/transliterated — brand,
  // file extensions, fixed install path, and physical-geometry acronyms. If an
  // en value contains one of these, every locale's value for that key must
  // contain it verbatim too (otherwise we'd ship a broken extension/path or a
  // mangled brand name). The fallback (fallbackLng: "en") only covers a
  // *missing* key — a present-but-mistranslated token would slip through, so
  // it's guarded here.
  const PROTECTED_TOKENS = [
    "Keymano",
    ".keylayout",
    ".bundle",
    "~/Library/Keyboard Layouts",
    "ANSI",
    "ISO",
    "JIS",
  ];

  for (const lang of langs) {
    it(`${lang} matches en key set + placeholders`, () => {
      for (const ns of Object.keys(enByNs)) {
        const path = `./${lang}/${ns}.json`;
        const mod = allModules[path];
        expect(mod, `${lang} missing namespace ${ns}`).toBeTruthy();
        const en = enByNs[ns];
        const loc = mod.default;
        expect(Object.keys(loc).sort()).toEqual(Object.keys(en).sort());
        for (const key of Object.keys(en)) {
          expect(placeholders(loc[key]), `${lang}/${ns}:${key} placeholder drift`).toEqual(
            placeholders(en[key]),
          );
        }
      }
    });

    it(`${lang} has no empty values and preserves protected tokens`, () => {
      for (const ns of Object.keys(enByNs)) {
        const en = enByNs[ns];
        const loc = allModules[`./${lang}/${ns}.json`].default;
        for (const key of Object.keys(en)) {
          const val = loc[key];
          // No empty/whitespace-only string (would render blank, not fall back
          // — fallbackLng doesn't fire for a present-but-empty value unless
          // returnEmptyString:false, which we also set, but ban it at source).
          expect(typeof val === "string" && val.trim().length > 0, `${lang}/${ns}:${key} is empty`).toBe(
            true,
          );
          // Protected literals must survive verbatim.
          for (const tok of PROTECTED_TOKENS) {
            if (en[key].includes(tok)) {
              expect(val.includes(tok), `${lang}/${ns}:${key} dropped protected token "${tok}"`).toBe(
                true,
              );
            }
          }
        }
      }
    });
  }
});

// Drift guard: every `t("...")` call in the app source must reference a key
// that exists in some en/* JSON (or use `defaultValue:` for safe fallback,
// or be an i18next plural — keys with `_one`/`_other`/`_zero`/`_few`/`_many`
// suffixes in JSON resolve from the singular form here).
describe("t() coverage", () => {
  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, acc);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) acc.push(p);
    }
    return acc;
  }

  const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // src/
  const files = walk(root);

  // Set of all defined keys across en namespaces (incl. plural forms collapsed
  // to their stem: `foo.bar_one` -> also exposes `foo.bar`).
  const allEnKeys = new Set<string>();
  for (const ns of Object.values(enByNs)) {
    for (const k of Object.keys(ns)) {
      allEnKeys.add(k);
      const m = /^(.+)_(zero|one|two|few|many|other)$/.exec(k);
      if (m) allEnKeys.add(m[1]);
    }
  }

  // Match t("foo.bar") and t('foo.bar', { … }); skip when defaultValue: is
  // present in the same call (i18next-safe fallback). Match keys with at
  // least one dot to avoid catching arbitrary t("ns:") or interpolation vars.
  const callRe = /\bt\(\s*["']([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)["']([^)]*)\)/g;

  it("every t() key in src/ exists in en/*.json (or has defaultValue)", () => {
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(src))) {
        const [, key, rest] = m;
        if (rest.includes("defaultValue")) continue;
        if (!allEnKeys.has(key)) missing.push(`${f}: t("${key}")`);
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
