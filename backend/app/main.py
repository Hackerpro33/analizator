from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
import json
import sys
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List

from .utils import files as files_utils
from typing import Optional, Dict, Any

import httpx
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, CollectorRegistry, generate_latest

from .config import get_settings
from .schemas import (
    EmailRequest,
    EmailResponse,
    ErrorResponse,
    ExtractRequest,
    ExtractResponse,
    FileUploadResponse,
    QuickExtraction,
    TaskEnqueueResponse,
    TaskStatusResponse,
)
from .utils.files import (
    DATA_DIR,
    UPLOAD_DIR,
    read_table_bytes,
    register_uploaded_file,
    resolve_file_path,
    safe_filename,
    get_file_registry,
)
from .services.extraction import build_extraction
from .tasks import TaskQueueUnavailable, enqueue_extraction, get_task_status

settings = get_settings()


app = FastAPI(
    title="Insight Sphere Backend",
    version="0.1.0",
    description=(
        "API for managing analytical datasets, providing upload/extraction capabilities "
        "with strong validation, observability, and documentation."
    ),
    contact={
        "name": "Insight Sphere Team",
        "url": "https://github.com/insight-sphere",
    },
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach a strict set of security-oriented HTTP headers."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "same-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        }
        for header, value in headers.items():
            response.headers.setdefault(header, value)
        return response

# --- CORS ---
allow_origins = {str(settings.frontend_origin), "http://127.0.0.1:5173", "http://127.0.0.1:5174"}
allow_origins.update(settings.additional_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allow_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
app.add_middleware(SecurityHeadersMiddleware)

EMAIL_LOG_PATH = DATA_DIR / "email_log.jsonl"

FILE_REGISTRY = files_utils._FILE_REGISTRY
_safe_name = safe_filename

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024
MAX_UPLOAD_SIZE = settings.max_upload_size
MAX_UPLOAD_SIZE_MB = settings.max_upload_size_mb
ALLOWED_EXTENSIONS = {ext.lower() for ext in settings.allowed_upload_extensions}


REGISTRY = CollectorRegistry()
UPLOAD_COUNTER = Counter(
    "insight_upload_total",
    "Total number of dataset uploads",
    registry=REGISTRY,
)
UPLOAD_SIZE = Histogram(
    "insight_upload_size_bytes",
    "Size of uploaded datasets in bytes",
    registry=REGISTRY,
    buckets=(10 * 1024, 100 * 1024, 1024 * 1024, 10 * 1024 * 1024, 50 * 1024 * 1024, float("inf")),
)

_IDEMPOTENCY_CACHE: Dict[str, Dict[str, Any]] = {}


async def _scan_for_malware(file_bytes: bytes) -> None:
    if not settings.clamav_scan_url:
        return

    timeout = httpx.Timeout(10.0, read=20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            str(settings.clamav_scan_url),
            files={"file": ("upload", file_bytes)},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="ClamAV scanning service unavailable")
    payload = response.json()
    if payload.get("status") != "clean":
        raise HTTPException(status_code=400, detail="File failed malware scan")


@app.get("/healthz", summary="Liveness probe", response_model=Dict[str, str])
def healthz() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/readiness", summary="Readiness probe", response_model=Dict[str, Any])
def readiness() -> Dict[str, Any]:
    checks = {
        "uploads_directory": Path(UPLOAD_DIR).exists(),
        "data_directory": Path(DATA_DIR).exists(),
    }
    status = "ready" if all(checks.values()) else "degraded"
    return {"status": status, "checks": checks}


@app.get("/metrics", summary="Prometheus metrics")
def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)

@app.get("/health", include_in_schema=False)
def legacy_health() -> Dict[str, str]:
    return {"status": "ok"}

# simple in-memory registry file_id -> path


def _ensure_allowed_extension(filename: Optional[str]) -> None:
    if not filename:
        return
    ext = os.path.splitext(filename)[1].lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")


