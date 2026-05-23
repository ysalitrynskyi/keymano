# Keymano — macOS 키보드 레이아웃 편집기

> 🌐 이것은 번역된 요약본입니다. 전체 문서는 영어로 제공됩니다: **[README](../../README.md)**.

> 🟢 **GitHub이 처음이거나 개발자가 아니신가요?** 쉬운 영어 **[시작 가이드](../../docs/GETTING_STARTED.md)**를 읽어 보세요.

**Keymano**는 macOS `.keylayout` 파일과 `.bundle` 키보드 패키지를 위한 무료 오픈 소스 크로스플랫폼 편집기이며, Ukelele의 오픈 소스 대안입니다. macOS, Windows, Linux는 물론 브라우저 안에서도 실시간으로 클릭할 수 있는 키보드를 사용해 macOS 키보드 레이아웃을 만들고, 편집하고, 검사할 수 있습니다.

## 실행하는 세 가지 방법

- **데스크톱 앱 다운로드** — macOS, Windows 또는 Linux용으로 [Releases page](https://github.com/ysalitrynskyi/keymano/releases)에서 받을 수 있습니다.
- **macOS:** Unsigned build — after installing from the `.dmg`, see **[First launch on macOS (English)](../../docs/GETTING_STARTED.md#first-launch-on-macos-important)** for the one-time Terminal step if macOS blocks the app.
- **브라우저에서 사용** — 호스팅된 앱을 **[keymano.ys.contact](https://keymano.ys.contact)**에서 여세요(관리자가 호스팅함); 전체 앱이 브라우저에서 실행되며 설치가 필요 없습니다.
- **웹 버전 제한:** 브라우저에서는 독립 `.keylayout` 파일을 열고 `.keylayout` 또는 `.bundle.zip`으로 내보낼 수 있습니다. 브라우저는 `.bundle` 폴더를 직접 가져오거나 `~/Library/Keyboard Layouts/`에 설치하거나 설치된 시스템 레이아웃을 탐색할 수 없습니다. 이런 작업은 데스크톱 앱을 사용하세요.
- **소스에서 빌드** — 기여자를 위한 방법입니다. [English README](../../README.md#build-from-source)를 참조하세요.

## 기능

- 시각적 편집기 — 아무 키나 클릭하여 모든 수정자 조합과 데드 키 상태에 대한 출력을 설정할 수 있음
- 데드 키, 종료자, 수정자 맵
- ANSI / ISO / JIS 물리적 키보드 배열
- Apple의 기본 `.keylayout` XML 및 `.bundle` 패키지를 읽고 씀
- 원클릭 자동 복구가 포함된 검증, PNG 및 참조 시트 내보내기
- 24개 언어의 인터페이스

- **저장 vs. 다른 이름으로 저장** — 저장은 현재 파일을 덮어쓰고, 다른 이름으로 저장은 복사본을 만듭니다.
## 개인정보

**데스크톱 앱**은 아무것도 수집하지 않으며 오프라인으로 동작합니다. **호스팅 웹 앱** [keymano.ys.contact](https://keymano.ys.contact)은 선택적으로 **Google Analytics**(익명 페이지 조회 통계)를 사용합니다. `.keylayout` 작업은 브라우저를 벗어나지 않습니다. 자체 호스팅 인스턴스는 운영자가 켜지 않는 한 분석이 없습니다. [PRIVACY.md](../../PRIVACY.md) 참고.

## 링크

- 🌍 라이브 웹 앱: <https://keymano.ys.contact>
- 📦 다운로드: <https://github.com/ysalitrynskyi/keymano/releases>
- 📘 시작하기(영어, 쉬운 설명): [Getting Started](../../docs/GETTING_STARTED.md)
- 📖 전체 문서(영어): [README](../../README.md)
- 🐙 소스 코드: <https://github.com/ysalitrynskyi/keymano>

---

*Keymano는 Apple 또는 SIL International과 관련 없는 독립 프로젝트입니다. "Apple", "macOS", "Ukelele"는 각 소유자의 상표입니다.*
