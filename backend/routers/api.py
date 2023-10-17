from typing import List, Optional

from fastapi import APIRouter, Query

from database import get_course_modules, get_guides, get_posts
from models import CourseModuleResponse, PostResponse, ScamGuideResponse

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/posts", response_model=List[PostResponse])
async def list_posts(
    type: Optional[str] = Query(default=None, description="Filter by post type"),
    limit: Optional[int] = Query(default=None, ge=1, description="Max results"),
):
    rows = await get_posts(type_filter=type, limit=limit)
    return rows


@router.get("/guides", response_model=List[ScamGuideResponse])
async def list_guides():
    rows = await get_guides()
    return rows


@router.get("/course/modules", response_model=List[CourseModuleResponse])
async def list_course_modules():
    rows = await get_course_modules()
    return rows
