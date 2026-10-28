"""/api/plans — learning paths, practice plans, placement quiz and re-balancing."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, status

from app.api.deps import ClientToday, CurrentUser
from app.models.plan_schemas import (
    OutlineIn, OutlineOut, PlacementIn, PlacementOut, PlacementQuestion, PlanCreate, PlanDayOut, PlanOut, PlanPreview, RebalanceIn,
    RebalanceOut,
)
from app.services import curriculum, plan_service as ps, subjects
from app.services.outline_service import generate_outline
from app.services.planner import ENGLISH_TOPICS

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("/curriculum")
async def get_curriculum(user: CurrentUser) -> dict:
    """Topics of the built-in DSA roadmap (ordered) and the supported tracks."""
    return {"topics": curriculum.topic_names(), "tracks": ["DSA", "INTERVIEW", "ENGLISH"],
            "english_topics": ENGLISH_TOPICS}


@router.get("/subjects")
async def get_subjects(user: CurrentUser) -> dict:
    """Subject catalog for the plan-creation screen (featured ones first; the rest sit behind "View more")."""
    return {"subjects": [subjects.catalog_out(x) for x in subjects.SUBJECTS], "max_plans": ps.MAX_PLANS,
            "over_budget_minutes": ps.OVER_BUDGET_MINUTES}


@router.post("/outline", response_model=OutlineOut)
async def outline(body: OutlineIn, user: CurrentUser, today: ClientToday) -> OutlineOut:
    """Draft a roadmap for any subject with AI. Nothing is saved — the learner reviews it, then creates the plan."""
    return await generate_outline(user, body, today)


@router.get("/placement", response_model=list[PlacementQuestion])
async def placement(user: CurrentUser) -> list[PlacementQuestion]:
    return ps.placement_questions()


@router.post("/placement", response_model=PlacementOut)
async def grade(body: PlacementIn, user: CurrentUser) -> PlacementOut:
    return ps.grade_placement(body.answers)


@router.post("/preview", response_model=PlanPreview)
async def preview(body: PlanCreate, user: CurrentUser, today: ClientToday) -> PlanPreview:
    return await ps.preview(user, body, today)


@router.post("/", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create(body: PlanCreate, user: CurrentUser, today: ClientToday) -> PlanOut:
    """Create a plan. Existing plans are untouched — several can run side by side."""
    plan = await ps.create_plan(user, body, today)
    return await ps.build_out(plan, today)


@router.get("/", response_model=list[PlanOut])
async def list_all(user: CurrentUser, today: ClientToday) -> list[PlanOut]:
    """Every active, paused and completed plan (active first)."""
    return [await ps.build_out(p, today) for p in await ps.list_plans(user)]


@router.get("/active", response_model=Optional[PlanOut])
async def active(user: CurrentUser, today: ClientToday) -> Optional[PlanOut]:
    plan = await ps.active_plan(user)
    return await ps.build_out(plan, today) if plan else None


@router.get("/{plan_id}/days", response_model=list[PlanDayOut])
async def days(plan_id: str, user: CurrentUser, today: ClientToday) -> list[PlanDayOut]:
    return await ps.build_days(await ps.owned_plan(plan_id, user), today)


@router.post("/{plan_id}/rebalance", response_model=RebalanceOut)
async def rebalance(plan_id: str, body: RebalanceIn, user: CurrentUser, today: ClientToday) -> RebalanceOut:
    """Re-pack every unfinished block (including missed ones) into the days that remain."""
    return await ps.rebalance(user, await ps.owned_plan(plan_id, user), today, body.extend_days)


@router.post("/{plan_id}/pause", response_model=PlanOut)
async def pause(plan_id: str, user: CurrentUser, today: ClientToday) -> PlanOut:
    """Take the plan off the calendar without losing progress."""
    plan = await ps.owned_plan(plan_id, user)
    await ps.pause_plan(user, plan)
    return await ps.build_out(plan, today)


@router.post("/{plan_id}/resume", response_model=RebalanceOut)
async def resume(plan_id: str, user: CurrentUser, today: ClientToday) -> RebalanceOut:
    """Put a paused plan back on the calendar starting today."""
    return await ps.resume_plan(user, await ps.owned_plan(plan_id, user), today)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(plan_id: str, user: CurrentUser) -> None:
    """Stop the plan: unfinished blocks are removed, completed work and journal stay."""
    await ps.drop_plan(user, await ps.owned_plan(plan_id, user))
