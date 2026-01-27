from __future__ import annotations

from pydantic import AnyHttpUrl, TypeAdapter

from app.services import object_storage


def test_get_object_storage_casts_endpoint_url_to_string(monkeypatch, tmp_path):
    adapter = TypeAdapter(AnyHttpUrl)
    endpoint = adapter.validate_python("http://minio:9000")
    captured = {}

    class DummyS3Client:
        def head_bucket(self, Bucket):
            captured["head_bucket"] = Bucket

        def put_object(self, **kwargs):
            captured["put_object_kwargs"] = kwargs

    class FakeBoto3:
        def __init__(self):
            self.client_kwargs = None

        def client(self, service_name, **kwargs):
            captured["service_name"] = service_name
            captured["client_kwargs"] = kwargs
            return DummyS3Client()

class DummyConfig:
        def __init__(self, **kwargs):
            captured["config_kwargs"] = kwargs

    object_storage.get_object_storage.cache_clear()
    monkeypatch.setattr(object_storage, "boto3", FakeBoto3())
    monkeypatch.setattr(object_storage, "Config", DummyConfig)
    monkeypatch.setattr(object_storage, "ClientError", RuntimeError)
    monkeypatch.setattr(object_storage, "BotoCoreError", RuntimeError)

    class DummySettings:
        object_storage_bucket = "test-bucket"
        object_storage_endpoint_url = endpoint
        object_storage_access_key = "access"
        object_storage_secret_key = "secret"
        object_storage_region = "us-east-1"
        object_storage_path_style = True
        object_storage_use_ssl = False
        object_storage_local_root = tmp_path

    monkeypatch.setattr(object_storage, "get_settings", lambda: DummySettings())

    storage = object_storage.get_object_storage()

    assert captured["client_kwargs"]["endpoint_url"] == "http://minio:9000"
    assert isinstance(captured["client_kwargs"]["endpoint_url"], str)
    assert storage.bucket == "test-bucket"

    object_storage.get_object_storage.cache_clear()


def test_object_storage_falls_back_when_endpoint_unreachable(monkeypatch, tmp_path):
    class DummyError(RuntimeError):
        pass

    class DummyS3Client:
        def head_bucket(self, Bucket):
            raise DummyError("network is down")

    class FakeBoto3:
        def client(self, *args, **kwargs):
            return DummyS3Client()

    object_storage.get_object_storage.cache_clear()


def test_object_storage_falls_back_when_client_creation_fails(monkeypatch, tmp_path):
    class DummyError(RuntimeError):
        pass

    class FakeBoto3:
        def client(self, *args, **kwargs):
            raise DummyError("dns failure")

    object_storage.get_object_storage.cache_clear()
    monkeypatch.setattr(object_storage, "boto3", FakeBoto3())
    monkeypatch.setattr(object_storage, "Config", lambda **kwargs: None)
    monkeypatch.setattr(object_storage, "ClientError", DummyError)
    monkeypatch.setattr(object_storage, "BotoCoreError", DummyError)
    monkeypatch.setattr(object_storage, "EndpointConnectionError", DummyError)

    class DummySettings:
        object_storage_bucket = "test-bucket"
        object_storage_endpoint_url = "http://minio:9000"
        object_storage_access_key = "access"
        object_storage_secret_key = "secret"
        object_storage_region = "us-east-1"
        object_storage_path_style = True
        object_storage_use_ssl = False
        object_storage_local_root = tmp_path

    monkeypatch.setattr(object_storage, "get_settings", lambda: DummySettings())

    storage = object_storage.get_object_storage()

    assert storage._s3_client is None  # type: ignore[attr-defined]

    object_storage.get_object_storage.cache_clear()
    monkeypatch.setattr(object_storage, "boto3", FakeBoto3())
    monkeypatch.setattr(object_storage, "Config", lambda **kwargs: None)
    monkeypatch.setattr(object_storage, "ClientError", DummyError)
    monkeypatch.setattr(object_storage, "BotoCoreError", DummyError)
    monkeypatch.setattr(object_storage, "EndpointConnectionError", DummyError)

    class DummySettings:
        object_storage_bucket = "test-bucket"
        object_storage_endpoint_url = "http://minio:9000"
        object_storage_access_key = "access"
        object_storage_secret_key = "secret"
        object_storage_region = "us-east-1"
        object_storage_path_style = True
        object_storage_use_ssl = False
        object_storage_local_root = tmp_path

    monkeypatch.setattr(object_storage, "get_settings", lambda: DummySettings())

    storage = object_storage.get_object_storage()

    assert storage._s3_client is None  # type: ignore[attr-defined]

    object_storage.get_object_storage.cache_clear()
