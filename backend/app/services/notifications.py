"""Notification utilities for delivering webhook alerts."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from ..config import Settings, get_settings

logger = logging.getLogger(__name__)


class WebhookDeliveryError(RuntimeError):
    """Raised when an outgoing webhook cannot be delivered."""


def dispatch_webhook(
    event_type: str,
    payload: Dict[str, Any],
    *,
    settings: Optional[Settings] = None,
    client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Send ``payload`` to the configured webhook endpoint.

    Parameters
    ----------
    event_type:
        String describing the type of event, e.g. ``bias_audit.threshold_breached``.
    payload:
        JSON serialisable payload delivered to the webhook.
    settings:
        Optional :class:`Settings` override. Defaults to :func:`get_settings`.
    client:
        Optional :class:`httpx.Client` instance. When omitted a new client is created
        for the duration of the delivery attempt.
    """

    settings = settings or get_settings()
    if not settings.alert_webhook_url:
        logger.debug("Webhook dispatch skipped: no ALERT_WEBHOOK_URL configured", extra={"event": event_type})
        return {"status": "skipped", "reason": "webhook not configured"}

    timeout = getattr(settings, "alert_webhook_timeout", 5.0)
    retries = max(0, int(getattr(settings, "alert_webhook_retries", 2)))
    request_payload = {"event": event_type, "payload": payload}

    owned_client = client is None
    if owned_client:
        client = httpx.Client(timeout=timeout)

    assert client is not None  # hint for mypy/pyright

    last_error: Optional[Exception] = None
    for attempt in range(1, retries + 2):
        try:
            response = client.post(
                str(settings.alert_webhook_url),
                json=request_payload,
                timeout=timeout,
            )
        except httpx.HTTPError as exc:  # pragma: no cover - network failure branch
            last_error = exc
            logger.debug(
                "Webhook delivery failed",
                extra={"event": event_type, "attempt": attempt, "error": str(exc)},
            )
        else:
            if 200 <= response.status_code < 300:
                logger.info(
                    "Webhook delivered",
                    extra={"event": event_type, "status_code": response.status_code, "attempt": attempt},
                )
                if owned_client:
                    client.close()
                return {
                    "status": "sent",
                    "attempts": attempt,
                    "response_status": response.status_code,
                }
            last_error = RuntimeError(f"Unexpected status code: {response.status_code}")
            logger.debug(
                "Webhook responded with error",
                extra={
                    "event": event_type,
                    "attempt": attempt,
                    "status_code": response.status_code,
                    "body": response.text,
                },
            )
    if owned_client:
        client.close()

    raise WebhookDeliveryError(
        f"Failed to deliver webhook after {retries + 1} attempts: {last_error}")


def notify_dataset_refresh_failure(
    schedule: Dict[str, Any],
    *,
    reason: str,
    settings: Optional[Settings] = None,
    client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Send a webhook about a failed dataset refresh attempt.

    Parameters
    ----------
    schedule:
        The schedule payload returned by :class:`~app.services.scheduler.TaskScheduler`.
    reason:
        Human-readable description of the failure cause. Typically the exception text
        or SLA violation note associated with ``schedule['last_error']``.
    settings / client:
        Optional overrides forwarded to :func:`dispatch_webhook`.
    """

    payload = {
        "schedule_id": schedule.get("id"),
        "name": schedule.get("name"),
        "task": schedule.get("task"),
        "status": schedule.get("status"),
        "dataset_id": (schedule.get("payload") or {}).get("dataset_id"),
        "retry_count": schedule.get("retry_count"),
        "max_retries": schedule.get("max_retries"),
        "next_run_due": schedule.get("next_run_due"),
        "last_run_at": schedule.get("last_run_at"),
        "sla_seconds": schedule.get("sla_seconds"),
        "reason": reason,
        "last_error": schedule.get("last_error"),
        "final_failure": schedule.get("status") == "failed",
    }
    return dispatch_webhook(
        "dataset.refresh.failed",
        payload,
        settings=settings,
        client=client,
    )


__all__ = [
    "WebhookDeliveryError",
    "dispatch_webhook",
    "notify_dataset_refresh_failure",
]
