"""initial schema"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _jsonb():
    return postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "architecture_versions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("topology_preset", sa.String(length=64), nullable=False),
        sa.Column("nodes_json", _jsonb(), nullable=False),
        sa.Column("edges_json", _jsonb(), nullable=False),
        sa.Column("segments_json", _jsonb(), nullable=False),
        sa.Column("placement_json", _jsonb(), nullable=False),
        sa.Column("enabled_flags_json", _jsonb(), nullable=False),
        sa.Column("policies_json", _jsonb(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cloned_from_id", sa.String(length=64), nullable=True),
        sa.Column("author", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "attack_scenarios",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("stages_json", _jsonb(), nullable=False),
        sa.Column("tags_json", _jsonb(), nullable=True),
        sa.Column("intensity", sa.String(length=32), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("success_criteria", _jsonb(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource", sa.String(length=255), nullable=False),
        sa.Column("payload", _jsonb(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("storage_bucket", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("metadata", _jsonb(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "entities",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("value", sa.String(length=255), nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meta_json", _jsonb(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "host_protection_status",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tool", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("details_json", _jsonb(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tool"),
    )
    op.create_table(
        "incidents",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("related_entities_json", _jsonb(), nullable=True),
        sa.Column("summary_json", _jsonb(), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("result", _jsonb(), nullable=True),
        sa.Column("error", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "model_runs",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=True),
        sa.Column("dataset_id", sa.String(length=128), nullable=True),
        sa.Column("model_type", sa.String(length=64), nullable=False),
        sa.Column("algorithm", sa.String(length=128), nullable=False),
        sa.Column("parameters", _jsonb(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("metrics_summary", _jsonb(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("source_ip", sa.String(length=64), nullable=True),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "model_alerts",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("run_id", sa.String(length=128), nullable=True),
        sa.Column("alert_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("threshold", _jsonb(), nullable=True),
        sa.Column("payload", _jsonb(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["model_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "model_results",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("run_id", sa.String(length=128), nullable=False),
        sa.Column("metrics", _jsonb(), nullable=True),
        sa.Column("coefficients", _jsonb(), nullable=True),
        sa.Column("residuals", _jsonb(), nullable=True),
        sa.Column("diagnostics", _jsonb(), nullable=True),
        sa.Column("artifacts_path", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["model_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "security_events",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=True),
        sa.Column("segment", sa.String(length=64), nullable=True),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("src_ip", sa.String(length=64), nullable=True),
        sa.Column("dst_ip", sa.String(length=64), nullable=True),
        sa.Column("dst_host", sa.String(length=255), nullable=True),
        sa.Column("dst_service", sa.String(length=128), nullable=True),
        sa.Column("user", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=True),
        sa.Column("technique_category", sa.String(length=64), nullable=True),
        sa.Column("attack_phase", sa.String(length=64), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("src_geo_json", _jsonb(), nullable=True),
        sa.Column("dst_geo_json", _jsonb(), nullable=True),
        sa.Column("iocs_json", _jsonb(), nullable=True),
        sa.Column("scenario_id", sa.String(length=64), nullable=True),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("architecture_version_id", sa.String(length=64), nullable=True),
        sa.Column("explanation_json", _jsonb(), nullable=True),
        sa.Column("raw_json", _jsonb(), nullable=True),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "simulation_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.Column("architecture_version_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary_json", _jsonb(), nullable=True),
        sa.Column("outcomes_json", _jsonb(), nullable=True),
        sa.Column("events_written", sa.Integer(), nullable=False),
        sa.Column("initiated_by", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "entity_edges",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("ts_bucket", sa.DateTime(timezone=True), nullable=False),
        sa.Column("src_entity_id", sa.String(length=64), nullable=False),
        sa.Column("dst_entity_id", sa.String(length=64), nullable=False),
        sa.Column("edge_type", sa.String(length=32), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("severity_max", sa.String(length=16), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_security_events_ts", "security_events", ["ts"])
    op.create_index("ix_security_events_source", "security_events", ["source"])
    op.create_index("ix_security_events_event_type", "security_events", ["event_type"])
    op.create_index("ix_security_events_segment", "security_events", ["segment"])
    op.create_index("ix_security_events_severity", "security_events", ["severity"])
    op.create_index("ix_security_events_src_ip", "security_events", ["src_ip"])
    op.create_index("ix_security_events_dst_ip", "security_events", ["dst_ip"])
    op.create_index("ix_security_events_dst_host", "security_events", ["dst_host"])
    op.create_index("ix_security_events_dst_service", "security_events", ["dst_service"])
    op.create_index("ix_security_events_user", "security_events", ["user"])
    op.create_index("ix_security_events_technique_category", "security_events", ["technique_category"])
    op.create_index("ix_security_events_attack_phase", "security_events", ["attack_phase"])
    op.create_index("ix_security_events_scenario_id", "security_events", ["scenario_id"])
    op.create_index("ix_security_events_run_id", "security_events", ["run_id"])
    op.create_index("ix_security_events_architecture_version_id", "security_events", ["architecture_version_id"])
    op.create_index("ix_security_events_ingested_at", "security_events", ["ingested_at"])

    op.create_index("ix_entities_type", "entities", ["type"])
    op.create_index("ix_entities_value", "entities", ["value"])

    op.create_index("ix_entity_edges_ts_bucket", "entity_edges", ["ts_bucket"])
    op.create_index("ix_entity_edges_src_entity_id", "entity_edges", ["src_entity_id"])
    op.create_index("ix_entity_edges_dst_entity_id", "entity_edges", ["dst_entity_id"])
    op.create_index("ix_entity_edges_edge_type", "entity_edges", ["edge_type"])


def downgrade() -> None:
    op.drop_index("ix_entity_edges_edge_type", table_name="entity_edges")
    op.drop_index("ix_entity_edges_dst_entity_id", table_name="entity_edges")
    op.drop_index("ix_entity_edges_src_entity_id", table_name="entity_edges")
    op.drop_index("ix_entity_edges_ts_bucket", table_name="entity_edges")
    op.drop_table("entity_edges")

    op.drop_index("ix_entities_value", table_name="entities")
    op.drop_index("ix_entities_type", table_name="entities")
    op.drop_table("entities")

    op.drop_index("ix_security_events_ingested_at", table_name="security_events")
    op.drop_index("ix_security_events_architecture_version_id", table_name="security_events")
    op.drop_index("ix_security_events_run_id", table_name="security_events")
    op.drop_index("ix_security_events_scenario_id", table_name="security_events")
    op.drop_index("ix_security_events_attack_phase", table_name="security_events")
    op.drop_index("ix_security_events_technique_category", table_name="security_events")
    op.drop_index("ix_security_events_user", table_name="security_events")
    op.drop_index("ix_security_events_dst_service", table_name="security_events")
    op.drop_index("ix_security_events_dst_host", table_name="security_events")
    op.drop_index("ix_security_events_dst_ip", table_name="security_events")
    op.drop_index("ix_security_events_src_ip", table_name="security_events")
    op.drop_index("ix_security_events_severity", table_name="security_events")
    op.drop_index("ix_security_events_segment", table_name="security_events")
    op.drop_index("ix_security_events_event_type", table_name="security_events")
    op.drop_index("ix_security_events_source", table_name="security_events")
    op.drop_index("ix_security_events_ts", table_name="security_events")
    op.drop_table("security_events")

    op.drop_table("simulation_runs")
    op.drop_table("model_results")
    op.drop_table("model_alerts")
    op.drop_table("model_runs")
    op.drop_table("jobs")
    op.drop_table("incidents")
    op.drop_table("host_protection_status")
    op.drop_table("audit_logs")
    op.drop_table("attack_scenarios")
    op.drop_table("architecture_versions")
    op.drop_table("datasets")
