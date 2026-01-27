from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .security import require_roles
from .services.user_store import UserRecord, UserStore, get_user_store, redact_user


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles("admin"))],
)


class UserUpdateRequest(BaseModel):
    role: Optional[Literal["admin", "security", "security_viewer", "user"]] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)


@router.get("/users")
def list_users(store: UserStore = Depends(get_user_store)) -> dict:
    return {"items": [redact_user(user) for user in store.list_users()]}


@router.patch("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdateRequest, store: UserStore = Depends(get_user_store)) -> dict:
    user = store.get_user(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    updates = {}
    if payload.role:
        if payload.role != user["role"]:
            if user["role"] == "admin" and payload.role != "admin" and store.count_admins() <= 1:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove last admin")
            updates["role"] = payload.role
    if payload.is_active is not None:
        if user["role"] == "admin" and not payload.is_active and store.count_admins() <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate last admin")
        updates["is_active"] = payload.is_active
    if payload.full_name:
        updates["full_name"] = payload.full_name.strip()
    if not updates:
        return {"user": redact_user(user)}
    updated = store.update_user(user_id, **updates)
    return {"user": redact_user(updated)}
