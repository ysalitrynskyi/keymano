# Keymano — macOS 键盘布局编辑器

> 🌐 这是一个翻译摘要。完整文档为英文：**[README](../../README.md)**。

> 🟢 **不熟悉 GitHub 或不是开发者？** 请阅读通俗英文 **[入门指南](../../docs/GETTING_STARTED.md)**。

**Keymano** 是一款免费、开源、跨平台的编辑器，用于编辑 macOS `.keylayout` 文件和 `.bundle` 键盘包——是 Ukelele 的开源替代方案。你可以在 macOS、Windows、Linux 上，或直接在浏览器中，通过一个可实时点击的键盘来构建、编辑并检查 macOS 键盘布局。

## 运行它的三种方式

- **下载桌面应用** — 适用于 macOS、Windows 或 Linux，来自 [Releases page](https://github.com/ysalitrynskyi/keymano/releases)。
- **macOS:** Unsigned build — after installing from the `.dmg`, see **[First launch on macOS (English)](../../docs/GETTING_STARTED.md#first-launch-on-macos-important)** for the one-time Terminal step if macOS blocks the app.
- **在浏览器中使用** — 打开托管的应用 **[keymano.ys.contact](https://keymano.ys.contact)**（由维护者托管）；完整应用可在浏览器中运行，无需安装。
- **Web 版限制：** 浏览器中可以打开单独的 `.keylayout` 文件，并导出为 `.keylayout` 或 `.bundle.zip`。浏览器不能直接导入 `.bundle` 文件夹，不能安装到 `~/Library/Keyboard Layouts/`，也不能浏览已安装的系统布局。需要这些功能请使用桌面应用。
- **从源码构建** — 供贡献者使用；请参阅 [English README](../../README.md#build-from-source)。

## 功能

- 可视化编辑器 — 点击任意按键即可为任意修饰键组合和死键状态设置其输出
- 死键、终止符和修饰键映射
- ANSI / ISO / JIS 物理键盘布局
- 读取和写入 Apple 原生的 `.keylayout` XML 和 `.bundle` 包
- 带一键自动修复的验证；PNG 和参考表导出
- 提供 24 种语言的界面

- **保存 vs. 另存为** — 保存覆盖当前文件；另存为创建副本。
## 隐私

**桌面应用**不收集任何数据，可完全离线使用。**托管 Web 应用** [keymano.ys.contact](https://keymano.ys.contact) 可选使用 **Google Analytics**（匿名页面访问统计）。你的 `.keylayout` 工作不会离开浏览器。自托管实例默认无分析，除非运营者启用。见 [PRIVACY.md](../../PRIVACY.md)。

## 链接

- 🌍 在线 Web 应用：<https://keymano.ys.contact>
- 📦 下载：<https://github.com/ysalitrynskyi/keymano/releases>
- 📘 入门（英文、通俗）: [Getting Started](../../docs/GETTING_STARTED.md)
- 📖 完整文档（英文）：[README](../../README.md)
- 🐙 源代码：<https://github.com/ysalitrynskyi/keymano>

---

*Keymano 是独立项目，与 Apple 或 SIL International 无关。“Apple”“macOS”“Ukelele”为其各自所有者的商标。*
