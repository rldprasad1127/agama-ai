"""/api/auth — register, login, profile."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.api.deps import ClientToday, CurrentUser
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.flashcard import Flashcard
from app.models.journal import JournalEntry
from app.models.schemas import (
    LoginIn, PasswordChangeIn, RegisterIn, TokenOut, UserOut, UserUpdate, user_to_out,
)
from app.models.task import TaskBlock
from app.models.user import User
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(str(user.id)), user=user_to_out(user))


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn) -> TokenOut:
    """Create an account (password is hashed) and return a JWT."""
    email = body.email.lower()
    if await User.find_one(User.email == email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(name=body.name, email=email, password_hash=hash_password(body.password))
    try:
        await user.insert()
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    return _token(user)


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn) -> TokenOut:
    user = await User.find_one(User.email == body.email.lower())
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return _token(user)


@router.post("/demo", response_model=TokenOut)
async def demo_login(today: ClientToday) -> TokenOut:
    """Quick Demo sandbox — a shared demo learner pre-filled with sample history."""
    if not get_settings().demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demo mode is disabled")
    from app.services.demo_seed import get_or_create_demo_user

    user = await get_or_create_demo_user(today)
    return _token(user)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return user_to_out(user)


@router.patch("/me", response_model=UserOut)
async def update_me(body: UserUpdate, user: CurrentUser) -> UserOut:
    if body.name is not None:
        user.name = body.name.strip() or user.name
    if body.daily_target_minutes is not None:
        user.daily_target_minutes = body.daily_target_minutes
    for f in ("onboarded", "learner_level", "goal"):
        v = getattr(body, f)
        if v is not None:
            setattr(user, f, v)
    if body.preferences is not None:
        upd = body.preferences.model_dump(exclude_unset=True)
        if "ai_model" in upd and not (upd["ai_model"] or "").strip():
            upd["ai_model"] = None
        user.preferences = user.preferences.model_copy(update=upd)
    await user.save()
    return user_to_out(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: PasswordChangeIn, user: CurrentUser) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    await user.save()


class DeleteAccountIn(BaseModel):
    password: str = ""


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(body: DeleteAccountIn, user: CurrentUser) -> None:
    """Permanently delete the account and every document it owns."""
    if user.is_demo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The demo account cannot be deleted")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is incorrect")
    await TaskBlock.find(TaskBlock.user_id == user.id).delete()
    await JournalEntry.find(JournalEntry.user_id == user.id).delete()
    await Flashcard.find(Flashcard.user_id == user.id).delete()
    await user.delete()
