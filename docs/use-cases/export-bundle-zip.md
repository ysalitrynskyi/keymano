# Export `.bundle.zip`

Use `.bundle.zip` when you need a browser-friendly archive that becomes a normal macOS `.bundle` after unzipping.

Why zip:

- browsers cannot write directory packages directly,
- `.bundle` is a directory, not a single file,
- zip preserves the `Contents/Info.plist` and `Contents/Resources/*.keylayout` tree.

In Keymano, open **Bundle** and click **Download .bundle.zip** in the browser or **Export bundle…** in the desktop app.
