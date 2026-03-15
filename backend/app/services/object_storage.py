from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

try:  # pragma: no cover - optional dependency during unit tests
    from botocore.config import Config
    from botocore.exceptions import BotoCoreError, ClientError, EndpointConnectionError
except ImportError:  # pragma: no cover
    Config = None  # type: ignore[assignment]
    BotoCoreError = ClientError = EndpointConnectionError = None  # type: ignore[assignment]

try:  # pragma: no cover - boto3 is provided in runtime requirements
    import boto3
except ImportError:  # pragma: no cover
    boto3 = None

from ..config import get_settings


logger = logging.getLogger(__name__)
DEFAULT_LOCAL_ROOT = Path(__file__).resolve().parent.parent / "uploads"


@dataclass
class ObjectLocation:
    bucket: str
    key: str
    url: Optional[str] = None
    checksum: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None


def _prepare_local_root(candidate: Path) -> Path:
    """Ensure ``candidate`` exists, falling back to ``DEFAULT_LOCAL_ROOT`` if needed."""
    try:
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate
    except OSError as exc:
        fallback = DEFAULT_LOCAL_ROOT
        try:
            fallback.mkdir(parents=True, exist_ok=True)
        except OSError as fallback_exc:
            raise RuntimeError(
                f"Unable to create object storage directory at {candidate} or fallback {fallback}"
            ) from fallback_exc
        logger.warning(
            "object_storage_local_root_unavailable",
            extra={
                "requested": str(candidate),
                "fallback": str(fallback),
                "error": str(exc),
            },
        )
        return fallback


class ObjectStorageClient:
    """Simple wrapper that stores artifacts in an S3-compatible bucket with local fallback."""

    def __init__(
        self,
        *,
        bucket: str,
        endpoint_url: Optional[str],
        access_key: Optional[str],
        secret_key: Optional[str],
        region_name: Optional[str],
        force_path_style: bool,
        use_ssl: bool,
        local_root: Path,
    ) -> None:
        self.bucket = bucket
        self.local_root = _prepare_local_root(Path(local_root))
        self._s3_client = None

        if (
            boto3
            and Config
            and endpoint_url
            and access_key
            and secret_key
        ):
            try:
                config = Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path" if force_path_style else "virtual"},
                )
                self._s3_client = boto3.client(
                    "s3",
                    endpoint_url=endpoint_url,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key,
                    region_name=region_name,
                    use_ssl=use_ssl,
                    config=config,
                )
                self._ensure_bucket()
            except (ClientError, BotoCoreError, EndpointConnectionError, OSError) as exc:
                self._disable_remote_backend("Failed to initialize remote object storage", exc)
        elif endpoint_url and not boto3:
            logger.warning("boto3 is not installed; falling back to local storage only")

    def _disable_remote_backend(self, message: str, exc: Exception) -> None:
        logger.warning("%s; falling back to local storage only (%s)", message, exc)
        self._s3_client = None

    def _ensure_bucket(self) -> None:
        if not self._s3_client:
            return
        try:
            self._s3_client.head_bucket(Bucket=self.bucket)
        except ClientError:
            try:
                logger.info("Creating object storage bucket %s", self.bucket)
                self._s3_client.create_bucket(Bucket=self.bucket)
            except (ClientError, BotoCoreError, EndpointConnectionError) as exc:
                self._disable_remote_backend("Failed to create remote object storage bucket", exc)
        except (BotoCoreError, EndpointConnectionError) as exc:
            self._disable_remote_backend("Remote object storage endpoint is unreachable", exc)

    def put_object(self, *, key: str, data: bytes, content_type: Optional[str]) -> ObjectLocation:
        location = ObjectLocation(bucket=self.bucket, key=key, content_type=content_type, size=len(data))
        if self._s3_client:
            try:
                self._s3_client.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    Body=data,
                    ContentType=content_type or "application/octet-stream",
                )
                location.url = f"s3://{self.bucket}/{key}"
            except (ClientError, BotoCoreError, EndpointConnectionError) as exc:  # pragma: no cover
                self._disable_remote_backend("Failed to persist object in S3 backend", exc)
        # Always persist locally for deterministic processing and tests
        local_path = self.local_root / key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(data)
        location.url = str(local_path.resolve())
        return location

    def local_path_for(self, key: str) -> Path:
        return (self.local_root / key).resolve()


@lru_cache()
def get_object_storage() -> ObjectStorageClient:
    settings = get_settings()
    endpoint_url = str(settings.object_storage_endpoint_url) if settings.object_storage_endpoint_url else None
    return ObjectStorageClient(
        bucket=settings.object_storage_bucket,
        endpoint_url=endpoint_url,
        access_key=settings.object_storage_access_key,
        secret_key=settings.object_storage_secret_key,
        region_name=settings.object_storage_region,
        force_path_style=settings.object_storage_path_style,
        use_ssl=settings.object_storage_use_ssl,
        local_root=settings.object_storage_local_root,
    )
