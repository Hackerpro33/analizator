#!/usr/bin/env python3
"""Utility to bump project version and roll the changelog."""
from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path
from typing import Tuple

VERSION_FILE = Path("backend/app/version.py")
CHANGELOG_FILE = Path("CHANGELOG.md")
VERSION_PATTERN = re.compile(r"__version__\s*=\s*['\"](?P<version>[^'\"]+)['\"]")
CHANGELOG_RELEASE_PATTERN = re.compile(
    r"(^## \[Unreleased\]\n)(?P<body>.*?)(?=^## \[)", re.MULTILINE | re.DOTALL
)


class VersionError(RuntimeError):
    """Raised when we cannot parse or update the project version."""


def parse_version(version: str) -> Tuple[int, int, int]:
    try:
        major, minor, patch = (int(part) for part in version.split("."))
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise VersionError(f"Некорректная версия: {version}") from exc
    return major, minor, patch


def format_version(parts: Tuple[int, int, int]) -> str:
    return ".".join(str(part) for part in parts)


def bump(version: str, bump_type: str) -> str:
    major, minor, patch = parse_version(version)
    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    elif bump_type == "patch":
        patch += 1
    else:  # pragma: no cover - argparse prevents this
        raise VersionError(f"Неизвестный тип обновления: {bump_type}")
    return format_version((major, minor, patch))


def read_current_version() -> str:
    content = VERSION_FILE.read_text(encoding="utf-8")
    match = VERSION_PATTERN.search(content)
    if not match:
        raise VersionError("Не удалось найти __version__ в backend/app/version.py")
    return match.group("version")


def write_version(new_version: str) -> None:
    content = VERSION_FILE.read_text(encoding="utf-8")
    new_content = VERSION_PATTERN.sub(f"__version__ = \"{new_version}\"", content)
    VERSION_FILE.write_text(new_content, encoding="utf-8")


def roll_changelog(new_version: str) -> None:
    content = CHANGELOG_FILE.read_text(encoding="utf-8")
    match = CHANGELOG_RELEASE_PATTERN.search(content)
    if not match:
        raise VersionError(
            "В CHANGELOG.md отсутствует секция [Unreleased] или она имеет неожиданный формат"
        )

    unreleased_body = match.group("body").strip("\n")
    today = dt.date.today().isoformat()
    new_release_section = f"## [{new_version}] - {today}\n"

    if not unreleased_body.strip():
        raise VersionError(
            "Секция [Unreleased] пуста — добавьте изменения в CHANGELOG перед выпуском"
        )

    new_release_section += unreleased_body.rstrip() + "\n\n"
    # Подготовим секцию Unreleased к новым изменениям.
    replacement = "## [Unreleased]\n\n"

    content = content[: match.start()] + replacement + content[match.end() :]

    header = "## [Unreleased]\n"
    header_index = content.index(header) + len(header)

    after_header = content[header_index:]
    if after_header.startswith("\n\n"):
        insertion_point = header_index + 2
    elif after_header.startswith("\n"):
        insertion_point = header_index + 1
        content = content[:insertion_point] + "\n" + content[insertion_point:]
        insertion_point += 1
    else:
        content = content[:header_index] + "\n\n" + content[header_index:]
        insertion_point = header_index + 2

    content = content[:insertion_point] + new_release_section + content[insertion_point:]
    CHANGELOG_FILE.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Повышает версию проекта и переносит записи из секции Unreleased в новый релиз."
        )
    )
    parser.add_argument(
        "bump_type",
        choices=("major", "minor", "patch"),
        help="Тип семантического обновления версии",
    )
    args = parser.parse_args()

    current_version = read_current_version()
    new_version = bump(current_version, args.bump_type)
    write_version(new_version)
    roll_changelog(new_version)
    print(f"Версия обновлена: {current_version} -> {new_version}")


if __name__ == "__main__":
    main()
