# Agent guidance

Read the project README and existing contributor documentation before changing code.

## Machine context (this host)

Cross-repo / MCP / disk / Azure / efficiency unlocks:
`~/work/AGENTS.md` (walk-up discovery; **this file does not replace it**).

- Registry: `~/.config/agent-coordination/AGENT-REGISTRY.md`
- Runbooks (on demand): `~/work/_runbooks/` - azure-disabled, ai-providers, disk-cleanup, deploy-verify, ...
- **SSH:** never connect without operator OK naming exact host — `~/work/_runbooks/ssh-and-hosts.md` (many servers; do not guess).
- **Efficiency unlocks:** fast env help -> DIY if safe, or ask operator once (what / why / ~sec). Not invent-scope.
- **Azure:** 🛑 **HARD OFF** (2026-07-16) — credits exhausted; any call now bills a real card. Make zero Azure calls; `azure_image`/`bulk_text` were removed from every agent config. Re-enable only via `_runbooks/azure-disabled.md`. Who-uses-what: `_runbooks/ai-providers.md`.
