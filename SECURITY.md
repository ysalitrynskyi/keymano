# Security Policy

## Supported versions

Keymano is pre-1.0; security fixes land on the latest `main` and the most recent
release. Please test against the latest version before reporting.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/ysalitrynskyi/keymano/security/advisories/new)
(Security ▸ Report a vulnerability), or email **ysalitrynskyi@gmail.com** with:

- a description and impact,
- steps to reproduce or a proof of concept,
- affected version / OS.

You'll get an acknowledgement within a few days. Please allow reasonable time
for a fix before public disclosure.

## Scope notes

Keymano runs locally and edits keyboard-layout files. It does not handle
accounts or credentials. Areas worth scrutiny:

- file parsing (`.keylayout` / `.bundle`) — malformed or hostile input,
- the desktop file-system commands (install/uninstall/reveal/open-external),
  which constrain paths to the user's Keyboard Layouts folder and external
  URLs to `http(s)`,
- the hosted/self-hosted **web build** — the static nginx image and its
  Content-Security-Policy / security headers (`docker/nginx.conf`), the
  startup entrypoint that renders the page + CSP and validates the optional
  `GA_MEASUREMENT_ID` (`docker/docker-entrypoint.sh`), and the Cloudflare
  Tunnel deployment (`docker-compose.prod.yml`). The web build has no upload
  endpoint or backend and caps request bodies; report any CSP bypass, header
  weakness, or analytics-injection issue here too.
