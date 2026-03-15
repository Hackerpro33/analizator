from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import logging
from fastapi import APIRouter, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import get_settings
from .observability import setup_observability
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
from .services.extraction import build_extraction
from .services.metadata_repository import get_metadata_repository, get_model_tracking_repository
from .services.object_storage import get_object_storage
from .tasks import TaskQueueUnavailable, enqueue_extraction, get_task_status
from .utils import files as files_utils
from .utils.files import DATA_DIR, UPLOAD_DIR, read_table_bytes, register_uploaded_file, resolve_file_path, safe_filename
from .version import __version__


settings = get_settings()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Insight Sphere Backend",
    version=__version__,
    description=(
        "API for managing analytical datasets, providing upload/extraction capabilities "
        "with strong validation, observability, and documentation."
    ),
    contact={
        "name": "Insight Sphere Team",
        "url": "https://github.com/insight-sphere",
    },
)

setup_observability(app)


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
        if settings.hsts_max_age:
            headers["Strict-Transport-Security"] = f"max-age={settings.hsts_max_age}; includeSubDomains; preload"
        for header, value in headers.items():
            response.headers.setdefault(header, value)
        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id", uuid.uuid4().hex)
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers.setdefault("X-Request-ID", request_id)
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            duration = (time.perf_counter() - start) * 1000
            logger.exception(
                "request_failed",
                extra={
                    "event": "request_failed",
                    "method": request.method,
                    "path": request.url.path,
                    "request_id": getattr(request.state, "request_id", None),
                    "duration_ms": duration,
                },
            )
            raise
        duration = (time.perf_counter() - start) * 1000
        logger.info(
            "request_completed",
            extra={
                "event": "request_completed",
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "request_id": getattr(request.state, "request_id", None),
                "duration_ms": duration,
            },
        )
        return response


class AuditMiddleware(BaseHTTPMiddleware):
    """Persist high-level request audit logs to the model tracking repository."""

    def __init__(self, app: FastAPI) -> None:
        super().__init__(app)
        self._repository = get_model_tracking_repository()

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        repo = self._repository
        try:
            user_id = getattr(getattr(request.state, "user", None), "id", None) or request.headers.get("x-user-id")
            repo.record_audit_event(
                user_id=user_id,
                action=request.method.upper(),
                resource=request.url.path,
                payload={"status_code": response.status_code},
                ip_address=request.client.host if request.client else None,
                request_id=getattr(request.state, "request_id", None),
            )
        except Exception:  # pragma: no cover - audit should never block responses
            logger.exception(
                "audit_log_failed",
                extra={"event": "audit_log_failed", "path": request.url.path},
            )
        return response


allow_origins = {str(settings.frontend_origin), "http://127.0.0.1:5173", "http://127.0.0.1:5174"}
allow_origins.update(settings.additional_origins)

if settings.force_https_redirect:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allow_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Idempotency-Key"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(AuditMiddleware)

EMAIL_LOG_PATH = DATA_DIR / "email_log.jsonl"
FILE_REGISTRY = files_utils._FILE_REGISTRY
_safe_name = safe_filename

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


def _ensure_allowed_extension(filename: Optional[str]) -> None:
    if not filename:
        return
    ext = os.path.splitext(filename)[1].lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")


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


api_v1_router = APIRouter(tags=["core"])


