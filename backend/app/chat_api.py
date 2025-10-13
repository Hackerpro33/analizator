from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import json
import os
import re
import shutil
import tempfile
import time
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .utils import dictionaries as dictionary_store

router = APIRouter()

APP_DIR = Path(__file__).resolve().parent
CANDIDATE_DIRS = [APP_DIR.parent / "data", APP_DIR / "data"]


def _ensure_store_dir() -> Path:
    for directory in CANDIDATE_DIRS:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            return directory
        except Exception:
            continue
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR


STORE_DIR = _ensure_store_dir()
CHAT_JSON = STORE_DIR / "chat_sessions.json"
MAX_HINTS = 8


def _atomic_write_json(path: Path, data: Any):
    fd, tmp_path = tempfile.mkstemp(prefix="chat_sessions_", suffix=".json", dir=str(path.parent))
    tmp = Path(tmp_path)
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        shutil.move(str(tmp), str(path))
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def _load_store() -> Dict[str, Any]:
    for directory in CANDIDATE_DIRS:
        candidate = directory / CHAT_JSON.name
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
    return {}


def _save_store(store: Dict[str, Any]):
    _atomic_write_json(CHAT_JSON, store)


DEFAULT_INSTRUCTIONS = (
    "Ты аналитический помощник. Помогай формулировать вопросы к данным, предлагай шаги анализа и "
    "подсказки по визуализации. Уточняй детали, если информации недостаточно."
)
DEFAULT_GREETING = (
    "Готов помочь с анализом. Расскажите, какие данные или гипотезы вас интересуют — я подскажу, как лучше "
    "подготовить исследование."
)


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant", "system"]
    content: str
    created_at: float


class AssistantState(BaseModel):
    user_id: str
    instructions: str = Field(default=DEFAULT_INSTRUCTIONS)
    messages: List[ChatMessage] = Field(default_factory=list)
    created_at: float
    updated_at: float


class ChatRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1, max_length=2000)


class InstructionsRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    instructions: str = Field(..., min_length=1, max_length=4000)


class ResetRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


def _initial_state(user_id: str) -> Dict[str, Any]:
    now = time.time()
    return {
        "user_id": user_id,
        "instructions": DEFAULT_INSTRUCTIONS,
        "messages": [
            {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": DEFAULT_GREETING,
                "created_at": now,
            }
        ],
        "created_at": now,
        "updated_at": now,
    }


def _ensure_state(store: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    state = store.get(user_id)
    if not state:
        state = _initial_state(user_id)
        store[user_id] = state
    return state


def _format_response(state: Dict[str, Any]) -> AssistantState:
    # ensure chronological order for deterministic responses
    state["messages"] = sorted(state.get("messages", []), key=lambda item: item.get("created_at", 0))
    return AssistantState(**state)


MAX_FOCUS_POINTS = 6


def _derive_focus_points(text: str) -> List[str]:
    lowered = text.lower()
    focus: List[str] = []

    if any(keyword in lowered for keyword in ["данн", "табл", "dataset", "файл"]):
        focus.append("Проверить структуру и качество данных: наличие пропусков, форматы дат, единицы измерения.")

    if any(keyword in lowered for keyword in ["гипотез", "предполож", "идея"]):
        focus.append("Разбить гипотезу на проверяемые показатели и подобрать метрики для подтверждения.")

    if any(keyword in lowered for keyword in ["врем", "тренд", "динами"]):
        focus.append("Построить временные ряды и оценить тренды, сезонность или аномалии.")

    if any(keyword in lowered for keyword in ["сегмент", "категор", "групп"]):
        focus.append("Сравнить ключевые показатели по сегментам, чтобы выявить различия между группами.")

    if any(char.isdigit() for char in text):
        focus.append("Проверить корректность числовых показателей и рассчитать базовые статистики (среднее, медиану, %).")

    if "визуал" in lowered or "граф" in lowered:
        focus.append("Подобрать подходящий тип визуализации и продумать подписи для презентации результатов.")

    if not focus:
        focus.extend(
            [
                "Уточнить ожидаемый результат анализа и ключевые показатели успеха.",
                "Определить, какие дополнительные данные или фильтры могут повлиять на выводы.",
            ]
        )

    unique_focus: List[str] = []
    for point in focus:
        if point not in unique_focus:
            unique_focus.append(point)

    return unique_focus[:MAX_FOCUS_POINTS]


def _dictionary_hints(message: str) -> List[str]:
    matches = dictionary_store.search_entries(message, limit=MAX_HINTS)
    if not matches:
        return []

    hints: List[str] = []
    seen: set[tuple[str, str]] = set()

    for match in matches:
        dictionary = match.get("dictionary", {})
        entry = match.get("entry", {})

        code = str(entry.get("code", "")).strip()
        label = str(entry.get("label", "")).strip()
        if not code or not label:
            continue

        key = (str(dictionary.get("id", "")), code)
        if key in seen:
            continue
        seen.add(key)

        source_parts = [dictionary.get("name"), dictionary.get("column")]
        source_text = ", ".join(part for part in source_parts if part)

        hint = f"{code} — {label}"
        if source_text:
            hint += f" ({source_text})"
        description = entry.get("description")
        if description:
            hint += f": {description}"
        hints.append(hint)

    return hints


def _generate_reply(instructions: str, user_message: str) -> str:
    instructions = instructions.strip() or DEFAULT_INSTRUCTIONS
    focus_points = _derive_focus_points(user_message)
    bullets = "\n".join(f"• {point}" for point in focus_points)
    hints = _dictionary_hints(user_message)
    hint_text = ""
    if hints:
        hint_lines = "\n".join(f"• {hint}" for hint in hints)
        hint_text = f"\n\nКонтекст по кодам из словарей:\n{hint_lines}"
    return (
        f"Следую вашим инструкциям: {instructions}\n\n"
        f"Вот шаги, которые помогут продвинуть анализ:\n{bullets}\n\n"
        "Если хотите изменить подход, скорректируйте инструкции или уточните детали в следующем сообщении."
        f"{hint_text}"
    )


@router.get("/state/{user_id}")
def get_state(user_id: str):
    store = _load_store()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    state = _ensure_state(store, user_id)
    return _format_response(state)


@router.post("/message")
def post_message(payload: ChatRequest):
    store = _load_store()
    state = _ensure_state(store, payload.user_id)

    now = time.time()
    state.setdefault("messages", []).append(
        {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": payload.message.strip(),
            "created_at": now,
        }
    )

    reply = _generate_reply(state.get("instructions", DEFAULT_INSTRUCTIONS), payload.message)
    state["messages"].append(
        {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": reply,
            "created_at": time.time(),
        }
    )
    state["updated_at"] = time.time()

    store[payload.user_id] = state
    _save_store(store)
    return _format_response(state)


@router.post("/instructions")
def update_instructions(payload: InstructionsRequest):
    store = _load_store()
    state = _ensure_state(store, payload.user_id)
    state["instructions"] = payload.instructions.strip()
    state["updated_at"] = time.time()
    store[payload.user_id] = state
    _save_store(store)
    return _format_response(state)


@router.post("/reset")
def reset_conversation(payload: ResetRequest):
    store = _load_store()
    state = _initial_state(payload.user_id)
    store[payload.user_id] = state
    _save_store(store)
    return _format_response(state)
