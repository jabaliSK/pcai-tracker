import uuid
from collections import defaultdict
from typing import List, Optional
from datetime import date, timedelta, datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, SessionLocal, engine, get_db
from .seed import seed_if_empty


DEFAULT_OPTIONS = {
    "testing_resource": ["Jabali", "DJ", "Pransshu", "Suraj", "Sanjana"],
    "testing_status": ["Pending", "In Progress", "Paused", "Blocked", "Done"],
    "orientation_status": ["Pending", "In Progress", "Paused", "Blocked", "Done"],
}

DEFAULT_SETTINGS = {
    "allow_hours_edit": "false",
}

IN_PROGRESS = "in progress"


def _seed_options(db: Session):
    """Populate default dropdown values for any category not yet present."""
    for category, values in DEFAULT_OPTIONS.items():
        exists = (
            db.query(models.OptionItem)
            .filter(models.OptionItem.category == category)
            .first()
        )
        if exists:
            continue
        for pos, value in enumerate(values):
            db.add(
                models.OptionItem(category=category, value=value, position=pos)
            )
    db.commit()


def _seed_settings(db: Session):
    """Ensure a row exists for every known global setting."""
    for key, value in DEFAULT_SETTINGS.items():
        exists = db.get(models.AppSetting, key)
        if not exists:
            db.add(models.AppSetting(key=key, value=value))
    db.commit()


def _get_bool_setting(db: Session, key: str, default: bool = False) -> bool:
    """Read a boolean setting from the key/value store."""
    row = db.get(models.AppSetting, key)
    if row is None or row.value is None:
        return default
    return str(row.value).strip().lower() in ("1", "true", "yes", "on")


def _add_status_event(db: Session, uid: str, status: Optional[str], kind: str = "testing"):
    db.add(
        models.StatusEvent(
            engagement_uid=uid,
            status=status,
            kind=kind,
            changed_at=datetime.now(timezone.utc),
        )
    )


def _compute_minutes(events, now):
    """Total whole minutes an engagement has spent in the 'In Progress' status."""
    acc = 0.0  # accumulated seconds
    start = None
    for e in sorted(events, key=lambda x: x.changed_at):
        if start is not None:
            acc += (e.changed_at - start).total_seconds()
            start = None
        if (e.status or "").strip().lower() == IN_PROGRESS:
            start = e.changed_at
    if start is not None:
        acc += (now - start).total_seconds()
    return int(round(acc / 60.0))


def _attach_hours(db: Session, objs):
    """Set testing_hours and orientation_hours (in memory) from status history.

    Durations are stored in whole minutes and derived from StatusEvent history,
    split by ``kind``. Engagements without any recorded events of a given kind
    keep their stored value so legacy manually-entered durations are preserved.

    When the global ``allow_hours_edit`` setting is on, a non-zero stored value
    is treated as a manual override and left untouched; records with no manual
    value (0 or null) still fall back to the auto timer so they never show 0.
    """
    manual_mode = _get_bool_setting(db, "allow_hours_edit", False)
    single = not isinstance(objs, list)
    items = [objs] if single else objs
    uids = [o.uid for o in items if o.uid]
    testing_by_uid = defaultdict(list)
    orientation_by_uid = defaultdict(list)
    if uids:
        events = (
            db.query(models.StatusEvent)
            .filter(models.StatusEvent.engagement_uid.in_(uids))
            .all()
        )
        for e in events:
            if (e.kind or "testing") == "orientation":
                orientation_by_uid[e.engagement_uid].append(e)
            else:
                testing_by_uid[e.engagement_uid].append(e)
    now = datetime.now(timezone.utc)
    for o in items:
        t_evs = testing_by_uid.get(o.uid)
        if t_evs and not (manual_mode and o.testing_hours):
            o.testing_hours = _compute_minutes(t_evs, now)
        o_evs = orientation_by_uid.get(o.uid)
        if o_evs and not (manual_mode and o.orientation_hours):
            o.orientation_hours = _compute_minutes(o_evs, now)
    return objs


