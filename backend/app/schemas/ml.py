from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class ModelRun(BaseModel):
    id: str = Field(..., description="Unique identifier of the model run.")
    user_id: Optional[str] = Field(None, description="ID of the user that initiated the run.")
    dataset_id: Optional[str] = Field(None, description="Dataset linked to the calculation.")
    model_type: str = Field(..., description="Logical type of the model (regression, forecasting, etc.).")
    algorithm: str = Field(..., description="Concrete algorithm (OLS, ARIMA, Prophet, ...).")
    parameters: Optional[Dict[str, Any]] = Field(None, description="Serialized hyperparameters.")
    status: str = Field(..., description="Execution status (queued/running/completed/failed).")
    error: Optional[str] = Field(None, description="Optional error message when the run fails.")
    metrics_summary: Optional[Dict[str, Any]] = Field(None, description="Aggregated metrics used for quick overviews.")
    created_at: datetime = Field(..., description="Creation timestamp.")
    updated_at: datetime = Field(..., description="Last update timestamp.")
    started_at: Optional[datetime] = Field(None, description="Timestamp when execution started.")
    completed_at: Optional[datetime] = Field(None, description="Timestamp when execution completed.")
    duration_ms: Optional[int] = Field(None, description="Execution duration in milliseconds.")
    source_ip: Optional[str] = Field(None, description="IP address recorded for audit purposes.")
    request_id: Optional[str] = Field(None, description="Request correlation identifier.")

    model_config = {"from_attributes": True}


class ModelResult(BaseModel):
    id: str
    run_id: str
    metrics: Optional[Dict[str, Any]] = None
    coefficients: Optional[Dict[str, Any]] = None
    residuals: Optional[Dict[str, Any]] = None
    diagnostics: Optional[Dict[str, Any]] = None
    artifacts_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertPayload(BaseModel):
    id: str
    run_id: Optional[str] = None
    alert_type: str
    severity: str
    message: str
    threshold: Optional[Dict[str, Any]] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AuditLogEntry(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    resource: str
    payload: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    request_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
