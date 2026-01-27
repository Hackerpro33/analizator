"""DataFrame операции для вкладки Линейка."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import numpy as np
import pandas as pd

from ..schemas.lineyka import (
    LineykaFilter,
    LineykaOperation,
    LineykaQueryRequest,
)
from .lineyka_store import RESERVED_COLUMNS, VersionRecord, store


def _coerce_filter(payload: Any) -> LineykaFilter:
    if isinstance(payload, LineykaFilter):
        return payload
    return LineykaFilter.model_validate(payload)


def _serialize_value(value: Any) -> Any:
    if isinstance(value, (pd.Timestamp, )):
        return value.isoformat()
    if pd.isna(value):
        return None
    if isinstance(value, np.generic):
        return value.item()
    return value


def _string_series(series: pd.Series, *, case_sensitive: bool) -> pd.Series:
    text = series.astype(str).fillna("")
    if not case_sensitive:
        text = text.str.lower()
    return text


def _build_mask(df: pd.DataFrame, filt: LineykaFilter) -> pd.Series:
    if filt.kind == "search" or filt.column == "__search__":
        term = str(filt.value or "").strip()
        if not term:
            return pd.Series(True, index=df.index)
        haystack = pd.Series(False, index=df.index)
        lowered = term.lower()
        for column in df.columns:
            if column in RESERVED_COLUMNS:
                continue
            haystack = haystack | df[column].astype(str).str.lower().str.contains(lowered, na=False)
        return haystack

    column = filt.column
    if column not in df.columns:
        return pd.Series(True, index=df.index)
    series = df[column]
    operator = filt.operator or "contains"
    if filt.kind == "text":
        text = _string_series(series, case_sensitive=filt.case_sensitive)
        needle = str(filt.value or "")
        needle_cmp = needle if filt.case_sensitive else needle.lower()
        if operator == "equals":
            return text == needle_cmp
        if operator == "starts_with":
            return text.str.startswith(needle_cmp)
        if operator == "ends_with":
            return text.str.endswith(needle_cmp)
        if operator == "not_contains":
            return ~text.str.contains(needle_cmp, na=False)
        if operator == "not_equals":
            return text != needle_cmp
        return text.str.contains(needle_cmp, na=False)
    if filt.kind == "number":
        numeric = pd.to_numeric(series, errors="coerce")
        value = pd.to_numeric(filt.value, errors="coerce")
        if operator == "gt":
            return numeric > value
        if operator == "gte":
            return numeric >= value
        if operator == "lt":
            return numeric < value
        if operator == "lte":
            return numeric <= value
        if operator == "between":
            high = pd.to_numeric(filt.value_to, errors="coerce")
            return (numeric >= value) & (numeric <= high)
        return numeric == value
    if filt.kind == "date":
        dates = pd.to_datetime(series, errors="coerce")
        value = pd.to_datetime(filt.value, errors="coerce")
        if operator == "after":
            return dates >= value
        if operator == "before":
            return dates <= value
        if operator == "between":
            high = pd.to_datetime(filt.value_to, errors="coerce")
            return (dates >= value) & (dates <= high)
        return dates == value
    if filt.kind == "categorical":
        values = filt.values or ([filt.value] if filt.value is not None else [])
        normalized = set(str(item) for item in values if item is not None)
        return df[column].astype(str).isin(normalized)
    return pd.Series(True, index=df.index)


def _apply_filters(df: pd.DataFrame, filters: Iterable[LineykaFilter]) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    applied: List[Dict[str, Any]] = []
    working = df
    mask = pd.Series(True, index=working.index)
    for filt in filters:
        filter_obj = _coerce_filter(filt)
        current_mask = _build_mask(working, filter_obj)
        mask = mask & current_mask
        applied.append(
            {
                "column": filter_obj.column,
                "kind": filter_obj.kind,
                "operator": filter_obj.operator,
                "value": filter_obj.value,
                "value_to": filter_obj.value_to,
                "values": filter_obj.values,
            }
        )
    return working[mask], applied


def _apply_sort(df: pd.DataFrame, sort_rules: Sequence[Any]) -> pd.DataFrame:
    if not sort_rules:
        return df
    by: List[str] = []
    ascending: List[bool] = []
    for rule in sort_rules:
        column = getattr(rule, "column", None) or rule.get("column")
        direction = getattr(rule, "direction", None) or rule.get("direction", "asc")
        if not column or column not in df.columns:
            continue
        by.append(column)
        ascending.append(direction == "asc")
    if not by:
        return df
    return df.sort_values(by=by, ascending=ascending, kind="mergesort")


def _prepare_columns(
    df: pd.DataFrame,
    include: Optional[List[str]],
    exclude: Optional[List[str]],
    schema_map: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    include_set = set(include or [])
    exclude_set = set(exclude or [])
    columns: List[Dict[str, Any]] = []
    for column in df.columns:
        if include_set and column not in include_set and column not in RESERVED_COLUMNS:
            continue
        if column in exclude_set:
            continue
        inferred_type = schema_map.get(column) if schema_map else None
        columns.append(
            {
                "name": column,
                "type": inferred_type or ("internal" if column in RESERVED_COLUMNS else "string"),
                "internal": column in RESERVED_COLUMNS,
            }
        )
    return columns


def _trim_row(row: Dict[str, Any], include: Optional[Sequence[str]], exclude: Optional[Sequence[str]]) -> Dict[str, Any]:
    include_set = set(include or [])
    exclude_set = set(exclude or [])
    payload: Dict[str, Any] = {}
    for key, value in row.items():
        if include_set and key not in include_set and key not in RESERVED_COLUMNS:
            continue
        if key in exclude_set:
            continue
        payload[key] = _serialize_value(value)
    return payload


def query_version(dataset_id: str, version_id: str, payload: LineykaQueryRequest) -> Dict[str, Any]:
    df = store.load_dataframe(dataset_id, version_id)
    filters = list(payload.filters or [])
    if payload.search:
        filters.append(LineykaFilter(column="__search__", kind="search", operator="contains", value=payload.search))
    filtered_df, applied = _apply_filters(df, filters)
    sorted_df = _apply_sort(filtered_df, payload.sort or [])
    window = sorted_df.iloc[payload.offset : payload.offset + payload.limit]
    include_columns = payload.include_columns
    exclude_columns = payload.exclude_columns
    rows = [
        _trim_row(record, include_columns, exclude_columns)
        for record in window.to_dict(orient="records")
    ]
    version = store.get_version(dataset_id, version_id)
    schema_map = {column["name"]: column.get("type") for column in version.schema}
    return {
        "dataset_id": dataset_id,
        "version_id": version_id,
        "rows": rows,
        "total_rows": int(len(df)),
        "filtered_rows": int(len(filtered_df)),
        "columns": _prepare_columns(df, include_columns, exclude_columns, schema_map),
        "applied_filters": applied,
        "limit": payload.limit,
        "offset": payload.offset,
        "summary": version.summary,
        "version": {
            "version_id": version.version_id,
            "created_at": version.created_at,
            "row_count": version.row_count,
            "column_count": version.column_count,
            "operation": version.operation,
        },
    }


def unique_column_values(dataset_id: str, version_id: str, column: str, *, search: Optional[str], limit: int = 100) -> List[Dict[str, Any]]:
    df = store.load_dataframe(dataset_id, version_id)
    if column not in df.columns:
        return []
    series = df[column]
    counts = series.value_counts(dropna=False)
    results: List[Dict[str, Any]] = []
    term = (search or "").strip().lower()
    for value, count in counts.items():
        normalized_value = None if pd.isna(value) else value
        label = "—" if normalized_value is None else str(normalized_value)
        if term and term not in label.lower():
            continue
        results.append({"value": normalized_value, "label": label, "count": int(count)})
        if len(results) >= limit:
            break
    return results


def _filter_dataframe(df: pd.DataFrame, filters: Iterable[LineykaFilter]) -> pd.DataFrame:
    if not filters:
        return df
    filtered, _ = _apply_filters(df, filters)
    return filtered


def keep_only_filtered(dataset_id: str, version_id: str, filters: Iterable[LineykaFilter], *, user_id: Optional[str]) -> VersionRecord:
    df = store.load_dataframe(dataset_id, version_id)
    filtered = _filter_dataframe(df, filters)
    operation = {
        "type": "keep_filtered",
        "params": [filter_obj.model_dump() for filter_obj in map(_coerce_filter, filters)],
        "summary": {"rows": int(len(filtered))},
    }
    return store.create_version(dataset_id, version_id, filtered, user_id=user_id, operation=operation)


def delete_columns(dataset_id: str, version_id: str, columns: Sequence[str], *, user_id: Optional[str]) -> VersionRecord:
    df = store.load_dataframe(dataset_id, version_id)
    for column in columns:
        if column in df.columns and column not in RESERVED_COLUMNS:
            df = df.drop(columns=[column])
    operation = {"type": "delete_columns", "params": {"columns": list(columns)}}
    return store.create_version(dataset_id, version_id, df, user_id=user_id, operation=operation)


def delete_rows(dataset_id: str, version_id: str, *, row_ids: Optional[Sequence[int]], filters: Sequence[LineykaFilter], user_id: Optional[str]) -> VersionRecord:
    df = store.load_dataframe(dataset_id, version_id)
    working = df
    if row_ids:
        mask = working["__lineyka_row_id"].isin(row_ids)
    elif filters:
        filtered = _filter_dataframe(working, filters)
        mask = working["__lineyka_row_id"].isin(filtered["__lineyka_row_id"])
    else:
        mask = pd.Series(False, index=working.index)
    reduced = working.loc[~mask].copy()
    operation = {
        "type": "delete_rows",
        "params": {"row_ids": list(row_ids or []), "filters": [f.model_dump() for f in map(_coerce_filter, filters)]},
        "summary": {"removed": int(mask.sum())},
    }
    return store.create_version(dataset_id, version_id, reduced, user_id=user_id, operation=operation)


def add_rows(dataset_id: str, version_id: str, rows: Sequence[Dict[str, Any]], *, user_id: Optional[str]) -> VersionRecord:
    df = store.load_dataframe(dataset_id, version_id)
    if not rows:
        return store.get_version(dataset_id, version_id)
    payload = pd.DataFrame(rows)
    for column in df.columns:
        if column not in payload.columns:
            payload[column] = None
    data_columns = [column for column in df.columns if column not in RESERVED_COLUMNS]
    payload = payload[data_columns]
    next_row_id = int(df["__lineyka_row_id"].max() if "__lineyka_row_id" in df.columns else 0) + 1
    payload.insert(0, "__lineyka_row_id", range(next_row_id, next_row_id + len(payload)))
    combined = pd.concat([df, payload], ignore_index=True)
    operation = {"type": "add_rows", "params": {"count": len(rows)}}
    return store.create_version(dataset_id, version_id, combined, user_id=user_id, operation=operation)


def add_column(
    dataset_id: str,
    version_id: str,
    *,
    name: str,
    strategy: str,
    constant_value: Optional[Any],
    source_column: Optional[str],
    arithmetic: Optional[Dict[str, Any]],
    user_id: Optional[str],
) -> VersionRecord:
    df = store.load_dataframe(dataset_id, version_id)
    working = df.copy()
    if name in RESERVED_COLUMNS:
        raise ValueError("Имя столбца зарезервировано")
    if strategy == "constant":
        working[name] = constant_value
    elif strategy == "copy":
        if not source_column or source_column not in working.columns:
            raise ValueError("Источник для копирования не найден")
        working[name] = working[source_column]
    elif strategy == "arithmetic":
        if not arithmetic:
            raise ValueError("Не переданы параметры арифметики")
        left_col = arithmetic.get("left")
        right_col = arithmetic.get("right")
        op = arithmetic.get("operator", "+")
        left_series = pd.to_numeric(working[left_col], errors="coerce") if left_col in working.columns else float(arithmetic.get("left_value", 0))
        right_series = pd.to_numeric(working[right_col], errors="coerce") if right_col in working.columns else float(arithmetic.get("right_value", 0))
        if op == "+":
            working[name] = left_series + right_series
        elif op == "-":
            working[name] = left_series - right_series
        elif op == "*":
            working[name] = left_series * right_series
        elif op == "/":
            working[name] = np.where(right_series == 0, np.nan, left_series / right_series)
        else:
            raise ValueError("Неизвестная операция")
    else:
        raise ValueError("Неизвестная стратегия")
    operation = {
        "type": "add_column",
        "params": {"name": name, "strategy": strategy},
    }
    return store.create_version(dataset_id, version_id, working, user_id=user_id, operation=operation)


def update_cells(
    dataset_id: str,
    version_id: str,
    *,
    updates: Sequence[Dict[str, Any]],
    user_id: Optional[str],
) -> VersionRecord:
    df = store.load_dataframe(dataset_id, version_id)
    working = df.copy()
    changed = 0
    touched_columns: Set[str] = set()
    for entry in updates:
        row_id = entry.get("row_id") or entry.get("__lineyka_row_id")
        column = entry.get("column")
        if row_id is None or not column or column in RESERVED_COLUMNS:
            continue
        mask = working["__lineyka_row_id"] == row_id
        if not mask.any():
            continue
        working.loc[mask, column] = entry.get("value")
        changed += int(mask.sum())
        touched_columns.add(column)
    if not changed:
        return store.get_version(dataset_id, version_id)
    operation = {
        "type": "update_cells",
        "params": {
            "updates": updates,
            "columns": sorted(touched_columns),
            "changed": changed,
        },
    }
    return store.create_version(dataset_id, version_id, working, user_id=user_id, operation=operation)


def append_rows(
    dataset_id: str,
    version_id: str,
    *,
    source_dataset_id: str,
    source_version_id: Optional[str],
    align_by_names: bool,
    column_mapping: Dict[str, str],
    user_id: Optional[str],
) -> VersionRecord:
    base_df = store.load_dataframe(dataset_id, version_id)
    if source_version_id:
        source_df = store.load_dataframe(source_dataset_id, source_version_id)
    else:
        base_version = store.ensure_base_version(source_dataset_id, user_id=user_id)
        source_df = store.load_dataframe(source_dataset_id, base_version.version_id)
    working_source = source_df.copy()
    if column_mapping:
        working_source = working_source.rename(columns=column_mapping)
    if align_by_names:
        target_cols = [col for col in base_df.columns if col not in RESERVED_COLUMNS]
        source_cols = [col for col in working_source.columns if col not in RESERVED_COLUMNS]
        union = sorted(set(target_cols) | set(source_cols))
        for column in union:
            if column not in base_df.columns:
                base_df[column] = None
            if column not in working_source.columns:
                working_source[column] = None
        base_df = base_df[["__lineyka_row_id"] + union]
        working_source = working_source[["__lineyka_row_id"] + union]
    next_row_id = int(base_df["__lineyka_row_id"].max()) + 1
    working_source = working_source.copy()
    working_source["__lineyka_row_id"] = range(next_row_id, next_row_id + len(working_source))
    combined = pd.concat([base_df, working_source], ignore_index=True)
    operation = {
        "type": "append_rows",
        "params": {
            "source_dataset_id": source_dataset_id,
            "source_version_id": source_version_id,
            "rows": len(working_source),
        },
    }
    return store.create_version(dataset_id, version_id, combined, user_id=user_id, operation=operation)


def join_columns(
    dataset_id: str,
    version_id: str,
    *,
    source_dataset_id: str,
    source_version_id: Optional[str],
    left_on: str,
    right_on: str,
    columns: Sequence[str],
    suffix: str,
    user_id: Optional[str],
) -> VersionRecord:
    base_df = store.load_dataframe(dataset_id, version_id)
    if left_on not in base_df.columns:
        raise ValueError("Ключевой столбец отсутствует в текущем наборе")
    if source_version_id:
        source_df = store.load_dataframe(source_dataset_id, source_version_id)
    else:
        base_version = store.ensure_base_version(source_dataset_id, user_id=user_id)
        source_df = store.load_dataframe(source_dataset_id, base_version.version_id)
    if right_on not in source_df.columns:
        raise ValueError("Ключевой столбец отсутствует в источнике")
    selection = [right_on] + [col for col in columns if col in source_df.columns]
    subset = source_df[selection].copy()
    rename_map = {}
    for col in selection:
        if col == right_on:
            continue
        target_name = col if col not in base_df.columns else f"{col}{suffix}"
        rename_map[col] = target_name
    subset = subset.rename(columns=rename_map)
    merged = base_df.merge(subset, how="left", left_on=left_on, right_on=right_on)
    merged = merged.drop(columns=[right_on])
    matches = int(base_df[left_on].isin(subset[right_on]).sum())
    operation = {
        "type": "join_columns",
        "params": {
            "source_dataset_id": source_dataset_id,
            "left_on": left_on,
            "right_on": right_on,
            "columns": list(columns),
            "suffix": suffix,
        },
        "summary": {
            "rows_matched": matches,
            "rows_unmatched": int(len(base_df) - matches),
        },
    }
    return store.create_version(dataset_id, version_id, merged, user_id=user_id, operation=operation)


def apply_operations(dataset_id: str, version_id: str, operations: Sequence[LineykaOperation], *, user_id: Optional[str]) -> VersionRecord:
    current_version = store.get_version(dataset_id, version_id)
    result = current_version
    for operation in operations:
        if operation.type == "keep_filtered":
            result = keep_only_filtered(dataset_id, result.version_id, operation.filters, user_id=user_id)
        elif operation.type == "delete_columns":
            result = delete_columns(dataset_id, result.version_id, operation.columns, user_id=user_id)
        elif operation.type == "delete_rows":
            result = delete_rows(
                dataset_id,
                result.version_id,
                row_ids=operation.row_ids,
                filters=operation.filters,
                user_id=user_id,
            )
        elif operation.type == "add_rows":
            result = add_rows(dataset_id, result.version_id, operation.rows, user_id=user_id)
        elif operation.type == "add_column":
            result = add_column(
                dataset_id,
                result.version_id,
                name=operation.name,
                strategy=operation.strategy,
                constant_value=operation.constant_value,
                source_column=operation.source_column,
                arithmetic=operation.arithmetic,
                user_id=user_id,
            )
        elif operation.type == "append_rows":
            result = append_rows(
                dataset_id,
                result.version_id,
                source_dataset_id=operation.source_dataset_id,
                source_version_id=operation.source_version_id,
                align_by_names=operation.align_by_names,
                column_mapping=operation.column_mapping,
                user_id=user_id,
            )
        elif operation.type == "join_columns":
            result = join_columns(
                dataset_id,
                result.version_id,
                source_dataset_id=operation.source_dataset_id,
                source_version_id=operation.source_version_id,
                left_on=operation.left_on,
                right_on=operation.right_on,
                columns=operation.columns,
                suffix=operation.suffix,
                user_id=user_id,
            )
        elif operation.type == "update_cells":
            result = update_cells(
                dataset_id,
                result.version_id,
                updates=operation.updates,
                user_id=user_id,
            )
        else:
            raise ValueError(f"Операция {operation.type} не поддерживается в apply_operations")
    return result


def integrate_forecast(
    dataset_id: str,
    version_id: str,
    *,
    result_rows: List[Dict[str, Any]],
    mode: str,
    user_id: Optional[str],
    metadata: Dict[str, Any],
) -> VersionRecord:
    df = store.load_dataframe(dataset_id, version_id)
    working = df.copy()
    forecast_df = pd.DataFrame(result_rows)
    if "date" not in forecast_df.columns:
        raise ValueError("forecast payload missing date column")
    date_series = pd.to_datetime(forecast_df["date"], errors="coerce")
    for suffix in ["forecast_yhat", "forecast_lower", "forecast_upper", "forecast_model_id", "forecast_scenario"]:
        if suffix not in forecast_df.columns:
            forecast_df[suffix] = None
    forecast_df = forecast_df[
        ["date", "forecast_yhat", "forecast_lower", "forecast_upper", "forecast_model_id", "forecast_scenario"]
    ].copy()
    forecast_df["date"] = date_series
    forecast_columns = [
        "lineyka_forecast",
        "lineyka_forecast_lower",
        "lineyka_forecast_upper",
        "lineyka_forecast_model",
        "lineyka_forecast_scenario",
    ]
    for column in forecast_columns:
        if column not in working.columns:
            working[column] = None
    if metadata.get("mode") == "replace":
        for column in forecast_columns:
            working[column] = None
    working["__lineyka_month"] = pd.to_datetime(working[metadata["date_column"]], errors="coerce").dt.to_period("M").dt.to_timestamp()
    merged = working.merge(
        forecast_df,
        how="left",
        left_on="__lineyka_month",
        right_on="date",
    )
    merged["lineyka_forecast"] = merged["forecast_yhat"].combine_first(merged["lineyka_forecast"])
    merged["lineyka_forecast_lower"] = merged["forecast_lower"].combine_first(merged["lineyka_forecast_lower"])
    merged["lineyka_forecast_upper"] = merged["forecast_upper"].combine_first(merged["lineyka_forecast_upper"])
    merged["lineyka_forecast_model"] = merged["forecast_model_id"].combine_first(merged["lineyka_forecast_model"])
    merged["lineyka_forecast_scenario"] = merged["forecast_scenario"].combine_first(merged["lineyka_forecast_scenario"])
    merged = merged.drop(columns=["forecast_yhat", "forecast_lower", "forecast_upper", "forecast_model_id", "forecast_scenario", "date", "__lineyka_month"])
    if mode == "append":
        max_date = working["__lineyka_month"].max()
        future = forecast_df[forecast_df["date"] > max_date].copy()
        if not future.empty:
            base_row = {column: None for column in merged.columns}
            rows_to_add = []
            next_row_id = int(merged["__lineyka_row_id"].max()) + 1
            for _, row in future.iterrows():
                record = dict(base_row)
                record["__lineyka_row_id"] = next_row_id
                record[metadata["date_column"]] = row["date"]
                record["lineyka_forecast"] = row["forecast_yhat"]
                record["lineyka_forecast_lower"] = row["forecast_lower"]
                record["lineyka_forecast_upper"] = row["forecast_upper"]
                record["lineyka_forecast_model"] = row["forecast_model_id"]
                record["lineyka_forecast_scenario"] = row["forecast_scenario"]
                rows_to_add.append(record)
                next_row_id += 1
            if rows_to_add:
                merged = pd.concat([merged, pd.DataFrame(rows_to_add)], ignore_index=True)
    operation = {
        "type": "forecast",
        "params": metadata,
        "summary": {"rows": len(result_rows)},
    }
    return store.create_version(dataset_id, version_id, merged, user_id=user_id, operation=operation)
