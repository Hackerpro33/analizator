from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import List, Tuple

from .services.host_protection import HostProtectionService, get_host_protection_service
from .services.security_event_store import SecurityEventStore, get_security_event_store

SEGMENTS = ["dmz", "internal", "prod", "office", "cloud"]
SOURCES = ["waf", "ids", "auth", "netflow", "endpoint", "dns"]
ATTACK_CHAIN = [
    ("recon", "scan"),
    ("initial_access", "exploit_attempt"),
    ("execution", "malware_drop"),
    ("persistence", "registry_mod"),
    ("privilege_escalation", "token_abuse"),
    ("lateral_movement", "pass_the_hash"),
    ("exfiltration", "dns_tunnel"),
]

GEO_POOL = [
    {"country": "US", "city": "New York", "lat": 40.71, "lon": -74.0, "asn": "AS13335"},
    {"country": "DE", "city": "Frankfurt", "lat": 50.11, "lon": 8.68, "asn": "AS680"},
    {"country": "RU", "city": "Moscow", "lat": 55.75, "lon": 37.61, "asn": "AS8359"},
    {"country": "SG", "city": "Singapore", "lat": 1.35, "lon": 103.82, "asn": "AS45102"},
    {"country": "BR", "city": "Sao Paulo", "lat": -23.55, "lon": -46.63, "asn": "AS28573"},
]

TARGETS = [
    ("edge-gateway", "10.10.10.5"),
    ("billing-core", "10.20.30.40"),
    ("k8s-api", "10.43.0.1"),
    ("analytics-warehouse", "10.88.12.5"),
    ("sso-prod", "10.64.0.10"),
]

HOST_STATUS_PRESETS = [
    {
        "tool": "aide",
        "status": "ok",
        "details": {"drift": 0, "last_scan": "15m ago"},
        "message": "AIDE baseline intact on critical paths",
        "severity": "low",
    },
    {
        "tool": "auditd",
        "status": "alert",
        "details": {"suspicious_files": 1, "policy": "immutable-core"},
        "message": "Auditd flagged unauthorized system binary modification",
        "severity": "high",
    },
    {
        "tool": "usbguard",
        "status": "ok",
        "details": {"blocked_devices": 3, "last_event": "usb:vendor=0x090c"},
        "message": "Usbguard rejected untrusted removable media",
        "severity": "medium",
    },
    {
        "tool": "clamav",
        "status": "ok",
        "details": {"last_update": "freshclam 3h ago", "quarantine": 0},
        "message": None,
        "severity": "low",
    },
    {
        "tool": "fail2ban",
        "status": "drift",
        "details": {"banned_ips": 4, "jails": ["sshd", "nginx-http-auth"]},
        "message": "Fail2ban banned repeated SSH brute force source",
        "severity": "medium",
    },
]


def _random_ip() -> str:
    return ".".join(str(random.randint(1, 254)) for _ in range(4))


def _build_events(total: int = 500) -> List[dict]:
    now = datetime.now(timezone.utc)
    events: List[dict] = []
    for index in range(total):
        phase, action = ATTACK_CHAIN[index % len(ATTACK_CHAIN)]
        segment = SEGMENTS[index % len(SEGMENTS)]
        src_geo = random.choice(GEO_POOL)
        dst_host, dst_ip = random.choice(TARGETS)
        event = {
            "ts": (now - timedelta(minutes=index % 240, seconds=random.randint(0, 50))).isoformat(),
            "source": random.choice(SOURCES),
            "severity": random.choice(["low", "medium", "high", "critical"]) if phase != "recon" else "low",
            "segment": segment,
            "event_type": "chain",
            "src_ip": _random_ip(),
            "src_geo": src_geo,
            "dst_ip": dst_ip,
            "dst_host": dst_host,
            "dst_service": random.choice(["ssh", "http", "kube-api", "rdp"]),
            "user": random.choice(["svc-ci", "svc-backup", "analyst", "root"]),
            "action": action,
            "attack_phase": phase,
            "message": f"{phase} via {action} targeting {dst_host}",
            "iocs": [{"type": "hash", "value": f"hash-{index:04d}"}],
        }
        events.append(event)
    return events


def seed_security_events(store: SecurityEventStore | None = None, total: int = 500) -> int:
    target_store = store or get_security_event_store()
    events = _build_events(total)
    target_store.bulk_ingest(events)
    return len(events)


def seed_host_protection(service: HostProtectionService | None = None) -> Tuple[int, int]:
    """Populate Host Protection status cards and telemetry without requiring an agent."""
    target_service = service or get_host_protection_service()
    statuses_written = 0
    telemetry_written = 0
    for preset in HOST_STATUS_PRESETS:
        target_service.upsert_status(tool=preset["tool"], status=preset["status"], details=preset.get("details"))
        statuses_written += 1
        if preset.get("message"):
            target_service.ingest_event(
                tool=preset["tool"],
                message=preset["message"],
                severity=preset["severity"],
                details=preset.get("details"),
            )
            telemetry_written += 1
    return statuses_written, telemetry_written


if __name__ == "__main__":
    created = seed_security_events()
    status_count, telemetry_count = seed_host_protection()
    print(
        f"Seeded {created} security events, {status_count} host protection statuses and {telemetry_count} telemetry events."
    )
