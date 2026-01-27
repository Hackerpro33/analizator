from __future__ import annotations

import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import FastAPI
try:  # pragma: no cover - optional instrumentation
    from opentelemetry import trace
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.logging import LoggingInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, OTLPSpanExporter

    OTEL_AVAILABLE = True
except ImportError:  # pragma: no cover
    trace = None
    FastAPIInstrumentor = None  # type: ignore[assignment]
    LoggingInstrumentor = None  # type: ignore[assignment]
    Resource = None  # type: ignore[assignment]
    TracerProvider = None  # type: ignore[assignment]
    BatchSpanProcessor = None  # type: ignore[assignment]
    OTLPSpanExporter = None  # type: ignore[assignment]
    OTEL_AVAILABLE = False
from .config import get_settings
from .version import __version__

try:  # pragma: no cover - sentry is optional in tests
    import sentry_sdk
except ImportError:  # pragma: no cover
    sentry_sdk = None


EXTRA_EXCLUDES = {
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        for key, value in record.__dict__.items():
            if key in EXTRA_EXCLUDES:
                continue
            payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _configure_logging(level: str, settings) -> None:
    logging_level = getattr(logging, level.upper(), logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.setLevel(logging_level)
    root.handlers = [handler]
    if settings.log_file_path:
        path = Path(settings.log_file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(path, encoding="utf-8")
        file_handler.setFormatter(JsonFormatter())
        root.addHandler(file_handler)


def _configure_tracing(app: FastAPI, endpoint: str, headers: Optional[str], insecure: bool, environment: str) -> None:
    if not OTEL_AVAILABLE:
        return
    parsed_headers: Dict[str, str] = {}
    if headers:
        for pair in headers.split(","):
            if not pair.strip():
                continue
            key, _, value = pair.partition("=")
            parsed_headers[key.strip()] = value.strip()
    exporter = OTLPSpanExporter(
        endpoint=endpoint,
        headers=parsed_headers or None,
        insecure=insecure,
    )
    resource = Resource.create(
        attributes={
            "service.name": get_settings().service_name,
            "service.version": __version__,
            "deployment.environment": environment,
        }
    )
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    LoggingInstrumentor().instrument(set_logging_format=True)


def _configure_sentry(dsn: Optional[str], environment: str, sample_rate: float) -> None:
    if not dsn or not sentry_sdk:
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=f"{get_settings().service_name}@{__version__}",
        traces_sample_rate=sample_rate,
    )


def setup_observability(app: FastAPI) -> None:
    settings = get_settings()
    _configure_logging(settings.log_level, settings)
    if settings.otel_exporter_otlp_endpoint:
        _configure_tracing(
            app,
            settings.otel_exporter_otlp_endpoint,
            settings.otel_exporter_otlp_headers,
            settings.otel_exporter_otlp_insecure,
            settings.environment,
        )
    _configure_sentry(settings.sentry_dsn, settings.environment, settings.sentry_traces_sample_rate)
