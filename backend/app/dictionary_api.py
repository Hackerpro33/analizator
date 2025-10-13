from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import math
import time
import uuid

from .utils.files import load_dataframe_from_identifier
from .utils import dictionaries as dictionary_store

router = APIRouter()


class DictionaryEntry(BaseModel):
    code: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    description: Optional[str] = ""
    keywords: List[str] = Field(default_factory=list)

    def normalised(self) -> Dict[str, Any]:
        payload = {
            "code": self.code.strip(),
            "label": self.label.strip(),
        }
        description = (self.description or "").strip()
        if description:
            payload["description"] = description
        keywords = [kw.strip() for kw in self.keywords if kw and kw.strip()]
        if keywords:
            payload["keywords"] = keywords
        return payload


class DictionaryBase(BaseModel):
    description: Optional[str] = ""
    dataset_id: Optional[str] = Field(None, description="Идентификатор набора данных")
    column: Optional[str] = Field(None, description="Колонка, к которой относится словарь")
    entries: List[DictionaryEntry] = Field(default_factory=list)


class DictionaryCreate(DictionaryBase):
    name: str = Field(..., min_length=1, description="Название словаря")
    file_url: Optional[str] = Field(None, description="Идентификатор загруженного файла")
    code_column: Optional[str] = Field(None, description="Имя колонки с кодовым значением")
    label_column: Optional[str] = Field(None, description="Имя колонки с расшифровкой кода")
    context_columns: List[str] = Field(default_factory=list, description="Дополнительные колонки для контекста")


class DictionaryUpdate(DictionaryBase):
    name: Optional[str] = Field(None, description="Название словаря")
    file_url: Optional[str] = None
    code_column: Optional[str] = None
    label_column: Optional[str] = None
    context_columns: List[str] = Field(default_factory=list)


class DictionaryResponse(DictionaryBase):
    id: str
    created_at: int
    updated_at: Optional[int] = None
    source_file: Optional[str] = None


def _now() -> int:
    return int(time.time())