def _run_migrations():
    """Add newer columns to an existing table without dropping data."""
    statements = [
        "ALTER TABLE engagements ADD COLUMN IF NOT EXISTS vpn_details TEXT",
        "ALTER TABLE engagements ADD COLUMN IF NOT EXISTS screen_share_resource VARCHAR(255)",
        "ALTER TABLE engagements ADD COLUMN IF NOT EXISTS orientation_feedback TEXT",
        "ALTER TABLE engagements ADD COLUMN IF NOT EXISTS testing_method VARCHAR(50)",
        "ALTER TABLE engagements ADD COLUMN IF NOT EXISTS uid VARCHAR(36)",
        "ALTER TABLE engagements ALTER COLUMN testing_hours TYPE double precision USING testing_hours::double precision",
        "ALTER TABLE engagements ALTER COLUMN orientation_hours TYPE double precision USING orientation_hours::double precision",
        "ALTER TABLE status_events ADD COLUMN IF NOT EXISTS kind VARCHAR(20) DEFAULT 'testing'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _backfill_uids():
    """Ensure every row has a uid before uid becomes the primary key."""
    with engine.begin() as conn:
        # Only relevant while the legacy integer id column still exists.
        conn.execute(
            text(
                "UPDATE engagements SET uid = gen_random_uuid()::text "
                "WHERE uid IS NULL"
            )
        )


def _promote_uid_to_pk():
    """Swap the primary key from the legacy integer id to uid, then drop id.

    Runs only once: guarded on the id column still being present. Idempotent
    because subsequent startups find no id column and skip the block.
    """
    ddl = """
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'engagements' AND column_name = 'id'
        ) THEN
            UPDATE engagements SET uid = gen_random_uuid()::text WHERE uid IS NULL;
            ALTER TABLE engagements ALTER COLUMN uid SET NOT NULL;
            ALTER TABLE engagements DROP CONSTRAINT IF EXISTS engagements_pkey;
            DROP INDEX IF EXISTS ix_engagements_uid;
            ALTER TABLE engagements ADD PRIMARY KEY (uid);
            ALTER TABLE engagements DROP COLUMN id;
        END IF;
    END $$;
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))

app = FastAPI(title="PCAI Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

_VERBS = {
    "POST": "create",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
}


def _classify_request(method: str, path: str):
    """Derive (action, entity_type, entity_uid) from an API request path."""
    parts = [p for p in path.split("/") if p]  # e.g. ['api', 'engagements', uid]
    entity_type = parts[1] if len(parts) >= 2 else None
    entity_uid = parts[2] if len(parts) >= 3 else None
    name = entity_type or "resource"
    if name.endswith("s"):
        name = name[:-1]
    action = f"{_VERBS.get(method, method.lower())}_{name}"
    return action, entity_type, entity_uid


@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    """Record every mutating API call in the audit_logs table.

    Runs for POST/PUT/PATCH/DELETE under /api/. The acting user comes from the
    ``X-User`` header sent by the frontend. Auditing must never break the actual
    request, so any failure here is swallowed.
    """
    response = await call_next(request)
    try:
        method = request.method.upper()
        path = request.url.path
        if method in AUDITED_METHODS and path.startswith("/api/"):
            username = (request.headers.get("x-user") or "").strip() or "unknown"
            action, entity_type, entity_uid = _classify_request(method, path)
            db = SessionLocal()
            try:
                db.add(
                    models.AuditLog(
                        username=username[:255],
                        action=action[:100],
                        method=method[:10],
                        path=path[:500],
                        entity_type=(entity_type or None) and entity_type[:50],
                        entity_uid=(entity_uid or None) and entity_uid[:255],
                        status_code=response.status_code,
                    )
                )
                db.commit()
            finally:
                db.close()
    except Exception:
        # Never let audit logging interfere with serving the request.
        pass
    return response



@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    _backfill_uids()
    _promote_uid_to_pk()
    db = SessionLocal()
    try:
        seed_if_empty(db)
        _seed_options(db)
        _seed_settings(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/options")
def list_options(db: Session = Depends(get_db)):
    """Return all configurable dropdown lists grouped by category."""
    items = (
        db.query(models.OptionItem)
        .order_by(models.OptionItem.category, models.OptionItem.position)
        .all()
    )
    result = {category: [] for category in DEFAULT_OPTIONS}
    for item in items:
        result.setdefault(item.category, []).append(item.value)
    return result


@app.put("/api/options/{category}")
def update_options(
    category: str,
    payload: schemas.OptionsUpdate,
    db: Session = Depends(get_db),
):
    """Replace the full list of values for a category."""
    if category not in DEFAULT_OPTIONS:
        raise HTTPException(status_code=404, detail="Unknown option category")
    cleaned = []
    seen = set()
    for raw in payload.values:
        value = (raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
    db.query(models.OptionItem).filter(
        models.OptionItem.category == category
    ).delete()
    for pos, value in enumerate(cleaned):
        db.add(models.OptionItem(category=category, value=value, position=pos))
    db.commit()
    return {category: cleaned}


@app.get("/api/settings", response_model=schemas.Settings)
def get_settings(db: Session = Depends(get_db)):
    """Return global app settings."""
    return schemas.Settings(
        allow_hours_edit=_get_bool_setting(db, "allow_hours_edit", False)
    )


@app.put("/api/settings", response_model=schemas.Settings)
def update_settings(
    payload: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
):
    """Update global app settings. Only provided fields are changed."""
    if payload.allow_hours_edit is not None:
        row = db.get(models.AppSetting, "allow_hours_edit")
        value = "true" if payload.allow_hours_edit else "false"
        if row is None:
            db.add(models.AppSetting(key="allow_hours_edit", value=value))
        else:
            row.value = value
        db.commit()
    return schemas.Settings(
        allow_hours_edit=_get_bool_setting(db, "allow_hours_edit", False)
    )


@app.get("/api/engagements", response_model=List[schemas.Engagement])
def list_engagements(
    search: Optional[str] = None,
    recent_days: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Engagement)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                models.Engagement.customer.ilike(like),
                models.Engagement.pm.ilike(like),
                models.Engagement.testing_resource.ilike(like),
                models.Engagement.orientation_resource.ilike(like),
                models.Engagement.comments.ilike(like),
                models.Engagement.tickets.ilike(like),
            )
        )
    if recent_days is not None:
        cutoff = date.today() - timedelta(days=recent_days)
        query = query.filter(models.Engagement.testing_date >= cutoff)
    results = query.order_by(
        models.Engagement.updated_at.desc().nullslast(),
        models.Engagement.created_at.desc(),
    ).all()
    _attach_hours(db, results)
    return results


@app.get("/api/engagements/{uid}", response_model=schemas.Engagement)
def get_engagement(uid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Engagement, uid)
    if not obj:
        raise HTTPException(status_code=404, detail="Engagement not found")
    _attach_hours(db, obj)
    return obj


@app.get(
    "/api/engagements/{uid}/status-events",
    response_model=List[schemas.StatusEvent],
)
def list_status_events(uid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Engagement, uid)
    if not obj:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return (
        db.query(models.StatusEvent)
        .filter(models.StatusEvent.engagement_uid == obj.uid)
        .order_by(models.StatusEvent.changed_at.asc(), models.StatusEvent.id.asc())
        .all()
    )


@app.post("/api/engagements", response_model=schemas.Engagement, status_code=201)
def create_engagement(payload: schemas.EngagementCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get("testing_date"):
        data["testing_date"] = date.today()
    if not data.get("testing_status"):
        data["testing_status"] = "Pending"
    if _get_bool_setting(db, "allow_hours_edit", False):
        # Manual hours mode: honour the values entered on the form.
        data["testing_hours"] = data.get("testing_hours") or 0
        data["orientation_hours"] = data.get("orientation_hours") or 0
    else:
        data["testing_hours"] = 0
        data["orientation_hours"] = 0
    data["uid"] = str(uuid.uuid4())
    obj = models.Engagement(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    _add_status_event(db, obj.uid, obj.testing_status, kind="testing")
    if obj.orientation_status:
        _add_status_event(db, obj.uid, obj.orientation_status, kind="orientation")
    db.commit()
    _attach_hours(db, obj)
    return obj


@app.put("/api/engagements/{uid}", response_model=schemas.Engagement)
def update_engagement(
    uid: str,
    payload: schemas.EngagementUpdate,
    db: Session = Depends(get_db),
):
    obj = db.get(models.Engagement, uid)
    if not obj:
        raise HTTPException(status_code=404, detail="Engagement not found")
    updates = payload.model_dump(exclude_unset=True)
    # Hours are auto-calculated from status history unless manual editing is
    # enabled globally; otherwise never trust the client's hour values.
    if not _get_bool_setting(db, "allow_hours_edit", False):
        updates.pop("testing_hours", None)
        updates.pop("orientation_hours", None)
    old_testing = obj.testing_status
    new_testing = updates.get("testing_status", old_testing)
    old_orientation = obj.orientation_status

    # When testing is marked Done, orientation begins: default it to Pending so
    # the orientation phase (and its timer) can start.
    testing_becoming_done = (
        "testing_status" in updates
        and (new_testing or "").strip().lower() == "done"
        and old_testing != new_testing
    )
    if testing_becoming_done and not (obj.orientation_status or "").strip():
        updates["orientation_status"] = "Pending"

    new_orientation = updates.get("orientation_status", old_orientation)
    for key, value in updates.items():
        setattr(obj, key, value)
    testing_changed = "testing_status" in updates and new_testing != old_testing
    orientation_changed = (
        "orientation_status" in updates and new_orientation != old_orientation
    )
    db.commit()
    db.refresh(obj)
    if testing_changed:
        _add_status_event(db, obj.uid, new_testing, kind="testing")
    if orientation_changed:
        _add_status_event(db, obj.uid, new_orientation, kind="orientation")
    if testing_changed or orientation_changed:
        db.commit()
    _attach_hours(db, obj)
    return obj


@app.delete("/api/engagements/{uid}", status_code=204)
def delete_engagement(uid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Engagement, uid)
    if not obj:
        raise HTTPException(status_code=404, detail="Engagement not found")
    db.delete(obj)
    db.commit()
    return None


@app.get("/api/audit-logs", response_model=List[schemas.AuditLog])
def list_audit_logs(
    limit: int = 200,
    username: Optional[str] = None,
    entity_uid: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return recent audit log entries, newest first."""
    limit = max(1, min(limit, 1000))
    query = db.query(models.AuditLog)
    if username:
        query = query.filter(models.AuditLog.username == username)
    if entity_uid:
        query = query.filter(models.AuditLog.entity_uid == entity_uid)
    return (
        query.order_by(models.AuditLog.created_at.desc(), models.AuditLog.id.desc())
        .limit(limit)
        .all()
    )

