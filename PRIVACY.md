# Privacy Policy

_Last updated: 2026-05-22._

Keymano is built to leave your data alone. This document describes — accurately
and verifiably — what data the project handles, and what it does not.

If you find anything here that does not match the code, please open a security
advisory ([SECURITY.md](SECURITY.md)) — that is a bug we want to fix.

---

## TL;DR

- **Desktop app (macOS / Windows / Linux):** runs entirely on your machine.
  No network calls, no telemetry, no analytics, no crash reporting, no auto-update
  pings. The only files it reads or writes are the `.keylayout` / `.bundle` files
  you open and the layouts you install into your own `~/Library/Keyboard Layouts`
  (or platform equivalent) folder.
- **Hosted web app at `https://keymano.ys.contact`:** a static SPA served by
  nginx behind a Cloudflare Tunnel. No accounts, and your `.keylayout` work stays
  in your browser — nothing about your layouts is ever sent to a server. The
  shipped build runs no analytics, cookies, or third-party trackers by default.
  A self-hoster (including this instance's operator) **may** opt in to Google
  Analytics by setting the `GA_MEASUREMENT_ID` environment variable; when that is
  set, the page loads Google's analytics script and sets Google's cookies. It is
  off unless explicitly configured.
- **Source / GitHub repository:** subject to GitHub's own privacy policy when you
  visit, clone, or open issues; that is outside Keymano's control.

---

## What Keymano collects

**Nothing by default.**

The Keymano application itself — desktop or web — does not collect, transmit,
log, profile, or share any personal data, usage data, telemetry, error reports,
IP addresses, device identifiers, or analytics. Not even anonymized aggregates.
The product code ships with no analytics.

The one exception is operator-controlled and off by default: a self-hoster can
enable **Google Analytics** on the hosted web build by setting the
`GA_MEASUREMENT_ID` environment variable on the container. When set, the page
loads Google's `gtag.js`, sends pageview/usage events to Google, and sets
Google's cookies — governed by
[Google's privacy policy](https://policies.google.com/privacy). When unset (the
default), none of that code is served. This switch never affects the desktop
app, which has no analytics path at all.

You can verify the default-off posture in the source:

- The desktop app's Tauri Content Security Policy (`src-tauri/tauri.conf.json`)
  forbids any non-self network connection — there is no way to enable analytics
  in the desktop build.
- The web build's nginx Content Security Policy (`docker/nginx.conf`) restricts
  `connect-src`/`script-src` to `'self'` until, and only if, an operator sets
  `GA_MEASUREMENT_ID`, at which point `docker/docker-entrypoint.sh` widens the
  CSP to exactly Google's analytics origins and injects the tag.
- The error boundary (`src/components/ErrorBoundary.tsx`) explicitly logs
  exceptions to the local console only — "no external telemetry (privacy)".
- There is no analytics library, tag manager, or A/B-testing SDK bundled in
  `package.json` or `Cargo.toml`; the optional Google tag is loaded at runtime
  from Google's CDN only when configured, never built into the app.

## What Keymano stores locally

To make the editor useful, the application keeps a small amount of state in the
runtime sandbox it is given (browser `localStorage` for the web build,
Tauri's per-app storage for the desktop build):

- **UI preferences** — theme (light / dark / system), font family, current
  language. Only used to render the UI.
- **Recently opened files** — a list of paths/names so the welcome screen can
  offer them again. The web build only stores the document names you create or
  open in the current browser; the desktop build stores the paths it has
  permission to reopen.
- **The currently open documents** — the unsaved working state of layouts you
  are editing. This stays in memory and, for the desktop build, in the same
  per-app storage; the web build never persists document contents anywhere
  outside the current tab unless you explicitly Save / Export.

None of this is transmitted off-device. Clearing your browser site data, or
quitting + reinstalling the desktop app, removes all of it.

## Files you open or save

When you open a `.keylayout` or `.bundle` file, its contents are parsed and held
in memory for editing. When you Save / Export / Install, the file is written
back to a location you choose (or, on the web, downloaded by your browser). The
file never leaves your machine through Keymano.

`Install` on macOS writes only into your own
`~/Library/Keyboard Layouts/` folder, and the file paths are validated by the
Rust core to refuse traversal outside that folder.

## Cookies and tracking

By default the hosted site sets **no cookies** and runs **no analytics or
tag-management scripts**, and it always opts out of Google's interest-cohort
tracking with `Permissions-Policy: interest-cohort=()`. The strict
`Content-Security-Policy` served with every response blocks third-party scripts
entirely — so no tracker can run unless the operator deliberately enables it.

If the operator sets `GA_MEASUREMENT_ID`, the site loads Google Analytics
(`gtag.js`), which sets Google's `_ga*` cookies and reports usage to Google; the
CSP is widened to exactly Google's analytics origins and nothing else. This is
the only way cookies or third-party scripts are ever introduced, it is off
unless configured, and it has no equivalent in the desktop app.

## Logs

The hosted nginx instance keeps minimal access logs for debugging and abuse
detection (request line, status, bytes, user agent). Because nginx sits behind
the Cloudflare Tunnel, the client address it sees and logs is the internal
tunnel-container address, **not** your real IP — nginx never receives it (the
config adds no `real_ip`/`X-Forwarded-For` handling). These logs are not joined
with anything that identifies a person, are not shared, and are rotated
automatically (capped to ~30 MB by the container's log driver). The `/healthz`
endpoint is excluded from logging.

## Children

Keymano is a developer-oriented keyboard-layout editor; it is not directed at
children and the application code itself collects nothing. With Google
Analytics turned off (the default), no data is collected from any user,
including children under 13 (COPPA) or 16 (GDPR Article 8). If an operator
chooses to enable `GA_MEASUREMENT_ID`, the COPPA / GDPR-Article-8 obligations
for visitors of their hosted instance pass through to that operator and to
Google's own age controls — Keymano cannot make those guarantees on someone
else's deployment.

## Third-party services

The Keymano product code embeds no third-party services. The hosted site is
fronted by a Cloudflare Tunnel, so Cloudflare sees the traffic at the network
layer; their handling is governed by
[Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).
If an operator enables `GA_MEASUREMENT_ID`, Google Analytics is loaded from
Google's CDN at runtime and is then subject to
[Google's privacy policy](https://policies.google.com/privacy); when it is
unset (the default), no Google code is loaded.

When you use the source repository or report issues, GitHub processes that
interaction under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Updates to this policy

This file lives in the source repository. Material changes will appear in
[`CHANGELOG.md`](CHANGELOG.md) and bump the "Last updated" date at the top.

## Contact

Questions about this policy: open a public Discussion, or email
**ysalitrynskyi@gmail.com**. Suspected privacy bugs (e.g. an unintended network
call): please follow [SECURITY.md](SECURITY.md).
