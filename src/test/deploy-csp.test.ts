// Guards the web deployment's Content-Security-Policy against the v0.2.0
// regression where the browser build (Rust core compiled to wasm) was dead in
// production: script-src had no 'wasm-unsafe-eval', so the browser blocked
// every WebAssembly compile and opening a layout threw a CompileError.
//
// Two layers are checked:
//   1. the static nginx.conf template (where 'wasm-unsafe-eval' lives), and
//   2. the CSP actually rendered by docker-entrypoint.sh for each analytics
//      mode (default / GA / Cloudflare / both) — the entrypoint is what
//      produces the header browsers receive, so a substitution bug there would
//      bypass a template-only check.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const nginxConf = readFileSync(join(repoRoot, "docker/nginx.conf"), "utf8");
const entrypoint = join(repoRoot, "docker/docker-entrypoint.sh");

/** Pull a single CSP directive's value (everything up to the next ';'). */
function directive(csp: string, name: string): string {
  const line = csp.split("\n").find((l) => l.includes("default-src 'self'")) ?? "";
  return (new RegExp(`${name} ([^;]*)`).exec(line)?.[1] ?? "").trim();
}

describe("nginx CSP template (docker/nginx.conf)", () => {
  const scriptSrc = directive(nginxConf, "script-src");

  it("declares a Content-Security-Policy with script-src", () => {
    expect(scriptSrc).toBeTruthy();
  });

  it("allows WebAssembly compilation via 'wasm-unsafe-eval'", () => {
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
  });

  it("does NOT enable general JS eval ('unsafe-eval')", () => {
    expect(scriptSrc.replace(/'wasm-unsafe-eval'/g, "")).not.toContain("unsafe-eval");
  });

  it("keeps the analytics substitution tokens for the entrypoint to fill", () => {
    expect(nginxConf).toContain("__CSP_SCRIPT_EXTRA__");
    expect(nginxConf).toContain("__CSP_CONNECT_EXTRA__");
    expect(nginxConf).toContain("__CSP_IMG_EXTRA__");
  });
});

