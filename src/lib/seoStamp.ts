// Pure helpers for the build-time SEO stamp (consumed by vite.config.ts's
// `seoStamp` plugin). Kept here, separate from the Vite plugin wiring, so the
// version/date substitution and sitemap shape are unit-testable without
// booting Rollup. See vite.config.ts B4.

/** Replace the `%APP_VERSION%` / `%BUILD_DATE%` placeholders in the static
 *  index.html so the public SEO surface (JSON-LD softwareVersion, etc.) never
 *  drifts from the released version. */
export function stampHtml(html: string, version: string, buildDate: string): string {
  return html.replace(/%APP_VERSION%/g, version).replace(/%BUILD_DATE%/g, buildDate);
}

/** Build the sitemap.xml emitted into the bundle. `lastmod` is the build date
 *  so the sitemap is always current against the release. */
export function buildSitemap(buildDate: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url>\n` +
    `    <loc>https://keymano.ys.contact/</loc>\n` +
    `    <lastmod>${buildDate}</lastmod>\n` +
    `    <changefreq>weekly</changefreq>\n` +
    `    <priority>1.0</priority>\n` +
    `  </url>\n` +
    `</urlset>\n`
  );
}
