# Create a macOS keyboard layout on Windows or Linux

The web build runs the same Rust layout core as the desktop app, so you can create macOS `.keylayout` files outside macOS.

Workflow:

1. Choose **Standard (US)** or **Basic**.
2. Edit outputs in **Editor**.
3. Validate in **XML & Validation**.
4. Download the `.keylayout` or `.bundle.zip`.
5. Move the file to a Mac and install it in `~/Library/Keyboard Layouts/`.

You still need macOS to test installation and Input Sources behavior.
