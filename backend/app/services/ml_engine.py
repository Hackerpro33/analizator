from __future__ import annotations

import json
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
    r2_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline as SKPipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer

from .dataset_store import get_dataset, get_dataset_file, list_datasets
from ..utils.files import load_dataframe_from_identifier


APP_DIR = Path(__file__).resolve().parent.parent
MODEL_DATA_DIR = APP_DIR / "data" / "models"
ARTIFACT_DIR = MODEL_DATA_DIR / "artifacts"
REGISTRY_PATH = MODEL_DATA_DIR / "registry.json"


MODEL_DATA_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


AlgorithmType = Literal["classification", "regression"]


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _atomic_write(path: Path, payload: Any) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _to_native(value: Any) -> Any:
    if isinstance(value, (np.generic,)):
        candidate = value.item()
        if isinstance(candidate, float) and math.isnan(candidate):
            return None
        return candidate
    if isinstance(value, (np.ndarray, list, tuple)):
        return [_to_native(item) for item in value]
    if isinstance(value, dict):
        return {key: _to_native(val) for key, val in value.items()}
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


class ModelRegistry:
    def __init__(self, registry_path: Path = REGISTRY_PATH) -> None:
        self.registry_path = registry_path

    def _load(self) -> List[Dict[str, Any]]:
        if not self.registry_path.exists():
            return []
        try:
            with self.registry_path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            if isinstance(payload, list):
                return payload
        except json.JSONDecodeError:
            return []
        return []

    def _save(self, items: List[Dict[str, Any]]) -> None:
        _atomic_write(self.registry_path, items)

    def list_models(self) -> List[Dict[str, Any]]:
        items = self._load()
        items.sort(key=lambda entry: entry.get("updated_at", entry.get("created_at", 0)), reverse=True)
        return items

    def get(self, model_id: str) -> Optional[Dict[str, Any]]:
        if not model_id:
            return None
        for item in self._load():
            if item.get("id") == model_id:
                return item
        return None

    def save(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        items = self._load()
        updated = False
        for idx, existing in enumerate(items):
            if existing.get("id") == metadata.get("id"):
                items[idx] = metadata
                updated = True
                break
        if not updated:
            items.append(metadata)
        self._save(items)
        return metadata


_registry = ModelRegistry()


@dataclass
class TrainingConfig:
    name: str
    dataset_id: Optional[str]
    file_url: Optional[str]
    target_column: str
    feature_columns: Optional[List[str]]
    task_type: AlgorithmType
    algorithm: str
    test_size: float = 0.2
    random_state: Optional[int] = None
    hyperparameters: Optional[Dict[str, Any]] = None
    description: Optional[str] = None


class MLTrainingError(Exception):
    pass


ALG_REGISTRY: Dict[AlgorithmType, Dict[str, Dict[str, Any]]] = {
    "classification": {
        "logistic_regression": {
            "label": "Логистическая регрессия",
            "defaults": {"max_iter": 500, "C": 1.0, "penalty": "l2", "solver": "lbfgs"},
            "params": {"C", "penalty", "solver", "max_iter"},
            "builder": lambda params: LogisticRegression(**params),
            "primary_metric": "f1_weighted",
        },
        "random_forest": {
            "label": "Случайный лес",
            "defaults": {"n_estimators": 300, "max_depth": None, "n_jobs": -1},
            "params": {"n_estimators", "max_depth", "min_samples_split"},
            "builder": lambda params: RandomForestClassifier(**params),
            "primary_metric": "f1_weighted",
        },
    },
    "regression": {
        "random_forest_regressor": {
            "label": "Случайный лес (регрессия)",
            "defaults": {"n_estimators": 200, "max_depth": None, "n_jobs": -1},
            "params": {"n_estimators", "max_depth", "min_samples_split"},
            "builder": lambda params: RandomForestRegressor(**params),
            "primary_metric": "r2",
        },
        "gradient_boosting": {
            "label": "Градиентный бустинг",
            "defaults": {"n_estimators": 200, "learning_rate": 0.05, "max_depth": 3},
            "params": {"n_estimators", "learning_rate", "max_depth", "subsample"},
            "builder": lambda params: GradientBoostingRegressor(**params),
            "primary_metric": "r2",
        },
    },
}


def _split_features(df: pd.DataFrame, feature_columns: List[str]) -> Tuple[List[str], List[str]]:
    numeric: List[str] = []
    categorical: List[str] = []
    for column in feature_columns:
        series = df[column]
        if column == "alert_level":
            categorical.append(column)
            continue
        if pd.api.types.is_numeric_dtype(series):
            numeric.append(column)
        else:
            try:
                converted = pd.to_numeric(series, errors="coerce")
            except Exception:
                converted = series
            has_values = converted.notna().any()
            if has_values and pd.api.types.is_numeric_dtype(converted.dropna()):
                df[column] = converted
                numeric.append(column)
            else:
                categorical.append(column)
    return numeric, categorical


def _build_preprocessor(numeric: Sequence[str], categorical: Sequence[str]) -> ColumnTransformer:
    transformers = []
    if numeric:
        numeric_pipeline = SKPipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]
        )
        transformers.append(("numeric", numeric_pipeline, list(numeric)))
    if categorical:
        categorical_pipeline = SKPipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]
        )
        transformers.append(("categorical", categorical_pipeline, list(categorical)))
    return ColumnTransformer(transformers=transformers, remainder="drop")


