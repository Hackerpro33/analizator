from __future__ import annotations

import secrets
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from starlette.responses import RedirectResponse

from .config import get_settings
from .security import (
    clear_auth_cookies,
    create_access_token,
    create_email_verification_token,
    create_refresh_token,
    decode_email_verification_token,
    get_current_user,
    get_refresh_payload,
    hash_password,
    set_auth_cookies,
    verify_password,
)
from .services.email_delivery import ensure_smtp_configured, send_email
from .services.user_store import UserRecord, UserStore, get_user_store, mask_email, redact_user


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


class RegistrationResponse(BaseModel):
    status: str
    email: str
    masked_email: str
    message: str


class VerificationTokenRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


def _auth_error(
    *,
    status_code: int,
    code: str,
    message: str,
    suggestion: Optional[str] = None,
    allow_google: bool = False,
    allow_registration: bool = False,
    allow_resend_verification: bool = False,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message,
            "suggestion": suggestion,
            "allow_google": allow_google,
            "allow_registration": allow_registration,
            "allow_resend_verification": allow_resend_verification,
        },
    )


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


def _api_base_url(request: Request) -> str:
    root = str(request.base_url).rstrip("/")
    prefix = get_settings().api_prefix.rstrip("/")
    return f"{root}{prefix}"


def _frontend_redirect(status_name: str) -> str:
    origin = str(get_settings().frontend_origin).rstrip("/")
    return f"{origin}/?{urlencode({'auth': status_name})}"


def _send_verification_email(user: UserRecord, verification_url: str) -> None:
    body = (
        f"Здравствуйте, {user.get('full_name') or user['email']}!\n\n"
        "Подтвердите email, чтобы завершить регистрацию:\n"
        f"{verification_url}\n\n"
        "Если вы не создавали аккаунт, просто проигнорируйте это письмо."
    )
    send_email(
        to_email=user["email"],
        subject="Подтверждение регистрации",
        body=body,
    )


def _confirm_email(token: str, store: UserStore) -> UserRecord:
    payload = decode_email_verification_token(token)
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token")
    user = store.get_user(user_id)
    if not user or user.get("email") != str(email).lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token is no longer valid")
    if user.get("email_verified"):
        return user
    return store.update_user(user_id, email_verified=True)


def _build_google_oauth_client():
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google sign-in is not configured")
    try:
        from authlib.integrations.starlette_client import OAuth
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authlib is not installed") from exc

    oauth = OAuth()
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
    return oauth.create_client("google")


@router.post("/register", response_model=RegistrationResponse)
def register_user(
    payload: RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    store: UserStore = Depends(get_user_store),
) -> RegistrationResponse:
    _bootstrap_admin_if_needed(store)
    ensure_smtp_configured()
    if store.find_by_email(payload.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
    role = _assign_role(store, payload.invite_code)
    user = store.create_user(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=role,
    )
    token = create_email_verification_token(user)
    verification_url = f"{_api_base_url(request)}/auth/verify-email?{urlencode({'token': token})}"
    background_tasks.add_task(_send_verification_email, user, verification_url)
    return RegistrationResponse(
        status="pending_verification",
        email=user["email"],
        masked_email=mask_email(user["email"]),
        message="Account created. Check your email to verify the address.",
    )


@router.post("/login", response_model=AuthResponse)
def login_user(payload: LoginRequest, response: Response, store: UserStore = Depends(get_user_store)) -> AuthResponse:
    _bootstrap_admin_if_needed(store)
    user = store.find_by_email(payload.email)
    if not user:
        raise _auth_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="email_not_found",
            message="Аккаунт с таким email не найден.",
            suggestion="Проверьте адрес или зарегистрируйтесь. Если вы раньше входили через Google, используйте Google-вход.",
            allow_google=True,
            allow_registration=True,
        )
    if not user.get("is_active", True):
        raise _auth_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code="account_inactive",
            message="Этот аккаунт отключен.",
        )
    if not user.get("email_verified", False):
        raise _auth_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code="email_not_verified",
            message="Email ещё не подтверждён.",
            suggestion="Подтвердите email из письма или запросите письмо повторно.",
            allow_resend_verification=True,
        )
    if user.get("auth_provider") == "google" and not user.get("hashed_password"):
        raise _auth_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code="google_only_account",
            message="Этот аккаунт привязан к Google-входу.",
            suggestion="Войдите через Google для этого email.",
            allow_google=True,
        )
    if not verify_password(payload.password, user.get("hashed_password")):
        raise _auth_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="invalid_password",
            message="Неверный пароль.",
            suggestion="Попробуйте ещё раз. Если аккаунт создавался через Google, используйте Google-вход.",
            allow_google=True,
        )
    store.mark_login(user["id"])
    fresh_user = store.get_user(user["id"]) or user
    return _issue_tokens(response, fresh_user)


