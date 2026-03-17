from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config import get_settings


MessengerRecord = Dict[str, Any]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_MESSENGER_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "messenger.json"


class MessengerStore:
    def __init__(self, storage_path: Path) -> None:
        self._path = Path(storage_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        if not self._path.exists():
            self._write(
                {
                    "profiles": {},
                    "devices": {},
                    "spaces": {},
                    "messages": {},
                    "attachments": {},
                }
            )

    def _read(self) -> Dict[str, Any]:
        try:
            with self._path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            payload = {}
        return {
            "profiles": payload.get("profiles", {}),
            "devices": payload.get("devices", {}),
            "spaces": payload.get("spaces", {}),
            "messages": payload.get("messages", {}),
            "attachments": payload.get("attachments", {}),
        }

    def _write(self, payload: Dict[str, Any]) -> None:
        tmp = self._path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        tmp.replace(self._path)

    def get_profile(self, user_id: str) -> Dict[str, Any]:
        with self._lock:
            state = self._read()
            return dict(state["profiles"].get(user_id, {}))

    def update_profile(self, user_id: str, profile: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            state = self._read()
            existing = dict(state["profiles"].get(user_id, {}))
            existing.update({key: value for key, value in profile.items() if value is not None})
            existing["updated_at"] = _utcnow().isoformat()
            state["profiles"][user_id] = existing
            self._write(state)
            return dict(existing)

    def register_device(
        self,
        *,
        user_id: str,
        label: str,
        device_kind: str,
        identity_key: Dict[str, Any],
        prekey_bundle: Dict[str, Any],
    ) -> MessengerRecord:
        now = _utcnow().isoformat()
        record = {
            "id": uuid.uuid4().hex,
            "user_id": user_id,
            "label": label.strip(),
            "device_kind": device_kind,
            "identity_key": identity_key,
            "prekey_bundle": prekey_bundle,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "last_seen_at": now,
        }
        with self._lock:
            state = self._read()
            state["devices"][record["id"]] = record
            self._write(state)
        return dict(record)

    def list_devices(self, user_id: Optional[str] = None, *, active_only: bool = False) -> List[MessengerRecord]:
        with self._lock:
            state = self._read()
            items = list(state["devices"].values())
        if user_id:
            items = [item for item in items if item.get("user_id") == user_id]
        if active_only:
            items = [item for item in items if item.get("is_active", True)]
        items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return [dict(item) for item in items]

    def deactivate_device(self, user_id: str, device_id: str) -> Optional[MessengerRecord]:
        with self._lock:
            state = self._read()
            record = state["devices"].get(device_id)
            if not record or record.get("user_id") != user_id:
                return None
            record["is_active"] = False
            record["updated_at"] = _utcnow().isoformat()
            state["devices"][device_id] = record
            self._write(state)
            return dict(record)

    def create_space(
        self,
        *,
        title: str,
        space_type: str,
        description: Optional[str],
        member_ids: List[str],
        created_by: str,
    ) -> MessengerRecord:
        now = _utcnow().isoformat()
        unique_members = list(dict.fromkeys(member_ids))
        record = {
            "id": uuid.uuid4().hex,
            "title": title.strip(),
            "type": space_type,
            "description": (description or "").strip(),
            "member_ids": unique_members,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "last_message_id": None,
        }
        with self._lock:
            state = self._read()
            state["spaces"][record["id"]] = record
            self._write(state)
        return dict(record)

    def get_space(self, space_id: str) -> Optional[MessengerRecord]:
        with self._lock:
            state = self._read()
            space = state["spaces"].get(space_id)
            return dict(space) if space else None

    def list_spaces_for_user(self, user_id: str) -> List[MessengerRecord]:
        with self._lock:
            state = self._read()
            spaces = [item for item in state["spaces"].values() if user_id in item.get("member_ids", [])]
            messages = state["messages"]
        spaces.sort(
            key=lambda item: messages.get(item.get("last_message_id") or "", {}).get("created_at", item.get("updated_at", "")),
            reverse=True,
        )
        return [dict(item) for item in spaces]

    def save_attachment(
        self,
        *,
        owner_user_id: str,
        storage_bucket: str,
        storage_key: str,
        media_kind: str,
        encrypted_metadata: Dict[str, Any],
        original_filename: str,
        content_type: str,
        size_bytes: int,
        sha256: str,
    ) -> MessengerRecord:
        now = _utcnow().isoformat()
        record = {
            "id": uuid.uuid4().hex,
            "owner_user_id": owner_user_id,
            "storage_bucket": storage_bucket,
            "storage_key": storage_key,
            "media_kind": media_kind,
            "encrypted_metadata": encrypted_metadata,
            "original_filename": original_filename,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "sha256": sha256,
            "created_at": now,
        }
        with self._lock:
            state = self._read()
            state["attachments"][record["id"]] = record
            self._write(state)
        return dict(record)

    def get_attachment(self, attachment_id: str) -> Optional[MessengerRecord]:
        with self._lock:
            state = self._read()
            attachment = state["attachments"].get(attachment_id)
            return dict(attachment) if attachment else None

    def create_message(
        self,
        *,
        space_id: str,
        sender_user_id: str,
        sender_device_id: str,
        client_message_id: Optional[str],
        message_type: str,
        encrypted_payload: Dict[str, Any],
        envelopes: List[Dict[str, Any]],
        attachment_ids: List[str],
    ) -> MessengerRecord:
        now = _utcnow().isoformat()
        record = {
            "id": uuid.uuid4().hex,
            "space_id": space_id,
            "sender_user_id": sender_user_id,
            "sender_device_id": sender_device_id,
            "client_message_id": client_message_id,
            "message_type": message_type,
            "encrypted_payload": encrypted_payload,
            "envelopes": envelopes,
            "attachment_ids": attachment_ids,
            "created_at": now,
        }
        with self._lock:
            state = self._read()
            state["messages"][record["id"]] = record
            if space_id in state["spaces"]:
                state["spaces"][space_id]["last_message_id"] = record["id"]
                state["spaces"][space_id]["updated_at"] = now
            self._write(state)
        return dict(record)

    def get_message(self, message_id: str) -> Optional[MessengerRecord]:
        with self._lock:
            state = self._read()
            message = state["messages"].get(message_id)
            return dict(message) if message else None

    def update_message(
        self,
        *,
        message_id: str,
        encrypted_payload: Dict[str, Any],
        envelopes: List[Dict[str, Any]],
        message_type: str,
    ) -> Optional[MessengerRecord]:
        now = _utcnow().isoformat()
        with self._lock:
            state = self._read()
            record = state["messages"].get(message_id)
            if not record:
                return None
            record["encrypted_payload"] = encrypted_payload
            record["envelopes"] = envelopes
            record["message_type"] = message_type
            record["updated_at"] = now
            record["edited_at"] = now
            record["is_edited"] = True
            state["messages"][message_id] = record
            self._write(state)
            return dict(record)

    def delete_message(self, *, message_id: str) -> Optional[MessengerRecord]:
        now = _utcnow().isoformat()
        with self._lock:
            state = self._read()
            record = state["messages"].get(message_id)
            if not record:
                return None
            record["deleted_at"] = now
            record["updated_at"] = now
            record["is_deleted"] = True
            record["attachment_ids"] = []
            record["encrypted_payload"] = None
            record["envelopes"] = []
            state["messages"][message_id] = record
            self._write(state)
            return dict(record)

    def list_messages_for_space(
        self,
        space_id: str,
        *,
        limit: int = 100,
        before: Optional[str] = None,
    ) -> List[MessengerRecord]:
        with self._lock:
            state = self._read()
            items = [item for item in state["messages"].values() if item.get("space_id") == space_id]
        items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        if before:
            items = [item for item in items if item.get("created_at", "") < before]
        return [dict(item) for item in items[:limit]]


@lru_cache()
def _messenger_store_for_path(path: str) -> MessengerStore:
    candidate = Path(path)
    try:
        return MessengerStore(candidate)
    except OSError:
        return MessengerStore(DEFAULT_MESSENGER_STORE_PATH)


def get_messenger_store() -> MessengerStore:
    settings = get_settings()
    return _messenger_store_for_path(str(settings.messenger_store_path))
