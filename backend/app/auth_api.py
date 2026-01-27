from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field

from .config import get_settings
from .security import (
    clear_auth_cookies,
    create_access_token,
    create_refresh_token,
    get_refresh_payload,
    get_current_user,
    hash_password,
    set_auth_cookies,
    verify_password,
)
from .services.user_store import UserRecord, UserStore, get_user_store, redact_user


router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    invite_code: Optional[str] = Field(default=None, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    user: dict
    token_type: str = "Bearer"
    expires_in: int


def _assign_role(store: UserStore, invite_code: Optional[str]) -> str:
    settings = get_settings()
    if not store.has_role("admin"):
        return "admin"
    if invite_code:
        if settings.admin_invite_code and secrets.compare_digest(invite_code, settings.admin_invite_code):
            return "admin"
        if settings.security_invite_code and secrets.compare_digest(invite_code, settings.security_invite_code):
            return "security"
    return "user"


def _issue_tokens(response: Response, user: UserRecord) -> AuthResponse:
    settings = get_settings()
    access_token = create_access_token(user)
    refresh_token = create_refresh_token(user)
    set_auth_cookies(response, access_token, refresh_token)
    return AuthResponse(user=redact_user(user), expires_in=settings.access_token_expires_minutes * 60)


def _bootstrap_admin_if_needed(store: UserStore) -> None:
    settings = get_settings()
    if not settings.initial_admin_email or not settings.initial_admin_password:
        return
    hashed = hash_password(settings.initial_admin_password)
    store.ensure_admin_seed(
        email=settings.initial_admin_email,
        hashed_password=hashed,
        full_name=settings.initial_admin_full_name or "System Admin",
    )


@router.post("/register", response_model=AuthResponse)
def register_user(payload: RegisterRequest, response: Response, store: UserStore = Depends(get_user_store)) -> AuthResponse:
    _bootstrap_admin_if_needed(store)
    if store.find_by_email(payload.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
    role = _assign_role(store, payload.invite_code)
    hashed_password = hash_password(payload.password)
    user = store.create_user(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hashed_password,
        role=role,
    )
    return _issue_tokens(response, user)


@router.post("/login", response_model=AuthResponse)
def login_user(payload: LoginRequest, response: Response, store: UserStore = Depends(get_user_store)) -> AuthResponse:
    _bootstrap_admin_if_needed(store)
    user = store.find_by_email(payload.email)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    store.mark_login(user["id"])
    fresh_user = store.get_user(user["id"]) or user
    return _issue_tokens(response, fresh_user)


@router.post("/logout", status_code=204)
def logout_user(response: Response) -> None:
    clear_auth_cookies(response)


@router.get("/me")
def me(current_user: UserRecord = Depends(get_current_user)) -> dict:
    return redact_user(current_user)


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


@router.patch("/me")
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: UserRecord = Depends(get_current_user),
    store: UserStore = Depends(get_user_store),
) -> dict:
    updates: dict = {}
    if payload.full_name:
        updates["full_name"] = payload.full_name.strip()
    if payload.password:
        updates["hashed_password"] = hash_password(payload.password)
    if not updates:
        return {"user": redact_user(current_user)}
    updated = store.update_user(current_user["id"], **updates)
    return {"user": redact_user(updated)}


@router.post("/refresh", response_model=AuthResponse)
def refresh_session(response: Response, store: UserStore = Depends(get_user_store), payload: dict = Depends(get_refresh_payload)) -> AuthResponse:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = store.get_user(user_id)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
    return _issue_tokens(response, user)
