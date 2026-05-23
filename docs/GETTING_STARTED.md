# Getting started (plain-English guide)

**Keymano** is a free editor for custom macOS keyboard layouts (`.keylayout` files
and `.bundle` packages). It is a cross-platform **Ukelele alternative** — use it in
your browser or install the desktop app on macOS, Windows, or Linux.

New to GitHub, or not a developer? This page explains how to get Keymano and use
it without needing to know any of the technical stuff. If a word looks unfamiliar,
check the [glossary](#glossary) at the bottom.

There are three ways to use Keymano. Most people want the **first** one.

---

## 1. Just install the app (recommended)

You do **not** need a GitHub account, git, or any developer tools.

1. Open the **Releases** page:
   <https://github.com/ysalitrynskyi/keymano/releases>
2. Find the newest release at the top. Under it, click **“Assets”** to expand the
   list of downloads.
3. Download the file for your computer:
   - **macOS** → the file ending in **`.dmg`**
   - **Windows** → the file ending in **`.msi`** (or **`.exe`**)
   - **Linux** → the file ending in **`.AppImage`** or **`.deb`**
4. Open the downloaded file and install it like any normal app.
5. **macOS only:** if the app will not open, follow [First launch on macOS](#first-launch-on-macos-important) below (one-time step).

### First launch on macOS (important)

Keymano is **not signed** with an Apple Developer ID (signing costs $99/year and
this app is free). macOS may block the first launch with a message like:

> *"Apple could not verify 'Keymano.app' is free of malware that may harm your Mac or compromise your privacy."*

**This is normal for unsigned open-source Mac apps.** The source code is public on
GitHub if you want to review it before running.

**To run Keymano (you only need to do this once):**

1. Open the `.dmg` from the release and drag **Keymano** into your **Applications** folder.
2. Open the **Terminal** app (press `⌘ + Space`, type `Terminal`, press Return).
3. Paste this command and press Return:

   ```bash
   xattr -d com.apple.quarantine /Applications/Keymano.app
   ```

4. Open Keymano from **Applications** or Launchpad as usual.

That command removes the “downloaded from the internet” flag macOS attaches to
the app. If you prefer not to use Terminal, try **right-click** (or Control-click)
**Keymano** → **Open** → **Open** in the dialog — that works on some Macs but not
all; the Terminal command above is the reliable fix.

---

## 2. Try it in your browser (no install)

Just want a quick look? Open **<https://keymano.ys.contact>** — the whole app
runs in your browser. You can open and edit a `.keylayout` file, save it back
as `.keylayout`, or export it as a `.bundle` keyboard package.

Browsers can't write into the system Keyboard Layouts folder for you, so the
**Install** button downloads the file instead — then you drop it in yourself:

- A standalone `.keylayout` downloads as a single file.
- A `.bundle` (a folder package) downloads as a `.bundle.zip` archive. **Unzip
  it first** — the result is a real `.bundle` folder.

On macOS, move the result into `~/Library/Keyboard Layouts/` (in Finder press
`⌘⇧G` to jump there), then open **System Settings → Keyboard → Input Sources**,
click **+**, and pick your layout. If it doesn't show up, log out and back in —
macOS only re-scans that folder at login. (The desktop app does all of this for
you with one click.)

---

## 3. Build it yourself (for developers)

If you're comfortable with a terminal and want to compile from the source code,
see **[Build from source](../README.md#build-from-source)** in the main README.
This is only for contributors/packagers — everyone else should use option 1 or 2.

---

## Using the app

Once it's open, see **[Using Keymano](../README.md#using-keymano)** in the README
for a short walk-through (start a layout, edit keys, dead keys, validate, save /
install). The app also has a built-in **Help tour** on each page — look for the
help button.

Want sample layouts to open? The [`examples/`](../examples/) folder has a few
ready-made phonetic Cyrillic layouts; download one and use **File → Open…**.

---

## Reporting a problem or asking for a feature

Found a bug or want something added? You'll need a free GitHub account.

1. Go to <https://github.com/ysalitrynskyi/keymano/issues>
2. Click **“New issue”**.
3. Give it a short title and describe:
   - what you did,
   - what you expected,
   - what actually happened (a screenshot helps a lot).
4. Click **“Submit new issue.”**

For **security problems** specifically, don't open a public issue — follow
[SECURITY.md](../SECURITY.md) instead.

For questions and help, see [SUPPORT.md](../SUPPORT.md).

---

## Glossary

- **GitHub** — the website that hosts Keymano's code and downloads.
- **Repository (“repo”)** — the project's folder of code and files on GitHub.
- **Release** — a published, ready-to-download version of the app. Downloads
  live under a release's **Assets**.
- **Asset** — a downloadable file attached to a release (the `.dmg`, `.msi`, etc.).
- **Issue** — a public note on GitHub used to report a bug or request a feature.
- **`.keylayout`** — Apple's keyboard-layout file (it's XML — plain text inside).
- **`.bundle`** — a package that can hold several layouts plus names and icons.
- **Gatekeeper** — macOS's security check that warns about unsigned apps.
- **Source code** — the human-written instructions the app is built from.
- **Build / compile** — turning source code into a runnable app (developers only).