def _clean_cell(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    return text or None


def _extract_entries_from_file(
    file_url: str,
    code_column: str,
    label_column: str,
    context_columns: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    df = load_dataframe_from_identifier(file_url)
    if code_column not in df.columns or label_column not in df.columns:
        raise HTTPException(status_code=400, detail="Указанные колонки не найдены в словаре")

    context_columns = context_columns or []
    valid_context = [col for col in context_columns if col in df.columns]

    entries: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        code = _clean_cell(row[code_column])
        label = _clean_cell(row[label_column])
        if not code or not label:
            continue

        payload: Dict[str, Any] = {"code": code, "label": label}

        descriptions: List[str] = []
        keywords: List[str] = []
        for column in valid_context:
            context_value = _clean_cell(row[column])
            if not context_value:
                continue
            descriptions.append(context_value)
            for token in context_value.replace(",", " ").split():
                token = token.strip()
                if token:
                    keywords.append(token)

        if descriptions:
            payload["description"] = "; ".join(descriptions)
        if keywords:
            payload["keywords"] = sorted({kw.lower() for kw in keywords})

        entries.append(payload)

    if not entries:
        raise HTTPException(status_code=400, detail="Не удалось извлечь значения из словаря")
    return entries


def _prepare_entries(payload: DictionaryBase) -> List[Dict[str, Any]]:
    return [entry.normalised() for entry in payload.entries]


def _persist_dictionary(data: Dict[str, Any]) -> Dict[str, Any]:
    items = dictionary_store.load_dictionaries()
    items.append(data)
    dictionary_store.save_dictionaries(items)
    return data


def _update_dictionary(dictionary_id: str, update: Dict[str, Any]) -> Dict[str, Any]:
    items = dictionary_store.load_dictionaries()
    for index, item in enumerate(items):
        if item.get("id") == dictionary_id:
            updated = item.copy()
            updated.update(update)
            items[index] = updated
            dictionary_store.save_dictionaries(items)
            return updated
    raise HTTPException(status_code=404, detail="Словарь не найден")


@router.get("/list")
def list_dictionaries(dataset_id: Optional[str] = None, column: Optional[str] = None):
    dictionaries = dictionary_store.load_dictionaries()
    if dataset_id:
        dictionaries = [item for item in dictionaries if item.get("dataset_id") == dataset_id]
    if column:
        dictionaries = [item for item in dictionaries if item.get("column") == column]
    return dictionaries


@router.get("/search")
def search_dictionaries(
    q: str = Query(..., min_length=1, max_length=200, description="Поисковый запрос по словарям"),
    dataset_id: Optional[str] = Query(None, description="Идентификатор набора данных"),
    column: Optional[str] = Query(None, description="Колонка, к которой относится словарь"),
    limit: int = Query(20, ge=1, le=100, description="Максимальное количество совпадений"),
):
    matches = dictionary_store.search_entries(q, dataset_id=dataset_id, column=column, limit=limit + 1)
    has_more = len(matches) > limit
    matches = matches[:limit]

    grouped: Dict[str, Dict[str, Any]] = {}

    for match in matches:
        dictionary = match["dictionary"]
        entry = match["entry"]
        dictionary_id = dictionary.get("id") or ""

        group = grouped.setdefault(
            dictionary_id,
            {
                "dictionary": {
                    "id": dictionary.get("id"),
                    "name": dictionary.get("name"),
                    "description": dictionary.get("description"),
                    "dataset_id": dictionary.get("dataset_id"),
                    "column": dictionary.get("column"),
                    "updated_at": dictionary.get("updated_at"),
                },
                "entries": [],
            },
        )

        entry_payload: Dict[str, Any] = {
            "code": entry.get("code"),
            "label": entry.get("label"),
        }
        if entry.get("description"):
            entry_payload["description"] = entry["description"]
        if entry.get("keywords"):
            entry_payload["keywords"] = entry["keywords"]

        group["entries"].append(entry_payload)

    return {
        "query": q,
        "results": list(grouped.values()),
        "matches": sum(len(group["entries"]) for group in grouped.values()),
        "has_more": has_more,
    }


@router.post("/create")
def create_dictionary(payload: DictionaryCreate):
    entries: List[Dict[str, Any]] = []
    source_file: Optional[str] = None

    if payload.entries:
        entries = _prepare_entries(payload)
    elif payload.file_url:
        if not payload.code_column or not payload.label_column:
            raise HTTPException(status_code=400, detail="Необходимо указать колонки с кодом и расшифровкой")
        entries = _extract_entries_from_file(
            payload.file_url,
            payload.code_column,
            payload.label_column,
            payload.context_columns,
        )
        source_file = payload.file_url
    else:
        raise HTTPException(status_code=400, detail="Нужно указать элементы словаря или файл")

    now = _now()
    dictionary = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
        "dataset_id": payload.dataset_id,
        "column": payload.column,
        "entries": entries,
        "created_at": now,
        "updated_at": now,
        "source_file": source_file,
    }

    _persist_dictionary(dictionary)
    return {"status": "created", "dictionary": dictionary}


@router.get("/{dictionary_id}")
def get_dictionary(dictionary_id: str):
    dictionary = dictionary_store.get_dictionary(dictionary_id)
    if not dictionary:
        raise HTTPException(status_code=404, detail="Словарь не найден")
    return dictionary


@router.put("/{dictionary_id}")
def update_dictionary(dictionary_id: str, payload: DictionaryUpdate):
    dictionary = dictionary_store.get_dictionary(dictionary_id)
    if not dictionary:
        raise HTTPException(status_code=404, detail="Словарь не найден")

    entries = dictionary.get("entries", [])
    source_file = dictionary.get("source_file")

    if payload.entries:
        entries = _prepare_entries(payload)
        source_file = payload.file_url or source_file
    elif payload.file_url:
        if not payload.code_column or not payload.label_column:
            raise HTTPException(status_code=400, detail="Необходимо указать колонки с кодом и расшифровкой")
        entries = _extract_entries_from_file(
            payload.file_url,
            payload.code_column,
            payload.label_column,
            payload.context_columns,
        )
        source_file = payload.file_url

    name = dictionary.get("name")
    if payload.name is not None:
        name = payload.name.strip()

    description = dictionary.get("description", "")
    if payload.description is not None:
        description = (payload.description or "").strip()

    dataset_id = dictionary.get("dataset_id")
    if payload.dataset_id is not None:
        dataset_id = payload.dataset_id

    column = dictionary.get("column")
    if payload.column is not None:
        column = payload.column

    update_data = {
        "name": name,
        "description": description,
        "dataset_id": dataset_id,
        "column": column,
        "entries": entries,
        "updated_at": _now(),
        "source_file": source_file,
    }
    updated = _update_dictionary(dictionary_id, update_data)
    return {"status": "updated", "dictionary": updated}


@router.delete("/{dictionary_id}")
def delete_dictionary(dictionary_id: str):
    items = dictionary_store.load_dictionaries()
    remaining = [item for item in items if item.get("id") != dictionary_id]
    if len(remaining) == len(items):
        raise HTTPException(status_code=404, detail="Словарь не найден")
    dictionary_store.save_dictionaries(remaining)
    return {"status": "deleted", "id": dictionary_id}
