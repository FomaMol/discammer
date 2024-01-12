from typing import Any, Optional

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
    slug: str
    locale: str = "en"
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


class LessonSummary(BaseModel):
    """Lightweight lesson representation used in module-detail listings."""

    slug: str
    order: int
    title: str
    est_minutes: int = 5
    widget_type: Optional[str] = None


class LessonResponse(BaseModel):
    """Full lesson payload — body Markdown plus optional widget config."""

    id: int
    module_slug: str
    slug: str
    locale: str
    order: int
    title: str
    body_md: Optional[str] = None
    widget_type: Optional[str] = None
    widget_config: Optional[dict[str, Any]] = None
    est_minutes: int = 5
