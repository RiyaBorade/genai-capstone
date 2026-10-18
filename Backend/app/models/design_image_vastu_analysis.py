from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.sql import func

from app.database import Base


class DesignImageVastuAnalysis(Base):
    __tablename__ = "design_image_vastu_analyses"

    id = Column(String(36), primary_key=True, index=True)
    design_id = Column(
        String(36),
        ForeignKey("designs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    image_index = Column(Integer, nullable=False)
    assessment = Column(JSON, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
