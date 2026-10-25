"""/api/flashcards — Leitner-box spaced repetition."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import ClientToday, CurrentUser, get_owned_task, parse_oid
from app.models.flashcard import LEITNER_INTERVALS, Flashcard
from app.models.schemas import (
    FlashcardCreate, FlashcardGenerateIn, FlashcardOut, FlashcardReviewIn, flashcard_to_out,
)
from app.services.ai_evaluator import get_evaluator

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


async def _owned(card_id: str, user) -> Flashcard:
    c = await Flashcard.get(parse_oid(card_id, "Flashcard"))
    if c is None or c.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flashcard not found")
    return c


@router.get("/", response_model=list[FlashcardOut])
async def list_cards(
    user: CurrentUser, today: ClientToday, due: bool = False, task_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
) -> list[FlashcardOut]:
    flt: dict = {"user_id": user.id}
    if due:
        flt["due_date"] = {"$lte": dt.datetime.combine(today, dt.time.max)}
    if task_id:
        flt["task_id"] = parse_oid(task_id, "Task")
    cards = await Flashcard.find(flt).sort("+due_date", "+box", "+created_at").limit(limit).to_list()
    return [flashcard_to_out(c) for c in cards]


@router.get("/stats")
async def card_stats(user: CurrentUser, today: ClientToday) -> dict:
    cards = await Flashcard.find(Flashcard.user_id == user.id).to_list()
    reviews = sum(c.reviews for c in cards)
    correct = sum(c.correct for c in cards)
    return {
        "total": len(cards),
        "due": sum(1 for c in cards if c.due_date <= today),
        "by_box": {str(b): sum(1 for c in cards if c.box == b) for b in LEITNER_INTERVALS},
        "accuracy": round(correct * 100 / reviews) if reviews else None,
    }


@router.post("/", response_model=FlashcardOut, status_code=status.HTTP_201_CREATED)
async def create_card(body: FlashcardCreate, user: CurrentUser, today: ClientToday) -> FlashcardOut:
    task_oid = None
    if body.task_id:
        task_oid = (await get_owned_task(body.task_id, user)).id
    c = Flashcard(user_id=user.id, task_id=task_oid, front=body.front.strip(), back=body.back.strip(),
                  topic=body.topic.strip(), due_date=today)
    await c.insert()
    return flashcard_to_out(c)


@router.post("/generate", response_model=list[FlashcardOut], status_code=status.HTTP_201_CREATED)
async def generate_cards(body: FlashcardGenerateIn, user: CurrentUser, today: ClientToday) -> list[FlashcardOut]:
    """“Draft 3 Questions”: AI builds recall cards from the block's reading (or a highlighted passage)."""
    task = await get_owned_task(body.task_id, user)
    drafts = await get_evaluator().generate_flashcards(
        title=task.title, source=task.prompt_context, highlight=body.text, count=body.count,
        model=user.preferences.ai_model,
    )
    out: list[FlashcardOut] = []
    for d in drafts:
        c = Flashcard(user_id=user.id, task_id=task.id, front=d.front, back=d.back, topic=d.topic or task.title, due_date=today)
        await c.insert()
        out.append(flashcard_to_out(c))
    return out


@router.post("/{card_id}/review", response_model=FlashcardOut)
async def review_card(card_id: str, body: FlashcardReviewIn, user: CurrentUser, today: ClientToday) -> FlashcardOut:
    """Leitner update: hard → box 1 (due again today), good → +1 box, easy → +2 boxes."""
    c = await _owned(card_id, user)
    if body.rating == "hard":
        c.box, c.due_date = 1, today
    else:
        c.box = min(5, c.box + (1 if body.rating == "good" else 2))
        c.due_date = today + dt.timedelta(days=LEITNER_INTERVALS[c.box])
        c.correct += 1
    c.reviews += 1
    c.last_reviewed = dt.datetime.now(dt.timezone.utc)
    await c.save()
    return flashcard_to_out(c)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(card_id: str, user: CurrentUser) -> None:
    await (await _owned(card_id, user)).delete()
