# Keymano — macOS キーボードレイアウトエディタ

> 🌐 これは翻訳版の要約です。完全なドキュメントは英語です: **[README](../../README.md)**。

> 🟢 **GitHub が初めて、または開発者ではない方へ** — 平易な英語の **[はじめにガイド](../../docs/GETTING_STARTED.md)** をお読みください。

**Keymano** は、macOS の `.keylayout` ファイルと `.bundle` キーボードパッケージのための、無料のオープンソースなクロスプラットフォームエディタです。Ukelele のオープンソース代替として、macOS、Windows、Linux、またはブラウザ上で、ライブでクリック可能なキーボードを使って macOS のキーボードレイアウトを作成、編集、検査できます。

## 実行する 3 つの方法

- **デスクトップアプリをダウンロード** — macOS、Windows、Linux 向け。 [Releases page](https://github.com/ysalitrynskyi/keymano/releases) から入手できます。
- **macOS:** Unsigned build — after installing from the `.dmg`, see **[First launch on macOS (English)](../../docs/GETTING_STARTED.md#first-launch-on-macos-important)** for the one-time Terminal step if macOS blocks the app.
- **ブラウザで使用** — ホストされたアプリを **[keymano.ys.contact](https://keymano.ys.contact)** で開きます（メンテナーがホストしています）。アプリ全体がブラウザ内で動作し、インストールは不要です。
- **Web 版の制限:** ブラウザでは単体の `.keylayout` ファイルを開き、`.keylayout` または `.bundle.zip` として書き出せます。`.bundle` フォルダを直接読み込むこと、`~/Library/Keyboard Layouts/` へインストールすること、インストール済みシステムレイアウトを参照することはできません。これらにはデスクトップアプリを使ってください。
- **ソースからビルド** — コントリビューター向けです。 [English README](../../README.md#build-from-source) を参照してください。

## 機能

- ビジュアルエディタ — 任意のキーをクリックして、任意の修飾キーの組み合わせとデッドキー状態に対する出力を設定
- デッドキー、ターミネータ、修飾マップ
- ANSI / ISO / JIS の物理キーボード形状
- Apple のネイティブな `.keylayout` XML と `.bundle` パッケージを読み書き
- ワンクリック自動修復付きの検証; PNG とリファレンスシートのエクスポート
- 24 言語のインターフェース

- **保存 vs. 別名で保存** — 保存は現在のファイルを上書き、別名で保存はコピーを作成します。
## プライバシー

**デスクトップアプリ**は何も収集せずオフラインで動作します。**ホストされた Web アプリ** [keymano.ys.contact](https://keymano.ys.contact) は任意で **Google Analytics**（匿名のページ閲覧統計）を使用します。`.keylayout` の作業はブラウザから出ません。自己ホストでは運用者が有効にしない限り分析はありません。[PRIVACY.md](../../PRIVACY.md) を参照。

## リンク

- 🌍 ライブ Web アプリ: <https://keymano.ys.contact>
- 📦 ダウンロード: <https://github.com/ysalitrynskyi/keymano/releases>
- 📘 はじめに（英語・平易）: [Getting Started](../../docs/GETTING_STARTED.md)
- 📖 完全なドキュメント（英語）: [README](../../README.md)
- 🐙 ソースコード: <https://github.com/ysalitrynskyi/keymano>

---

*Keymano は Apple や SIL International と提携していない独立プロジェクトです。「Apple」「macOS」「Ukelele」はそれぞれの所有者の商標です。*
