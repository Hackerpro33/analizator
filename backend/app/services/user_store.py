from __future__ import annotations

import json
import secrets
import threading
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import EmailStr

from ..config import get_settings


UserRecord = Dict[str, Any]


class UserStore:
    """File backed user registry with optimistic concurrency control."""

    def __init__(self, storage_path: Path):
        self._path = Path(storage_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._path.write_text("[]", encoding="utf-8")
        self._lock = threading.Lock()

    def _read(self) -> List[UserRecord]:
        with self._path.open("r", encoding="utf-8") as handle:
            try:
                data = json.load(handle)
            except json.JSONDecodeError:
                data = []
        if not isinstance(data, list):
            return []
        return data

    def _write(self, payload: List[UserRecord]) -> None:
        tmp_path = self._path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        tmp_path.replace(self._path)

    def list_users(self) -> List[UserRecord]:
        with self._lock:
            return list(self._read())

    def get_user(self, user_id: str) -> Optional[UserRecord]:
        with self._lock:
            for user in self._read():
                if user["id"] == user_id:
                    return dict(user)
        return None

    def find_by_email(self, email: str) -> Optional[UserRecord]:
        normalized = email.lower()
        with self._lock:
            for user in self._read():
                if user["email"] == normalized:
                    return dict(user)
        return None

    def has_role(self, role: str) -> bool:
        with self._lock:
            return any(user.get("role") == role for user in self._read())

    def count_admins(self) -> int:
        with self._lock:
            return sum(1 for user in self._read() if user.get("role") == "admin")

    def create_user(
        self,
        *,
        email: EmailStr,
        full_name: str,
        hashed_password: str,
        role: str,
        is_active: bool = True,
    ) -> UserRecord:
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "id": str(uuid.uuid4()),
            "email": email.lower(),
            "full_name": full_name.strip(),
            "hashed_password": hashed_password,
            "role": role,
            "is_active": is_active,
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        }
        with self._lock:
            users = self._read()
            if any(user["email"] == record["email"] for user in users):
                raise ValueError("User with this email already exists")
            users.append(record)
            self._write(users)
        return dict(record)

    def update_user(self, user_id: str, **changes: Any) -> UserRecord:
        with self._lock:
            users = self._read()
            updated: Optional[UserRecord] = None
            for index, user in enumerate(users):
                if user["id"] == user_id:
                    candidate = dict(user)
                    candidate.update(changes)
                    candidate["updated_at"] = datetime.now(timezone.utc).isoformat()
                    users[index] = candidate
                    updated = candidate
                    break
            if not updated:
                raise KeyError(f"user {user_id} not found")
            self._write(users)
        return dict(updated)

    def mark_login(self, user_id: str) -> None:
        self.update_user(user_id, last_login_at=datetime.now(timezone.utc).isoformat())

    def ensure_admin_seed(self, *, email: EmailStr, hashed_password: str, full_name: str) -> Optional[UserRecord]:
        with self._lock:
            users = self._read()
            if any(user.get("role") == "admin" for user in users):
                return None
            now = datetime.now(timezone.utc).isoformat()
            record = {
                "id": str(uuid.uuid4()),
                "email": email.lower(),
                "full_name": full_name.strip() or "System Admin",
                "hashed_password": hashed_password,
                "role": "admin",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
                "last_login_at": None,
            }
            users.append(record)
            self._write(users)
        return dict(record)


def redact_user(user: UserRecord) -> Dict[str, Any]:
    result = {
        "id": user["id"],
        "email": user["email"],
        "full_name": user.get("full_name") or "",
        "role": user.get("role", "user"),
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
        "last_login_at": user.get("last_login_at"),
    }
    return result


def mask_email(email: str) -> str:
    username, _, domain = email.partition("@")
    if not domain:
        return email
    if len(username) <= 2:
        obscured = username[0] + "*"
    else:
        obscured = username[0] + "*" * (len(username) - 2) + username[-1]
    return f"{obscured}@{domain}"


def generate_invite_code(length: int = 32) -> str:
    return secrets.token_urlsafe(length)[:length]


@lru_cache()
def get_user_store() -> UserStore:
    settings = get_settings()
    return UserStore(Path(settings.user_store_path))
