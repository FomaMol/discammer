from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from database import (
    get_conn,
    get_course_modules,
    get_guides,
    get_lesson,
    get_lessons_for_module,
    get_module_by_slug,
    get_posts,
)
from models import (
    CourseModuleResponse,
    LessonResponse,
    LessonSummary,
    PostResponse,
    ScamGuideResponse,
)

router = APIRouter(prefix="/api", tags=["api"])


Locale = Literal["en", "ru"]


@router.get("/posts", response_model=List[PostResponse])
async def list_posts(
    type: Optional[str] = Query(default=None, description="Filter by post type"),
    limit: Optional[int] = Query(default=None, ge=1, description="Max results"),
    lang: Locale = Query(default="en"),
    conn=Depends(get_conn),
):
    rows = await get_posts(conn, type_filter=type, limit=limit, locale=lang)
    return rows


@router.get("/guides", response_model=List[ScamGuideResponse])
async def list_guides(lang: Locale = Query(default="en"), conn=Depends(get_conn)):
    rows = await get_guides(conn, locale=lang)
    return rows


@router.get("/course/modules", response_model=List[CourseModuleResponse])
async def list_course_modules(lang: Locale = "en", conn=Depends(get_conn)):
    rows = await get_course_modules(conn, locale=lang)
    return rows


@router.get("/course/{module_slug}", response_model=CourseModuleResponse)
async def get_course_module(module_slug: str, lang: Locale = "en", conn=Depends(get_conn)):
    row = await get_module_by_slug(conn, slug=module_slug, locale=lang)
    if not row:
        raise HTTPException(status_code=404, detail="Module not found")
    return row


@router.get(
    "/course/{module_slug}/lessons", response_model=List[LessonSummary]
)
async def list_module_lessons(module_slug: str, lang: Locale = "en", conn=Depends(get_conn)):
    rows = await get_lessons_for_module(conn, module_slug=module_slug, locale=lang)
    return rows


@router.get(
    "/course/{module_slug}/{lesson_slug}", response_model=LessonResponse
)
async def get_course_lesson(
    module_slug: str, lesson_slug: str, lang: Locale = "en", conn=Depends(get_conn)
):
    row = await get_lesson(conn, module_slug=module_slug, lesson_slug=lesson_slug, locale=lang)
    if not row:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return row
