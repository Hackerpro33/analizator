from __future__ import annotations

import json
import platform
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from .config import get_settings
from .security import get_current_user, require_roles
from .services.user_store import UserRecord
from .version import __version__

try:  # optional dependency
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]


router = APIRouter(
    prefix="/system",
    tags=["system"],
    dependencies=[Depends(get_current_user)],
)

_NETWORK_SAMPLE = {
    "timestamp": time.time(),
    "bytes_sent": (psutil.net_io_counters().bytes_sent if psutil and psutil.net_io_counters() else 0),
    "bytes_recv": (psutil.net_io_counters().bytes_recv if psutil and psutil.net_io_counters() else 0),
}


def _log_path() -> Path:
    return Path(get_settings().log_file_path)


def _sample_network() -> Dict[str, float]:
    if not psutil:
        return {"download_mbps": 0.0, "upload_mbps": 0.0}
    counters = psutil.net_io_counters()
    if not counters:
        return {"download_mbps": 0.0, "upload_mbps": 0.0}
    now = time.time()
    elapsed = max(now - _NETWORK_SAMPLE["timestamp"], 1e-3)
    download_rate = (counters.bytes_recv - _NETWORK_SAMPLE["bytes_recv"]) * 8 / 1_000_000 / elapsed
    upload_rate = (counters.bytes_sent - _NETWORK_SAMPLE["bytes_sent"]) * 8 / 1_000_000 / elapsed
    _NETWORK_SAMPLE.update(
        {
            "timestamp": now,
            "bytes_recv": counters.bytes_recv,
            "bytes_sent": counters.bytes_sent,
        }
    )
    return {
        "download_mbps": max(download_rate, 0.0),
        "upload_mbps": max(upload_rate, 0.0),
    }


def _database_info() -> Dict[str, Optional[float]]:
    settings = get_settings()
    database_url = settings.database_url
    info: Dict[str, Optional[float]] = {
        "status": "unknown",
        "size_bytes": None,
        "path": None,
        "type": "external",
        "last_backup": None,
        "active_queries": None,
    }
    if database_url.startswith("sqlite:///"):
        info["type"] = "sqlite"
        path = Path(database_url.split("///", 1)[1])
        info["path"] = str(path)
        if path.exists():
            info["status"] = "online"
            info["size_bytes"] = path.stat().st_size
        else:
            info["status"] = "missing"
    else:
        info["status"] = "external"
    return info


@router.get("/metrics")
def metrics() -> Dict[str, object]:
    if not psutil:
        return {
            "psutil_available": False,
            "cpu_percent": None,
            "memory_percent": None,
            "disk_percent": None,
            "uptime_seconds": None,
            "active_connections": None,
            "network": _sample_network(),
            "process_count": None,
            "system": {
                "version": __version__,
                "platform": platform.platform(),
                "python": platform.python_version(),
                "service_name": get_settings().service_name,
            },
            "database": _database_info(),
            "timestamp": time.time(),
        }

    vm = psutil.virtual_memory()
    cpu_percent = psutil.cpu_percent(interval=None)
    disk_percent = psutil.disk_usage(get_settings().object_storage_local_root).percent
    try:
        connections = len(psutil.net_connections(kind="inet"))
    except (psutil.AccessDenied, psutil.Error):
        connections = None
    network = _sample_network()
    uptime_seconds = max(time.time() - psutil.boot_time(), 0.0)

    return {
        "psutil_available": True,
        "cpu_percent": cpu_percent,
        "memory_percent": vm.percent,
        "disk_percent": disk_percent,
        "uptime_seconds": uptime_seconds,
        "active_connections": connections,
        "network": network,
        "process_count": len(psutil.pids()),
        "system": {
            "version": __version__,
            "platform": platform.platform(),
            "python": platform.python_version(),
            "service_name": get_settings().service_name,
        },
        "database": _database_info(),
        "timestamp": time.time(),
    }


def _collect_logs(limit: int, level: Optional[str], query: Optional[str]) -> List[Dict[str, Any]]:
    path = _log_path()
    if not path.exists():
        return []
    normalized_level = level.lower() if level else None
    normalized_query = query.lower() if query else None
    window: Deque[Dict[str, Any]] = deque(maxlen=limit)
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            log_level = str(payload.get("level", "")).lower()
            if normalized_level and log_level != normalized_level:
                continue
            haystack = " ".join(
                str(payload.get(field, "")).lower()
                for field in ("message", "logger", "event", "request_id")
            )
            if normalized_query and normalized_query not in haystack:
                continue
            window.append(
                {
                    "timestamp": payload.get("timestamp"),
                    "level": payload.get("level"),
                    "message": payload.get("message"),
                    "logger": payload.get("logger"),
                    "extra": {
                        key: value
                        for key, value in payload.items()
                        if key not in {"timestamp", "level", "message", "logger"}
                    },
                }
            )
    entries = list(window)
    entries.reverse()
    return entries


@router.get("/logs")
def list_logs(
    limit: int = 200,
    level: Optional[str] = None,
    query: Optional[str] = None,
    current_user: UserRecord = Depends(require_roles("admin", "security")),
) -> Dict[str, Any]:
    safe_limit = max(1, min(limit, 1000))
    items = _collect_logs(safe_limit, level, query)
    return {"items": items, "count": len(items)}


@router.get("/logs/download")
def download_logs(
    _: UserRecord = Depends(require_roles("admin")),
) -> FileResponse:
    path = _log_path()
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log file not found")
    filename = f"system_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.log"
    return FileResponse(path, media_type="text/plain", filename=filename)
