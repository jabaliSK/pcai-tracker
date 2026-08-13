import uuid

from sqlalchemy import Column, Integer, String, Date, Text, DateTime, Float, func
from .database import Base


class Engagement(Base):
    __tablename__ = "engagements"

    uid = Column(
        String(36),
        primary_key=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
    )
    customer = Column(String(255), nullable=False, index=True)
    pm = Column(String(255))
    type = Column(String(100))  # VPN / Screen Share
    testing_method = Column(String(50))  # Manual / Automated

    testing_date = Column(Date)
    orientation_date = Column(Date)

    testing_resource = Column(String(255))
    orientation_resource = Column(String(255))

    vpn_app_ip = Column(Text)
    vpn_user = Column(String(255))
    vpn_pass = Column(String(255))
    vpn_details = Column(Text)

    screen_share_resource = Column(String(255))

    testing_status = Column(String(100))
    orientation_status = Column(String(100))

    testing_hours = Column(Float)
    orientation_hours = Column(Integer)

    orientation_feedback = Column(Text)

    comments = Column(Text)
    tickets = Column(String(255))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OptionItem(Base):
    """Configurable dropdown values, editable via the Settings page."""

    __tablename__ = "option_items"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False, index=True)
    value = Column(String(255), nullable=False)
    position = Column(Integer, nullable=False, default=0)


class StatusEvent(Base):
    """History of testing-status changes per engagement (for the auto timer)."""

    __tablename__ = "status_events"

    id = Column(Integer, primary_key=True, index=True)
    engagement_uid = Column(String(36), index=True, nullable=False)
    status = Column(String(100))
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
