# macOS first-run text (for releases)

Canonical user-facing steps live in
[GETTING_STARTED.md#first-launch-on-macos-important](GETTING_STARTED.md#first-launch-on-macos-important).

When editing a GitHub Release body, include a **macOS first-run** block like this
(so non-technical users are not stuck at Gatekeeper):

```markdown
> ### ⚠️ macOS first-run — please read
>
> Keymano is **not signed** with an Apple Developer ID ($99/year; this app is free).
> macOS may show:
>
> > *"Apple could not verify 'Keymano.app' is free of malware…"*
>
> **This is normal for unsigned open-source apps. One-time fix:**
>
> 1. Open the `.dmg` and drag **Keymano** to **Applications**.
> 2. Open **Terminal** (`⌘ + Space` → type `Terminal` → Return).
> 3. Paste and run:
>
>    ```bash
>    xattr -d com.apple.quarantine /Applications/Keymano.app
>    ```
>
> 4. Open Keymano from Applications. You only do this once.
>
> Full guide: https://github.com/ysalitrynskyi/keymano/blob/main/docs/GETTING_STARTED.md#first-launch-on-macos-important
```

Future CI release drafts should link to the Getting Started anchor instead of
only “right-click → Open”.
