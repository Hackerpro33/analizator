from __future__ import annotations

from datetime import datetime, timezone

from app.services.security_event_store import SecurityEventStore


def test_normalize_event_defaults():
    payload = {
        "source": "ids",
        "ts": "2024-05-01T10:00:00Z",
        "src_geo": {"country": "US", "lat": "40.1", "lon": "-73.3", "asn": "AS123"},
        "raw": {str(index): index for index in range(100)},
    }
    event = SecurityEventStore.normalize_event(payload)
    assert event.severity == "medium"
    assert event.source == "ids"
    assert isinstance(event.ts, datetime)
    assert event.ts.tzinfo == timezone.utc
    assert event.src_geo["asn"] == "AS123"
