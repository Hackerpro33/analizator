from __future__ import annotations

from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


class LineykaFilter(BaseModel):
    column: str = Field(..., description="Имя столбца для фильтрации")
    kind: Literal["text", "number", "date", "categorical", "search"] = "text"
    operator: str = Field("contains", description="Оператор фильтра (например contains, equals, between)")
    value: Optional[Union[str, float, int]] = None
    value_to: Optional[Union[str, float, int]] = None
    values: List[Union[str, float, int]] = Field(default_factory=list)
    case_sensitive: bool = False


class LineykaSort(BaseModel):
    column: str
    direction: Literal["asc", "desc"] = "asc"


class LineykaQueryRequest(BaseModel):
    limit: int = Field(200, ge=1, le=5000)
    offset: int = Field(0, ge=0)
    filters: List[LineykaFilter] = Field(default_factory=list)
    sort: List[LineykaSort] = Field(default_factory=list)
    search: Optional[str] = None
    include_columns: Optional[List[str]] = None
    exclude_columns: Optional[List[str]] = None


class KeepFilteredOperation(BaseModel):
    type: Literal["keep_filtered"] = "keep_filtered"
    filters: List[LineykaFilter] = Field(default_factory=list)


class DeleteColumnsOperation(BaseModel):
    type: Literal["delete_columns"] = "delete_columns"
    columns: List[str]


class DeleteRowsOperation(BaseModel):
    type: Literal["delete_rows"] = "delete_rows"
    row_ids: Optional[List[int]] = None
    filters: List[LineykaFilter] = Field(default_factory=list)
    mode: Literal["selected", "filtered"] = "selected"


class AddRowsOperation(BaseModel):
    type: Literal["add_rows"] = "add_rows"
    rows: List[Dict[str, Union[str, int, float, None]]]


class AddColumnOperation(BaseModel):
    type: Literal["add_column"] = "add_column"
    name: str
    strategy: Literal["constant", "copy", "arithmetic"] = "constant"
    constant_value: Optional[Union[str, float, int]] = None
    source_column: Optional[str] = None
    arithmetic: Optional[Dict[str, Union[str, float]]] = None  # {"left": "col", "operator": "+", "right": "col2"}


class AppendRowsOperation(BaseModel):
    type: Literal["append_rows"] = "append_rows"
    source_dataset_id: str
    source_version_id: Optional[str] = None
    align_by_names: bool = True
    column_mapping: Dict[str, str] = Field(default_factory=dict)


class JoinColumnsOperation(BaseModel):
    type: Literal["join_columns"] = "join_columns"
    source_dataset_id: str
    source_version_id: Optional[str] = None
    left_on: str
    right_on: str
    columns: List[str]
    suffix: str = "_src"


class UpdateCellsOperation(BaseModel):
    type: Literal["update_cells"] = "update_cells"
    updates: List[Dict[str, Union[str, int, float, None]]] = Field(
        ..., description="Список {row_id, column, value}"
    )


LineykaOperation = Union[
    KeepFilteredOperation,
    DeleteColumnsOperation,
    DeleteRowsOperation,
    AddRowsOperation,
    AddColumnOperation,
    AppendRowsOperation,
    JoinColumnsOperation,
    UpdateCellsOperation,
]


class LineykaTransformRequest(BaseModel):
    operations: List[LineykaOperation]

    @model_validator(mode="before")
    def _ensure_operations(cls, values):
        data = dict(values or {})
        ops = data.get("operations") or []
        if not ops:
            raise ValueError("operations не может быть пустым")
        return values


class ForecastJobRequest(BaseModel):
    date_column: str
    value_column: str
    sef_columns: List[str] = Field(default_factory=list)
    horizon: int = Field(12, ge=1, le=36)
    methods: List[str] = Field(default_factory=list)
    ensemble_mode: Literal["none", "simple", "weighted"] = "weighted"
    mode: Literal["append", "replace"] = "append"


class LineykaAuditRequest(BaseModel):
    date_column: Optional[str] = None
    target_column: Optional[str] = None


class LineykaPublishRequest(BaseModel):
    mode: Literal["new", "update"] = "new"
    target_dataset_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
