from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import get_settings
from .security import ACCESS_COOKIE_NAME, get_current_user, resolve_user_from_access_token
from .services.metadata_repository import get_model_tracking_repository
from .services.messenger_store import MessengerStore, get_messenger_store
from .services.object_storage import get_object_storage
from .services.user_store import UserRecord, UserStore, get_user_store, redact_user


router = APIRouter(
    prefix="/messenger",
    tags=["messenger"],
)
ws_router = APIRouter(prefix="/messenger", tags=["messenger"])


def _space_label(space_type: str) -> str:
    if space_type == "channel":
        return "Канал"
    if space_type == "group":
        return "Группа"
    return "Диалог"


def _merge_profile(user: UserRecord, profile: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **redact_user(user),
        "status": profile.get("status") or "",
        "phone": profile.get("phone") or "",
        "telegram": profile.get("telegram") or "",
        "department": profile.get("department") or "",
        "silent_mode": bool(profile.get("silent_mode", False)),
        "avatar_attachment_id": profile.get("avatar_attachment_id"),
    }


def _record_audit(request: Optional[Request], user_id: Optional[str], action: str, resource: str, payload: Dict[str, Any]) -> None:
    repo = get_model_tracking_repository()
    repo.record_audit_event(
        user_id=user_id,
        action=action,
        resource=resource,
        payload=payload,
        ip_address=request.client.host if request and request.client else None,
        request_id=getattr(request.state, "request_id", None) if request else None,
    )


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(user_id, []).append(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id, [])
            if websocket in sockets:
                sockets.remove(websocket)
            if not sockets and user_id in self._connections:
                self._connections.pop(user_id, None)

    async def send_user_event(self, user_id: str, event: Dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._connections.get(user_id, []))
        stale: List[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(event)
            except RuntimeError:
                stale.append(socket)
        for socket in stale:
            await self.disconnect(user_id, socket)


connection_manager = ConnectionManager()


class MessengerProfilePatch(BaseModel):
    status: Optional[str] = Field(default=None, max_length=280)
    phone: Optional[str] = Field(default=None, max_length=64)
    telegram: Optional[str] = Field(default=None, max_length=128)
    department: Optional[str] = Field(default=None, max_length=128)
    silent_mode: Optional[bool] = None
    avatar_attachment_id: Optional[str] = Field(default=None, max_length=128)


class DeviceRegisterRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    device_kind: Literal["web", "desktop", "mobile"] = "web"
    identity_key: Dict[str, Any]
    prekey_bundle: Dict[str, Any]


class CreateSpaceRequest(BaseModel):
    type: Literal["direct", "group", "channel"]
    title: str = Field(min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=500)
    member_ids: List[str] = Field(default_factory=list)


class SpaceMembershipPatch(BaseModel):
    add_member_ids: List[str] = Field(default_factory=list)
    remove_member_ids: List[str] = Field(default_factory=list)
    grant_admin_ids: List[str] = Field(default_factory=list)
    revoke_admin_ids: List[str] = Field(default_factory=list)


class CreateMessageRequest(BaseModel):
    sender_device_id: str = Field(min_length=1, max_length=128)
    client_message_id: Optional[str] = Field(default=None, max_length=128)
    message_type: Literal["text", "voice", "image", "document", "file", "video_note", "mixed"] = "text"
    encrypted_payload: Dict[str, Any]
    envelopes: List[Dict[str, Any]] = Field(default_factory=list)
    attachment_ids: List[str] = Field(default_factory=list)


class UpdateMessageRequest(BaseModel):
    message_type: Literal["text", "mixed"] = "text"
    encrypted_payload: Dict[str, Any]
    envelopes: List[Dict[str, Any]] = Field(default_factory=list)


def _resolve_space_payload(
    *,
    space: Dict[str, Any],
    store: MessengerStore,
    user_store: UserStore,
) -> Dict[str, Any]:
    users = {user["id"]: user for user in user_store.list_users()}
    profiles = {user_id: store.get_profile(user_id) for user_id in space.get("member_ids", [])}
    last_message = None
    if space.get("last_message_id"):
        messages = store.list_messages_for_space(space["id"], limit=1)
        if messages:
            last_message = messages[0]
    return {
        "id": space["id"],
        "title": space["title"],
        "type": space["type"],
        "label": _space_label(space["type"]),
        "description": space.get("description") or "",
        "member_ids": space.get("member_ids", []),
        "admin_user_ids": space.get("admin_user_ids", [space.get("created_by")]),
        "members": [
            _merge_profile(users[member_id], profiles.get(member_id, {}))
            for member_id in space.get("member_ids", [])
            if member_id in users
        ],
        "created_by": space.get("created_by"),
        "created_at": space.get("created_at"),
        "updated_at": space.get("updated_at"),
        "can_manage_members": False,
        "last_message": (
            {
                "id": last_message["id"],
                "message_type": last_message["message_type"],
                "created_at": last_message["created_at"],
            }
            if last_message
            else None
        ),
    }


def _resolve_message_payload(
    *,
    message: Dict[str, Any],
    store: MessengerStore,
    user_store: UserStore,
) -> Dict[str, Any]:
    sender = user_store.get_user(message["sender_user_id"])
    attachments = []
    for attachment_id in message.get("attachment_ids", []):
        attachment = store.get_attachment(attachment_id)
        if attachment:
            attachments.append(attachment)
    return {
        "id": message["id"],
        "space_id": message["space_id"],
        "sender_user_id": message["sender_user_id"],
        "sender_device_id": message["sender_device_id"],
        "sender": redact_user(sender) if sender else None,
        "client_message_id": message.get("client_message_id"),
        "message_type": message["message_type"],
        "encrypted_payload": message["encrypted_payload"],
        "envelopes": message.get("envelopes", []),
        "attachments": attachments,
        "created_at": message["created_at"],
        "updated_at": message.get("updated_at"),
        "edited_at": message.get("edited_at"),
        "deleted_at": message.get("deleted_at"),
        "is_edited": bool(message.get("is_edited")),
        "is_deleted": bool(message.get("is_deleted")),
    }


@router.get("/bootstrap")
def get_bootstrap(
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    settings = get_settings()
    profile = _merge_profile(current_user, store.get_profile(current_user["id"]))
    spaces = [
        {
            **_resolve_space_payload(space=space, store=store, user_store=user_store),
            "can_manage_members": current_user["id"] in space.get("admin_user_ids", [space.get("created_by")]),
        }
        for space in store.list_spaces_for_user(current_user["id"])
    ]
    devices = store.list_devices(current_user["id"], active_only=False)
    return {
        "profile": profile,
        "spaces": spaces,
        "devices": devices,
        "rtc": {
            "ice_servers": settings.messenger_ice_servers_config,
        },
    }


@router.get("/directory")
def get_directory(
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    items = [
        _merge_profile(user, store.get_profile(user["id"]))
        for user in user_store.list_users()
        if user.get("is_active", True)
    ]
    _record_audit(None, current_user["id"], "messenger.directory.read", "/messenger/directory", {"count": len(items)})
    return {"items": items}


@router.get("/profile")
def get_profile(
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> Dict[str, Any]:
    return _merge_profile(current_user, store.get_profile(current_user["id"]))


@router.patch("/profile")
def patch_profile(
    payload: MessengerProfilePatch,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> Dict[str, Any]:
    profile = store.update_profile(current_user["id"], payload.model_dump(exclude_none=True))
    _record_audit(
        request,
        current_user["id"],
        "messenger.profile.updated",
        "/messenger/profile",
        {"fields": sorted(payload.model_dump(exclude_none=True).keys())},
    )
    return _merge_profile(current_user, profile)


@router.get("/devices")
def list_devices(
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> Dict[str, Any]:
    return {"items": store.list_devices(current_user["id"], active_only=False)}


@router.get("/users/{user_id}/devices")
def list_user_devices(
    user_id: str,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    target_user = user_store.get_user(user_id)
    if not target_user or not target_user.get("is_active", True):
        raise HTTPException(status_code=404, detail="User not found")
    return {"items": store.list_devices(user_id, active_only=True)}


@router.post("/devices", status_code=status.HTTP_201_CREATED)
def register_device(
    payload: DeviceRegisterRequest,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> Dict[str, Any]:
    device = store.register_device(
        user_id=current_user["id"],
        label=payload.label,
        device_kind=payload.device_kind,
        identity_key=payload.identity_key,
        prekey_bundle=payload.prekey_bundle,
    )
    _record_audit(
        request,
        current_user["id"],
        "messenger.device.registered",
        "/messenger/devices",
        {"device_id": device["id"], "device_kind": device["device_kind"]},
    )
    return device


@router.delete("/devices/{device_id}")
def revoke_device(
    device_id: str,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> Dict[str, Any]:
    device = store.deactivate_device(current_user["id"], device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    _record_audit(
        request,
        current_user["id"],
        "messenger.device.revoked",
        f"/messenger/devices/{device_id}",
        {"device_id": device_id},
    )
    return {"status": "revoked", "device": device}


@router.get("/spaces")
def list_spaces(
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    items = [
        {
            **_resolve_space_payload(space=space, store=store, user_store=user_store),
            "can_manage_members": current_user["id"] in space.get("admin_user_ids", [space.get("created_by")]),
        }
        for space in store.list_spaces_for_user(current_user["id"])
    ]
    return {"items": items}


@router.post("/spaces", status_code=status.HTTP_201_CREATED)
async def create_space(
    payload: CreateSpaceRequest,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    member_ids = list(dict.fromkeys([current_user["id"], *payload.member_ids]))
    known_users = {user["id"] for user in user_store.list_users()}
    if any(member_id not in known_users for member_id in member_ids):
        raise HTTPException(status_code=400, detail="Unknown member id")
    if payload.type == "direct" and len(member_ids) != 2:
        raise HTTPException(status_code=400, detail="Direct chats must have exactly two members")
    space = store.create_space(
        title=payload.title,
        space_type=payload.type,
        description=payload.description,
        member_ids=member_ids,
        created_by=current_user["id"],
    )
    resolved = {
        **_resolve_space_payload(space=space, store=store, user_store=user_store),
        "can_manage_members": True,
    }
    _record_audit(
        request,
        current_user["id"],
        "messenger.space.created",
        "/messenger/spaces",
        {"space_id": space["id"], "type": space["type"], "member_count": len(member_ids)},
    )
    for member_id in member_ids:
        await connection_manager.send_user_event(
            member_id,
            {"type": "space.created", "space": resolved},
        )
    return resolved


@router.get("/spaces/{space_id}/messages")
def list_messages(
    space_id: str,
    limit: int = Query(100, ge=1, le=200),
    before: Optional[str] = Query(default=None),
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    space = store.get_space(space_id)
    if not space or current_user["id"] not in space.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Space not found")
    items = [
        _resolve_message_payload(message=message, store=store, user_store=user_store)
        for message in reversed(store.list_messages_for_space(space_id, limit=limit, before=before))
    ]
    return {"items": items}


@router.patch("/spaces/{space_id}/membership")
async def patch_space_membership(
    space_id: str,
    payload: SpaceMembershipPatch,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    space = store.get_space(space_id)
    if not space or current_user["id"] not in space.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Space not found")
    if space.get("type") not in {"group", "channel"}:
        raise HTTPException(status_code=400, detail="Membership can be managed only for groups and channels")

    admin_user_ids = set(space.get("admin_user_ids", [space.get("created_by")]))
    if current_user["id"] not in admin_user_ids and current_user["id"] != space.get("created_by"):
        raise HTTPException(status_code=403, detail="Only creator or delegated admins can manage members")

    known_users = {user["id"]: user for user in user_store.list_users()}
    requested_ids = set(payload.add_member_ids + payload.remove_member_ids + payload.grant_admin_ids + payload.revoke_admin_ids)
    if any(member_id not in known_users for member_id in requested_ids):
        raise HTTPException(status_code=400, detail="Unknown member id")

    updated = store.update_space_membership(
        space_id=space_id,
        add_member_ids=payload.add_member_ids,
        remove_member_ids=payload.remove_member_ids,
        grant_admin_ids=payload.grant_admin_ids,
        revoke_admin_ids=payload.revoke_admin_ids,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Space not found")
    resolved = {
        **_resolve_space_payload(space=updated, store=store, user_store=user_store),
        "can_manage_members": current_user["id"] in updated.get("admin_user_ids", [updated.get("created_by")]),
    }
    _record_audit(
        request,
        current_user["id"],
        "messenger.space.membership.updated",
        f"/messenger/spaces/{space_id}/membership",
        {
            "space_id": space_id,
            "added": payload.add_member_ids,
            "removed": payload.remove_member_ids,
            "granted_admin": payload.grant_admin_ids,
            "revoked_admin": payload.revoke_admin_ids,
        },
    )
    event = {"type": "space.updated", "space_id": space_id, "space": resolved}
    for member_id in updated.get("member_ids", []):
        await connection_manager.send_user_event(member_id, event)
    for removed_member_id in payload.remove_member_ids:
        await connection_manager.send_user_event(removed_member_id, event)
    return resolved


@router.post("/spaces/{space_id}/messages", status_code=status.HTTP_201_CREATED)
async def create_message(
    space_id: str,
    payload: CreateMessageRequest,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    space = store.get_space(space_id)
    if not space or current_user["id"] not in space.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Space not found")
    devices = {device["id"]: device for device in store.list_devices(active_only=True)}
    sender_device = devices.get(payload.sender_device_id)
    if not sender_device or sender_device.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=400, detail="Sender device is invalid or inactive")
    for attachment_id in payload.attachment_ids:
        if not store.get_attachment(attachment_id):
            raise HTTPException(status_code=400, detail=f"Attachment {attachment_id} not found")
    message = store.create_message(
        space_id=space_id,
        sender_user_id=current_user["id"],
        sender_device_id=payload.sender_device_id,
        client_message_id=payload.client_message_id,
        message_type=payload.message_type,
        encrypted_payload=payload.encrypted_payload,
        envelopes=payload.envelopes,
        attachment_ids=payload.attachment_ids,
    )
    resolved = _resolve_message_payload(message=message, store=store, user_store=user_store)
    _record_audit(
        request,
        current_user["id"],
        "messenger.message.created",
        f"/messenger/spaces/{space_id}/messages",
        {
            "space_id": space_id,
            "message_id": message["id"],
            "attachment_count": len(payload.attachment_ids),
            "envelope_count": len(payload.envelopes),
        },
    )
    event = {"type": "message.created", "space_id": space_id, "message": resolved}
    for member_id in space.get("member_ids", []):
        await connection_manager.send_user_event(member_id, event)
    return resolved


@router.patch("/spaces/{space_id}/messages/{message_id}")
async def update_message(
    space_id: str,
    message_id: str,
    payload: UpdateMessageRequest,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    space = store.get_space(space_id)
    if not space or current_user["id"] not in space.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Space not found")
    message = store.get_message(message_id)
    if not message or message.get("space_id") != space_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.get("sender_user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can edit only your own messages")
    if message.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Deleted message cannot be edited")
    if message.get("attachment_ids"):
        raise HTTPException(status_code=400, detail="Only text messages can be edited")

    updated = store.update_message(
        message_id=message_id,
        encrypted_payload=payload.encrypted_payload,
        envelopes=payload.envelopes,
        message_type=payload.message_type,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Message not found")
    resolved = _resolve_message_payload(message=updated, store=store, user_store=user_store)
    _record_audit(
        request,
        current_user["id"],
        "messenger.message.updated",
        f"/messenger/spaces/{space_id}/messages/{message_id}",
        {"space_id": space_id, "message_id": message_id},
    )
    event = {"type": "message.updated", "space_id": space_id, "message": resolved}
    for member_id in space.get("member_ids", []):
        await connection_manager.send_user_event(member_id, event)
    return resolved


@router.delete("/spaces/{space_id}/messages/{message_id}")
async def delete_message(
    space_id: str,
    message_id: str,
    request: Request,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> Dict[str, Any]:
    space = store.get_space(space_id)
    if not space or current_user["id"] not in space.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Space not found")
    message = store.get_message(message_id)
    if not message or message.get("space_id") != space_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.get("sender_user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can delete only your own messages")

    deleted = store.delete_message(message_id=message_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found")
    resolved = _resolve_message_payload(message=deleted, store=store, user_store=user_store)
    _record_audit(
        request,
        current_user["id"],
        "messenger.message.deleted",
        f"/messenger/spaces/{space_id}/messages/{message_id}",
        {"space_id": space_id, "message_id": message_id},
    )
    event = {"type": "message.deleted", "space_id": space_id, "message": resolved}
    for member_id in space.get("member_ids", []):
        await connection_manager.send_user_event(member_id, event)
    return {"status": "deleted", "message": resolved}


@router.post("/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    request: Request,
    file: UploadFile = File(...),
    media_kind: str = Form(...),
    encrypted_metadata: str = Form(default="{}"),
    sha256: Optional[str] = Form(default=None),
    duration_seconds: Optional[int] = Form(default=None),
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> Dict[str, Any]:
    settings = get_settings()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty attachment")
    if len(data) > settings.messenger_max_attachment_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Attachment exceeds the maximum allowed size")
    if media_kind == "video_note" and duration_seconds and duration_seconds > settings.messenger_max_video_note_seconds:
        raise HTTPException(status_code=400, detail="Video note exceeds the maximum allowed duration")
    try:
        metadata_payload = json.loads(encrypted_metadata or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid encrypted metadata payload") from exc

    key = f"messenger/{current_user['id']}/{uuid.uuid4().hex}/{Path(file.filename or 'blob').name}"
    storage = get_object_storage()
    location = storage.put_object(
        key=key,
        data=data,
        content_type=file.content_type or "application/octet-stream",
    )
    checksum = sha256 or hashlib.sha256(data).hexdigest()
    attachment = store.save_attachment(
        owner_user_id=current_user["id"],
        storage_bucket=location.bucket,
        storage_key=location.key,
        media_kind=media_kind,
        encrypted_metadata=metadata_payload,
        original_filename=file.filename or "blob",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        sha256=checksum,
    )
    _record_audit(
        request,
        current_user["id"],
        "messenger.attachment.uploaded",
        "/messenger/attachments",
        {"attachment_id": attachment["id"], "media_kind": media_kind, "size_bytes": len(data)},
    )
    return attachment


@router.get("/attachments/{attachment_id}")
def get_attachment(
    attachment_id: str,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> Dict[str, Any]:
    attachment = store.get_attachment(attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment


@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: str,
    current_user: UserRecord = Depends(get_current_user),
    store: MessengerStore = Depends(get_messenger_store),
) -> FileResponse:
    attachment = store.get_attachment(attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    local_path = get_object_storage().local_path_for(attachment["storage_key"])
    if not local_path.exists():
        raise HTTPException(status_code=404, detail="Attachment payload missing")
    return FileResponse(
        path=local_path,
        media_type=attachment.get("content_type") or "application/octet-stream",
        filename=attachment.get("original_filename") or local_path.name,
    )


@ws_router.websocket("/ws")
async def messenger_ws(
    websocket: WebSocket,
    store: MessengerStore = Depends(get_messenger_store),
    user_store: UserStore = Depends(get_user_store),
) -> None:
    token = websocket.query_params.get("access_token") or websocket.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        await websocket.close(code=4401)
        return
    try:
        user = resolve_user_from_access_token(token, user_store)
    except HTTPException:
        await websocket.close(code=4403)
        return

    await connection_manager.connect(user["id"], websocket)
    try:
        await websocket.send_json(
            {
                "type": "session.ready",
                "user_id": user["id"],
                "spaces": [space["id"] for space in store.list_spaces_for_user(user["id"])],
            }
        )
        while True:
            raw_message = await websocket.receive_text()
            try:
                payload = json.loads(raw_message)
            except json.JSONDecodeError:
                continue
            event_type = payload.get("type")
            if not isinstance(event_type, str) or not event_type.startswith("call."):
                continue

            space_id = payload.get("space_id")
            if not isinstance(space_id, str):
                continue
            space = store.get_space(space_id)
            if not space or user["id"] not in space.get("member_ids", []):
                continue

            target_user_id = payload.get("target_user_id")
            event = {
                **payload,
                "from_user_id": user["id"],
            }

            if isinstance(target_user_id, str) and target_user_id in space.get("member_ids", []):
                await connection_manager.send_user_event(target_user_id, event)
                continue

            for member_id in space.get("member_ids", []):
                if member_id != user["id"]:
                    await connection_manager.send_user_event(member_id, event)
    except WebSocketDisconnect:
        await connection_manager.disconnect(user["id"], websocket)
