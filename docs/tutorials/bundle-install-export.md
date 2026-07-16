# Bundle export and install on modern macOS

A `.bundle` is a directory package containing `Info.plist`, one or more `.keylayout` files, and localized names.

Export:

1. Open **Bundle**.
2. Edit metadata in **Bundle studio** when working with a real bundle.
3. Click **Export bundle**.
4. Browser builds download `<name>.bundle.zip`; unzip once to get the `.bundle` folder.

Install:

1. Put the `.bundle` in `~/Library/Keyboard Layouts/`.
2. Open System Settings → Keyboard → Input Sources.
3. Click **+** and add the layout.
4. If it does not appear, log out and back in.

Desktop builds can also use **Install to system**, which copies the package into the user Keyboard Layouts folder without overwriting existing files.
