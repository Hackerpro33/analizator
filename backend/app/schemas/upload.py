"""Schemas for dataset upload/extraction endpoints."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field


class ColumnPreview(BaseModel):
    """Metadata about a column detected in the uploaded dataset."""

    name: str = Field(..., description="Column name as present in the dataset", examples=["incident_date"])
    type: str = Field(
        ...,
        description="High level column data type detected by the backend",
        examples=["datetime"],
    )


class QuickExtraction(BaseModel):
    """Lightweight preview of an uploaded dataset."""

    columns: List[ColumnPreview] = Field(
        ...,
        description="Detected columns with their data types",
        examples=[[{"name": "incident_id", "type": "number"}]],
    )
    row_count: int = Field(..., description="Total number of rows detected in the dataset", examples=[1200])
    sample_data: List[Dict[str, Any]] = Field(
        ...,
        description="Sample rows extracted from the dataset for quick preview",
        examples=[[{"incident_id": 1, "offense": "Burglary", "district": "North"}]],
    )
    insights: List[str] = Field(
        default_factory=list,
        description="Domain specific insights generated for the dataset",
        examples=[["Crime indicator 'incident_id' increased by 4.00 between the first and last records."]],
    )


class FileUploadResponse(BaseModel):
    """Response returned by the dataset upload endpoint."""

    status: str = Field("success", description="Status of the upload request", examples=["success"])
    file_url: str = Field(
        ...,
        description="Internal identifier that can be used to reference the uploaded file",
        examples=["a3f1-42ab"],
    )
    filename: Optional[str] = Field(
        None,
        description="Original filename provided by the client",
        examples=["incidents.csv"],
    )
    storage_bucket: Optional[str] = Field(
        None,
        description="Name of the object storage bucket where the file resides",
        examples=["insight-artifacts"],
    )
    storage_key: Optional[str] = Field(
        None,
        description="Object key within the bucket that uniquely identifies the upload",
        examples=["datasets/123/incidents.csv"],
    )
    checksum: Optional[str] = Field(
        None,
        description="SHA-256 checksum of the uploaded file for tamper detection",
    )
    size_bytes: Optional[int] = Field(
        None,
        description="Size of the uploaded file in bytes",
    )
    content_type: Optional[str] = Field(
        None,
        description="Content type detected for the uploaded file",
    )
    quick_extraction: Optional[QuickExtraction] = Field(
        None,
        description="Optional quick extraction payload with structural information about the dataset",
    )


class ExtractRequest(BaseModel):
    """Request body for extracting metadata of a previously uploaded dataset."""

    file_url: str = Field(..., description="Identifier returned by the upload endpoint", examples=["a3f1-42ab"])
    json_schema: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional JSON schema supplied by the client to validate the dataset",
        json_schema_extra={
            "example": {
                "title": "Dataset",
                "type": "object",
                "properties": {"incident_id": {"type": "integer"}},
            }
        },
    )


class ExtractResponse(BaseModel):
    """Response returned by the dataset extraction endpoint."""

    status: str = Field("success", description="Status of the extraction request", examples=["success"])
    output: QuickExtraction = Field(..., description="Quick extraction payload for the requested dataset")


class TaskEnqueueResponse(BaseModel):
    """Response returned when a background analytics task is enqueued."""

    task_id: str = Field(..., description="Identifier of the scheduled task", examples=["rq:job:123"])
    status: Literal["queued"] = Field(
        "queued",
        description="Initial status of the task right after scheduling",
        examples=["queued"],
    )
    queue: str = Field(..., description="Name of the queue the task was submitted to", examples=["insight-analytics"])


class TaskStatusResponse(BaseModel):
    """Status payload returned for a background analytics task."""

    task_id: str = Field(..., description="Identifier of the tracked task", examples=["rq:job:123"])
    status: str = Field(
        ...,
        description="Current RQ status (queued/started/finished/failed)",
        examples=["finished"],
    )
    result: Optional[QuickExtraction] = Field(
        None,
        description="Optional quick extraction payload when the task finished successfully",
    )
    error: Optional[str] = Field(
        None,
        description="Optional traceback or message if the task failed",
        examples=["Traceback (most recent call last)..."],
    )


class EmailRequest(BaseModel):
    """Schema for email logging endpoint payload."""

    to: str = Field(..., description="Recipient email address", examples=["team@example.com"])
    subject: str = Field(..., description="Email subject", examples=["Dataset ready"])
    body: str = Field(..., description="Email body", examples=["Your dataset has been processed."])
    from_name: Optional[str] = Field(
        None,
        description="Optional friendly name that will be associated with the email",
        examples=["Insight Sphere"],
    )


class EmailResponse(BaseModel):
    """Response returned by the email logging endpoint."""

    status: str = Field("queued", description="Status of the email logging request", examples=["queued"])
    logged: bool = Field(True, description="Flag indicating that the email was appended to the audit log", examples=[True])


class ErrorResponse(BaseModel):
    """Generic error response schema."""

    detail: str = Field(..., description="Human readable error description", examples=["File too large"])