@app.post(
    "/api/upload",
    summary="Upload dataset",
    response_model=FileUploadResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        413: {"model": ErrorResponse, "description": "Payload too large"},
        502: {"model": ErrorResponse, "description": "ClamAV service unavailable"},
    },
)
async def api_upload(
    file: UploadFile = File(..., description="Dataset file to upload"),
    idempotency_key: Optional[str] = Header(None, convert_underscores=False, alias="Idempotency-Key"),
) -> FileUploadResponse:
    if idempotency_key and idempotency_key in _IDEMPOTENCY_CACHE:
        return FileUploadResponse(**_IDEMPOTENCY_CACHE[idempotency_key])

    _ensure_allowed_extension(file.filename)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max allowed size is {settings.max_upload_size_mb} MB",
        )
    await _scan_for_malware(data)
    # save
    fid = str(uuid.uuid4())
    safe = safe_filename(file.filename or "file")
    upload_dir = Path(UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    path = upload_dir / f"{fid}_{safe}"
    upload_root = Path(UPLOAD_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    path = upload_root / f"{fid}_{safe}"
    with path.open("wb") as f:
        f.write(data)
    register_uploaded_file(fid, path)
    # quick extraction for preview (optional)
    try:
        df = read_table_bytes(data, file.filename)
        extraction = build_extraction(df)
    except Exception:
        extraction = None
    quick = QuickExtraction.model_validate(extraction) if extraction else None
    payload = FileUploadResponse(status="success", file_url=fid, filename=file.filename, quick_extraction=quick)
    UPLOAD_COUNTER.inc()
    UPLOAD_SIZE.observe(len(data))
    if idempotency_key:
        _IDEMPOTENCY_CACHE[idempotency_key] = payload.model_dump()
    return payload


@app.post(
    "/api/extract",
    summary="Extract dataset metadata",
    response_model=ExtractResponse,
    responses={400: {"model": ErrorResponse, "description": "Unable to process dataset"}},
)
def api_extract(req: ExtractRequest) -> ExtractResponse:
    path = resolve_file_path(req.file_url)
    with path.open("rb") as f:
        file_bytes = f.read()
    try:
        df = read_table_bytes(file_bytes, path.name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    output_dict = build_extraction(df)
    return ExtractResponse(status="success", output=QuickExtraction.model_validate(output_dict))


@app.post(
    "/api/extract/async",
    summary="Schedule dataset metadata extraction",
    response_model=TaskEnqueueResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Unable to process dataset"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
def api_extract_async(req: ExtractRequest) -> TaskEnqueueResponse:
    if not settings.task_queue_enabled:
        raise HTTPException(status_code=503, detail="Task queue is disabled")
    # Ensure the file exists before enqueuing to fail fast for invalid identifiers.
    resolve_file_path(req.file_url)
    try:
        task_id = enqueue_extraction(req.file_url)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TaskEnqueueResponse(task_id=task_id, status="queued", queue=settings.task_queue_name)


@app.get(
    "/api/tasks/{task_id}",
    summary="Inspect background task status",
    response_model=TaskStatusResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Task not found"},
        503: {"model": ErrorResponse, "description": "Task queue unavailable"},
    },
)
def api_task_status(task_id: str) -> TaskStatusResponse:
    if not settings.task_queue_enabled:
        raise HTTPException(status_code=503, detail="Task queue is disabled")
    try:
        status_payload = get_task_status(task_id)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    result_payload = status_payload.get("result")
    quick = QuickExtraction.model_validate(result_payload) if result_payload else None
    return TaskStatusResponse(
        task_id=status_payload["task_id"],
        status=status_payload["status"],
        result=quick,
        error=status_payload.get("error"),
    )


@app.post(
    "/api/utils/send-email",
    summary="Log outgoing email",
    response_model=EmailResponse,
    responses={500: {"model": ErrorResponse, "description": "Failed to write audit log"}},
)
async def api_send_email(payload: EmailRequest) -> EmailResponse:
    record = {
        "to": payload.to,
        "subject": payload.subject,
        "body": payload.body,
        "from_name": payload.from_name,
    }
    log_path = Path(EMAIL_LOG_PATH)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(log_path, "a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to log email: {exc}")
    return EmailResponse(status="queued", logged=True)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)



# Allow running both as part of the ``app`` package (e.g. ``uvicorn app.main:app``)
# and as a standalone script (e.g. ``python main.py`` or ``uvicorn main:app``).
if __package__ in {None, ""}:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.append(current_dir)
    import audit_api as audit_router_module
    import chat_api as chat_router_module
    import datasets_api as datasets_router_module
    import dictionary_api as dictionary_router_module
    import visualizations_api as visualizations_router_module
else:
    from . import audit_api as audit_router_module
    from . import chat_api as chat_router_module
    from . import datasets_api as datasets_router_module
    from . import dictionary_api as dictionary_router_module
    from . import visualizations_api as visualizations_router_module

datasets_router = datasets_router_module.router
dictionary_router = dictionary_router_module.router
visualizations_router = visualizations_router_module.router
chat_router = chat_router_module.router
audit_router = audit_router_module.router

app.include_router(datasets_router, prefix="/api/dataset")
app.include_router(dictionary_router, prefix="/api/dictionary")
app.include_router(visualizations_router, prefix="/api/visualization")
app.include_router(chat_router, prefix="/api/chat")
app.include_router(audit_router, prefix="/api/audit")
FILE_REGISTRY = get_file_registry()
_safe_name = safe_filename
