from pydantic import BaseModel, Field
from typing import Literal, Optional, List, Dict
from datetime import datetime

VastuDirection = Literal[
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
]


class DesignCustomizationRequest(BaseModel):
    wall_color: Optional[str] = None
    flooring: Optional[str] = None
    furniture_style: Optional[str] = None
    style: Optional[str] = None


class DesignGenerateRequest(BaseModel):
    room_id: str
    style: str
    room_type: Optional[str] = "living"
    budget: Optional[float] = None
    wall_color: Optional[str] = "white"
    flooring_material: Optional[str] = "hardwood"
    custom_prompt: Optional[str] = Field(None, max_length=500)
    room_location: Optional[VastuDirection] = None


class DesignGenerateResponse(BaseModel):
    design_id: str
    status: str
    message: str


class ImageVastuFinding(BaseModel):
    guideline: str
    assessment: str
    evidence: str
    confidence: float


class ImageVastuAnalysisResponse(BaseModel):
    image_index: int
    status: str
    score: Optional[float] = None
    confidence: Optional[float] = None
    summary: str
    findings: List[ImageVastuFinding] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    room_type: Optional[str] = None
    camera_direction: Optional[str] = None
    room_location: Optional[str] = None
    model: Optional[str] = None


class DesignResponse(BaseModel):
    id: str
    room_id: str
    user_id: str
    style: str
    budget: Optional[float] = None
    image_1_url: Optional[str] = None
    image_2_url: Optional[str] = None
    image_3_url: Optional[str] = None
    estimated_cost: Optional[float] = None
    budget_match_percentage: Optional[float] = None
    furniture_breakdown: Optional[Dict] = None
    vastu_score: Optional[float] = None
    vastu_suggestions: Optional[List[str]] = None
    vastu_warnings: Optional[List[str]] = None
    image_vastu_analyses: List[ImageVastuAnalysisResponse] = Field(default_factory=list)
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class DesignListResponse(BaseModel):
    designs: List[DesignResponse]
    total: int


class DesignWithDetails(BaseModel):
    design: DesignResponse
    room_image_url: str
    budget_summary: Dict
