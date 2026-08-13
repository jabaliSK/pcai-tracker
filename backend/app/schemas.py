from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class EngagementBase(BaseModel):
    customer: str
    pm: Optional[str] = None
    type: Optional[str] = None
    testing_method: Optional[str] = None
    testing_date: Optional[date] = None
    orientation_date: Optional[date] = None
    testing_resource: Optional[str] = None
    orientation_resource: Optional[str] = None
    vpn_app_ip: Optional[str] = None
    vpn_user: Optional[str] = None
    vpn_pass: Optional[str] = None
    vpn_details: Optional[str] = None
    screen_share_resource: Optional[str] = None
    testing_status: Optional[str] = None
    orientation_status: Optional[str] = None
    testing_hours: Optional[float] = None
    orientation_hours: Optional[int] = None
    orientation_feedback: Optional[str] = None
    comments: Optional[str] = None
    tickets: Optional[str] = None


class EngagementCreate(EngagementBase):
    pass


class EngagementUpdate(BaseModel):
    customer: Optional[str] = None
    pm: Optional[str] = None
    type: Optional[str] = None
    testing_method: Optional[str] = None
    testing_date: Optional[date] = None
    orientation_date: Optional[date] = None
    testing_resource: Optional[str] = None
    orientation_resource: Optional[str] = None
    vpn_app_ip: Optional[str] = None
    vpn_user: Optional[str] = None
    vpn_pass: Optional[str] = None
    vpn_details: Optional[str] = None
    screen_share_resource: Optional[str] = None
    testing_status: Optional[str] = None
    orientation_status: Optional[str] = None
    testing_hours: Optional[int] = None
    orientation_hours: Optional[int] = None
    orientation_feedback: Optional[str] = None
    comments: Optional[str] = None
    tickets: Optional[str] = None


class Engagement(EngagementBase):
    model_config = ConfigDict(from_attributes=True)
    uid: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class OptionsUpdate(BaseModel):
    values: list[str]


class StatusEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: Optional[str] = None
    changed_at: Optional[datetime] = None
