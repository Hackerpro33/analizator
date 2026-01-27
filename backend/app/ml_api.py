from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from .services.dataset_store import list_datasets
from .services.ml_engine import (
    MLService,
    MLTrainingError,
    TrainingConfig,
    algorithm_catalog,
    service as ml_service,
)


def get_ml_service() -> MLService:
    return ml_service


router = APIRouter(prefix="/ml", tags=["ml"])


class TrainingRequest(BaseModel):
    name: str = Field(..., description="Имя модели")
    dataset_id: Optional[str] = Field(None, description="Идентификатор набора из каталога")
    file_url: Optional[str] = Field(
        None,
        description="Прямой идентификатор файла (если набор не зарегистрирован)",
    )
    target_column: str = Field(..., description="Колонка с целевой переменной")
    feature_columns: Optional[List[str]] = Field(
        default=None,
        description="Список признаков. Если не указано — берем все кроме целевой колонки.",
    )
    task_type: Literal["classification", "regression"] = Field(
        ...,
        description="Тип задачи, определяющий алгоритмы и метрики",
    )
    algorithm: str = Field(..., description="Алгоритм обучения")
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    test_size: float = Field(0.2, ge=0.1, le=0.4)
    random_state: Optional[int] = Field(None, ge=1)
    description: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def validate_source(self) -> "TrainingRequest":
        if not self.dataset_id and not self.file_url:
            raise ValueError("Укажите dataset_id или file_url")
        return self


class PredictionRequest(BaseModel):
    records: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Произвольные записи для инференса",
    )
    dataset_id: Optional[str] = Field(
        default=None,
        description="Идентификатор зарегистрированного набора",
    )
    file_url: Optional[str] = Field(
        default=None,
        description="Внутренний идентификатор файла",
    )
    limit: int = Field(120, ge=1, le=1000)

    @model_validator(mode="after")
    def validate_payload(self) -> "PredictionRequest":
        if not self.records and not self.dataset_id and not self.file_url:
            raise ValueError("Передайте records или ссылку на набор данных")
        return self


def _public_model(metadata: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(metadata)
    payload.pop("artifact_path", None)
    return payload


def _dataset_summary(dataset: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": dataset.get("id"),
        "name": dataset.get("name"),
        "description": dataset.get("description"),
        "row_count": dataset.get("row_count"),
        "tags": dataset.get("tags") or [],
        "columns": dataset.get("columns") or [],
        "file_url": dataset.get("file_url"),
        "updated_at": dataset.get("updated_at") or dataset.get("created_at"),
    }


@router.get("/catalog", summary="Доступные алгоритмы")
def api_catalog() -> Dict[str, Any]:
    return {"algorithms": algorithm_catalog()}


@router.get("/datasets", summary="Каталог наборов данных для обучения")
def api_datasets() -> Dict[str, Any]:
    datasets = [_dataset_summary(item) for item in list_datasets()]
    return {"items": datasets, "count": len(datasets)}


@router.get("/datasets/{dataset_id}/profile", summary="Профиль набора данных")
def api_dataset_profile(dataset_id: str) -> Dict[str, Any]:
    try:
        profile = ml_service.profile_dataset(dataset_id)
    except MLTrainingError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return profile


@router.get("/models", summary="Список моделей")
def api_models(service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    models = [_public_model(item) for item in service.list_models()]
    return {"items": models, "count": len(models)}


@router.get("/models/{model_id}", summary="Описание модели")
def api_model_detail(model_id: str, service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    try:
        metadata = service.get_model(model_id)
    except MLTrainingError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _public_model(metadata)


@router.post("/train", summary="Обучить модель")
def api_train(payload: TrainingRequest, service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    config = TrainingConfig(**payload.model_dump())
    try:
        metadata = service.train(config)
    except MLTrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _public_model(metadata)


@router.post("/models/{model_id}/predict", summary="Запуск инференса")
def api_predict(model_id: str, payload: PredictionRequest, service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    try:
        response = service.predict(
            model_id,
            records=payload.records,
            dataset_id=payload.dataset_id,
            file_url=payload.file_url,
            limit=payload.limit,
        )
    except MLTrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return response


@router.get("/insights", summary="Инсайты по ИИ", response_model=None)
def api_insights(service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    payload = service.insights()
    highlight = payload.get("highlight")
    if isinstance(highlight, dict):
        payload["highlight"] = _public_model(highlight)
    return payload
