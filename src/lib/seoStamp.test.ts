import { describe, it, expect } from "vitest";

import { stampHtml, buildSitemap } from "./seoStamp";

describe("seoStamp (B4 build-time SEO surface)", () => {
  it("replaces every %APP_VERSION% placeholder with the version", () => {
    const html = `<meta name="v" content="%APP_VERSION%"><span>%APP_VERSION%</span>`;
    const out = stampHtml(html, "1.2.3", "2026-05-22");
    expect(out).toBe(`<meta name="v" content="1.2.3"><span>1.2.3</span>`);
    expect(out).not.toContain("%APP_VERSION%");
  });

  it("replaces every %BUILD_DATE% placeholder with the build date", () => {
    const out = stampHtml(`a %BUILD_DATE% b %BUILD_DATE%`, "1.2.3", "2026-05-22");
    expect(out).toBe(`a 2026-05-22 b 2026-05-22`);
    expect(out).not.toContain("%BUILD_DATE%");
  });

  it("leaves html without placeholders untouched", () => {
    const html = `<!doctype html><html><head></head></html>`;
    expect(stampHtml(html, "1.2.3", "2026-05-22")).toBe(html);
  });

  it("emits a well-formed sitemap with the build date as <lastmod>", () => {
    const xml = buildSitemap("2026-05-22");
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(`<loc>https://keymano.ys.contact/</loc>`);
    expect(xml).toContain(`<lastmod>2026-05-22</lastmod>`);
    expect(xml).toContain(`<priority>1.0</priority>`);
    // single <url> entry, properly closed
    expect((xml.match(/<url>/g) ?? []).length).toBe(1);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });
});
