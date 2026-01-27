from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional, Sequence
import warnings

from fastapi import Cookie, Depends, Header, HTTPException, Request, Response, status
from jose import JWTError, jwt
warnings.filterwarnings("ignore", category=DeprecationWarning, module="crypt")
warnings.filterwarnings("ignore", category=DeprecationWarning, message=".*'crypt' is deprecated.*")

from passlib.context import CryptContext

from .config import get_settings
from .services.user_store import UserRecord, UserStore, get_user_store


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

ACCESS_COOKIE_NAME = "insight_access_token"
REFRESH_COOKIE_NAME = "insight_refresh_token"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def _create_token(*, subject: str, role: str, token_type: str, expires_minutes: int) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    payload = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user: UserRecord) -> str:
    settings = get_settings()
    return _create_token(
        subject=user["id"],
        role=user["role"],
        token_type="access",
        expires_minutes=settings.access_token_expires_minutes,
    )


def create_refresh_token(user: UserRecord) -> str:
    settings = get_settings()
    return _create_token(
        subject=user["id"],
        role=user["role"],
        token_type="refresh",
        expires_minutes=settings.refresh_token_expires_minutes,
    )


def _decode_token(token: str, expected_type: str) -> Dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    token_type = payload.get("type")
    if token_type != expected_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token mismatch")
    return payload


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    cookie_kwargs = {
        "httponly": True,
        "samesite": "lax",
        "secure": settings.auth_cookie_secure,
        "path": "/",
    }
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        access_token,
        max_age=settings.access_token_expires_minutes * 60,
        **cookie_kwargs,
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=settings.refresh_token_expires_minutes * 60,
        **cookie_kwargs,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")


def _extract_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_cookie: Optional[str] = Cookie(None, alias=ACCESS_COOKIE_NAME),
) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1]
    if access_cookie:
        return access_cookie
    bearer = request.headers.get("authorization")
    if bearer and bearer.lower().startswith("bearer "):
        return bearer.split(" ", 1)[1]
    return None


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_cookie: Optional[str] = Cookie(None, alias=ACCESS_COOKIE_NAME),
    store: UserStore = Depends(get_user_store),
) -> UserRecord:
    token = _extract_token(request, authorization=authorization, access_cookie=access_cookie)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    payload = _decode_token(token, expected_type="access")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user = store.get_user(user_id)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or missing")
    return user


def optional_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_cookie: Optional[str] = Cookie(None, alias=ACCESS_COOKIE_NAME),
    store: UserStore = Depends(get_user_store),
) -> Optional[UserRecord]:
    token = _extract_token(request, authorization=authorization, access_cookie=access_cookie)
    if not token:
        return None
    try:
        payload = _decode_token(token, expected_type="access")
    except HTTPException:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = store.get_user(user_id)
    if not user or not user.get("is_active", True):
        return None
    return user


def get_refresh_payload(
    refresh_cookie: Optional[str] = Cookie(None, alias=REFRESH_COOKIE_NAME),
) -> Dict[str, Any]:
    if not refresh_cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")
    return _decode_token(refresh_cookie, expected_type="refresh")


def require_roles(*roles: Sequence[str]) -> Callable[[UserRecord], UserRecord]:
    allowed = set(roles)

    def dependency(user: UserRecord = Depends(get_current_user)) -> UserRecord:
        if allowed and user.get("role") not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency


def require_private_lab_access() -> None:
    settings = get_settings()
    if settings.lab_mode.upper() != "PRIVATE_LAB":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation available only in PRIVATE_LAB mode. Configure Variant C per README.",
        )
