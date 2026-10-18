from sqlalchemy import Column, DateTime, Float, String
from sqlalchemy.sql import func

from app.database import Base


class RoomOrientation(Base):
    __tablename__ = "room_orientations"

    room_id = Column(String(36), primary_key=True)
    user_id = Column(String(128), nullable=False, index=True)
    heading_degrees = Column(Float, nullable=False)
    direction = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
