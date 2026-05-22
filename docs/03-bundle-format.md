# 03 — `.bundle` Keyboard Package Format

A `.bundle` is a macOS package directory holding one or more `.keylayout` files plus metadata, icon, and localized names. Installing a `.bundle` into `/Library/Keyboard Layouts/` or `~/Library/Keyboard Layouts/` exposes all contained layouts.

## On-disk layout

```
MyKeyboard.bundle/
└── Contents/
    ├── Info.plist
    ├── version.plist                 (optional)
    └── Resources/
        ├── MyKeyboard.keylayout      (1+ layout files)
        ├── Another.keylayout
        ├── MyKeyboard.icns           (optional, per layout — name matches layout)
        ├── English.lproj/
        │   └── InfoPlist.strings      (localized layout display names)
        └── <Locale>.lproj/
            └── InfoPlist.strings
```

Note: a keyboard `.bundle` has an empty/absent `Contents/MacOS/` (no executable). It's a resource-only package.

## `Contents/Info.plist`

Plist (XML plist; we write XML plist for portability). Required keys:

| Key | Value |
|-----|-------|
| `CFBundleIdentifier` | must start with `com.apple.keyboardlayout.` then a name, e.g. `com.apple.keyboardlayout.MyKeyboard` |
| `CFBundleName` | bundle display name |
| `CFBundleVersion` | version string |
| `CFBundlePackageType` | (for bundles Apple does not require `BNDL` here for keyboard layouts; Ukelele writes minimal set) |

Ukelele-specific / observed keys: `BuildVersion`, `ProjectName`, `SourceVersion`. Keep them optional — write if present, tolerate on read.

There is no per-layout entry in Info.plist; macOS discovers every `.keylayout` in `Resources/`. The `<keyboard name=...>` and the `id`/`group` inside each `.keylayout` identify each layout.

## `Contents/version.plist` (optional)

Standard Apple version plist: `BuildVersion`, `ProjectName`, `SourceVersion`. Optional; preserve if present.

## Localization — `Resources/<Locale>.lproj/InfoPlist.strings`

`.strings` format (key = value;). Maps a layout's internal name to a localized display name. Example `English.lproj/InfoPlist.strings`:

```
"MyKeyboard" = "My Keyboard";
"Another" = "Another Layout";
```

`.strings` files are UTF-16 by Apple convention but UTF-8 is accepted by modern macOS. We write UTF-8 (with BOM-less) and parse both. Each `.lproj` folder name is a locale (`English`, `en`, `fr`, `de`, `ja`, …). Ukelele uses legacy names like `English.lproj`; modern is `en.lproj`. Support both; default to writing `en.lproj` + keep any existing.

## Icon — `Resources/<LayoutName>.icns`

Optional `.icns` matching a layout's base filename. macOS shows it in the input menu. v1: accept/preserve existing `.icns`; generation from PNG is a nice-to-have (use the `icns` Rust crate later). Don't block on it.

## Our model mapping

A bundle in our model:

```
KeyboardBundle {
  identifier: String,            // com.apple.keyboardlayout.X
  name: String,
  version: String,
  build_version: Option<String>,
  project_name: Option<String>,
  source_version: Option<String>,
  layouts: Vec<BundledLayout>,
  localizations: Vec<Localization>,  // locale -> map<layoutInternalName, displayName>
  extra_plist: Map<String,Plist>,    // preserve unknown keys
}

BundledLayout {
  file_stem: String,             // "MyKeyboard" (no extension)
  keyboard: Keyboard,            // parsed .keylayout model (see 07)
  icon: Option<Vec<u8>>,         // raw .icns bytes
  intended_language: Option<String>,
}

Localization { locale: String, names: Map<String,String> }
```

## Operations

- **Read bundle**: walk `Contents/Resources/`, parse each `.keylayout`, read Info.plist + version.plist, parse each `.lproj/InfoPlist.strings`, load `.icns` bytes.
- **Write bundle**: create dir tree, write Info.plist (+version.plist if present), write each layout, write `.lproj` strings, copy icons.
- **Standalone → bundle**: wrap single Keyboard into a one-layout bundle; default identifier from name.
- **Bundle → standalone**: only valid if exactly one layout; emit its `.keylayout`.

## Cross-platform note

We read/write the bundle as a plain directory on any OS (it's just folders + files). On macOS a `.bundle` directory is treated as a package by Finder; on Linux/Windows it's an ordinary folder — fine for authoring. We may also offer a zipped `.bundle` export for easy transfer. Installing into the live macOS system is a separate macOS-only action (copy folder to `~/Library/Keyboard Layouts/`).
