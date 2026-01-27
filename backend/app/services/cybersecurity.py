from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Any, Dict, Iterable, List, Literal, Sequence


CRITICALITY_WEIGHT: Dict[str, float] = {
    "low": 0.65,
    "medium": 0.85,
    "high": 1.05,
    "mission": 1.2,
}

SEVERITY_WEIGHT: Dict[str, float] = {
    "low": 2.0,
    "medium": 4.0,
    "high": 7.0,
    "critical": 12.0,
}

THREAT_MULTIPLIER: Dict[str, float] = {
    "low": 0.9,
    "elevated": 1.05,
    "imminent": 1.25,
}


CONTROL_LIBRARY: List[Dict[str, Any]] = [
    {
        "id": "ztna-microsegmentation",
        "title": "Zero Trust микросегментация 2.0",
        "category": "network",
        "technologies": ["ZTNA 2.0", "software-defined perimeter", "adaptive identity gating"],
        "description": (
            "Автоматически строит микро-периметры вокруг сервисов и пользователей, "
            "принудительно проверяя контекст на каждом запросе."
        ),
        "signals": ["edr", "identity", "network"],
        "outcomes": [
            "минимизация латерального перемещения",
            "контроль доступа в runtime",
            "автогенерация политик по MITRE ATT&CK",
        ],
        "maturity": "ga",
    },
    {
        "id": "confidential-ml",
        "title": "Конфиденциальные ML-песочницы",
        "category": "data",
        "technologies": ["confidential computing", "SGX/SEV", "fully homomorphic encryption"],
        "description": (
            "Инференс и обучение выполняются внутри доверенных исполнений, "
            "а данные шифруются с использованием FHE и защищённых ключей."
        ),
        "signals": ["ml", "pii"],
        "outcomes": [
            "невозможность утечки обучающих датасетов",
            "автоматическое зануление приватного бюджета",
            "поддержка federated learning",
        ],
        "maturity": "preview",
    },
    {
        "id": "pq-stack",
        "title": "Post-quantum TLS/SSH стек",
        "category": "crypto",
        "technologies": ["Kyber", "Dilithium", "hybrid TLS 1.3"],
        "description": (
            "Комбинирует текущие алгоритмы и PQC (Kyber/Dilithium) для защиты каналов, "
            "подписей артефактов и артефактов CI/CD."
        ),
        "signals": ["network", "devsecops"],
        "outcomes": [
            "готовность к требованиям NIST PQC",
            "предотвращение store-now-decrypt-later",
            "автоматический катастрофоустойчивый откат",
        ],
        "maturity": "ga",
    },
    {
        "id": "autonomous-purple-team",
        "title": "Autonomous purple teaming",
        "category": "offense-defense",
        "technologies": ["breach & attack simulation", "AI-guided TTP chaining"],
        "description": "Автоматические эмулированные атаки по ATT&CK/Engenuity для проверки защит.",
        "signals": ["siem", "soar", "gpt-agent"],
        "outcomes": [
            "непрерывная валидация SOC",
            "раннее обнаружение дыр в плейбуках",
            "закрытие ручных проверок",
        ],
        "maturity": "ga",
    },
    {
        "id": "behavioral-passkeys",
        "title": "Пасскиеи и поведенческие биометрии",
        "category": "identity",
        "technologies": ["FIDO2", "risk-based authentication", "behavioral biometrics"],
        "description": "Удаляет пароли из периметра, использует биоподписи и токены аппаратного уровня.",
        "signals": ["identity", "endpoint"],
        "outcomes": [
            "устранение фишинговых рисков",
            "динамический SSO без секретов",
            "аналитика отклонений с помощью ML",
        ],
        "maturity": "ga",
    },
    {
        "id": "deception-grid",
        "title": "Self-healing deception grid",
        "category": "runtime",
        "technologies": ["moving target defense", "decoy fabric", "eBPF guards"],
        "description": "Эффект матрёшки-сетей ловушек с телеметрией eBPF и авто-изолированием подсетей.",
        "signals": ["runtime", "network"],
        "outcomes": [
            "встроенное обнуление скомпрометированных узлов",
            "замедление APT",
            "авто-переключение секретов",
        ],
        "maturity": "beta",
    },
]


@dataclass
class Asset:
    asset_id: str
    asset_type: str
    criticality: str
    exposure: float
    last_patch_days: int
    contains_pii: bool
    internet_exposed: bool
    quantum_ready: bool
    runtime: str
    identities: Sequence[str]


@dataclass
class Telemetry:
    source: str
    severity: str
    vector: str
    signal_type: str
    detected_by_ai: bool


@dataclass
class ServiceProfile:
    name: str
    attack_surface: float
    runtime: str
    supports_chaos: bool


def _severity_score(events: Iterable[Telemetry]) -> float:
    return sum(SEVERITY_WEIGHT.get(event.severity, 3.0) * (1.2 if event.detected_by_ai else 1.0) for event in events)


def _criticality_factor(asset: Asset) -> float:
    return CRITICALITY_WEIGHT.get(asset.criticality, 0.8)


def _segment_assets(assets: Iterable[Asset]) -> List[Dict[str, Any]]:
    buckets: Dict[str, List[Asset]] = {}
    for asset in assets:
        buckets.setdefault(asset.runtime, []).append(asset)

    segments: List[Dict[str, Any]] = []
    for runtime, segment_assets in buckets.items():
        sorted_assets = sorted(segment_assets, key=lambda item: item.asset_id)
        segments.append(
            {
                "segment": runtime,
                "assets": [asset.asset_id for asset in sorted_assets],
                "gateway": (
                    "adaptive-mesh"
                    if runtime in {"kubernetes", "service-mesh"}
                    else "identity-broker"
                ),
                "policies": [
                    "device posture",
                    "continuous authentication",
                    "least privilege routing",
                ],
                "ai_guardrails": ["LLM anomaly firewall", "policy drift detector"],
            }
        )
    return segments