def _prepare_algorithm(task_type: AlgorithmType, algorithm: str, overrides: Optional[Dict[str, Any]]) -> Tuple[SKPipeline, Dict[str, Any]]:
    catalog = ALG_REGISTRY.get(task_type)
    if not catalog or algorithm not in catalog:
        raise MLTrainingError(f"Алгоритм {algorithm} не поддерживается для задачи {task_type}")
    spec = catalog[algorithm]
    params = spec["defaults"].copy()
    overrides = overrides or {}
    for key, value in overrides.items():
        if key not in spec["params"]:
            continue
        params[key] = value
    estimator = spec["builder"](params)
    return estimator, spec


def _metric_value(metrics: Dict[str, Any], spec: Dict[str, Any]) -> float:
    primary = spec.get("primary_metric")
    if not primary:
        return 0.0
    value = metrics.get(primary)
    if value is None:
        return 0.0
    return float(value)


class MLService:
    def __init__(self, registry: ModelRegistry = _registry):
        self.registry = registry

    def list_models(self) -> List[Dict[str, Any]]:
        return self.registry.list_models()

    def get_model(self, model_id: str) -> Dict[str, Any]:
        metadata = self.registry.get(model_id)
        if not metadata:
            raise MLTrainingError("Модель не найдена")
        return metadata

    def _resolve_dataset(self, dataset_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not dataset_id:
            return None
        return get_dataset(dataset_id)

    def profile_dataset(self, dataset_id: str) -> Dict[str, Any]:
        dataset = self._resolve_dataset(dataset_id)
        if not dataset:
            raise MLTrainingError("Набор данных не найден")
        file_reference = get_dataset_file(dataset_id, dataset.get("file_url"))
        if not file_reference:
            raise MLTrainingError("У набора данных нет связанного файла")
        df = load_dataframe_from_identifier(file_reference)
        columns = []
        for column in df.columns:
            series = df[column]
            sample = series.dropna().head(3).tolist()
            col_info = {
                "name": column,
                "dtype": str(series.dtype),
                "non_nulls": int(series.count()),
                "unique": int(series.nunique(dropna=True)),
                "sample": [_to_native(item) for item in sample],
            }
            if pd.api.types.is_numeric_dtype(series):
                col_info["mean"] = _to_native(series.dropna().mean())
                col_info["std"] = _to_native(series.dropna().std())
            columns.append(col_info)
        preview = [_to_native(row) for row in df.head(20).to_dict(orient="records")]
        return {
            "dataset": {
                "id": dataset.get("id"),
                "name": dataset.get("name"),
                "description": dataset.get("description"),
                "row_count": int(df.shape[0]),
            },
            "columns": columns,
            "preview": preview,
        }

    def train(self, config: TrainingConfig) -> Dict[str, Any]:
        dataset_meta = self._resolve_dataset(config.dataset_id)
        file_reference = get_dataset_file(config.dataset_id, config.file_url)
        if not file_reference:
            raise MLTrainingError("Не указан источник данных для обучения")
        df = load_dataframe_from_identifier(file_reference)
        if config.target_column not in df.columns:
            raise MLTrainingError(f"Целевая колонка {config.target_column} отсутствует в наборе")
        df = df.dropna(subset=[config.target_column])
        if df.empty:
            raise MLTrainingError("Набор данных пуст после фильтрации")
        if config.feature_columns:
            missing = [col for col in config.feature_columns if col not in df.columns]
            if missing:
                raise MLTrainingError(f"Колонки {', '.join(missing)} отсутствуют в наборе")
            features = [col for col in config.feature_columns if col != config.target_column]
        else:
            features = [col for col in df.columns if col != config.target_column]
        if not features:
            raise MLTrainingError("Не выбраны признаки для обучения")

        numeric, categorical = _split_features(df, features)
        if not numeric and not categorical:
            raise MLTrainingError("Не удалось определить признаки для обучения")

        estimator, spec = _prepare_algorithm(config.task_type, config.algorithm, config.hyperparameters)
        preprocessor = _build_preprocessor(numeric, categorical)
        pipeline = SKPipeline(
            steps=[
                ("preprocess", preprocessor),
                ("model", estimator),
            ]
        )

        X = df[features]
        y = df[config.target_column]

        stratify = None
        if config.task_type == "classification":
            unique_classes = y.nunique()
            if unique_classes < 2:
                raise MLTrainingError("Для классификации требуется минимум два класса")
            counts = y.value_counts()
            has_min_samples = counts.min() >= 2
            stratify = y if has_min_samples else None

        test_fraction = max(0.1, min(config.test_size, 0.4))

        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=test_fraction,
            random_state=config.random_state or 42,
            stratify=stratify,
        )
        try:
            pipeline.fit(X_train, y_train)
            predictions = pipeline.predict(X_test)
        except Exception as exc:
            raise MLTrainingError(f"Не удалось обучить модель: {exc}") from exc

        metrics = self._calculate_metrics(config.task_type, y_test, predictions, pipeline)
        preview = self._build_preview(X_test, y_test, predictions, pipeline)
        label_distribution = self._distribution(y)

        model_id = str(uuid.uuid4())
        artifact_path = ARTIFACT_DIR / f"{model_id}.joblib"
        joblib.dump(pipeline, artifact_path)

        metadata = {
            "id": model_id,
            "name": config.name,
            "description": config.description,
            "dataset_id": config.dataset_id,
            "dataset_name": dataset_meta.get("name") if dataset_meta else None,
            "file_url": file_reference,
            "target_column": config.target_column,
            "feature_columns": features,
            "task_type": config.task_type,
            "algorithm": config.algorithm,
            "metrics": _to_native(metrics),
            "label_distribution": label_distribution,
            "artifact_path": str(artifact_path),
            "status": "ready",
            "test_size": test_fraction,
            "random_state": config.random_state or 42,
            "hyperparameters": config.hyperparameters or {},
            "preview": preview,
            "created_at": _now_ts(),
            "created_date": _now_iso(),
            "updated_at": _now_ts(),
            "updated_date": _now_iso(),
            "latest_inference": {
                "sample": preview["records"],
                "generated_at": preview["generated_at"],
                "summary": preview["summary"],
            },
            "primary_score": _metric_value(metrics, spec),
        }
        self.registry.save(metadata)
        return metadata

    def predict(
        self,
        model_id: str,
        *,
        records: Optional[List[Dict[str, Any]]] = None,
        dataset_id: Optional[str] = None,
        file_url: Optional[str] = None,
        limit: int = 200,
    ) -> Dict[str, Any]:
        metadata = self.get_model(model_id)
        pipeline = self._load_artifact(metadata["artifact_path"])
        source_reference = file_url or get_dataset_file(dataset_id, None) or metadata.get("file_url")
        if records is None:
            if not source_reference:
                raise MLTrainingError("Не указан источник данных для инференса")
            df = load_dataframe_from_identifier(source_reference)
        else:
            if not isinstance(records, list) or not records:
                raise MLTrainingError("Передайте минимум одну запись для инференса")
            df = pd.DataFrame(records)
        missing = [col for col in metadata["feature_columns"] if col not in df.columns]
        if missing:
            raise MLTrainingError(f"В данных отсутствуют признаки: {', '.join(missing)}")
        X = df[metadata["feature_columns"]]
        predictions = pipeline.predict(X)

        output = []
        probability_fn = getattr(pipeline, "predict_proba", None)
        proba = probability_fn(X) if callable(probability_fn) else None

        for idx, (raw_row, prediction) in enumerate(zip(X.to_dict(orient="records"), predictions)):
            entry = {
                "input": raw_row,
                "prediction": _to_native(prediction),
            }
            if proba is not None and idx < len(proba):
                entry["probabilities"] = _to_native(proba[idx])
            if idx >= limit:
                break
            output.append(entry)

        inference_summary = self._distribution(pd.Series(predictions))
        payload = {
            "model_id": model_id,
            "generated_at": _now_iso(),
            "predictions": output,
            "count": len(output),
            "summary": inference_summary,
        }

        metadata["latest_inference"] = {
            "generated_at": payload["generated_at"],
            "summary": inference_summary,
            "sample": output[: min(5, len(output))],
        }
        metadata["updated_at"] = _now_ts()
        metadata["updated_date"] = _now_iso()
        self.registry.save(metadata)
        return payload

    def _resolve_artifact_path(self, artifact_path: str) -> Path:
        path = Path(artifact_path)
        candidates = [path]
        if not path.is_absolute():
            candidates.append((APP_DIR.parent / path).resolve())
            candidates.append((APP_DIR.parent.parent / path).resolve())
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return path

    def _load_artifact(self, artifact_path: str) -> SKPipeline:
        path = self._resolve_artifact_path(artifact_path)
        if not path.exists():
            raise MLTrainingError("Файл модели отсутствует")
        return joblib.load(path)

    def _calculate_metrics(self, task_type: AlgorithmType, y_true, y_pred, pipeline: SKPipeline) -> Dict[str, Any]:
        if task_type == "classification":
            metrics = {
                "accuracy": accuracy_score(y_true, y_pred),
                "precision_weighted": precision_score(y_true, y_pred, average="weighted", zero_division=0),
                "recall_weighted": recall_score(y_true, y_pred, average="weighted", zero_division=0),
                "f1_weighted": f1_score(y_true, y_pred, average="weighted", zero_division=0),
            }
            return metrics
        mse = mean_squared_error(y_true, y_pred)
        metrics = {
            "rmse": math.sqrt(mse),
            "mae": mean_absolute_error(y_true, y_pred),
            "r2": r2_score(y_true, y_pred),
        }
        return metrics

    def _build_preview(self, X_test, y_test, predictions, pipeline: SKPipeline) -> Dict[str, Any]:
        limit = min(10, len(predictions))
        records = []
        probability_fn = getattr(pipeline, "predict_proba", None)
        proba = probability_fn(X_test.head(limit)) if callable(probability_fn) else None
        for idx in range(limit):
            features = _to_native(X_test.iloc[idx].to_dict())
            entry = {
                "features": features,
                "actual": _to_native(y_test.iloc[idx]) if idx < len(y_test) else None,
                "prediction": _to_native(predictions[idx]),
            }
            if proba is not None and idx < len(proba):
                entry["probabilities"] = _to_native(proba[idx])
            records.append(entry)
        summary = self._distribution(pd.Series(predictions))
        return {
            "records": records,
            "generated_at": _now_iso(),
            "summary": summary,
        }

    def _distribution(self, series: pd.Series) -> Dict[str, Any]:
        distribution = {}
        if series.empty:
            return distribution
        counts = series.value_counts(dropna=False)
        total = counts.sum()
        for label, value in counts.items():
            distribution[str(label)] = value / total if total else 0
        return _to_native(distribution)

    def insights(self) -> Dict[str, Any]:
        models = self.list_models()
        if not models:
            return {
                "models": [],
                "highlight": None,
                "recommendations": [
                    "Загрузите набор данных и обучите первую модель, чтобы включить ИИ-подсказки во всех разделах."
                ],
            }
        ready_models = [model for model in models if model.get("status") == "ready"]
        if not ready_models:
            return {"models": [], "highlight": None, "recommendations": []}
        sorted_models = sorted(ready_models, key=lambda m: m.get("primary_score", 0), reverse=True)
        highlight = sorted_models[0]
        insight_models = [
            {
                "id": model["id"],
                "name": model.get("name"),
                "dataset": model.get("dataset_name"),
                "task_type": model.get("task_type"),
                "algorithm": model.get("algorithm"),
                "score": model.get("primary_score"),
                "metrics": model.get("metrics"),
                "updated_at": model.get("updated_at"),
            }
            for model in sorted_models
        ]
        recommendations = self._build_recommendations(highlight)
        return {
            "models": insight_models,
            "highlight": highlight,
            "recommendations": recommendations,
        }

    def _build_recommendations(self, model: Dict[str, Any]) -> List[str]:
        recs: List[str] = []
        inference = model.get("latest_inference") or {}
        summary = inference.get("summary") or {}
        max_label = None
        max_value = 0
        for label, value in summary.items():
            if value is None:
                continue
            if value > max_value:
                max_label = label
                max_value = value
        if max_label:
            if model.get("task_type") == "classification":
                recs.append(
                    f"Модель ожидает {max_value:.0%} записей класса «{max_label}». Подготовьте меры реагирования заранее."
                )
            else:
                recs.append(
                    f"Прогноз показывает смещение к значению {max_label}. Рассмотрите корректировку планов распределения ресурсов."
                )
        if model.get("metrics", {}).get("accuracy"):
            accuracy = model["metrics"]["accuracy"]
            if accuracy < 0.75:
                recs.append("Точность ниже 75% — добавьте больше признаков или обновите целевой столбец.")
            else:
                recs.append("Модель стабильно точна — подключите инференс в дашборды и отчёты.")
        if not recs:
            recs.append("Запустите инференс на свежих данных, чтобы получить оперативные рекомендации.")
        return recs


def algorithm_catalog() -> Dict[str, List[Dict[str, Any]]]:
    catalog: Dict[str, List[Dict[str, Any]]] = {}
    for task_type, entries in ALG_REGISTRY.items():
        catalog[task_type] = []
        for name, spec in entries.items():
            catalog[task_type].append(
                {
                    "id": name,
                    "label": spec.get("label"),
                    "defaults": spec.get("defaults"),
                    "params": sorted(spec.get("params", [])),
                    "primary_metric": spec.get("primary_metric"),
                }
            )
    return catalog


service = MLService()
