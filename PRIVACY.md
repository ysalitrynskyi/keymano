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
  in your browser — nothing about your layouts is ever sent to a server. This
  hosted instance **uses Google Analytics** for anonymous page-view / usage
  statistics; Google's analytics script loads and Google sets its cookies
  (governed by [Google's privacy policy](https://policies.google.com/privacy)).
  Only standard analytics events are sent — never your layout content. Analytics
  is enabled per deployment via the `GA_MEASUREMENT_ID` environment variable, so
  a **self-hosted** instance has none unless its operator turns it on, and the
  **desktop app** has no analytics path at all.
- **Source / GitHub repository:** subject to GitHub's own privacy policy when you
  visit, clone, or open issues; that is outside Keymano's control.

---

## What Keymano collects

**The app collects nothing about your layouts.**

The Keymano application code — desktop or web — does not collect, transmit, log,
profile, or share your layout content, files, or document data. The product
code ships with **no** bundled analytics SDK.

The **hosted web app** at `keymano.ys.contact` does load **Google Analytics**
(injected at deploy time from the `GA_MEASUREMENT_ID` environment variable) for
anonymous page-view / usage statistics: Google's `gtag.js` runs, sends
pageview/usage events to Google, and sets Google's cookies — governed by
[Google's privacy policy](https://policies.google.com/privacy). It never
receives your `.keylayout` content. A self-hosted instance that leaves
`GA_MEASUREMENT_ID` unset serves none of that code. This never affects the
desktop app, which has no analytics path at all.

You can verify this in the source:

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

The hosted site at `keymano.ys.contact` loads **Google Analytics** (`gtag.js`),
which sets Google's `_ga*` cookies and reports anonymous page-view / usage
events to Google. It is the only third-party script and the only source of
cookies; the `Content-Security-Policy` is widened to exactly Google's analytics
origins and nothing else, and the page always opts out of Google's
interest-cohort tracking with `Permissions-Policy: interest-cohort=()`.

Analytics is gated by the `GA_MEASUREMENT_ID` environment variable. A
self-hosted instance that leaves it unset sets **no cookies** and loads **no
analytics or tag-management scripts** — the strict CSP then blocks third-party
scripts entirely. The desktop app has no analytics path either way.

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
