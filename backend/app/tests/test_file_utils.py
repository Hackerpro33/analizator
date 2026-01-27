import sys
from types import SimpleNamespace

import pytest


class _DummyPDF:
    def __init__(self):
        self.pages = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


pdfplumber_stub = SimpleNamespace(open=lambda *_args, **_kwargs: _DummyPDF())
pytesseract_stub = SimpleNamespace(
    image_to_string=lambda *_args, **_kwargs: "",
    pytesseract=SimpleNamespace(TesseractNotFoundError=RuntimeError),
)
class _DummyImage:
    def convert(self, *_args, **_kwargs):
        return self


pil_image_module = SimpleNamespace(open=lambda *_args, **_kwargs: _DummyImage())

class _HTTPException(Exception):
    def __init__(self, status_code, detail=None):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


sys.modules.setdefault("pdfplumber", pdfplumber_stub)
sys.modules.setdefault("pytesseract", pytesseract_stub)
sys.modules.setdefault("PIL", SimpleNamespace(Image=pil_image_module))
sys.modules.setdefault("PIL.Image", pil_image_module)
sys.modules.setdefault("fastapi", SimpleNamespace(HTTPException=_HTTPException))

from ..utils import files


@pytest.fixture(autouse=True)
def isolate_uploads(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    uploads.mkdir(parents=True)
    monkeypatch.setattr(files, "UPLOAD_DIR", uploads)
    # also ensure DATA_DIR exists for helper functions constructing relative paths
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    monkeypatch.setattr(files, "DATA_DIR", data_dir)
    files._FILE_REGISTRY.clear()
    yield uploads


def test_resolve_file_path_uses_dataset_identifier(tmp_path):
    dataset_dir = files.UPLOAD_DIR / "datasets" / "abc123"
    dataset_dir.mkdir(parents=True)
    target_file = dataset_dir / "table.csv"
    target_file.write_text("a\n1\n", encoding="utf-8")

    resolved = files.resolve_file_path("abc123")

    assert resolved == target_file.resolve()


def test_resolve_file_path_supports_nested_upload_path(tmp_path):
    dataset_dir = files.UPLOAD_DIR / "datasets" / "def456"
    dataset_dir.mkdir(parents=True)
    nested = dataset_dir / "data" / "report.csv"
    nested.parent.mkdir(parents=True)
    nested.write_text("value\n2\n", encoding="utf-8")

    resolved = files.resolve_file_path("datasets/def456/data/report.csv")

    assert resolved == nested.resolve()
