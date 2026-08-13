import json
import os
from datetime import date

from sqlalchemy.orm import Session

from . import models

SEED_FILE = os.path.join(os.path.dirname(__file__), "seed_data.json")


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _parse_int(value):
    if value is None:
        return None
    if isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def seed_if_empty(db: Session):
    if db.query(models.Engagement).count() > 0:
        return
    if not os.path.exists(SEED_FILE):
        return

    with open(SEED_FILE, "r", encoding="utf-8") as f:
        rows = json.load(f)

    for row in rows:
        db.add(
            models.Engagement(
                customer=row.get("customer") or "Unknown",
                pm=row.get("pm"),
                type=row.get("type"),
                testing_date=_parse_date(row.get("testing_date")),
                orientation_date=_parse_date(row.get("orientation_date")),
                testing_resource=row.get("testing_resource"),
                orientation_resource=row.get("orientation_resource"),
                vpn_app_ip=row.get("vpn_app_ip"),
                vpn_user=row.get("vpn_user"),
                vpn_pass=row.get("vpn_pass"),
                testing_status=row.get("testing_status"),
                orientation_status=row.get("orientation_status"),
                testing_hours=_parse_int(row.get("testing_hours")),
                orientation_hours=_parse_int(row.get("orientation_hours")),
                comments=row.get("comments"),
                tickets=row.get("tickets"),
            )
        )
    db.commit()
