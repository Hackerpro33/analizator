from __future__ import annotations

from fastapi import APIRouter, Depends

from .security import get_current_user
from .services.user_store import UserRecord, UserStore, get_user_store, redact_user


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/overview")
def users_overview(
    current_user: UserRecord = Depends(get_current_user),
    store: UserStore = Depends(get_user_store),
) -> dict:
    items = [redact_user(user) for user in store.list_users()]
    total_users = len(items)
    active_users = sum(1 for entry in items if entry.get("is_active"))
    role_counts = {}
    for entry in items:
        role = entry.get("role", "user")
        role_counts[role] = role_counts.get(role, 0) + 1

    stats = {
        "total": total_users,
        "active": active_users,
        "admins": role_counts.get("admin", 0),
        "security": role_counts.get("security", 0),
        "users": role_counts.get("user", 0),
    }
    return {
        "current_user": redact_user(current_user),
        "items": items,
        "stats": stats,
        "can_manage": current_user.get("role") == "admin",
    }
