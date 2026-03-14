"""Application configuration powered by environment variables."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, List, Optional

from pydantic import AliasChoices, AnyHttpUrl, AnyUrl, EmailStr, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _make_source_lenient(source: Any) -> Any:
    if not source or not hasattr(source, "decode_complex_value"):
        return source
    original = source.decode_complex_value

    def _safe_decode(*args: Any, **kwargs: Any) -> Any:
        try:
            return original(*args, **kwargs)
        except (json.JSONDecodeError, ValueError, TypeError):
            if "value" in kwargs:
                return kwargs["value"]
            if len(args) >= 3:
                return args[2]
            return None

    source.decode_complex_value = _safe_decode
    return source


class Settings(BaseSettings):
    """Runtime configuration for the Insight Sphere backend."""

    api_prefix: str = Field(
        "/api/v1",
        alias="API_PREFIX",
        description="Base prefix for all REST API endpoints.",
    )
    environment: str = Field(
        "development",
        alias="ENVIRONMENT",
        description="Deployment environment for observability tagging.",
    )
    service_name: str = Field(
        "insight-backend",
        alias="SERVICE_NAME",
        description="Logical service identifier used in logs and tracing.",
    )
    frontend_origin: AnyHttpUrl = Field(
        "http://localhost:5173",
        alias="FRONTEND_ORIGIN",
        description="Primary frontend origin allowed to communicate with the API.",
    )
    additional_cors_origins: str = Field(
        "",
        alias="ADDITIONAL_CORS_ORIGINS",
        description="Comma separated list of additional origins allowed by CORS.",
    )
    allowed_hosts: str = Field(
        "localhost,127.0.0.1",
        alias="ALLOWED_HOSTS",
        description="Comma separated list of hosts accepted by the TrustedHost middleware.",
    )
    max_upload_size_mb: int = Field(
        25,
        alias="MAX_UPLOAD_SIZE_MB",
        description="Maximum upload size in megabytes for dataset files.",
    )
    allowed_upload_extensions: List[str] = Field(
        default_factory=lambda: [".csv", ".tsv", ".xlsx", ".xls"],
        alias="ALLOWED_UPLOAD_EXTENSIONS",
        description="List of file extensions allowed for upload.",
    )
    lab_mode: str = Field(
        "PRIVATE_LAB",
        alias="LAB_MODE",
        description="Variant C guard: PUBLIC_VIEW (dashboards only) or PRIVATE_LAB (full access).",
    )
    lab_ip_allowlist: str = Field(
        "",
        alias="LAB_IP_ALLOWLIST",
        description="Optional comma separated IPs allowed to access lab endpoints, enforced by reverse proxy per README.",
    )
    clamav_scan_url: Optional[AnyHttpUrl] = Field(
        None,
        alias="CLAMAV_SCAN_URL",
        description="Optional HTTP endpoint of a ClamAV scanning service.",
    )
    redis_url: AnyUrl = Field(
        "redis://redis:6379/0",
        alias="REDIS_URL",
        description="Connection URL for the Redis instance used by background workers and caching.",
    )
    task_queue_enabled: bool = Field(
        False,
        alias="TASK_QUEUE_ENABLED",
        description="Toggle for enabling Redis/RQ backed background processing.",
    )
    task_queue_name: str = Field(
        "insight-analytics",
        alias="TASK_QUEUE_NAME",
        description="Name of the Redis queue used for long-running analytics tasks.",
    )
    task_default_timeout: int = Field(
        600,
        alias="TASK_DEFAULT_TIMEOUT",
        description="Default timeout for background analytics tasks in seconds.",
    )
    alert_webhook_url: Optional[AnyHttpUrl] = Field(
        None,
        alias="ALERT_WEBHOOK_URL",
        description="Webhook endpoint for alert notifications.",
    )
    alert_webhook_retries: int = Field(
        2,
        alias="ALERT_WEBHOOK_RETRIES",
        description="Number of retry attempts for webhook delivery.",
        ge=0,
    )
    alert_webhook_timeout: float = Field(
        5.0,
        alias="ALERT_WEBHOOK_TIMEOUT",
        description="Timeout in seconds for webhook delivery attempts.",
        ge=0.1,
    )
    jwt_secret_key: str = Field(
        "change-me",
        alias="AUTH_JWT_SECRET",
        description="Secret key used for signing JWT tokens.",
    )
    jwt_algorithm: str = Field(
        "HS256",
        alias="AUTH_JWT_ALGORITHM",
        description="Algorithm for JWT signing.",
    )
    access_token_expires_minutes: int = Field(
        30,
        alias="AUTH_ACCESS_TOKEN_EXPIRES_MINUTES",
        description="Lifetime of access tokens in minutes.",
    )
    refresh_token_expires_minutes: int = Field(
        60 * 24 * 7,
        alias="AUTH_REFRESH_TOKEN_EXPIRES_MINUTES",
        description="Lifetime of refresh tokens in minutes.",
    )
    auth_cookie_secure: bool = Field(
        False,
        alias="AUTH_COOKIE_SECURE",
        description="Mark authentication cookies as Secure.",
    )
    force_https_redirect: bool = Field(
        False,
        alias="FORCE_HTTPS_REDIRECT",
        description="Redirect inbound HTTP traffic to HTTPS.",
    )
    hsts_max_age: int = Field(
        31536000,
        alias="HSTS_MAX_AGE",
        description="Max-age value for the Strict-Transport-Security header.",
        ge=0,
    )
    admin_invite_code: Optional[str] = Field(
        None,
        alias="ADMIN_INVITE_CODE",
        description="Invite code to grant admin privileges on registration.",
    )
    security_invite_code: Optional[str] = Field(
        None,
        alias="SECURITY_INVITE_CODE",
        description="Invite code to grant security officer role.",
    )
    initial_admin_email: Optional[EmailStr] = Field(
        None,
        alias="INITIAL_ADMIN_EMAIL",
        description="Bootstrap admin email. Used only if no admins exist.",
    )
    initial_admin_password: Optional[str] = Field(
        None,
        alias="INITIAL_ADMIN_PASSWORD",
        description="Bootstrap admin password. Used only if no admins exist.",
    )
    initial_admin_full_name: Optional[str] = Field(
        "System Admin",
        alias="INITIAL_ADMIN_FULL_NAME",
        description="Display name for bootstrap admin.",
    )
    user_store_path: Path = Field(
        default=Path(__file__).resolve().parent / "data" / "users.json",
        alias="USER_STORE_PATH",
        description="Path to the JSON file used for storing user accounts.",
    )
    database_url: str = Field(
        default=f"sqlite:///{(Path(__file__).resolve().parent / 'data' / 'metadata.db').as_posix()}",
        alias="DATABASE_URL",
        description="SQLAlchemy connection string for metadata persistence (PostgreSQL recommended).",
    )
    object_storage_endpoint_url: Optional[AnyHttpUrl] = Field(
        None,
        validation_alias=AliasChoices("OBJECT_STORAGE_ENDPOINT_URL", "MINIO_ENDPOINT"),
        description="Endpoint URL of the S3-compatible object storage.",
    )
    object_storage_access_key: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("OBJECT_STORAGE_ACCESS_KEY", "MINIO_ACCESS_KEY"),
        description="Access key for the S3-compatible object storage.",
    )
    object_storage_secret_key: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("OBJECT_STORAGE_SECRET_KEY", "MINIO_SECRET_KEY"),
        description="Secret key for the object storage.",
    )
    object_storage_region: Optional[str] = Field(
        None,
        alias="OBJECT_STORAGE_REGION",
        description="Region name for the object storage service.",
    )
    object_storage_bucket: str = Field(
        "insight-artifacts",
        validation_alias=AliasChoices("OBJECT_STORAGE_BUCKET", "MINIO_BUCKET"),
        description="Bucket used for storing uploaded datasets.",
    )
    object_storage_path_style: bool = Field(
        True,
        alias="OBJECT_STORAGE_PATH_STYLE",
        description="Use path-style addressing when talking to the object storage (required for MinIO).",
    )

    host_agent_token: Optional[str] = Field(
        None,
        alias="HOST_AGENT_TOKEN",
        description="Shared secret token for host protection telemetry ingestion.",
    )
    object_storage_use_ssl: bool = Field(
        False,
        alias="OBJECT_STORAGE_USE_SSL",
        description="Use HTTPS when communicating with the object storage endpoint.",
    )
    object_storage_local_root: Path = Field(
        default=Path(__file__).resolve().parent / "uploads",
        alias="OBJECT_STORAGE_LOCAL_ROOT",
        description="Local directory where uploaded files are persisted for processing.",
    )
    sentry_dsn: Optional[AnyUrl] = Field(
        None,
        alias="SENTRY_DSN",
        description="Sentry DSN for centralized exception reporting.",
    )
    sentry_traces_sample_rate: float = Field(
        0.0,
        alias="SENTRY_TRACES_SAMPLE_RATE",
        description="Sample rate for Sentry distributed tracing (0..1).",
        ge=0.0,
        le=1.0,
    )
    otel_exporter_otlp_endpoint: Optional[AnyHttpUrl] = Field(
        None,
        alias="OTEL_EXPORTER_OTLP_ENDPOINT",
        description="OTLP collector endpoint for OpenTelemetry traces.",
    )
    otel_exporter_otlp_headers: Optional[str] = Field(
        None,
        alias="OTEL_EXPORTER_OTLP_HEADERS",
        description="Comma separated headers for OTLP exporter (key=value).",
    )
    otel_exporter_otlp_insecure: bool = Field(
        False,
        alias="OTEL_EXPORTER_OTLP_INSECURE",
        description="Allow insecure transport when exporting traces.",
    )
    log_level: str = Field(
        "INFO",
        alias="LOG_LEVEL",
        description="Base log level for structured logging.",
    )
    log_file_path: Path = Field(
        default=Path(__file__).resolve().parent / "data" / "system.log",
        alias="LOG_FILE_PATH",
        description="Filesystem path where structured application logs are stored.",
    )

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("api_prefix", mode="before")
    def _normalize_prefix(cls, value: str) -> str:
        candidate = value.strip() or "/api/v1"
        if not candidate.startswith("/"):
            candidate = f"/{candidate}"
        return candidate.rstrip("/") or "/api"

    @field_validator("allowed_upload_extensions", mode="before")
    def _split_allowed_extensions(cls, value):
        if isinstance(value, str):
            return [ext.strip() for ext in value.split(",") if ext.strip()]
        return value

    @field_validator("clamav_scan_url", "alert_webhook_url", mode="before")
    def _empty_string_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("sentry_dsn", "otel_exporter_otlp_endpoint", mode="before")
    def _optional_url_empty_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("initial_admin_email", "initial_admin_password", mode="before")
    def _optional_seed_empty(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def additional_origins(self) -> List[str]:
        return [origin.strip() for origin in self.additional_cors_origins.split(",") if origin.strip()]

    @property
    def allowed_host_list(self) -> List[str]:
        hosts = [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]
        hosts.extend(["127.0.0.1", "localhost", "testserver"])
        # remove duplicates while preserving order
        seen = set()
        deduped = []
        for host in hosts:
            if host not in seen:
                seen.add(host)
                deduped.append(host)
        return deduped

    @property
    def max_upload_size(self) -> int:
        return int(self.max_upload_size_mb) * 1024 * 1024

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        return (
            init_settings,
            _make_source_lenient(env_settings),
            _make_source_lenient(dotenv_settings),
            file_secret_settings,
        )


@lru_cache()
def get_settings() -> Settings:
    """Return cached :class:`Settings` instance."""

    return Settings()  # type: ignore[call-arg]
