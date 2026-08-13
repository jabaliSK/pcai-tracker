import uuid
from collections import defaultdict
from typing import List, Optional
from datetime import date, timedelta, datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
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


def _add_status_event(db: Session, uid: str, status: Optional[str]):
    db.add(
        models.StatusEvent(
            engagement_uid=uid,
            status=status,
            changed_at=datetime.now(timezone.utc),
        )
    )


def _compute_hours(events, now):
    """Total hours an engagement has spent in the 'In Progress' status."""
    acc = 0.0
    start = None
    for e in sorted(events, key=lambda x: x.changed_at):
        if start is not None:
            acc += (e.changed_at - start).total_seconds()
            start = None
        if (e.status or "").strip().lower() == IN_PROGRESS:
            start = e.changed_at
    if start is not None:
        acc += (now - start).total_seconds()
    return round(acc / 3600.0, 2)


def _attach_hours(db: Session, objs):
    """Set testing_hours (in memory) from status history for each engagement.

    Engagements without any recorded status events keep their stored value so
    legacy manually-entered hours are preserved.
    """
    single = not isinstance(objs, list)
    items = [objs] if single else objs
    uids = [o.uid for o in items if o.uid]
    by_uid = defaultdict(list)
    if uids:
        events = (
            db.query(models.StatusEvent)
            .filter(models.StatusEvent.engagement_uid.in_(uids))
            .all()
        )
        for e in events:
            by_uid[e.engagement_uid].append(e)
    now = datetime.now(timezone.utc)
    for o in items:
        evs = by_uid.get(o.uid)
        if evs:
            o.testing_hours = _compute_hours(evs, now)
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
        models.Engagement.testing_date.desc().nullslast(),
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
    data["testing_hours"] = 0
    data["uid"] = str(uuid.uuid4())
    obj = models.Engagement(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    _add_status_event(db, obj.uid, obj.testing_status)
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
    # testing_hours is auto-calculated from status history; never trust client.
    updates.pop("testing_hours", None)
    old_status = obj.testing_status
    new_status = updates.get("testing_status", old_status)
    for key, value in updates.items():
        setattr(obj, key, value)
    status_changed = "testing_status" in updates and new_status != old_status
    db.commit()
    db.refresh(obj)
    if status_changed:
        _add_status_event(db, obj.uid, new_status)
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