@router.post("/logout", status_code=204)
def logout_user(response: Response) -> None:
    clear_auth_cookies(response)


@router.get("/me")
def me(current_user: UserRecord = Depends(get_current_user)) -> dict:
    return redact_user(current_user)


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
def refresh_session(
    response: Response,
    store: UserStore = Depends(get_user_store),
    payload: dict = Depends(get_refresh_payload),
) -> AuthResponse:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = store.get_user(user_id)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
    if not user.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email address is not verified")
    return _issue_tokens(response, user)


@router.post("/verify-email")
def verify_email(payload: VerificationTokenRequest, store: UserStore = Depends(get_user_store)) -> dict:
    user = _confirm_email(payload.token, store)
    return {"status": "verified", "user": redact_user(user)}


@router.get("/verify-email")
def verify_email_via_link(token: str, store: UserStore = Depends(get_user_store)) -> RedirectResponse:
    _confirm_email(token, store)
    return RedirectResponse(url=_frontend_redirect("email-verified"), status_code=status.HTTP_302_FOUND)


@router.post("/resend-verification")
def resend_verification_email(
    payload: ResendVerificationRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    store: UserStore = Depends(get_user_store),
) -> dict:
    ensure_smtp_configured()
    user = store.find_by_email(payload.email)
    if not user:
        return {"status": "queued"}
    if user.get("email_verified"):
        return {"status": "already_verified"}
    token = create_email_verification_token(user)
    verification_url = f"{_api_base_url(request)}/auth/verify-email?{urlencode({'token': token})}"
    background_tasks.add_task(_send_verification_email, user, verification_url)
    return {"status": "queued"}


@router.get("/google/login")
async def google_login(request: Request):
    client = _build_google_oauth_client()
    redirect_uri = f"{_api_base_url(request)}/auth/google/callback"
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, store: UserStore = Depends(get_user_store)):
    _bootstrap_admin_if_needed(store)
    client = _build_google_oauth_client()
    try:
        token = await client.authorize_access_token(request)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google authentication failed") from exc

    user_info = token.get("userinfo") or await client.userinfo(token=token)
    email = user_info.get("email")
    google_sub = user_info.get("sub")
    if not email or not google_sub:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google did not provide user identity")
    if user_info.get("email_verified") is not True:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Google account email is not verified")

    user = store.find_by_google_sub(google_sub) or store.find_by_email(email)
    if user:
        user = store.update_user(
            user["id"],
            full_name=user_info.get("name") or user.get("full_name") or email,
            email_verified=True,
            auth_provider="google",
            google_sub=google_sub,
        )
    else:
        user = store.create_user(
            email=email,
            full_name=user_info.get("name") or email,
            hashed_password=None,
            role=_assign_role(store, invite_code=None),
            email_verified=True,
            auth_provider="google",
            google_sub=google_sub,
        )

    store.mark_login(user["id"])
    redirect = RedirectResponse(url=_frontend_redirect("google-success"), status_code=status.HTTP_302_FOUND)
    _issue_tokens(redirect, store.get_user(user["id"]) or user)
    return redirect
