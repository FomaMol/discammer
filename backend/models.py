from typing import Optional

from pydantic import BaseModel


class PostResponse(BaseModel):
    id: int
    slug: str
    title: str
    subtitle: Optional[str] = None
    type: str
    cover_image: Optional[str] = None
    published_at: Optional[str] = None


class ScamGuideResponse(BaseModel):
    id: int
    slug: str
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    threat_level: Optional[int] = None
    category: Optional[str] = None


class CourseModuleResponse(BaseModel):
    id: int
    order: int
    title: str
    description: Optional[str] = None
    is_locked: bool = True
    icon: Optional[str] = None
    duration: Optional[str] = None
    lessons: int = 0
    difficulty: Optional[str] = None
    topics: list[str] = []
    objectives: list[str] = []
    accent: Optional[str] = None
