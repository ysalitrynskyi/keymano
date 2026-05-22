// Single source of truth for app identity. Version is injected from
// package.json at build time (see vite.config define); everything else is a
// constant referenced everywhere — no hardcoded duplicates.

declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
export const APP_NAME = "Keymano";
export const APP_TAGLINE = "A classic instrument for macOS keyboard layouts";
export const AUTHOR = "Yevhen Salitrynskyi";
export const CONTACT_EMAIL = "ysalitrynskyi+keymano@gmail.com";
export const AUTHOR_MAILTO = `mailto:${CONTACT_EMAIL}`;
export const GITHUB_URL = "https://github.com/ysalitrynskyi/keymano";
export const LICENSE = "Apache-2.0";
