# Browser vs. desktop limits

Keymano uses the same Rust core in both builds. File-system access is the main difference.

| Capability | Browser | Desktop |
| --- | --- | --- |
| Edit `.keylayout` | Yes | Yes |
| Open `.bundle.zip` | Yes | Yes |
| Open a `.bundle` folder directly | No | Yes |
| Read installed system layouts | No | Yes, for editable user/system files |
| Install into `~/Library/Keyboard Layouts` | No, download only | Yes |
| Offline private editing | Yes after load | Yes |

The browser never uploads layout content. It downloads files you choose to save.
