from __future__ import annotations

import logging
from logging.config import fileConfig
from typing import Iterable, List

from alembic import context
from sqlalchemy import Engine, MetaData, engine_from_config, pool

from app.config import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")


def _combine_metadata(metadata_list: Iterable[MetaData]) -> MetaData:
    combined = MetaData()
    for metadata in metadata_list:
        if not isinstance(metadata, MetaData):
            continue
        for table in metadata.tables.values():
            if table.name in combined.tables:
                continue
            table.tometadata(combined)
    return combined


def _load_metadata() -> MetaData:
    metadatas: List[MetaData] = []

    from app.services.security_event_store import security_metadata

    metadatas.append(security_metadata)

    try:
        from app.services.metadata_repository import metadata as metadata_repository
    except Exception as exc:  # pragma: no cover - optional dependency
        logger.warning("metadata_repository_import_failed", exc_info=exc)
    else:
        if isinstance(metadata_repository, MetaData):
            metadatas.append(metadata_repository)

    from app.services.security_architecture import metadata as architecture_metadata

    metadatas.append(architecture_metadata)

    from app.services.host_protection import metadata as host_metadata

    metadatas.append(host_metadata)

    return _combine_metadata(metadatas)


target_metadata = _load_metadata()


def _configure_sqlalchemy_url() -> None:
    settings = get_settings()
    config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    _configure_sqlalchemy_url()
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    _configure_sqlalchemy_url()
    connectable: Engine = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
