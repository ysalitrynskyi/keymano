# Ukelele migration and compatibility

Keymano and Ukelele both work with Apple `.keylayout` files. The safest migration path is to keep a backup and round-trip through validation.

1. Export or locate the `.keylayout` / `.bundle` from Ukelele.
2. Open it in Keymano.
3. Check **XML & Validation**.
4. Use **Layer matrix** to inspect modifier maps and inherited values.
5. Use **Dead Keys** to review action states and terminators.
6. Save to a new filename first, then test the copy in macOS Input Sources.

Notes:

- Keymano preserves header comments today; internal XML comments are not guaranteed.
- Apple built-in layouts are sealed by macOS and cannot be imported directly by any editor.
- If a layout relies on unusual high key codes, enable views that include existing high codes.
