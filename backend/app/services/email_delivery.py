from __future__ import annotations

import smtplib
from email.message import EmailMessage

from fastapi import HTTPException, status

from ..config import get_settings


def ensure_smtp_configured() -> None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured",
        )


def send_email(*, to_email: str, subject: str, body: str) -> None:
    ensure_smtp_configured()
    settings = get_settings()
    if settings.environment.lower() == "test":
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email or settings.smtp_user
    message["To"] = to_email
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            smtp.ehlo()
            if settings.smtp_use_starttls:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send verification email",
        ) from exc
