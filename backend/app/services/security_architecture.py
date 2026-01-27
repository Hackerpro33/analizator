from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import JSON, Column, DateTime, Integer, MetaData, String, Table, Text, create_engine, func, insert, select, update
from sqlalchemy.engine import Engine

try:  # pragma: no cover - optional PG specific feature
    from sqlalchemy.dialects.postgresql import JSONB
except Exception:  # pragma: no cover
    JSONB = JSON  # type: ignore

from ..config import get_settings
from .security_event_store import SecurityEventStore, get_security_event_store


metadata = MetaData()


architecture_versions_table = Table(
    "architecture_versions",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("name", String(255), nullable=False),
    Column("description", Text, nullable=True),
    Column("topology_preset", String(64), nullable=False, default="microservices"),
    Column("nodes_json", JSONB().with_variant(JSON, "sqlite"), nullable=False),
    Column("edges_json", JSONB().with_variant(JSON, "sqlite"), nullable=False),
    Column("segments_json", JSONB().with_variant(JSON, "sqlite"), nullable=False),
    Column("placement_json", JSONB().with_variant(JSON, "sqlite"), nullable=False),
    Column("enabled_flags_json", JSONB().with_variant(JSON, "sqlite"), nullable=False),
    Column("policies_json", JSONB().with_variant(JSON, "sqlite"), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
    Column("cloned_from_id", String(64), nullable=True),
    Column("author", String(255), nullable=True),
)

attack_scenarios_table = Table(
    "attack_scenarios",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("name", String(255), nullable=False),
    Column("description", Text, nullable=True),
    Column("stages_json", JSONB().with_variant(JSON, "sqlite"), nullable=False),
    Column("tags_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("intensity", String(32), nullable=False, default="medium"),
    Column("duration_seconds", Integer, nullable=False, default=60),
    Column("success_criteria", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
)

simulation_runs_table = Table(
    "simulation_runs",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("scenario_id", String(64), nullable=False),
    Column("architecture_version_id", String(64), nullable=False),
    Column("status", String(32), nullable=False, default="pending"),
    Column("progress", Integer, nullable=False, default=0),
    Column("started_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
    Column("completed_at", DateTime(timezone=True), nullable=True),
    Column("summary_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("outcomes_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("events_written", Integer, nullable=False, default=0),
    Column("initiated_by", String(255), nullable=True),
)


ARCHITECTURE_PRESETS: Sequence[Dict[str, Any]] = [
    {
        "name": "Microservices Mesh",
        "description": "Service mesh with sidecars enforcing mTLS and IDS high sensitivity.",
        "topology_preset": "mesh",
        "nodes": [
            {"id": "edge-gateway", "label": "Edge Gateway"},
            {"id": "auth-service", "label": "Auth"},
            {"id": "order-service", "label": "Orders"},
            {"id": "inventory-service", "label": "Inventory"},
            {"id": "analytics", "label": "Analytics"},
        ],
        "edges": [
            {"source": "edge-gateway", "target": "auth-service", "protocol": "https"},
            {"source": "edge-gateway", "target": "order-service", "protocol": "https"},
            {"source": "order-service", "target": "inventory-service", "protocol": "http"},
            {"source": "order-service", "target": "analytics", "protocol": "grpc"},
        ],
        "segments": [
            {"id": "dmz", "label": "DMZ"},
            {"id": "internal", "label": "Internal"},
            {"id": "prod", "label": "Production"},
        ],
        "placement": {
            "edge-gateway": "dmz",
            "auth-service": "internal",
            "order-service": "prod",
            "inventory-service": "prod",
            "analytics": "internal",
        },
        "policies": [
            {
                "id": "seg-prod",
                "from_segment": "dmz",
                "to_segment": "prod",
                "allow": False,
                "controls": {"mtls": True, "authz_mode": "strict"},
                "rationale": "DMZ cannot directly reach prod workloads",
            },
            {
                "id": "mesh-internal",
                "from_segment": "internal",
                "to_segment": "prod",
                "allow": True,
                "controls": {
                    "mtls": True,
                    "rate_limit": "medium",
                    "waf_profile": "api-gateway",
                    "ids_level": "high",
                    "egress_restrict": True,
                    "logging_level": "verbose",
                },
                "rationale": "Mesh enforces service identity and IDS detection",
            },
        ],
        "enabled_flags": {"mesh": True, "egress_filtering": True},
    }
]

SCENARIO_PRESETS: Sequence[Dict[str, Any]] = [
    {
        "name": "Credential Stuffing & Lateral Movement",
        "description": "Simulates brute force against auth followed by lateral move to inventory.",
        "tags": ["ATT&CK:TA0006", "OWASP:Auth"],
        "intensity": "medium",
        "duration_seconds": 90,
        "stages": [
            {
                "phase": "initial_access",
                "technique_category": "auth_abuse_label",
                "target_service_label": "auth-service",
                "params": {"origin_segment": "internet", "attempts": 500},
            },
            {
                "phase": "lateral_movement",
                "technique_category": "lateral_move_label",
                "target_service_label": "inventory-service",
                "params": {"origin_service": "auth-service"},
            },
            {
                "phase": "exfiltration",
                "technique_category": "anomalous_egress_label",
                "target_service_label": "analytics",
                "params": {"channel": "https"},
            },
        ],
    }
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PolicyEngine:
    def __init__(self, architecture: Dict[str, Any]):
        self.architecture = architecture
        self.policies = architecture.get("policies") or []
        self.placement = architecture.get("placement") or {}

    def evaluate_stage(self, stage: Dict[str, Any]) -> Dict[str, Any]:
        target_service = stage.get("target_service_label")
        target_segment = self.placement.get(target_service, "unknown")
        origin_segment = stage.get("params", {}).get("origin_segment") or stage.get("params", {}).get("entry_segment") or "internet"
        matched_policies = [policy for policy in self.policies if self._matches(policy, origin_segment, target_segment, stage)]
        explanations: List[str] = []
        recommended = None
        outcome = "allowed"

        for policy in matched_policies:
            controls = policy.get("controls") or {}
            if policy.get("allow") is False:
                outcome = "blocked"
                explanations.append("segmentation_deny")
                break
            if controls.get("ids_level") in {"high", "paranoid"} or controls.get("waf_profile"):
                if outcome != "blocked":
                    outcome = "detected"
                explanations.append("ids_detected")
            if controls.get("rate_limit") in {"low", "aggressive"}:
                if outcome == "allowed":
                    outcome = "degraded"
                explanations.append("rate_limit_triggered")
            if controls.get("mtls"):
                explanations.append("mtls_enforced")
            if controls.get("authz_mode") == "strict":
                explanations.append("authz_enforced")
            if controls.get("egress_restrict"):
                explanations.append("egress_blocked")

        if not explanations:
            explanations.append("no_matching_policy")
        if outcome == "allowed":
            recommended = self._recommend_fix(stage)

        severity_map = {"blocked": "high", "detected": "high", "degraded": "medium", "allowed": "medium"}

        return {
            "outcome": outcome,
            "explanations": explanations,
            "recommended_fix": recommended,
            "severity": severity_map.get(outcome, "medium"),
            "target_segment": target_segment,
            "origin_segment": origin_segment,
        }

    @staticmethod
    def _recommend_fix(stage: Dict[str, Any]) -> str:
        phase = stage.get("phase")
        tech = stage.get("technique_category")
        if phase in {"initial_access", "execution"}:
            return "Strengthen authz & enable mTLS for incoming flows"
        if tech == "anomalous_egress_label":
            return "Add egress restrictions and deep logging for exfil paths"
        return "Increase IDS sensitivity and enforce rate limiting"

    def _matches(self, policy: Dict[str, Any], origin_segment: str, target_segment: str, stage: Dict[str, Any]) -> bool:
        from_segment = policy.get("from_segment")
        to_segment = policy.get("to_segment")
        from_service = policy.get("from_service")
        to_service = policy.get("to_service")
        target_service = stage.get("target_service_label")
        origin_service = stage.get("params", {}).get("origin_service")

        if from_segment and from_segment != origin_segment:
            return False
        if to_segment and to_segment != target_segment:
            return False
        if from_service and from_service != origin_service:
            return False
        if to_service and to_service != target_service:
            return False
        return True


@dataclass
class ArchitectureVersion:
    id: str
    name: str
    description: Optional[str]
    topology_preset: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    segments: List[Dict[str, Any]]
    placement: Dict[str, str]
    enabled_flags: Dict[str, Any]
    policies: List[Dict[str, Any]]
    cloned_from_id: Optional[str]
    created_at: datetime
    updated_at: datetime


@dataclass
class AttackScenario:
    id: str
    name: str
    description: Optional[str]
    stages: List[Dict[str, Any]]
    tags: List[str]
    intensity: str
    duration_seconds: int
    success_criteria: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class SecurityArchitectureManager:
    def __init__(self, engine: Engine, event_store: SecurityEventStore):
        self._engine = engine
        self._event_store = event_store
        metadata.create_all(self._engine, checkfirst=True)
        self._ensure_presets()

    @classmethod
    def from_settings(cls) -> "SecurityArchitectureManager":
        settings = get_settings()
        engine = create_engine(settings.database_url, future=True)
        event_store = get_security_event_store()
        return cls(engine, event_store)

    def _ensure_presets(self) -> None:
        with self._engine.begin() as connection:
            count = connection.execute(select(func.count()).select_from(architecture_versions_table)).scalar_one()
            if count == 0:
                for preset in ARCHITECTURE_PRESETS:
                    connection.execute(
                        insert(architecture_versions_table).values(
                            id=uuid.uuid4().hex,
                            name=preset["name"],
                            description=preset.get("description"),
                            topology_preset=preset.get("topology_preset", "microservices"),
                            nodes_json=preset.get("nodes", []),
                            edges_json=preset.get("edges", []),
                            segments_json=preset.get("segments", []),
                            placement_json=preset.get("placement", {}),
                            enabled_flags_json=preset.get("enabled_flags", {}),
                            policies_json=preset.get("policies", []),
                            created_at=_now(),
                            updated_at=_now(),
                            cloned_from_id=None,
                        )
                    )
            scenario_count = connection.execute(select(func.count()).select_from(attack_scenarios_table)).scalar_one()
            if scenario_count == 0:
                for preset in SCENARIO_PRESETS:
                    connection.execute(
                        insert(attack_scenarios_table).values(
                            id=uuid.uuid4().hex,
                            name=preset["name"],
                            description=preset.get("description"),
                            stages_json=preset.get("stages", []),
                            tags_json=preset.get("tags", []),
                            intensity=preset.get("intensity", "medium"),
                            duration_seconds=preset.get("duration_seconds", 60),
                            success_criteria=preset.get("success_criteria"),
                            created_at=_now(),
                            updated_at=_now(),
                        )
                    )

    def list_versions(self) -> List[ArchitectureVersion]:
        with self._engine.begin() as connection:
            rows = connection.execute(
                select(architecture_versions_table).order_by(architecture_versions_table.c.created_at.desc())
            ).mappings()
            return [self._map_architecture(row) for row in rows]

    def get_version(self, version_id: str) -> Optional[ArchitectureVersion]:
        with self._engine.begin() as connection:
            row = connection.execute(
                select(architecture_versions_table).where(architecture_versions_table.c.id == version_id)
            ).mappings().first()
        return self._map_architecture(row) if row else None

    def save_version(self, payload: Dict[str, Any], *, author: Optional[str] = None) -> ArchitectureVersion:
        version_id = payload.get("id") or uuid.uuid4().hex
        now = _now()
        record = {
            "id": version_id,
            "name": payload.get("name") or f"Architecture {now.isoformat()}",
            "description": payload.get("description"),
            "topology_preset": payload.get("topology_preset") or "microservices",
            "nodes_json": payload.get("nodes") or [],
            "edges_json": payload.get("edges") or [],
            "segments_json": payload.get("segments") or [],
            "placement_json": payload.get("placement") or {},
            "enabled_flags_json": payload.get("enabled_flags") or {},
            "policies_json": payload.get("policies") or [],
            "updated_at": now,
            "author": author,
        }
        with self._engine.begin() as connection:
            existing = connection.execute(
                select(architecture_versions_table.c.id).where(architecture_versions_table.c.id == version_id)
            ).scalar()
            if existing:
                connection.execute(
                    update(architecture_versions_table).where(architecture_versions_table.c.id == version_id).values(**record)
                )
            else:
                record["created_at"] = now
                connection.execute(insert(architecture_versions_table).values(**record))
        return self.get_version(version_id)  # type: ignore

    def clone_version(self, version_id: str, name: Optional[str], author: Optional[str]) -> ArchitectureVersion:
        original = self.get_version(version_id)
        if not original:
            raise ValueError("Source architecture not found")
        payload = {
            "name": name or f"{original.name} Clone",
            "description": original.description,
            "topology_preset": original.topology_preset,
            "nodes": original.nodes,
            "edges": original.edges,
            "segments": original.segments,
            "placement": original.placement,
            "enabled_flags": original.enabled_flags,
            "policies": original.policies,
        }
        clone = self.save_version(payload, author=author)
        with self._engine.begin() as connection:
            connection.execute(
                update(architecture_versions_table)
                .where(architecture_versions_table.c.id == clone.id)
                .values(cloned_from_id=version_id)
            )
        return clone

    def diff_versions(self, left_id: str, right_id: str) -> Dict[str, Any]:
        left = self.get_version(left_id)
        right = self.get_version(right_id)
        if not left or not right:
            raise ValueError("Both versions must exist for diff")
        summary = {
            "left": left.id,
            "right": right.id,
            "nodes_added": [node for node in right.nodes if node not in left.nodes],
            "nodes_removed": [node for node in left.nodes if node not in right.nodes],
            "policies_added": [policy for policy in right.policies if policy not in left.policies],
            "policies_removed": [policy for policy in left.policies if policy not in right.policies],
            "topology_change": left.topology_preset != right.topology_preset,
        }
        return summary

    def list_scenarios(self) -> List[AttackScenario]:
        with self._engine.begin() as connection:
            rows = connection.execute(
                select(attack_scenarios_table).order_by(attack_scenarios_table.c.created_at.desc())
            ).mappings()
            return [self._map_scenario(row) for row in rows]

    def save_scenario(self, payload: Dict[str, Any]) -> AttackScenario:
        scenario_id = payload.get("id") or uuid.uuid4().hex
        now = _now()
        record = {
            "id": scenario_id,
            "name": payload.get("name") or f"Scenario {now.isoformat()}",
            "description": payload.get("description"),
            "stages_json": payload.get("stages") or [],
            "tags_json": payload.get("tags") or [],
            "intensity": payload.get("intensity") or "medium",
            "duration_seconds": int(payload.get("duration_seconds") or 60),
            "success_criteria": payload.get("success_criteria"),
            "updated_at": now,
        }
        with self._engine.begin() as connection:
            existing = connection.execute(
                select(attack_scenarios_table.c.id).where(attack_scenarios_table.c.id == scenario_id)
            ).scalar()
            if existing:
                connection.execute(
                    update(attack_scenarios_table).where(attack_scenarios_table.c.id == scenario_id).values(**record)
                )
            else:
                record["created_at"] = now
                connection.execute(insert(attack_scenarios_table).values(**record))
        scenario = self.get_scenario(scenario_id)
        if scenario is None:
            raise RuntimeError("Failed to retrieve scenario after save")
        return scenario

    def get_scenario(self, scenario_id: str) -> Optional[AttackScenario]:
        with self._engine.begin() as connection:
            row = connection.execute(
                select(attack_scenarios_table).where(attack_scenarios_table.c.id == scenario_id)
            ).mappings().first()
        return self._map_scenario(row) if row else None

    def list_runs(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._engine.begin() as connection:
            rows = connection.execute(
                select(simulation_runs_table)
                .order_by(simulation_runs_table.c.started_at.desc())
                .limit(limit)
            ).mappings()
            return [self._map_run(row) for row in rows]

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        with self._engine.begin() as connection:
            row = connection.execute(
                select(simulation_runs_table).where(simulation_runs_table.c.id == run_id)
            ).mappings().first()
        return self._map_run(row) if row else None

    def run_scenario(self, *, scenario_id: str, architecture_version_id: str, initiated_by: Optional[str]) -> Dict[str, Any]:
        scenario = self.get_scenario(scenario_id)
        architecture = self.get_version(architecture_version_id)
        if not scenario or not architecture:
            raise ValueError("Scenario or architecture not found")

        run_id = uuid.uuid4().hex
        now = _now()
        with self._engine.begin() as connection:
            connection.execute(
                insert(simulation_runs_table).values(
                    id=run_id,
                    scenario_id=scenario.id,
                    architecture_version_id=architecture.id,
                    status="running",
                    progress=0,
                    started_at=now,
                    initiated_by=initiated_by,
                )
            )

        policy_engine = PolicyEngine(
            {
                "policies": architecture.policies,
                "placement": architecture.placement,
            }
        )
        events: List[Dict[str, Any]] = []
        outcomes: List[Dict[str, Any]] = []
        for index, stage in enumerate(scenario.stages):
            evaluation = policy_engine.evaluate_stage(stage)
            outcomes.append(
                {
                    "stage_index": index,
                    "phase": stage.get("phase"),
                    "technique_category": stage.get("technique_category"),
                    "outcome": evaluation["outcome"],
                    "explanations": evaluation["explanations"],
                    "recommended_fix": evaluation["recommended_fix"],
                    "target_service_label": stage.get("target_service_label"),
                }
            )
            events.append(
                {
                    "ts": (_now()),
                    "source": "simulation",
                    "severity": evaluation["severity"],
                    "segment": evaluation["target_segment"],
                    "event_type": "scenario_stage",
                    "dst_host": stage.get("target_service_label"),
                    "dst_service": stage.get("target_service_label"),
                    "attack_phase": stage.get("phase"),
                    "technique_category": stage.get("technique_category"),
                    "action": evaluation["outcome"],
                    "scenario_id": scenario.id,
                    "run_id": run_id,
                    "architecture_version_id": architecture.id,
                    "message": f"{stage.get('phase')}::{stage.get('technique_category')} {evaluation['outcome']}",
                    "explanation_controls": evaluation["explanations"],
                }
            )

        self._event_store.bulk_ingest(events)

        summary = {
            "scenario": {"id": scenario.id, "name": scenario.name},
            "architecture_version": {"id": architecture.id, "name": architecture.name},
            "blocked": sum(1 for item in outcomes if item["outcome"] == "blocked"),
            "detected": sum(1 for item in outcomes if item["outcome"] == "detected"),
            "allowed": sum(1 for item in outcomes if item["outcome"] == "allowed"),
            "degraded": sum(1 for item in outcomes if item["outcome"] == "degraded"),
        }

        with self._engine.begin() as connection:
            connection.execute(
                update(simulation_runs_table)
                .where(simulation_runs_table.c.id == run_id)
                .values(
                    status="completed",
                    progress=100,
                    completed_at=_now(),
                    outcomes_json=outcomes,
                    summary_json=summary,
                    events_written=len(events),
                )
            )
        result = self.get_run(run_id)
        if result is None:
            raise RuntimeError("Simulation run record missing after completion")
        return result

    @staticmethod
    def _map_architecture(row: Optional[Dict[str, Any]]) -> Optional[ArchitectureVersion]:
        if not row:
            return None
        return ArchitectureVersion(
            id=row["id"],
            name=row["name"],
            description=row.get("description"),
            topology_preset=row.get("topology_preset", "microservices"),
            nodes=row.get("nodes_json") or [],
            edges=row.get("edges_json") or [],
            segments=row.get("segments_json") or [],
            placement=row.get("placement_json") or {},
            enabled_flags=row.get("enabled_flags_json") or {},
            policies=row.get("policies_json") or [],
            cloned_from_id=row.get("cloned_from_id"),
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )

    @staticmethod
    def _map_scenario(row: Optional[Dict[str, Any]]) -> Optional[AttackScenario]:
        if not row:
            return None
        return AttackScenario(
            id=row["id"],
            name=row["name"],
            description=row.get("description"),
            stages=row.get("stages_json") or [],
            tags=row.get("tags_json") or [],
            intensity=row.get("intensity") or "medium",
            duration_seconds=row.get("duration_seconds") or 60,
            success_criteria=row.get("success_criteria"),
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )

    @staticmethod
    def _map_run(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not row:
            return None
        return {
            "id": row["id"],
            "scenario_id": row["scenario_id"],
            "architecture_version_id": row["architecture_version_id"],
            "status": row.get("status"),
            "progress": row.get("progress"),
            "started_at": row.get("started_at"),
            "completed_at": row.get("completed_at"),
            "summary": row.get("summary_json") or {},
            "outcomes": row.get("outcomes_json") or [],
            "events_written": row.get("events_written"),
        }


manager_instance: Optional[SecurityArchitectureManager] = None


def get_security_architecture_manager() -> SecurityArchitectureManager:
    global manager_instance
    if manager_instance is None:
        manager_instance = SecurityArchitectureManager.from_settings()
    return manager_instance


__all__ = [
    "SecurityArchitectureManager",
    "ArchitectureVersion",
    "AttackScenario",
    "get_security_architecture_manager",
]
