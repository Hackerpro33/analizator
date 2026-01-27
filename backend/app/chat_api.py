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

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .utils import dictionaries as dictionary_store
from .utils import files as file_utils

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
    analysis_context: Optional[Dict[str, Any]] = Field(None, description="Структурированный контекст анализа")


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


DATASET_PATTERNS = [
    r"(?:dataset|file|файл|таблица)\s*[:=#]\s*([^\s,;]+)",
    r"(?:dataset|file|файл|таблица)\s+(?:id|номер|named|под названием)?\s*([^\s,;]+)",
    r"(?:анализ(?:ируй)?|analyze)\s+([^\s,;]+)",
]


def _extract_dataset_identifier(message: str) -> Optional[str]:
    for pattern in DATASET_PATTERNS:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if match:
            identifier = match.group(1).strip().strip('"\'`')
            if identifier:
                return identifier
    return None


def _format_number(value: float) -> str:
    if pd.isna(value):
        return "n/a"
    if abs(value) >= 1000:
        return f"{value:,.0f}".replace(",", " ")
    return f"{value:.2f}"


def _load_registered_dataset(identifier: str) -> Optional[Dict[str, Any]]:
    normalized = identifier.lower().strip()
    if not normalized:
        return None
    for directory in CANDIDATE_DIRS:
        dataset_file = directory / "datasets.json"
        if not dataset_file.exists():
            continue
        try:
            items = json.loads(dataset_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        for item in items:
            candidates = {
                str(item.get("file_url", "")).lower(),
                str(item.get("id", "")).lower(),
                str(item.get("name", "")).lower(),
            }
            if normalized in candidates:
                return item
    return None


def _summarize_dataframe(label: str, dataframe: pd.DataFrame) -> List[str]:
    summary: List[str] = []
    rows, cols = dataframe.shape
    summary.append(f"Набор «{label}»: {rows} строк × {cols} столбцов.")

    if cols:
        preview = [str(col) for col in dataframe.columns[:6]]
        extra = cols - len(preview)
        column_text = ", ".join(preview)
        if extra > 0:
            column_text += f" … (+{extra} столбцов)"
        summary.append(f"Столбцы: {column_text}")

    normalized = dataframe.replace({"": pd.NA})
    missing_counts = normalized.isna().sum()
    missing_total = int(missing_counts.sum())
    if missing_total:
        top_missing = [
            f"{column}: {int(count)}"
            for column, count in missing_counts.sort_values(ascending=False).head(3).items()
            if int(count) > 0
        ]
        if top_missing:
            summary.append("Пропуски: " + ", ".join(top_missing))
    else:
        summary.append("Пропуски не обнаружены.")

    numeric_summaries: List[str] = []
    numeric_columns: List[str] = []
    for column in dataframe.columns:
        numeric_series = pd.to_numeric(dataframe[column], errors="coerce")
        if numeric_series.notna().sum() >= max(1, len(numeric_series) // 2):
            stats = numeric_series.describe()
            numeric_columns.append(str(column))
            numeric_summaries.append(
                f"{column}: min {_format_number(stats.get('min', pd.NA))}, "
                f"медиана {_format_number(stats.get('50%', pd.NA))}, "
                f"max {_format_number(stats.get('max', pd.NA))}"
            )
    if numeric_summaries:
        summary.append("Числовые показатели:")
        summary.extend(numeric_summaries[:3])

    text_columns = [col for col in dataframe.columns if str(col) not in numeric_columns]
    if text_columns:
        top_column = text_columns[0]
        top_values = (
            dataframe[top_column].astype(str).value_counts().head(3)
            if not dataframe.empty and top_column in dataframe
            else None
        )
        if top_values is not None and not top_values.empty:
            freq = ", ".join(f"{idx}: {count}" for idx, count in top_values.items())
            summary.append(f"Популярные значения в {top_column}: {freq}")

    return [f"• {line}" for line in summary]


def _dataset_summary_lines(identifier: str) -> List[str]:
    path = None
    path_error = ""
    try:
        path = file_utils.resolve_file_path(identifier)
    except HTTPException as exc:
        path_error = str(exc.detail)
    except Exception as exc:  # pragma: no cover - unexpected filesystem failure
        path_error = str(exc)

    if path:
        try:
            dataframe = file_utils.read_table_bytes(path.read_bytes(), path.name)
            return _summarize_dataframe(path.name, dataframe)
        except HTTPException as exc:
            return [f"• Не получилось прочитать «{path.name}»: {exc.detail}"]
        except Exception as exc:  # pragma: no cover - unexpected decoding failure
            return [f"• Ошибка при чтении «{path.name}»: {exc}"]

    dataset_meta = _load_registered_dataset(identifier)
    if dataset_meta:
        label = dataset_meta.get("name") or dataset_meta.get("file_url") or identifier
        sample_data = dataset_meta.get("sample_data")
        if sample_data:
            try:
                dataframe = pd.DataFrame(sample_data)
                return _summarize_dataframe(label, dataframe)
            except Exception as exc:  # pragma: no cover
                return [f"• Зарегистрированный набор «{label}», но sample_data повреждена: {exc}"]

        lines = [f"• Зарегистрированный набор «{label}» содержит ~{dataset_meta.get('row_count', '?')} строк."]
        columns = [col.get("name") for col in dataset_meta.get("columns") or [] if col.get("name")]
        if columns:
            extra = max(len(columns) - 6, 0)
            column_text = ", ".join(columns[:6])
            if extra:
                column_text += f" … (+{extra} столбцов)"
            lines.append(f"• Описанные столбцы: {column_text}")
        if dataset_meta.get("tags"):
            lines.append("• Теги: " + ", ".join(dataset_meta["tags"]))
        return lines

    if path_error:
        return [f"• Файл «{identifier}» не найден: {path_error}"]
    return [f"• Файл «{identifier}» не найден"]


def _derive_followup_questions(text: str) -> List[str]:
    lowered = text.lower()
    questions: List[str] = []

    if any(keyword in lowered for keyword in ["данн", "табл", "dataset", "csv", "xls"]):
        questions.append("Какой набор данных использовать и какие столбцы считать ключевыми?")

    if any(keyword in lowered for keyword in ["цель", "метрик", "kpi", "результат"]):
        questions.append("Какую целевую метрику или KPI нужно оптимизировать?")

    if any(keyword in lowered for keyword in ["врем", "период", "дата"]):
        questions.append("Какой временной диапазон важен и есть ли сезонность/аномалии?")

    if any(keyword in lowered for keyword in ["карта", "гео", "район", "координат"]):
        questions.append("Нужны ли георазрезы: широта/долгота или административные районы?")

    if any(keyword in lowered for keyword in ["модель", "прогноз", "регресс", "классиф"]):
        questions.append("Есть ли ограничения по алгоритмам (объяснимость, скорость, ресурсы)?")

    if not questions:
        questions.extend(
            [
                "Какого результата ждёте от анализа и кто целевая аудитория отчёта?",
                "Какие ограничения по качеству данных или приватности нужно учесть?",
            ]
        )

    unique_questions: List[str] = []
    for item in questions:
        if item not in unique_questions:
            unique_questions.append(item)

    return unique_questions[:4]


def _local_capabilities(message: str) -> List[str]:
    lowered = message.lower()
    capabilities = [
        "Профилирование набора: проверка пропусков, типов столбцов и дубликатов на локальном сервере.",
        "Интерактивные дашборды и визуализации без выхода данных наружу.",
    ]

    if any(keyword in lowered for keyword in ["врем", "тренд", "прогноз", "season"]):
        capabilities.append("Прогнозирование временных рядов и оценка трендов с локальными моделями.")

    if any(keyword in lowered for keyword in ["карта", "гео", "район", "координат"]):
        capabilities.append("Геоаналитика: тепловые карты, кластеры и разбор районов.")

    if any(keyword in lowered for keyword in ["граф", "связ", "network", "knowledge"]):
        capabilities.append("Связи между объектами и граф знаний для поиска паттернов.")

    if any(keyword in lowered for keyword in ["контроль", "bias", "смещ", "качество"]):
        capabilities.append("Аудит смещений, метрики качества и объяснимость моделей для принятия решений.")

    capabilities.append("Работа со справочниками и кодами: быстрые подсказки из локальных словарей.")

    unique_capabilities: List[str] = []
    for capability in capabilities:
        if capability not in unique_capabilities:
            unique_capabilities.append(capability)

    return unique_capabilities[:MAX_FOCUS_POINTS]


REASONING_RULES = [
    {
        "keywords": ("финанс", "доход", "выруч", "budget", "revenue", "profit"),
        "domain": "финансы и экономика",
        "context": "Важно разделить показатели на фактические и плановые, чтобы оценить маржу и эффективность капитала.",
        "risk": "Опасность искажений из-за сезонности, курсовой разницы и разной учетной политики.",
        "actions": [
            "Сравните динамику выручки и расходов с прошлым периодом и планом.",
            "Посмотрите вклад ключевых сегментов или продуктов: кто тянет рост, а кто тормозит.",
            "Проверьте связь между затратами и KPI (маржа, CAC/LTV, EBITDA).",
        ],
    },
    {
        "keywords": ("безопас", "инцид", "crime", "полиц", "law", "наруш"),
        "domain": "общественная безопасность",
        "context": "Уместно разграничить оперативные события, расследования и профилактику, чтобы увидеть причинно-следственные связи.",
        "risk": "Неполные или запоздалые отчёты могут скрывать всплески и смещения по районам.",
        "actions": [
            "Сформируйте тепловую карту инцидентов и определите участки с ростом частоты.",
            "Сравните категории правонарушений, чтобы приоритизировать вмешательство.",
            "Проверьте наличие повторяющихся объектов (адреса, исполнители) для выявления паттернов.",
        ],
    },
    {
        "keywords": ("логист", "склад", "supply", "цепоч", "постав", "производ"),
        "domain": "операционная эффективность и цепочки поставок",
        "context": "Следует отслеживать узкие места по складам/маршрутам и балансировать спрос с остатками.",
        "risk": "Ошибка прогноза спроса или задержка поставок приведут к обнулению запасов или переизбытку.",
        "actions": [
            "Проанализируйте время цикла поставки и сравните его с SLA клиентов.",
            "Оцените уровень запасов против прогноза спроса на горизонте 2-4 недели.",
            "Идентифицируйте маршруты и подрядчиков с максимальным временем задержки.",
        ],
    },
]

DEFAULT_REASONING = {
    "domain": "универсальный аналитический запрос",
    "context": "Стоит уточнить целевую метрику и заинтересованных стейкхолдеров, чтобы согласовать ожидания.",
    "risk": "Главный риск — неверная интерпретация данных без проверки качества и контекста сбора.",
    "actions": [
        "Соберите перечень доступных источников и оцените полноту/актуальность.",
        "Разбейте вопрос на измеримые подпункты (метрики, сегменты, временные рамки).",
        "Заранее продумайте формат отдачи: дашборд, отчёт, предупреждение.",
    ],
}


def _rich_reasoning(message: str) -> str:
    lowered = message.lower()
    rule = next((rule for rule in REASONING_RULES if any(keyword in lowered for keyword in rule["keywords"])), DEFAULT_REASONING)
    actions = list(rule["actions"])
    risk = rule["risk"]

    if any(keyword in lowered for keyword in ["прогноз", "forecast", "тренд", "динами"]):
        actions.append("Постройте временной ряд и оцените сезонность/аномалии перед выбором модели прогноза.")
        risk += " Проверьте сезонные эффекты и события, которые могли повлиять на тренд."

    if any(keyword in lowered for keyword in ["качество", "data quality", "загрязн"]):
        actions.append("Запустите аудит качества: пропуски, выбросы, несогласованные коды справочников.")

    steps_text = "\n".join(f"  - {step}" for step in actions[:4])
    return (
        "Продвинутый ответ локального ИИ:\n"
        f"• Тематика запроса: {rule['domain']}\n"
        f"• Контекст: {rule['context']}\n"
        f"• Риски и проверки: {risk}\n"
        f"• Следующие шаги:\n{steps_text}"
    )


def _analysis_context_block(context: Optional[Dict[str, Any]]) -> str:
    if not context:
        return ""
    lines: List[str] = []
    target = context.get("target") or context.get("selected_target")
    if target:
        lines.append(f"• Целевая метрика: {target}")
    years = context.get("years") or context.get("selected_years")
    if years:
        unique_years = ", ".join(str(year) for year in years)
        lines.append(f"• Период анализа: {unique_years}")
    aggregate = context.get("aggregate") or {}
    aggregate_value = aggregate.get("value")
    if aggregate_value is not None:
        label = aggregate.get("label") or aggregate.get("type") or "Агрегат"
        lines.append(f"• {label}: {aggregate_value:.2f}")
    delta = context.get("delta") or {}
    if delta:
        delta_abs = delta.get("abs") or delta.get("absolute")
        delta_pct = delta.get("pct") or delta.get("percent")
        basis = delta.get("type") or "MoM"
        if delta_abs is not None:
            text = f"• Динамика {basis}: {delta_abs:+.2f}"
            if delta_pct is not None:
                text += f" ({delta_pct:+.1f}%)"
            lines.append(text)
    correlations = context.get("correlations") or []
    if correlations:
        sorted_corr = sorted(
            correlations,
            key=lambda item: abs(item.get("value") or item.get("correlation") or 0),
            reverse=True,
        )[:3]
        snippets = []
        for item in sorted_corr:
            value = item.get("value") or item.get("correlation")
            feature = item.get("feature") or item.get("name")
            lag = item.get("lag")
            if value is None or feature is None:
                continue
            base = f"{feature}={value:.2f}"
            if lag:
                base += f" (лаг {lag})"
            snippets.append(base)
        if snippets:
            lines.append("• Топ связей: " + "; ".join(snippets))
    model = context.get("model") or context.get("best_model") or {}
    if model:
        method = model.get("method") or model.get("label")
        metrics = []
        if model.get("mae") is not None:
            metrics.append(f"MAE {model['mae']:.2f}")
        if model.get("rmse") is not None:
            metrics.append(f"RMSE {model['rmse']:.2f}")
        if metrics:
            lines.append(f"• Модель {method}: {', '.join(metrics)}")
    forecast = context.get("forecast") or {}
    horizon_value = forecast.get("horizon_value")
    horizon_date = forecast.get("horizon_date")
    last_actual = forecast.get("last_actual")
    if horizon_value is not None and horizon_date:
        text = f"• Прогноз на {horizon_date}: {horizon_value:.2f}"
        if last_actual is not None:
            text += f" (последний факт {last_actual:.2f})"
        lines.append(text)
    if not lines:
        return ""
    return "\n\nКонтекст анализа:\n" + "\n".join(lines)


def _generate_reply(instructions: str, user_message: str, context: Optional[Dict[str, Any]]) -> str:
    instructions = instructions.strip() or DEFAULT_INSTRUCTIONS
    focus_points = _derive_focus_points(user_message)
    followups = _derive_followup_questions(user_message)
    capabilities = _local_capabilities(user_message)

    focus_text = "\n".join(f"• {point}" for point in focus_points)
    followup_text = "\n".join(f"• {question}" for question in followups)
    capability_text = "\n".join(f"• {capability}" for capability in capabilities)

    hints = _dictionary_hints(user_message)
    hint_text = ""
    if hints:
        hint_lines = "\n".join(f"• {hint}" for hint in hints)
        hint_text = f"\n\nКонтекст по кодам из словарей:\n{hint_lines}"

    dataset_identifier = _extract_dataset_identifier(user_message)
    if dataset_identifier:
        dataset_lines = _dataset_summary_lines(dataset_identifier)
        dataset_text = "\n\nЛокальный разбор файла:\n" + "\n".join(dataset_lines)
    else:
        dataset_text = (
            "\n\nПодсказка: добавьте к запросу `file:report.csv` или `анализируй sales.csv`, "
            "чтобы я провёл локальный анализ загруженного файла без внешних сервисов."
        )
    reasoning_text = "\n\n" + _rich_reasoning(user_message)
    context_text = _analysis_context_block(context)

    return (
        "Локальный ИИ активирован: обработка и генерация ответов выполняются без внешних вызовов.\n"
        f"Следую вашим инструкциям: {instructions}\n\n"
        f"План анализа на основе запроса:\n{focus_text}\n\n"
        f"Уточните детали, чтобы сделать ответ точнее:\n{followup_text}\n\n"
        "Могу выполнить прямо сейчас (локально):\n"
        f"{capability_text}\n\n"
        "Если хотите изменить подход, скорректируйте инструкции или уточните детали в следующем сообщении."
        f"{context_text}{hint_text}{dataset_text}{reasoning_text}"
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

    reply = _generate_reply(
        state.get("instructions", DEFAULT_INSTRUCTIONS),
        payload.message,
        payload.analysis_context,
    )
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