@api_v1_router.post(
    "/upload",
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
    fid = str(uuid.uuid4())
    safe = safe_filename(file.filename or "file")
    key = f"datasets/{fid}/{safe}"
    storage = get_object_storage()
    location = storage.put_object(key=key, data=data, content_type=file.content_type)
    register_uploaded_file(fid, storage.local_path_for(key))

    try:
        df = read_table_bytes(data, file.filename)
        extraction = build_extraction(df)
    except Exception:
        extraction = None
    quick = QuickExtraction.model_validate(extraction) if extraction else None

    checksum = hashlib.sha256(data).hexdigest()
    metadata_repo = get_metadata_repository()
    try:
        metadata_repo.record_dataset_upload(
            dataset_id=fid,
            filename=file.filename or safe,
            storage_bucket=location.bucket,
            storage_key=location.key,
            content_type=file.content_type or "application/octet-stream",
            size_bytes=len(data),
            checksum=checksum,
            quick_extraction=quick.model_dump() if quick else None,
        )
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("metadata_persistence_failed", error=str(exc))

    payload = FileUploadResponse(
        status="success",
        file_url=fid,
        filename=file.filename,
        quick_extraction=quick,
        storage_bucket=location.bucket,
        storage_key=location.key,
        checksum=checksum,
        size_bytes=len(data),
        content_type=file.content_type or "application/octet-stream",
    )
    UPLOAD_COUNTER.inc()
    UPLOAD_SIZE.observe(len(data))
    if idempotency_key:
        _IDEMPOTENCY_CACHE[idempotency_key] = payload.model_dump()
    return payload


@api_v1_router.post(
    "/extract",
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


@api_v1_router.post(
    "/extract/async",
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
    resolve_file_path(req.file_url)
    try:
        task_id = enqueue_extraction(req.file_url)
    except TaskQueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    metadata_repo = get_metadata_repository()
    try:
        metadata_repo.record_job_event(
            job_id=task_id,
            job_type="dataset-extract",
            dataset_id=req.file_url,
            status="queued",
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("job_record_failed", error=str(exc))
    return TaskEnqueueResponse(task_id=task_id, status="queued", queue=settings.task_queue_name)


@api_v1_router.get(
    "/tasks/{task_id}",
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
    metadata_repo = get_metadata_repository()
    try:
        metadata_repo.record_job_event(
            job_id=task_id,
            job_type="dataset-extract",
            dataset_id=status_payload.get("dataset_id"),
            status=status_payload["status"],
            result=quick.model_dump() if quick else None,
            error=status_payload.get("error"),
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("job_record_failed", error=str(exc))
    return TaskStatusResponse(
        task_id=status_payload["task_id"],
        status=status_payload["status"],
        result=quick,
        error=status_payload.get("error"),
    )


@api_v1_router.post(
    "/utils/send-email",
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
            json.dump(record, log_file, ensure_ascii=False)
            log_file.write("\n")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to log email: {exc}")
    return EmailResponse(status="queued", logged=True)


if __package__ in {None, ""}:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.append(current_dir)
    import admin_api as admin_router_module
    import ai_lab_api as ai_lab_router_module
    import lineyka_api as lineyka_router_module
    import auth_api as auth_router_module
    import audit_api as audit_router_module
    import collaboration_api as collaboration_router_module
    import chat_api as chat_router_module
    import cybersecurity_api as cybersecurity_router_module
    import cyber_events_api as cyber_events_router_module
    import cyber_architecture_api as cyber_architecture_router_module
    import cyber_host_api as cyber_host_router_module
    import datasets_api as datasets_router_module
    import dictionary_api as dictionary_router_module
    import ml_api as ml_router_module
    import visualizations_api as visualizations_router_module
    import users_api as users_router_module
    import system_api as system_router_module
else:
    from . import admin_api as admin_router_module
    from . import ai_lab_api as ai_lab_router_module
    from . import lineyka_api as lineyka_router_module
    from . import auth_api as auth_router_module
    from . import audit_api as audit_router_module
    from . import collaboration_api as collaboration_router_module
    from . import chat_api as chat_router_module
    from . import cybersecurity_api as cybersecurity_router_module
    from . import cyber_events_api as cyber_events_router_module
    from . import cyber_architecture_api as cyber_architecture_router_module
    from . import cyber_host_api as cyber_host_router_module
    from . import datasets_api as datasets_router_module
    from . import dictionary_api as dictionary_router_module
    from . import ml_api as ml_router_module
    from . import visualizations_api as visualizations_router_module
    from . import users_api as users_router_module
    from . import system_api as system_router_module

datasets_router = datasets_router_module.router
dictionary_router = dictionary_router_module.router
visualizations_router = visualizations_router_module.router
chat_router = chat_router_module.router
audit_router = audit_router_module.router
collaboration_router = collaboration_router_module.router
ml_router = ml_router_module.router
ai_lab_router = ai_lab_router_module.router
lineyka_router = lineyka_router_module.router
admin_router = admin_router_module.router
auth_router = auth_router_module.router
cybersecurity_router = cybersecurity_router_module.router
cyber_events_router = cyber_events_router_module.router
cyber_architecture_router = cyber_architecture_router_module.router
cyber_host_router = cyber_host_router_module.router
users_router = users_router_module.router
system_router = system_router_module.router

def _compose_prefix(base: str, extra: str = "") -> str:
    normalized_base = base or "/"
    normalized_base = normalized_base.rstrip("/") or "/"
    if not extra:
        return "" if normalized_base == "/" else normalized_base
    normalized_extra = extra if extra.startswith("/") else f"/{extra}"
    if normalized_base == "/":
        return normalized_extra
    return f"{normalized_base}{normalized_extra}"


def _include_router(router: APIRouter, extra_prefix: str = "") -> None:
    seen: set[str] = set()
    for base in settings.api_prefix_variants:
        prefix = _compose_prefix(base, extra_prefix)
        if prefix in seen:
            continue
        seen.add(prefix)
        if not prefix:
            app.include_router(router)
        else:
            app.include_router(router, prefix=prefix)


_include_router(api_v1_router)
_include_router(datasets_router, "/dataset")
_include_router(dictionary_router, "/dictionary")
_include_router(visualizations_router, "/visualization")
_include_router(chat_router, "/chat")
_include_router(audit_router, "/audit")
_include_router(collaboration_router)
_include_router(ml_router)
_include_router(ai_lab_router)
_include_router(lineyka_router)
_include_router(cybersecurity_router)
_include_router(cyber_events_router)
_include_router(cyber_architecture_router)
_include_router(cyber_host_router)
_include_router(admin_router)
_include_router(auth_router)
_include_router(users_router)
_include_router(system_router)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