describe("rendered CSP (docker/docker-entrypoint.sh)", () => {
  let workdir: string;

  beforeAll(() => {
    workdir = mkdtempSync(join(tmpdir(), "keymano-csp-"));
  });
  afterAll(() => {
    // mkdtemp dir is under the OS temp root; leaving it is harmless, but tidy up.
    try {
      execFileSync("rm", ["-rf", workdir]);
    } catch {
      /* best effort */
    }
  });

  /** Run the real entrypoint with stubbed paths + nginx; return rendered files. */
  function render(env: Record<string, string>): {
    csp: string;
    html: string;
    analyticsJs: boolean;
  } {
    const dir = mkdtempSync(join(workdir, "case-"));
    const outConf = join(dir, "default.conf");
    const tmplHtml = join(dir, "index.html.tmpl");
    const outHtml = join(dir, "index.html");
    const analyticsJs = join(dir, "analytics.js");
    writeFileSync(tmplHtml, "<head>\n<!--KEYMANO_ANALYTICS-->\n</head>\n");

    execFileSync("sh", [entrypoint, "true"], {
      env: {
        PATH: process.env.PATH ?? "",
        NGINX_BIN: "true", // skip real `nginx -t` (a bare server block won't validate standalone)
        KEYMANO_TMPL_CONF: join(repoRoot, "docker/nginx.conf"),
        KEYMANO_OUT_CONF: outConf,
        KEYMANO_TMPL_HTML: tmplHtml,
        KEYMANO_OUT_HTML: outHtml,
        KEYMANO_ANALYTICS_JS: analyticsJs,
        ...env,
      },
      stdio: "pipe",
    });

    const csp = readFileSync(outConf, "utf8");
    return { csp, html: readFileSync(outHtml, "utf8"), analyticsJs: existsSync(analyticsJs) };
  }

  it("ALWAYS allows wasm and never general eval, in every analytics mode", () => {
    const modes: Record<string, string>[] = [
      {},
      { GA_MEASUREMENT_ID: "G-TEST123" },
      { CLOUDFLARE_WEB_ANALYTICS: "1" },
      { GA_MEASUREMENT_ID: "G-TEST123", CLOUDFLARE_WEB_ANALYTICS: "1" },
    ];
    for (const env of modes) {
      const scriptSrc = directive(render(env).csp, "script-src");
      expect(scriptSrc, JSON.stringify(env)).toContain("'wasm-unsafe-eval'");
      expect(scriptSrc.replace(/'wasm-unsafe-eval'/g, ""), JSON.stringify(env)).not.toContain(
        "unsafe-eval",
      );
    }
  });

  it("default mode is same-origin (no analytics origins, no injected script)", () => {
    const { csp, html, analyticsJs } = render({});
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).toBe("'self' 'wasm-unsafe-eval'");
    expect(directive(csp, "connect-src")).toBe("'self'");
    expect(html).not.toContain("gtag");
    expect(html).not.toContain("KEYMANO_ANALYTICS"); // marker consumed
    expect(analyticsJs).toBe(false);
  });

  it("GA mode adds Google origins and injects the tag", () => {
    const { csp, html, analyticsJs } = render({ GA_MEASUREMENT_ID: "G-TEST123" });
    expect(directive(csp, "script-src")).toContain("https://www.googletagmanager.com");
    expect(directive(csp, "connect-src")).toContain("https://www.google-analytics.com");
    expect(directive(csp, "img-src")).toContain("https://www.google-analytics.com");
    expect(html).toContain("googletagmanager.com/gtag/js?id=G-TEST123");
    expect(analyticsJs).toBe(true);
    // GA alone must not pull in Cloudflare origins.
    expect(csp).not.toContain("cloudflareinsights.com");
  });

  it("Cloudflare mode adds CF origins only (no Google, no injected tag)", () => {
    const { csp, html } = render({ CLOUDFLARE_WEB_ANALYTICS: "1" });
    expect(directive(csp, "script-src")).toContain("https://static.cloudflareinsights.com");
    expect(directive(csp, "connect-src")).toContain("https://cloudflareinsights.com");
    expect(csp).not.toContain("googletagmanager.com");
    expect(html).not.toContain("gtag");
  });

  it("GA + Cloudflare combine without dropping wasm-unsafe-eval", () => {
    const scriptSrc = directive(
      render({ GA_MEASUREMENT_ID: "G-TEST123", CLOUDFLARE_WEB_ANALYTICS: "1" }).csp,
      "script-src",
    );
    expect(scriptSrc).toBe(
      "'self' 'wasm-unsafe-eval' https://www.googletagmanager.com https://static.cloudflareinsights.com",
    );
  });

  it("rejects a malformed GA id (env-var injection guard) and stays same-origin", () => {
    const { csp, html } = render({ GA_MEASUREMENT_ID: 'G-X"><script>alert(1)</script>' });
    expect(directive(csp, "script-src")).toBe("'self' 'wasm-unsafe-eval'");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("gtag");
  });
});

describe("prod compose analytics wiring (docker-compose.prod.yml)", () => {
  const compose = readFileSync(join(repoRoot, "docker-compose.prod.yml"), "utf8");

  // If either passthrough is dropped, the container never sees the env var and
  // the analytics toggle becomes a silent no-op.
  it("passes GA_MEASUREMENT_ID through to the container", () => {
    expect(compose).toMatch(/GA_MEASUREMENT_ID:\s*\$\{GA_MEASUREMENT_ID/);
  });
  it("passes CLOUDFLARE_WEB_ANALYTICS through to the container", () => {
    expect(compose).toMatch(/CLOUDFLARE_WEB_ANALYTICS:\s*\$\{CLOUDFLARE_WEB_ANALYTICS/);
  });
});
