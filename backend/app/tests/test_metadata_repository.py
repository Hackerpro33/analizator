from __future__ import annotations

import pytest

from app.services import metadata_repository


@pytest.mark.skipif(not metadata_repository.SQLALCHEMY_AVAILABLE, reason="SQLAlchemy not available")
def test_metadata_repository_falls_back_to_sqlite(monkeypatch, tmp_path):
    metadata_repository.get_metadata_repository.cache_clear()

    original_create_engine = metadata_repository.create_engine
    called_urls = []

    def fake_create_engine(url, future=True):
        called_urls.append(url)
        if url.startswith("postgresql"):
            raise metadata_repository.SQLAlchemyError("boom")  # type: ignore[arg-type]
        return original_create_engine(url, future=future)

    class DummySettings:
        database_url = "postgresql://postgres:password@localhost:5432/app"
        object_storage_local_root = tmp_path / "uploads"

    monkeypatch.setattr(metadata_repository, "create_engine", fake_create_engine)
    monkeypatch.setattr(metadata_repository, "get_settings", lambda: DummySettings())

    repo = metadata_repository.get_metadata_repository()

    assert isinstance(repo, metadata_repository.SqlMetadataRepository)
    assert any("postgresql" in url for url in called_urls)
    assert any("metadata_local.db" in url for url in called_urls)

    metadata_repository.get_metadata_repository.cache_clear()
    monkeypatch.setattr(metadata_repository, "create_engine", original_create_engine)
