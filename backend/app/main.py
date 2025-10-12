from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import pandas as pd
import numpy as np
import os
import json
import sys
import uuid
from typing import Optional, Dict, Any, List

from .utils.files import (
    DATA_DIR,
    UPLOAD_DIR,
    read_table_bytes,
    register_uploaded_file,
    resolve_file_path,
    safe_filename,
)

app = FastAPI(title="Insight Sphere Backend", version="0.1.0")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach a strict set of security-oriented HTTP headers."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "same-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        }
        for header, value in headers.items():
            response.headers.setdefault(header, value)
        return response

# --- CORS ---
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
ADDITIONAL_ORIGINS: List[str] = [
    origin.strip()
    for origin in os.getenv("ADDITIONAL_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
allow_origins = {FRONTEND_ORIGIN, "http://127.0.0.1:5173", "http://127.0.0.1:5174"}
allow_origins.update(ADDITIONAL_ORIGINS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allow_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

allowed_hosts_env = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1")
allowed_hosts = [host.strip() for host in allowed_hosts_env.split(",") if host.strip()]
allowed_hosts.append("127.0.0.1")
allowed_hosts.append("localhost")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(dict.fromkeys(allowed_hosts)))
app.add_middleware(SecurityHeadersMiddleware)

EMAIL_LOG_PATH = DATA_DIR / "email_log.jsonl"

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024

@app.get("/health")
def health():
    return {"status": "ok"}

def detect_general_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    return "string"

CRIME_TREND_KEYWORDS = ("crime", "offense", "incident", "violence", "homicide")
POLICING_TREND_KEYWORDS = ("police", "patrol", "enforcement")
RISK_FACTOR_KEYWORDS = ("unemployment", "poverty", "alcohol", "drug", "gang", "homeless")


def _numeric_series(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.dropna()


def _generate_domain_insights(df: pd.DataFrame) -> List[str]:
    insights: List[str] = []
    lower_name_map = {str(col): str(col).lower() for col in df.columns}

    for original_name, lower_name in lower_name_map.items():
        numeric = _numeric_series(df[original_name])
        if numeric.empty:
            continue

        if any(keyword in lower_name for keyword in CRIME_TREND_KEYWORDS):
            change = float(numeric.iloc[-1] - numeric.iloc[0])
            if change > 0:
                insights.append(
                    f"Crime indicator '{original_name}' increased by {change:.2f} between the first and last records."
                )
            elif change < 0:
                insights.append(
                    f"Crime indicator '{original_name}' decreased by {abs(change):.2f} between the first and last records."
                )
            else:
                insights.append(
                    f"Crime indicator '{original_name}' remained stable across the observed period."
                )
            continue

        if any(keyword in lower_name for keyword in POLICING_TREND_KEYWORDS):
            change = float(numeric.iloc[-1] - numeric.iloc[0])
            if change > 0:
                insights.append(
                    f"Policing resource '{original_name}' increased by {change:.2f} between the first and last records."
                )
            elif change < 0:
                insights.append(
                    f"Policing resource '{original_name}' decreased by {abs(change):.2f} between the first and last records."
                )
            else:
                insights.append(
                    f"Policing resource '{original_name}' remained stable across the observed period."
                )
            continue

        if any(keyword in lower_name for keyword in RISK_FACTOR_KEYWORDS):
            average = float(numeric.mean())
            insights.append(
                f"Risk factor '{original_name}' averages {average:.2f} across the dataset."
            )

    return insights


def build_extraction(df: pd.DataFrame, sample_rows: int = 100) -> Dict[str, Any]:
    cols = [{"name": str(c), "type": detect_general_type(df[c])} for c in df.columns]
    sample = df.head(sample_rows).replace({np.nan: ""}).astype(object)
    sample = sample.to_dict(orient="records")
    insights = _generate_domain_insights(df)
    return {
        "columns": cols,
        "row_count": int(len(df)),
        "sample_data": sample,
        "insights": insights,
    }


# simple in-memory registry file_id -> path
@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max allowed size is {MAX_UPLOAD_SIZE_MB} MB",
        )
    # save
    fid = str(uuid.uuid4())
    safe = safe_filename(file.filename or "file")
    path = UPLOAD_DIR / f"{fid}_{safe}"
    with path.open("wb") as f:
        f.write(data)
    register_uploaded_file(fid, path)
    # quick extraction for preview (optional)
    try:
        df = read_table_bytes(data, file.filename)
        extraction = build_extraction(df)
    except Exception:
        extraction = None
    return {"status": "success", "file_url": fid, "filename": file.filename, "quick_extraction": extraction}

class ExtractRequest(BaseModel):
    file_url: str
    json_schema: Optional[dict] = None

@app.post("/api/extract")
def api_extract(req: ExtractRequest):
    path = resolve_file_path(req.file_url)
    with path.open("rb") as f:
        file_bytes = f.read()
    try:
        df = read_table_bytes(file_bytes, path.name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    output = build_extraction(df)
    return {"status": "success", "output": output}

class EmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    from_name: Optional[str] = None


@app.post("/api/utils/send-email")
async def api_send_email(payload: EmailRequest):
    record = {
        "to": payload.to,
        "subject": payload.subject,
        "body": payload.body,
        "from_name": payload.from_name,
    }
    try:
        with EMAIL_LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to log email: {exc}")
    return {"status": "queued", "logged": True}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)



# Allow running both as part of the ``app`` package (e.g. ``uvicorn app.main:app``)
# and as a standalone script (e.g. ``python main.py`` or ``uvicorn main:app``).
if __package__ in {None, ""}:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.append(current_dir)
    import audit_api as audit_router_module
    import chat_api as chat_router_module
    import datasets_api as datasets_router_module
    import visualizations_api as visualizations_router_module
else:
    from . import audit_api as audit_router_module
    from . import chat_api as chat_router_module
    from . import datasets_api as datasets_router_module
    from . import visualizations_api as visualizations_router_module

datasets_router = datasets_router_module.router
visualizations_router = visualizations_router_module.router
chat_router = chat_router_module.router
audit_router = audit_router_module.router

app.include_router(datasets_router, prefix="/api/dataset")
app.include_router(visualizations_router, prefix="/api/visualization")
app.include_router(chat_router, prefix="/api/chat")
app.include_router(audit_router, prefix="/api/audit")
