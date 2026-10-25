"""Instance-wide settings stored in the database."""

from typing import Any

from sqlalchemy.orm import Session

from ..models import AppSetting

DISABLED_PROVIDERS = "disabled_providers"


def get(db: Session, key: str, default: Any = None) -> Any:
    row = db.get(AppSetting, key)
    return row.value if row else default


def put(db: Session, key: str, value: Any) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()
