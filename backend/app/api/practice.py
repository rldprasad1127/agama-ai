"""/api/practice — interview & English speaking Q&A sessions with a final review."""
from __future__ import annotations

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, status

from app.api.deps import ClientToday, CurrentUser
from app.models.learning import MistakeNote, PracticeSession
from app.models.practice_schemas import (
    AnswerIn, AnswerOut, FinishOut, MistakeOut, MistakeUpdate, SessionCreate, SessionOut,
)
from app.services import practice_service as ps
from app.services.schedule_service import effective_streak

router = APIRouter(prefix="/api/practice", tags=["practice"])


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def start(body: SessionCreate, user: CurrentUser, today: ClientToday) -> SessionOut:
    """Start (or resume, for a scheduled block) a Q&A session. The AI writes the question list up front."""
    return ps.session_out(await ps.start_session(user, body, today))


@router.get("/sessions", response_model=list[SessionOut])
async def history(user: CurrentUser, limit: int = 30) -> list[SessionOut]:
    rows = await PracticeSession.find(PracticeSession.user_id == user.id).sort("-created_at").limit(max(1, min(limit, 100))).to_list()
    return [ps.session_out(s) for s in rows]


@router.get("/sessions/{sid}", response_model=SessionOut)
async def get_session(sid: str, user: CurrentUser) -> SessionOut:
    return ps.session_out(await ps.owned_session(sid, user))


@router.post("/sessions/{sid}/answer", response_model=AnswerOut)
async def answer(sid: str, body: AnswerIn, user: CurrentUser, today: ClientToday) -> AnswerOut:
    s = await ps.owned_session(sid, user)
    s, fb = await ps.answer_turn(user, s, body, today)
    out = ps.session_out(s)
    return AnswerOut(session=out, feedback=ps._fb_out(fb) if (fb and s.instant_feedback) else None,
                     done=all(t.answer is not None for t in s.turns))


@router.post("/sessions/{sid}/finish", response_model=FinishOut)
async def finish(sid: str, user: CurrentUser, today: ClientToday) -> FinishOut:
    s = await ps.owned_session(sid, user)
    s, _ = await ps.finish_session(user, s, today)
    return FinishOut(session=ps.session_out(s), streak_count=effective_streak(user, today), total_xp=user.xp)


@router.delete("/sessions/{sid}", status_code=status.HTTP_204_NO_CONTENT)
async def abandon(sid: str, user: CurrentUser) -> None:
    await ps.abandon(user, await ps.owned_session(sid, user))


def _m(m: MistakeNote) -> MistakeOut:
    return MistakeOut(id=str(m.id), wrong=m.wrong, right=m.right, rule=m.rule, times=m.times, last_seen=m.last_seen, mastered=m.mastered)


@router.get("/mistakes", response_model=list[MistakeOut])
async def mistakes(user: CurrentUser, include_mastered: bool = False) -> list[MistakeOut]:
    q = MistakeNote.find(MistakeNote.user_id == user.id) if include_mastered else MistakeNote.find(MistakeNote.user_id == user.id, MistakeNote.mastered == False)  # noqa: E712
    return [_m(m) for m in await q.sort("-times").limit(60).to_list()]


@router.patch("/mistakes/{mid}", response_model=MistakeOut)
async def update_mistake(mid: str, body: MistakeUpdate, user: CurrentUser) -> MistakeOut:
    try:
        m = await MistakeNote.get(PydanticObjectId(mid))
    except Exception:
        m = None
    if m is None or m.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    m.mastered = body.mastered
    await m.save()
    return _m(m)
