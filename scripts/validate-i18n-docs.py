#!/usr/bin/env python3
"""Validate or update localized README freshness markers.

Usage:
  python scripts/validate-i18n-docs.py --check
  python scripts/validate-i18n-docs.py --write
"""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "README.md"
I18N = ROOT / "docs" / "i18n"
MARKER_RE = re.compile(r"^> Source freshness: `README\.md` sha256:[0-9a-f]{12}\.\n\n", re.M)


def source_hash() -> str:
    return hashlib.sha256(SOURCE.read_bytes()).hexdigest()[:12]


def marker() -> str:
    return f"> Source freshness: `README.md` sha256:{source_hash()}.\n\n"


def updated_text(text: str) -> str:
    next_marker = marker()
    if MARKER_RE.search(text):
        return MARKER_RE.sub(next_marker, text, count=1)
    lines = text.splitlines(keepends=True)
    if len(lines) >= 2:
        return "".join(lines[:2]) + next_marker + "".join(lines[2:])
    return text + "\n\n" + next_marker


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write == args.check:
        parser.error("choose exactly one of --write or --check")

    changed: list[Path] = []
    for path in sorted(I18N.glob("README.*.md")):
        text = path.read_text(encoding="utf-8")
        next_text = updated_text(text)
        if next_text != text:
            changed.append(path)
            if args.write:
                path.write_text(next_text, encoding="utf-8")

    if changed and args.check:
        for path in changed:
            print(f"stale: {path.relative_to(ROOT)}")
        return 1
    if args.write:
        print(f"updated {len(changed)} localized README freshness markers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
