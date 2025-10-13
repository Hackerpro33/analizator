"""Utilities for persisting and retrieving data dictionaries for code values."""
from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .files import DATA_DIR


DICTIONARY_JSON = DATA_DIR / "dictionaries.json"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_dictionaries() -> List[Dict[str, Any]]:
    """Return all persisted dictionaries.

    The storage is backed by :data:`DICTIONARY_JSON`. If the file is missing or
    cannot be parsed the function returns an empty list, providing a forgiving
    behaviour for the API layer.
    """

    if not DICTIONARY_JSON.exists():
        return []
    try:
        with DICTIONARY_JSON.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return []
    if isinstance(payload, list):
        return payload
    return []


def save_dictionaries(items: List[Dict[str, Any]]) -> None:
    """Persist ``items`` to :data:`DICTIONARY_JSON` atomically."""

    _ensure_parent(DICTIONARY_JSON)
    fd, tmp_name = tempfile.mkstemp(prefix="dictionaries_", suffix=".json", dir=str(DICTIONARY_JSON.parent))
    tmp_path = Path(tmp_name)
    try:
        os.close(fd)
    except OSError:
        pass

    try:
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(items, handle, ensure_ascii=False, indent=2)
        shutil.move(str(tmp_path), str(DICTIONARY_JSON))
    finally:
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass


def get_dictionary(dictionary_id: str) -> Dict[str, Any] | None:
    """Return a dictionary by its identifier or ``None`` if absent."""

    for item in load_dictionaries():
        if item.get("id") == dictionary_id:
            return item
    return None


def _tokenise_query(text: str) -> List[str]:
    tokens = [segment for segment in re.split(r"\W+", text.lower()) if segment]
    # preserve order but drop duplicates
    seen = set()
    unique_tokens: List[str] = []
    for token in tokens:
        if token not in seen:
            seen.add(token)
            unique_tokens.append(token)
    return unique_tokens


def _entry_search_haystack(entry: Dict[str, Any]) -> List[str]:
    haystack: List[str] = []
    for key in ("code", "label", "description"):
        value = entry.get(key)
        if value:
            haystack.append(str(value).lower())
    for keyword in entry.get("keywords", []) or []:
        if keyword:
            haystack.append(str(keyword).lower())
    return haystack


def _matches_tokens(tokens: Iterable[str], haystack: Iterable[str]) -> Tuple[int, int]:
    """Return a tuple ``(score, unique_hits)`` for ``tokens`` in ``haystack``.

    ``score`` counts the total number of token occurrences, while
    ``unique_hits`` counts how many distinct tokens matched at least once.
    """

    total_hits = 0
    unique_hits = 0
    for token in tokens:
        token_hits = 0
        for text in haystack:
            if token in text:
                token_hits += 1
        total_hits += token_hits
        if token_hits:
            unique_hits += 1
    return total_hits, unique_hits


def search_entries(
    query: str,
    dataset_id: Optional[str] = None,
    column: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Search dictionary entries matching ``query``.

    The result is a list of dictionaries with keys ``dictionary`` and
    ``entry``. Items are ordered by relevance score which prioritises the
    number of matching tokens and the diversity of matches.
    """

    if limit <= 0:
        return []

    tokens = _tokenise_query(query)
    if not tokens:
        return []

    matches: List[Dict[str, Any]] = []
    dictionaries = load_dictionaries()
    for dictionary in dictionaries:
        if dataset_id and dictionary.get("dataset_id") != dataset_id:
            continue
        if column and dictionary.get("column") != column:
            continue

        entries = dictionary.get("entries") or []
        for entry in entries:
            haystack = _entry_search_haystack(entry)
            if not haystack:
                continue

            score, unique_hits = _matches_tokens(tokens, haystack)
            if not score:
                continue

            matches.append(
                {
                    "dictionary": dictionary,
                    "entry": entry,
                    "score": score,
                    "unique_hits": unique_hits,
                }
            )

    matches.sort(
        key=lambda item: (
            -item["unique_hits"],
            -item["score"],
            item["dictionary"].get("name", ""),
            str(item["entry"].get("code", "")),
        )
    )

    return matches[:limit]