def _recommended_controls(assets: Sequence[Asset], telemetry: Sequence[Telemetry]) -> List[Dict[str, Any]]:
    pii_pressure = sum(1 for asset in assets if asset.contains_pii)
    high_exposure = any(asset.exposure > 0.7 and asset.internet_exposed for asset in assets)
    stale_assets = any(asset.last_patch_days > 45 for asset in assets)
    ai_pressure = any(event.detected_by_ai and event.severity in {"high", "critical"} for event in telemetry)

    recommendations: List[Dict[str, Any]] = []

    catalogue = {item["id"]: item for item in CONTROL_LIBRARY}
    if high_exposure:
        item = catalogue["ztna-microsegmentation"].copy()
        item["priority"] = "p0"
        item["reason"] = "Критичные сервисы открыты в интернет и требуют микро-периметров."
        recommendations.append(item)
    if pii_pressure:
        item = catalogue["confidential-ml"].copy()
        item["priority"] = "p1"
        item["reason"] = "Данные с PII требуют конфиденциальных исполнений и дифференциальной приватности."
        recommendations.append(item)
    if stale_assets:
        item = catalogue["deception-grid"].copy()
        item["priority"] = "p1"
        item["reason"] = "Замедляет эксплуатацию устаревших компонентов и обеспечивает самоисцеление."
        recommendations.append(item)
    if ai_pressure:
        item = catalogue["autonomous-purple-team"].copy()
        item["priority"] = "p2"
        item["reason"] = "Нужна непрерывная проверка SOC, чтобы автоматизировать ответ на сложные атаки."
        recommendations.append(item)

    if not recommendations:
        item = catalogue["behavioral-passkeys"].copy()
        item["priority"] = "p2"
        item["reason"] = "Укрепляет идентичности и устраняет пароли даже при низком риске."
        recommendations.append(item)
    return recommendations


def evaluate_posture(
    assets: Sequence[Asset],
    telemetry: Sequence[Telemetry],
    threat_level: Literal["low", "elevated", "imminent"],
    privacy_budget_spent: float,
) -> Dict[str, Any]:
    if not assets:
        raise ValueError("Передайте хотя бы один актив")

    exposure_vector: List[float] = []
    outdated_components = 0
    quantum_ready_assets = 0
    pii_assets = 0

    for asset in assets:
        base = asset.exposure * _criticality_factor(asset)
        if asset.internet_exposed:
            base += 0.12
        if asset.last_patch_days > 45:
            base += 0.15
            outdated_components += 1
        if asset.contains_pii:
            pii_assets += 1
        if asset.quantum_ready:
            quantum_ready_assets += 1
        exposure_vector.append(min(1.0, base))

    average_exposure = mean(exposure_vector)
    severity = _severity_score(telemetry)
    threat_multiplier = THREAT_MULTIPLIER.get(threat_level, 1.0)

    exposure_index = min(100.0, round((average_exposure * 100.0 * threat_multiplier) + severity * 2.5, 2))
    resilience = max(
        0.0,
        round(
            100.0
            - (exposure_index * 0.6)
            - outdated_components * 3.0
            + (quantum_ready_assets / max(len(assets), 1)) * 10.0,
            2,
        ),
    )

    quantum_safe_score = max(
        5.0,
        round(30.0 + (quantum_ready_assets / max(len(assets), 1)) * 70.0 - severity * 0.8, 2),
    )
    privacy_budget_remaining = max(
        0.0,
        round(
            (1.0 - min(privacy_budget_spent, 1.0) - (pii_assets * 0.02) - severity * 0.0025)
            * 100.0,
            2,
        ),
    )

    detections = {
        "pressure": severity,
        "vectors": {},
    }
    for event in telemetry:
        detections["vectors"].setdefault(event.vector, 0)
        detections["vectors"][event.vector] += SEVERITY_WEIGHT.get(event.severity, 3.0)

    return {
        "resilience_index": resilience,
        "exposure_index": exposure_index,
        "quantum_safe_score": min(100.0, quantum_safe_score),
        "privacy_budget_remaining": privacy_budget_remaining,
        "zero_trust_segments": _segment_assets(assets),
        "recommended_controls": _recommended_controls(assets, telemetry),
        "detections": detections,
        "active_controls": CONTROL_LIBRARY[:3],
    }


def plan_moving_target_defense(
    services: Sequence[ServiceProfile],
    base_rotation_minutes: int,
) -> Dict[str, Any]:
    if not services:
        raise ValueError("Передайте хотя бы один сервис")

    schedule = []
    for index, service in enumerate(services):
        adaptive_rotation = max(
            5,
            int(base_rotation_minutes * (1.0 - service.attack_surface * 0.4) - index * 1.5),
        )
        techniques = [
            "ephemeral identity tokens",
            "dynamic mesh sharding",
        ]
        if service.runtime in {"kubernetes", "service-mesh"}:
            techniques.append("eBPF syscall cloaking")
        if service.supports_chaos:
            techniques.append("chaos workload rehealing")

        schedule.append(
            {
                "service": service.name,
                "rotation_minutes": adaptive_rotation,
                "techniques": techniques,
                "automation": "self-healing deception grid",
                "zero_touch": service.supports_chaos,
            }
        )

    return {
        "base_rotation_minutes": base_rotation_minutes,
        "schedule": schedule,
        "autonomous_runbook": [
            "rotate signing keys with PQ-safe pairs",
            "refresh policy drift detections",
            "retrain anomaly detectors on new topology snapshots",
        ],
    }
