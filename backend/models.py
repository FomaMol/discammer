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


class GuideSource(BaseModel):
    """One editorial source supporting a guide's general safety guidance."""

    publisher: str
    title: str
    url: str
    scope_note: Optional[str] = None
    recorded_at: str


class ScamGuideResponse(BaseModel):
    id: int
    slug: str
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    threat_level: Optional[int] = None
    category: Optional[str] = None
    source_scope: Optional[str] = None
    source_catalogued_at: Optional[str] = None
    sources: list[GuideSource] = []


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
    content_revision: Optional[str] = None


class LessonProgressSummary(BaseModel):
    module_slug: str
    slug: str
    content_revision: Optional[str] = None


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
